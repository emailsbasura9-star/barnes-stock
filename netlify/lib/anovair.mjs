// Anovair "Bootcut Jeans" stock watcher — tracks colorways in sizes 28 & 30
// and emails (from "Anovair Bootcut") when a watched size goes out → in.
//
// Anovair runs on Shopify, which exposes each product at /products/<handle>.json
// with a variants array carrying per-size `available` booleans — a clean server
// fetch, no scraping.

import { getStore } from "@netlify/blobs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SENDER = process.env.ALERT_FROM_ANOVAIR || "Anovair Bootcut <onboarding@resend.dev>";
const SITE = "https://anovair.com";

// Sizes watched for every colorway (Anovair is waist-only).
export const SIZES = ["28", "30"];

// The colorways to track.
export const PRODUCTS = [
  { id: "raw-denim",  label: "Raw Denim",  handle: "bootcut-denim-jeans-selvedge",   img: "https://cdn.shopify.com/s/files/1/0507/8948/2693/files/Bootcut_Jeans_-_Raw_Denim_1.jpg?v=1770565887" },
  { id: "light-blue", label: "Light Blue", handle: "bootcut-denim-jeans-light-blue",  img: "https://cdn.shopify.com/s/files/1/0507/8948/2693/files/BootcutJeans-LightBlue1_289eb1c7-2fe2-4870-a854-f6e9557475a1.jpg?v=1770565845" },
  { id: "charcoal",   label: "Charcoal",   handle: "bootcut-denim-jeans-charcoal",    img: "https://cdn.shopify.com/s/files/1/0507/8948/2693/files/Bootcut_Jeans_-_Charcoal_1.jpg?v=1770565820" },
];

function store() { return getStore("anovair"); }
export async function resetState() { await store().delete("state"); }

async function sendAlert(restocks) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — skipping Anovair email"); return; }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";

  const labels = [...new Set(restocks.map((r) => r.label))].join(", ");
  const subject = "Anovair Bootcut — en stock: " + labels;

  const rows = restocks.map((r) => `
    <tr>
      <td style="padding:8px 10px 8px 0;vertical-align:top"><img src="${r.img}" width="56" style="border-radius:6px;display:block"></td>
      <td style="padding:8px 0;vertical-align:top">
        <a href="${SITE}/products/${r.handle}" style="font-weight:600;color:#1a1a1a;text-decoration:none;font-size:15px">Bootcut — ${r.label}</a>
        <div style="color:#16a34a;font-size:13px;margin-top:2px">Size ${r.size} — in stock</div>
      </td>
    </tr>`).join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 12px"><b>Anovair bootcut — back in your size</b></p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="color:#8e8e93;font-size:12px;margin:16px 0 0">Anovair Bootcut watcher</p>
  </div>`;

  const text = "Anovair bootcut back in stock:\n\n" +
    restocks.map((r) => `${r.label} — size ${r.size}\n${SITE}/products/${r.handle}`).join("\n\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER, to, subject, html, text }),
  });
  if (!res.ok) console.error("Resend (anovair) error", res.status, await res.text());
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
      const r = await fetch(`${SITE}/products/${p.handle}.json`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      const j = await r.json();
      const variants = (j.product && j.product.variants) || [];
      const avail = {};
      for (const v of variants) avail[(v.option1 || v.title || "").trim()] = v.available ? "in" : "out";

      const sizes = {};
      let changed = false;
      for (const s of SIZES) {
        const now_ = avail[s] || "—";
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
        label: p.label, handle: p.handle, img: p.img, url: `${SITE}/products/${p.handle}`,
        sizes, ok: true, status: r.status,
        lastChecked: now, lastChanged: changed ? now : rec.lastChanged || null,
      };
    } catch (e) {
      products[p.id] = { ...rec, label: p.label, handle: p.handle, img: p.img, url: `${SITE}/products/${p.handle}`, ok: false, error: String(e.message || e), lastChecked: now };
    }
  }

  await db.setJSON("state", { products, firstRun: false, lastRun: now });
  if (restocks.length) { try { await sendAlert(restocks); } catch (e) { console.error("anovair email failed", e); } }
  return { ok: true, lastRun: now, restocked: restocks.map((r) => r.label + " " + r.size), firstRun };
}

export async function getData() {
  const db = store();
  const st = (await db.get("state", { type: "json" })) || { products: {}, lastRun: null };
  const list = PRODUCTS.map((p) => {
    const r = st.products?.[p.id] || {};
    return {
      id: p.id, label: p.label, url: `${SITE}/products/${p.handle}`, img: p.img,
      ok: r.ok !== false, error: r.error ?? null,
      sizes: r.sizes || {},
      lastChecked: r.lastChecked || null, lastChanged: r.lastChanged || null,
    };
  });
  return { products: list, sizes: SIZES, lastRun: st.lastRun || null };
}
