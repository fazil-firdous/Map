// Things regular users do: add a shop, suggest edits, confirm a shop, add photos, claim, Ask the bazaar.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const config = require("./config");
const intent = require("../../shared/intent");
const { needUser, needPhone } = require("./auth");
const { bad, forbidden, notFound, HttpError, str, url, num, normPhone, isMobile } = require("./util");
const { taxonomy } = require("./shops");

const POINTS = { shop_added: 10, photo: 3, edit: 2, confirm: 1 };
async function award(c, userId, reason, ref) {
  const pts = POINTS[reason];
  if (!userId || !pts) return;
  await c.query("INSERT INTO points_ledger (user_id, delta, reason, ref) VALUES ($1, $2, $3, $4)", [userId, pts, reason, ref]);
  await c.query("UPDATE users SET points = points + $2 WHERE id = $1", [userId, pts]);
}

const inCity = (lat, lon) => lat >= config.bbox.minLat && lat <= config.bbox.maxLat && lon >= config.bbox.minLon && lon <= config.bbox.maxLon;
const newId = () => "SXR-" + crypto.randomBytes(4).toString("hex").toUpperCase();
const EDIT_FIELDS = new Set(["name", "phone", "category", "address", "opening_hours", "instagram", "whatsapp", "website", "location"]);

