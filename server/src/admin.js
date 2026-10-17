// Moderation: new shops, edits, closures, claims, photos. Approvals award champion points.
const db = require("./db");
const { needAdmin } = require("./auth");
const { award } = require("./contrib");
const { bad, notFound, normPhone, url, num } = require("./util");

const FIELD_SQL = {
  name: "name = $2", phone: "phone = $2, phone_is_chain = false", category: "category = $2, grp = (SELECT g.name FROM taxonomy t JOIN taxonomy_groups g ON g.id = t.grp_id WHERE t.category = $2)",
  address: "address = $2", opening_hours: "opening_hours = $2", instagram: "instagram = $2", whatsapp: "whatsapp = $2", website: "website = $2",
};

function routes(app) {
  app.get("/v1/admin/queue", { preHandler: needAdmin }, async () => {
    const [shops, edits, claims, photos, stats] = await Promise.all([
      db.many(`SELECT s.id, s.name, s.category, s.phone, s.instagram, s.address, s.locality, ST_Y(s.geom::geometry) lat, ST_X(s.geom::geometry) lon,
               s.created_at, u.name AS by_name, u.points AS by_points FROM shops s LEFT JOIN users u ON u.id = s.created_by
               WHERE s.status = 'pending' ORDER BY s.created_at LIMIT 100`),
      db.many(`SELECT e.id, e.kind, e.field, e.value, e.created_at, s.id AS shop_id, s.name AS shop_name,
               (SELECT count(*)::int FROM edits x WHERE x.shop_id = e.shop_id AND x.kind = e.kind AND x.status = 'pending') AS same
               FROM edits e JOIN shops s ON s.id = e.shop_id WHERE e.status = 'pending' AND e.kind IN ('edit','closed') ORDER BY e.created_at LIMIT 100`),
      db.many(`SELECT c.id, c.phone, c.note, c.created_at, s.id AS shop_id, s.name AS shop_name, s.phone AS listed_phone
               FROM claims c JOIN shops s ON s.id = c.shop_id WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 100`),
      db.many(`SELECT p.id, p.file, p.created_at, s.id AS shop_id, s.name AS shop_name FROM photos p JOIN shops s ON s.id = p.shop_id
               WHERE p.status = 'pending' ORDER BY p.created_at LIMIT 100`),
      db.one(`SELECT (SELECT count(*) FROM shops WHERE status = 'active')::int AS shops, (SELECT count(*) FROM shops WHERE owner_id IS NOT NULL)::int AS claimed,
               (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM asks WHERE created_at > now() - interval '7 days')::int AS asks_week`),
    ]);
    return { shops, edits, claims, photos, stats };
  });

  app.post("/v1/admin/shops/:id/:action", { preHandler: needAdmin }, async (req) => {
    const ok = req.params.action === "approve";
    return db.tx(async c => {
      const s = (await c.query("UPDATE shops SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING id, created_by", [req.params.id, ok ? "active" : "rejected"])).rows[0];
      if (!s) throw notFound();
      if (ok) await award(c, s.created_by, "shop_added", s.id);
      return { ok: true };
    });
  });

  app.post("/v1/admin/edits/:id/:action", { preHandler: needAdmin }, async (req) => {
    const ok = req.params.action === "approve";
    return db.tx(async c => {
      const e = (await c.query("SELECT * FROM edits WHERE id = $1 AND status = 'pending' FOR UPDATE", [req.params.id])).rows[0];
      if (!e) throw notFound();
      if (ok && e.kind === "closed") {
        await c.query("UPDATE shops SET status = 'closed' WHERE id = $1 AND owner_id IS NULL", [e.shop_id]);
      } else if (ok && e.field === "location") {
        const [lat, lon] = String(e.value).split(",").map(Number);
        if (num(lat, 33.9, 34.3) === null || num(lon, 74.6, 75) === null) throw bad("Location must be 'lat,lon' in Srinagar");
        await c.query("UPDATE shops SET geom = ST_MakePoint($3, $2)::geography, location_precise = true WHERE id = $1", [e.shop_id, lat, lon]);
      } else if (ok && FIELD_SQL[e.field]) {
        let v = e.value;
        if (e.field === "phone" || e.field === "whatsapp") v = normPhone(v);
        if (e.field === "website" || e.field === "instagram") v = url(v);
        await c.query(`UPDATE shops SET ${FIELD_SQL[e.field]} WHERE id = $1`, [e.shop_id, v]);
      }
      await c.query("UPDATE edits SET status = $2, reviewed_at = now() WHERE id = $1", [e.id, ok ? "approved" : "rejected"]);
      // Close all identical pending reports for the same shop at once.
      if (e.kind === "closed") await c.query("UPDATE edits SET status = $2, reviewed_at = now() WHERE shop_id = $1 AND kind = 'closed' AND status = 'pending'", [e.shop_id, ok ? "approved" : "rejected"]);
      if (ok) await award(c, e.user_id, "edit", e.shop_id);
      return { ok: true };
    });
  });

  app.post("/v1/admin/claims/:id/:action", { preHandler: needAdmin }, async (req) => {
    const ok = req.params.action === "approve";
    return db.tx(async c => {
      const cl = (await c.query("UPDATE claims SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING *", [req.params.id, ok ? "approved" : "rejected"])).rows[0];
      if (!cl) throw notFound();
      if (ok) {
        await c.query("UPDATE shops SET owner_id = $2, verified = true, sources = array(SELECT DISTINCT unnest(sources || '{owner}')) WHERE id = $1", [cl.shop_id, cl.user_id]);
        await c.query("UPDATE users SET role = CASE WHEN role = 'admin' THEN role ELSE 'owner' END WHERE id = $1", [cl.user_id]);
      }
      return { ok: true };
    });
  });

  app.post("/v1/admin/photos/:id/:action", { preHandler: needAdmin }, async (req) => {
    const ok = req.params.action === "approve";
    return db.tx(async c => {
      const p = (await c.query("UPDATE photos SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING *", [req.params.id, ok ? "approved" : "rejected"])).rows[0];
      if (!p) throw notFound();
      if (ok) { await award(c, p.user_id, "photo", p.shop_id); await c.query("UPDATE shops SET updated_at = now() WHERE id = $1", [p.shop_id]); } // new version: phones sync the photo
      return { ok: true };
    });
  });

  app.post("/v1/admin/users/:id/ban", { preHandler: needAdmin }, async (req) => {
    await db.q("UPDATE users SET banned = true WHERE id = $1", [req.params.id]);
    return { ok: true };
  });
}

module.exports = { routes };
