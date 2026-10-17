"""Pack app.html into one self-contained file: dist/kulgam-eats-prototype.html (icons, Leaflet, QR, photos, fonts inlined)."""
import base64, io, json, pathlib, re
from PIL import Image
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
src = (H / "app.html").read_text()
EXTRA = {"store", "pizza", "chef-hat", "soup", "coffee", "croissant", "sandwich", "sparkles", "bike", "salad", "drumstick"}  # names used via data arrays
ICONS = sorted(set(re.findall(r'I\("([a-z0-9-]+)"', src)) | EXTRA)
ldir = ROOT / "mobile/node_modules/lucide-static/icons"
icons = {n: re.sub(r"^[\s\S]*?<svg[^>]*>|</svg>\s*$", "", (ldir / f"{n}.svg").read_text()).replace("\n", "") for n in ICONS}
src = src.replace("<!--INLINE-JS:../../mobile/www/js/icons.js-->", f"<script>window.SBIcons = {json.dumps(icons)};</script>")
src = re.sub(r"<!--INLINE-JS:([^>]+)-->", lambda m: f"<script>{(H / m.group(1)).read_text()}</script>", src)
src = re.sub(r"<!--INLINE-CSS:([^>]+)-->", lambda m: f"<style>{(H / m.group(1)).read_text()}</style>", src)
def img(name):
    im = Image.open(ROOT / f"mobile/www/img/photos/{name}.jpg").convert("RGB"); im.thumbnail((560, 320))
    b = io.BytesIO(); im.save(b, "JPEG", quality=62, optimize=True); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
src = re.sub(r"__IMG_([a-z0-9-]+)__", lambda m: img(m.group(1)), src)
src = src.replace("__BASEMAP__", (ROOT / "food/data/kulgam_basemap.json").read_text())
for w in ("600", "800"): src = src.replace(f"__PJS{w}__", base64.b64encode((ROOT / f"mobile/www/fonts/PJS-{w}.woff2").read_bytes()).decode())
(H / "dist").mkdir(exist_ok=True); out = H / "dist/kulgam-eats-prototype.html"; out.write_text(src)
missing = [n for n in ICONS if not icons[n]]
print(out, len(src) // 1024, "KB;", len(ICONS), "icons", "missing:" , missing)