/** Accept JPEG/PNG/WebP up to 3 MB (the app shrinks photos before upload). Returns stored file name. */
async function savePhoto(file) {
  const buf = await file.toBuffer();
  if (buf.length > 3 * 1024 * 1024) throw bad("Photo too large (max 3 MB)");
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf.slice(0, 4).toString("hex") === "89504e47" ? "png"
    : buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP" ? "webp" : null;
  if (!ext) throw bad("Only JPEG, PNG or WebP photos");
  const name = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  fs.mkdirSync(path.join(config.uploadsDir, name.split("/")[0]), { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  return name;
}

function routes(app) {
  // ---- Add a missing shop (goes to review, +10 points when approved) ----
  app.post("/v1/shops", { preHandler: needUser, config: { rateLimit: { max: 30, timeWindow: "1 day" } } }, async (req) => {
    const b = req.body || {};
    const name = str(b.name, 120), category = str(b.category, 60);
    const lat = num(b.lat, -90, 90), lon = num(b.lon, -180, 180);
    if (!name || name.length < 3) throw bad("Shop name is too short");
    if (lat === null || lon === null || !inCity(lat, lon)) throw bad("Pick the shop's location in Srinagar");
    const cat = await db.one("SELECT t.category, g.name AS grp FROM taxonomy t JOIN taxonomy_groups g ON g.id = t.grp_id WHERE t.category = $1", [category]);
    if (!cat) throw bad("Pick a category from the list");
    const dup = await db.one(`SELECT id, name FROM shops WHERE status IN ('active','pending')
      AND ST_DWithin(geom, ST_MakePoint($2, $1)::geography, 150) AND similarity(lower(name), lower($3)) > 0.5 LIMIT 1`, [lat, lon, name]);
    if (dup) throw new HttpError(409, `Already listed: ${dup.name}`);
    const phone = normPhone(b.phone);
    const s = await db.one(`INSERT INTO shops (id, name, grp, category, phone, whatsapp, instagram, address, locality, geom, location_precise,
        sources, source_ids, quality_score, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_MakePoint($11,$10)::geography, true, '{users}', ARRAY['users:' || $1], 40, 'pending', $12)
      RETURNING id`, [newId(), name, cat.grp, cat.category, phone, isMobile(phone) ? phone : null, url(b.instagram && !/^https?:/.test(b.instagram) ? "instagram.com/" + String(b.instagram).replace(/^@/, "") : b.instagram),
      str(b.address, 200), str(b.locality, 60), lat, lon, req.user.id]);
    return { id: s.id, status: "pending" };
  });

  // ---- Suggest an edit / report closed ----
  app.post("/v1/shops/:id/edits", { preHandler: needUser, config: { rateLimit: { max: 60, timeWindow: "1 day" } } }, async (req) => {
    const field = str(req.body?.field, 30), value = str(req.body?.value, 300);
    if (!EDIT_FIELDS.has(field) || !value) throw bad("Choose what to change and type the correct value");
    if (!(await db.one("SELECT 1 FROM shops WHERE id = $1", [req.params.id]))) throw notFound();
    await db.q("INSERT INTO edits (shop_id, user_id, kind, field, value) VALUES ($1, $2, 'edit', $3, $4)", [req.params.id, req.user.id, field, value]);
    return { status: "pending" };
  });
  app.post("/v1/shops/:id/closed", { preHandler: needUser, config: { rateLimit: { max: 30, timeWindow: "1 day" } } }, async (req) => {
    if (!(await db.one("SELECT 1 FROM shops WHERE id = $1", [req.params.id]))) throw notFound();
    await db.q("INSERT INTO edits (shop_id, user_id, kind) VALUES ($1, $2, 'closed')", [req.params.id, req.user.id]);
    return { status: "pending" };
  });

  // ---- "Is it still here?" confirmations. Must be within 300 m. Two different people make it verified. ----
  app.post("/v1/shops/:id/confirm", { preHandler: needUser, config: { rateLimit: { max: 40, timeWindow: "1 day" } } }, async (req) => {
    const lat = num(req.body?.lat, -90, 90), lon = num(req.body?.lon, -180, 180);
    if (lat === null || lon === null) throw bad("Location needed to confirm");
    return db.tx(async c => {
      const s = (await c.query(`SELECT id, verified, ST_Distance(geom, ST_MakePoint($3,$2)::geography) AS d FROM shops WHERE id = $1`, [req.params.id, lat, lon])).rows[0];
      if (!s) throw notFound();
      if (s.d > 300) throw bad("You need to be at the shop to confirm it");
      const already = (await c.query("SELECT 1 FROM edits WHERE shop_id = $1 AND user_id = $2 AND kind = 'confirm' AND created_at > now() - interval '90 days'", [s.id, req.user.id])).rows[0];
      if (already) return { verified: s.verified, already: true };
      const today = (await c.query("SELECT count(*)::int n FROM points_ledger WHERE user_id = $1 AND reason = 'confirm' AND created_at > now() - interval '1 day'", [req.user.id])).rows[0].n;
      await c.query("INSERT INTO edits (shop_id, user_id, kind, status) VALUES ($1, $2, 'confirm', 'approved')", [s.id, req.user.id]);
      if (today < 20) await award(c, req.user.id, "confirm", s.id);
      const n = (await c.query("SELECT count(DISTINCT user_id)::int n FROM edits WHERE shop_id = $1 AND kind = 'confirm' AND created_at > now() - interval '180 days'", [s.id])).rows[0].n;
      if (n >= 2 && !s.verified) await c.query("UPDATE shops SET verified = true WHERE id = $1", [s.id]);
      return { verified: s.verified || n >= 2, confirmations: n };
    });
  });

  // ---- Photos (owner photos go live at once; others are reviewed, +3 points when approved) ----
  app.post("/v1/shops/:id/photos", { preHandler: needUser, config: { rateLimit: { max: 40, timeWindow: "1 day" } } }, async (req) => {
    const s = await db.one("SELECT id, owner_id FROM shops WHERE id = $1", [req.params.id]);
    if (!s) throw notFound();
    const file = await req.file();
    if (!file) throw bad("Attach a photo");
    const name = await savePhoto(file);
    const isOwner = s.owner_id === req.user.id;
    const p = await db.one("INSERT INTO photos (shop_id, user_id, file, status) VALUES ($1, $2, $3, $4) RETURNING id, status",
      [s.id, req.user.id, name, isOwner ? "approved" : "pending"]);
    if (isOwner) await db.q("UPDATE shops SET updated_at = now() WHERE id = $1", [s.id]);
    return p;
  });

  // ---- Claim a shop: instant if your verified number is the shop's listed number ----
  app.post("/v1/shops/:id/claim", { preHandler: needPhone }, async (req) => {
    return db.tx(async c => {
      const s = (await c.query("SELECT id, phone, phones_other, whatsapp, phone_is_chain, owner_id FROM shops WHERE id = $1 FOR UPDATE", [req.params.id])).rows[0];
      if (!s) throw notFound();
      if (s.owner_id === req.user.id) return { status: "approved" };
      if (s.owner_id) throw forbidden("This shop is already claimed. Contact support if it's yours");
      const listed = [s.phone, s.whatsapp, ...(s.phones_other || [])].filter(Boolean);
      if (!s.phone_is_chain && listed.includes(req.user.phone)) {
        await c.query("UPDATE shops SET owner_id = $2, verified = true, sources = array(SELECT DISTINCT unnest(sources || '{owner}')) WHERE id = $1", [s.id, req.user.id]);
        await c.query("UPDATE users SET role = CASE WHEN role = 'admin' THEN role ELSE 'owner' END WHERE id = $1", [req.user.id]);
        await c.query("INSERT INTO claims (shop_id, user_id, phone, status, note) VALUES ($1, $2, $3, 'approved', 'phone matched')", [s.id, req.user.id, req.user.phone]);
        return { status: "approved" };
      }
      await c.query("INSERT INTO claims (shop_id, user_id, phone, note) VALUES ($1, $2, $3, $4)", [s.id, req.user.id, req.user.phone, str(req.body?.note, 300)]);
      return { status: "pending", message: "Your number isn't the one listed for this shop. We'll call you to check, usually within a day." };
    });
  });

  // ---- Ask the bazaar ----
  app.post("/v1/asks", { preHandler: needUser, config: { rateLimit: { max: 10, timeWindow: "1 day" } } }, async (req) => {
    const text = str(req.body?.text, 300);
    const lat = num(req.body?.lat, -90, 90), lon = num(req.body?.lon, -180, 180);
    if (!text || text.length < 3) throw bad("Write what you need");
    if (lat === null || lon === null || !inCity(lat, lon)) throw bad("Choose your area in Srinagar");
    const { categories } = await taxonomy();
    const p = intent.parse(text, categories.filter(Boolean));
    const cats = p.cats.slice(0, 2);
    const targets = cats.length ? await db.many(`
      SELECT id, name, owner_id IS NOT NULL AS claimed, whatsapp, phone, phone_is_chain,
             round(ST_Distance(geom, ST_MakePoint($2,$1)::geography))::int AS meters
      FROM shops WHERE status = 'active' AND category = ANY($3) AND ST_DWithin(geom, ST_MakePoint($2,$1)::geography, 2500)
      ORDER BY (owner_id IS NOT NULL) DESC, geom <-> ST_MakePoint($2,$1)::geography LIMIT 25`, [lat, lon, cats]) : [];
    const ask = await db.one("INSERT INTO asks (user_id, text, category, geom) VALUES ($1, $2, $3, ST_MakePoint($5,$4)::geography) RETURNING id",
      [req.user.id, text, cats[0] || null, lat, lon]);
    const claimed = targets.filter(t => t.claimed);
    if (claimed.length) await db.q("INSERT INTO ask_targets (ask_id, shop_id) SELECT $1, unnest($2::text[])", [ask.id, claimed.map(t => t.id)]);
    return {
      id: ask.id, category: cats[0] || null, in_app: claimed.length,
      // Shops not on the app yet: the app offers one-tap WhatsApp messages from the user's own WhatsApp (free).
      whatsapp: targets.filter(t => !t.claimed).map(t => ({ id: t.id, name: t.name, meters: t.meters,
        number: t.whatsapp || (!t.phone_is_chain && isMobile(t.phone) ? t.phone : null) })).filter(t => t.number).slice(0, 10),
    };
  });
  app.get("/v1/asks/mine", { preHandler: needUser }, async (req) => {
    const asks = await db.many(`SELECT a.id, a.text, a.created_at, a.expires_at,
        (SELECT count(*)::int FROM ask_targets t WHERE t.ask_id = a.id) AS sent_to,
        COALESCE((SELECT json_agg(json_build_object('shop_id', r.shop_id, 'shop', s.name, 'text', r.text, 'at', r.created_at,
            'phone', CASE WHEN s.phone_is_chain THEN NULL ELSE s.phone END, 'whatsapp', s.whatsapp) ORDER BY r.created_at)
          FROM ask_replies r JOIN shops s ON s.id = r.shop_id WHERE r.ask_id = a.id), '[]') AS replies
      FROM asks a WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 20`, [req.user.id]);
    return { asks };
  });
}

module.exports = { routes, award, savePhoto };
