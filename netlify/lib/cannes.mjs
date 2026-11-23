// Cannes Film Week (Semana de Cine, Cine Gaumont, Buenos Aires) ticket watcher.
// Checks a few pages every 5 minutes and emails when the ticket-relevant text
// changes — e.g. an on-sale date/time/price/link appears, or the event shows up
// in the Gaumont's cartelera. Emails come from "Cannes BA Tickets".
//
// Design: for each page we extract the visible text, keep only the lines that
// match that page's `focus` (ticket keywords, or the Cannes film titles), and
// alert when THAT subset changes. This ignores unrelated page churn (ads,
// "también te puede interesar", comment counts) so you don't get false alarms.

import { getStore } from "@netlify/blobs";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SENDER = process.env.ALERT_FROM_CANNES || "Cannes BA Tickets <onboarding@resend.dev>";

// Edit this list to add/remove/repoint watched pages.
export const TARGETS = [
  {
    id: "otroscines",
    label: "OtrosCines — guía 2026",
    url: "https://otroscines.com/post/semana-de-cine-del-festival-de-cannes-2026-en-el-gaumont-toda-la-programacion-y-nuestras-criticas",
    focus: /entrada|entradas|venta|comprar|preventa|anticipad|localidad|precio|\$\s?\d|\b\d{1,2}\s?(de\s)?(noviembre|diciembre)\b|\b\d{1,2}[:.]\d{2}\b/i,
  },
  {
    id: "gaumont",
    label: "Cine Gaumont — cartelera",
    url: "https://www.cinegaumont.ar/es-AR/programacion",
    // The event / its films appearing here IS the on-sale moment.
    focus: /cannes|bola negra|\bfjord\b|ser querido|tigre de papel|hombre de su tiempo|soudain/i,
  },
  {
    id: "cannes",
    label: "Festival de Cannes — prensa (suplementario)",
    url: "https://www.festival-cannes.com/en/press/press-releases/",
    focus: /semana de cine|buenos aires|gaumont/i,
  },
];

const sha1 = (s) => createHash("sha1").update(s || "").digest("hex");

function extractText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const t = $("body").text() || "";
  return t
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function relevantLines(text, focus) {
  return text
    .split("\n")
    .filter((l) => focus.test(l))
    .join("\n");
}

function store() {
  return getStore("cannes");
}

async function sendAlert(changes) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — skipping Cannes email"); return; }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";

  const labels = changes.map((c) => c.label).join(", ");
  const subject = "Cannes BA Tickets — posible novedad (" + labels + ")";

  const blocks = changes
    .map(
      (c) => `
      <div style="margin:0 0 16px;padding:12px 0;border-top:1px solid #eee">
        <div style="font-weight:600;font-size:15px">${c.label}${c.appeared ? ' — <span style="color:#16a34a">apareció contenido nuevo</span>' : ""}</div>
        <div style="font-size:12px;margin:3px 0 8px"><a href="${c.url}" style="color:#2563eb">${c.url}</a></div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#333;margin:0;background:#f7f7f6;padding:9px 11px;border-radius:6px">${(c.extract || "(sin texto)").slice(0, 900).replace(/</g, "&lt;")}</pre>
      </div>`
    )
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 6px"><b>Cambió el texto relevante en una página que vigilo.</b></p>
    <p style="font-size:13px;color:#555;margin:0 0 14px">Puede ser el anuncio de venta de entradas. Revisá el enlace para confirmar.</p>
    ${blocks}
    <p style="color:#8e8e93;font-size:12px;margin:14px 0 0">Cannes BA Tickets · revisa cada 5 min</p>
  </div>`;

  const text =
    "Cambió el texto relevante en una página vigilada (posible venta de entradas):\n\n" +
    changes.map((c) => `${c.label}\n${c.url}\n${(c.extract || "").slice(0, 900)}`).join("\n\n---\n\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER, to, subject, html, text }),
  });
  if (!res.ok) console.error("Resend (cannes) error", res.status, await res.text());
}

export async function run() {
  const db = store();
  const prev = (await db.get("state", { type: "json" })) || { targets: {}, firstRun: true };
  const targets = prev.targets || {};
  const firstRun = prev.firstRun !== false; // true on very first run
  const now = new Date().toISOString();
  const changes = [];

  for (const tgt of TARGETS) {
    const rec = targets[tgt.id] || {};
    try {
      const r = await fetch(tgt.url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" },
      });
      const html = await r.text();
      const text = extractText(html);
      const extract = relevantLines(text, tgt.focus);
      const hash = sha1(extract);
      const hadBaseline = rec.extractHash !== undefined;
      const changed = hadBaseline && rec.extractHash !== hash;
      const appeared = (!rec.extract || rec.extract.length === 0) && extract.length > 0;

      targets[tgt.id] = {
        label: tgt.label, url: tgt.url, status: r.status, ok: true,
        extract, extractHash: hash,
        hasMatch: extract.length > 0,
        lastChecked: now,
        lastChanged: changed ? now : rec.lastChanged || null,
      };

      if (changed && !firstRun) changes.push({ ...tgt, extract, appeared });
    } catch (e) {
      targets[tgt.id] = {
        ...rec, label: tgt.label, url: tgt.url, ok: false,
        error: String(e.message || e), lastChecked: now,
      };
    }
  }

  await db.setJSON("state", { targets, firstRun: false, lastRun: now });
  if (changes.length) { try { await sendAlert(changes); } catch (e) { console.error("cannes email failed", e); } }
  return { ok: true, lastRun: now, changed: changes.map((c) => c.id), firstRun };
}

export async function getData() {
  const db = store();
  const state = (await db.get("state", { type: "json" })) || { targets: {}, lastRun: null };
  const list = TARGETS.map((t) => {
    const r = state.targets?.[t.id] || {};
    return {
      id: t.id, label: t.label, url: t.url,
      ok: r.ok !== false, status: r.status ?? null, error: r.error ?? null,
      hasMatch: !!r.hasMatch,
      snippet: (r.extract || "").slice(0, 400),
      lastChecked: r.lastChecked || null,
      lastChanged: r.lastChanged || null,
    };
  });
  return { targets: list, lastRun: state.lastRun || null };
}
