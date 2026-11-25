// Universal product reader. Given a product URL, returns its variants and
// per-variant availability — auto-detecting the storefront format:
//   - Shopify: /products/<handle>.json  (variants[].available)
//   - Structured data: JSON-LD Product offers (schema.org InStock/OutOfStock)
// Covers most DTC brands (Anovair = Shopify, Nudie = JSON-LD). A site that is
// neither returns { ok:false } so callers can tell the user it can't be read.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function tryShopify(url) {
  const m = url.match(/^(https?:\/\/[^/]+)(?:\/[a-z-]{2,5})?.*\/products\/([^/?#]+)/i);
  if (!m) return null;
  const jsonUrl = m[1] + "/products/" + m[2] + ".json";
  let r;
  try { r = await fetch(jsonUrl, { headers: { "User-Agent": UA, Accept: "application/json" } }); }
  catch (e) { return null; }
  if (!r.ok) return null;
  let j;
  try { j = await r.json(); } catch (e) { return null; }
  const p = j && j.product;
  if (!p || !Array.isArray(p.variants)) return null;
  const image = (p.image && p.image.src) || (p.images && p.images[0] && p.images[0].src) || null;
  const variants = p.variants.map((v) => ({ name: (v.title || v.option1 || "").trim(), available: !!v.available }));
  return { ok: true, platform: "shopify", title: p.title || "", image, variants };
}

async function tryJsonLd(url) {
  let r;
  try { r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en;q=0.9" } }); }
  catch (e) { return null; }
  if (!r.ok) return null;
  const html = await r.text();
  let prod = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch (e) { continue; }
    const p = j["@type"] === "Product" ? j : ((j["@graph"] || []).find((g) => g && g["@type"] === "Product"));
    if (p && Array.isArray(p.offers) && p.offers.length) { prod = p; break; }
  }
  if (!prod) return null;
  const image = Array.isArray(prod.image) ? prod.image[0] : prod.image;
  const variants = prod.offers.map((o) => ({
    name: (o.name || o.sku || "").trim(),
    available: /InStock/i.test(o.availability || ""),
  }));
  return { ok: true, platform: "jsonld", title: prod.name || "", image: image || null, variants };
}

export async function fetchProduct(url) {
  try {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const shop = await tryShopify(url).catch(() => null);
    if (shop && shop.variants.length) return shop;
    const ld = await tryJsonLd(url).catch(() => null);
    if (ld && ld.variants.length) return ld;
    return { ok: false, error: "Could not read stock from this link (not a Shopify product, and no structured product data found)." };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
