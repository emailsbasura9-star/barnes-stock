// Nudie Jeans "Tuff Tony" stock watcher — tracks a set of colorways in
// W28/L32 and W30/L32, and emails (from "Nudie Tuff Tony") when a watched
// size goes from out of stock → in stock.
//
// Nudie product pages embed a full per-size stock list as JSON-LD in the
// server HTML (one Offer per waist/length with schema.org InStock/OutOfStock),
// so a plain server fetch reads exact availability — no browser needed.

import { getStore } from "@netlify/blobs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SENDER = process.env.ALERT_FROM_NUDIE || "Nudie Tuff Tony <onboarding@resend.dev>";
const BASE = "https://www.nudiejeans.com/en-AR/product/";

// Sizes watched for every colorway.
export const SIZES = ["W28/L32", "W29/L32", "W30/L32"];

// The colorways to track. Edit to add/remove.
export const PRODUCTS = [
  { id: "black-vintage",    label: "Black Vintage",    slug: "tuff-tony-black-vintage",     img: "https://nudie.centracdn.net/client/dynamic/images/8572_06e4f52cce-114756_tuff_tony_black_vintage_7.jpg" },
  { id: "black-water",      label: "Black Water",      slug: "tuff-tony-black-water",       img: "https://nudie.centracdn.net/client/dynamic/images/9089_67cd3b774d-115070_tuff_tony_black_water1_lifestyle.jpg" },
  { id: "dirt-path",        label: "Dirt Path",        slug: "tuff-tony-dirt-path",         img: "https://nudie.centracdn.net/client/dynamic/images/9572_68ea6adac9-115281-tuff-tony-dirt-path-1-1.jpg" },
  { id: "dry-deadstock-23", label: "Dry Deadstock 23", slug: "tuff-tony-dry-deadstock-23",  img: "https://nudie.centracdn.net/client/dynamic/images/9479_c2b716ee94-tuff-tony-deadstock-23-pc-1-flatshot.jpg" },
  { id: "dry-ecru-waves",   label: "Dry Ecru Waves",   slug: "tuff-tony-dry-ecru-waves",    img: "https://nudie.centracdn.net/client/dynamic/images/9430_95f4c4b30e-01-tuff-tony-dry-ecru-waves-back.jpg" },
  { id: "dry-old",          label: "Dry Old",          slug: "tuff-tony-dry-old",           img: "https://nudie.centracdn.net/client/dynamic/images/9011_4f0790c6e7-115015_tuff_tony_dry_old-flatshot-hover.jpg" },
  { id: "dry-sunburns",     label: "Dry Sunburns",     slug: "tuff-tony-dry-sunburns",      img: "https://nudie.centracdn.net/client/dynamic/images/8931_527e04f8a9-tuff-tony-sunburns-product-image-flatshot.jpg" },
  { id: "one-wash",         label: "One Wash",         slug: "tuff-tony-one-wash-115068",   img: "https://nudie.centracdn.net/client/dynamic/images/9061_cee00ca64f-115068_tuff-tony-one-wash-14-1-flatshot.jpg" },
];

function store() { return getStore("nudie"); }
export async function resetState() { await store().delete("state"); }

// Parse the JSON-LD Product offers → { "W30/L32": "in"|"out", ... }
function parseOffers(html) {
  const out = {};
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let j;
    try { j = JSON.parse(m[1]); } catch (e) { continue; }
    const p = j["@type"] === "Product" ? j : ((j["@graph"] || []).find((g) => g && g["@type"] === "Product"));
    if (p && Array.isArray(p.offers)) {
      for (const o of p.offers) {
        if (o && o.name) out[o.name] = /InStock/i.test(o.availability || "") ? "in" : "out";
      }
      return out;
    }
  }
  return out;
}

async function sendAlert(restocks) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — skipping Nudie email"); return; }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";

  const labels = [...new Set(restocks.map((r) => r.label))].join(", ");
  const subject = "Nudie Tuff Tony — en stock: " + labels;

  const rows = restocks.map((r) => `
    <tr>
      <td style="padding:8px 10px 8px 0;vertical-align:top"><img src="${r.img}" width="56" style="border-radius:6px;display:block"></td>
      <td style="padding:8px 0;vertical-align:top">
        <a href="${BASE}${r.slug}" style="font-weight:600;color:#1a1a1a;text-decoration:none;font-size:15px">${r.label}</a>
        <div style="color:#16a34a;font-size:13px;margin-top:2px">${r.size} — in stock</div>
      </td>
    </tr>`).join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 12px"><b>Tuff Tony — back in your size</b></p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="color:#8e8e93;font-size:12px;margin:16px 0 0">Nudie Tuff Tony watcher</p>
  </div>`;

  const text = "Tuff Tony back in stock:\n\n" +
    restocks.map((r) => `${r.label} — ${r.size}\n${BASE}${r.slug}`).join("\n\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER, to, subject, html, text }),
  });
  if (!res.ok) console.error("Resend (nudie) error", res.status, await res.text());
}

export async function run() {
  const db = store();
  const prev = (await db.get("state", { type: "json" })) || { products: {}, firstRun: true };
  const products = prev.products || {};
  const firstRun = prev.firstRun !== false;
  const now = new Date().toISOString();
  const restocks = [];

  for (const p of PRODUCTS) {
    const rec = products[p.id] || {};
    try {
      const r = await fetch(BASE + p.slug, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en;q=0.9" },
      });
      const html = await r.text();
      const offers = parseOffers(html);
      const sizes = {};
      let changed = false;
      for (const s of SIZES) {
        const now_ = offers[s] || "—";
        sizes[s] = now_;
        const was = rec.sizes ? rec.sizes[s] : undefined;
        if (now_ === "in" && was !== "in") {
          changed = true;
          if (!firstRun) restocks.push({ ...p, size: s });
        } else if (was !== now_) {
          changed = true;
        }
      }
      products[p.id] = {
        label: p.label, slug: p.slug, img: p.img, url: BASE + p.slug,
        sizes, ok: true, status: r.status,
        lastChecked: now, lastChanged: changed ? now : rec.lastChanged || null,
      };
    } catch (e) {
      products[p.id] = { ...rec, label: p.label, slug: p.slug, img: p.img, url: BASE + p.slug, ok: false, error: String(e.message || e), lastChecked: now };
    }
  }

  await db.setJSON("state", { products, firstRun: false, lastRun: now });
  if (restocks.length) { try { await sendAlert(restocks); } catch (e) { console.error("nudie email failed", e); } }
  return { ok: true, lastRun: now, restocked: restocks.map((r) => r.label + " " + r.size), firstRun };
}

export async function getData() {
  const db = store();
  const st = (await db.get("state", { type: "json" })) || { products: {}, lastRun: null };
  const list = PRODUCTS.map((p) => {
    const r = st.products?.[p.id] || {};
    return {
      id: p.id, label: p.label, url: BASE + p.slug, img: p.img,
      ok: r.ok !== false, error: r.error ?? null,
      sizes: r.sizes || {},
      lastChecked: r.lastChecked || null, lastChanged: r.lastChanged || null,
    };
  });
  return { products: list, sizes: SIZES, lastRun: st.lastRun || null };
}
