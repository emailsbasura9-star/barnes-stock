// Core logic shared by the scheduled check and the manual refresh.
// Scrapes Barnes product pages server-side (no browser, no CORS),
// parses the hidden variant data, compares to last time, stores the
// result in Netlify Blobs, and emails via Resend when a watched item
// returns in size 1 (Talle 1).

import { getStore } from "@netlify/blobs";
import * as cheerio from "cheerio";

const STORE_BASE = "https://barnesindustries.com.ar/productos/";

// The nine muscle tees, in display order, with their colour swatches.
export const PRODUCTS = [
  { label: "White",          swatch: "#ededed", slug: "muscle-tee-white-t503w" },
  { label: "Black",          swatch: "#161616", slug: "muscle-tees" },
  { label: "Slub Black",     swatch: "#161616", slug: "muscle-tee-slub-black-hhm2a" },
  { label: "Slub Habano",    swatch: "#b08457", slug: "muscle-tee-slub-habano-1g2b5" },
  { label: "Brown",          swatch: "#5c3d2e", slug: "muscle-tee-vison-domingo-20hs-yu8xy" },
  { label: "Navy Blue",      swatch: "#1b2a4a", slug: "muscle-tee-navy-blue-domingo-20hs-t323a" },
  { label: "Bordeaux",       swatch: "#7b2233", slug: "muscle-tee-heavyweight-bordeaux-miercoles-20hs-17o91" },
  { label: "Military Green", swatch: "#545e2e", slug: "muscle-tee-military-green-domingo-20hs-1thmk" },
  { label: "Silver Grey",    swatch: "#b7bbc0", slug: "muscle-tee-ash-grey-domingo-20hs-18jel" },
];

// Items you get emailed about (when they return in size 1).
export const WATCHED = new Set([
  "muscle-tee-white-t503w",
  "muscle-tees",
  "muscle-tee-slub-black-hhm2a",
  "muscle-tee-slub-habano-1g2b5",
  "muscle-tee-vison-domingo-20hs-yu8xy",
]);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function store() {
  return getStore("barnes");
}

// Read the stock for one product. Returns { t1, t2 }.
async function scrapeOne(slug) {
  const res = await fetch(STORE_BASE + slug + "/", {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const $ = cheerio.load(html);
  const raw = $("[data-variants]").first().attr("data-variants");
  if (!raw) throw new Error("no variant data on page");

  let t1 = 0, t2 = 0;
  const variants = JSON.parse(raw); // cheerio decodes the HTML entities
  for (const v of variants) {
    const opt = ((v.option0 || "") + " " + (v.option1 || "")).toLowerCase();
    const units = v.available ? (v.stock || 0) : 0;
    if (/talle\s*1(\s|$)/.test(opt)) t1 = units;
    else if (/talle\s*2(\s|$)/.test(opt)) t2 = units;
  }
  return { t1, t2 };
}

async function sendEmail(flipped) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";
  const from = process.env.ALERT_FROM || "Barnes Tracker <onboarding@resend.dev>";

  const subject = `Barnes restock: ${flipped.map((f) => f.label).join(", ")} back in size 1`;

  const rows = flipped
    .map(
      (f) => `
      <tr><td style="padding:10px 0;border-top:1px solid #eee">
        <a href="${STORE_BASE}${f.slug}/" style="color:#1a1a1a;text-decoration:none;font-weight:600;font-size:15px">${f.label}</a>
        <div style="color:#16a34a;font-size:13px;margin-top:2px">Talle 1 &middot; ${f.t1} left</div>
      </td></tr>`
    )
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 14px"><b>Back in stock in Talle 1</b></p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="color:#8e8e93;font-size:12px;margin:18px 0 0;border-top:1px solid #eee;padding-top:12px">Barnes stock tracker</p>
  </div>`;

  const text =
    "Back in stock in Talle 1:\n\n" +
    flipped
      .map((f) => `${f.label} — Talle 1: ${f.t1} left\n${STORE_BASE}${f.slug}/`)
      .join("\n\n") +
    "\n\n— Barnes stock tracker";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
  }
}

// Run a full check. Returns a small summary object.
export async function run() {
  const db = store();
  const prev = (await db.get("stock", { type: "json" })) || { items: [], updatedAt: null };
  const settings = (await db.get("settings", { type: "json" })) || { alertsEnabled: true };

  const prevBySlug = Object.fromEntries((prev.items || []).map((x) => [x.slug, x]));

  const items = [];
  for (const p of PRODUCTS) {
    try {
      const { t1, t2 } = await scrapeOne(p.slug);
      items.push({ label: p.label, swatch: p.swatch, slug: p.slug, t1, t2 });
    } catch (e) {
      // Keep the last known numbers for this item rather than zeroing it.
      const old = prevBySlug[p.slug];
      items.push({
        label: p.label, swatch: p.swatch, slug: p.slug,
        t1: old ? old.t1 : 0, t2: old ? old.t2 : 0,
        error: String(e.message || e),
      });
    }
  }

  const okCount = items.filter((i) => !i.error).length;
  if (okCount === 0) {
    // Total failure (Cloudflare block / network). Don't overwrite good data, don't email.
    return { ok: false, error: "all product fetches failed", updatedAt: prev.updatedAt };
  }

  // Which watched items just returned in size 1 (0/absent -> >0).
  const flipped = [];
  for (const it of items) {
    if (!WATCHED.has(it.slug)) continue;
    const prevT1 = prevBySlug[it.slug] ? prevBySlug[it.slug].t1 : 0;
    if (it.t1 > 0 && !(prevT1 > 0)) flipped.push(it);
  }

  const now = new Date().toISOString();
  await db.setJSON("stock", { updatedAt: now, items });

  if (settings.alertsEnabled && flipped.length) {
    try { await sendEmail(flipped); } catch (e) { console.error("email failed", e); }
  }

  return { ok: true, updatedAt: now, flipped: flipped.map((f) => f.label), okCount };
}

export async function getData() {
  const db = store();
  const stock = (await db.get("stock", { type: "json" })) || { items: [], updatedAt: null };
  const settings = (await db.get("settings", { type: "json" })) || { alertsEnabled: true };
  return { stock, settings };
}

export async function setAlerts(enabled) {
  const db = store();
  await db.setJSON("settings", { alertsEnabled: !!enabled });
  return { alertsEnabled: !!enabled };
}
