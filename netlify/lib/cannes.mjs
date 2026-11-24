// Cannes Film Week (Semana de Cine, Cine Gaumont, Buenos Aires) ticket watcher.
// Checks a few pages every 5 minutes and emails when something ticket-relevant
// changes, showing exactly what changed. Emails come from "Cannes BA Tickets".
//
// Two watch modes:
//  - "text": extract the page's visible text, keep only lines matching `focus`
//    (ticket keywords / the Cannes film titles), and alert when that subset
//    changes. The email shows the new/removed lines (a diff), not just a dump.
//  - "build": the page is a JavaScript app whose content isn't in the server
//    HTML (cannesfilmweek.ar reads it from a database in the browser). We watch
//    the site's build fingerprint — the hashed asset files it loads — and alert
//    if the site is rebuilt. Caveat: a data-only edit without a rebuild is missed.

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
    mode: "text",
    // Note: time is colon-only (14:00) so the page's dd.mm date stamp doesn't trigger it.
    focus: /entrada|entradas|venta|comprar|preventa|anticipad|localidad|precio|\$\s?\d|\b\d{1,2}\s?(de\s)?(noviembre|diciembre)\b|\b\d{1,2}:\d{2}\b/i,
  },
  {
    id: "gaumont",
    label: "Cine Gaumont — cartelera",
    url: "https://www.cinegaumont.ar/es-AR/programacion",
    mode: "text",
    focus: /cannes|bola negra|\bfjord\b|ser querido|tigre de papel|hombre de su tiempo|soudain/i,
  },
  {
    id: "cannesfilmweek",
    label: "Cannes Film Week AR — sitio oficial (build-watch)",
    url: "https://cannesfilmweek.ar/",
    mode: "build",
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
  return text.split("\n").filter((l) => focus.test(l)).join("\n");
}

function buildFingerprint(html) {
  const $ = cheerio.load(html);
  const assets = new Set();
  $("script[src], link[href]").each((_, el) => {
    const u = ($(el).attr("src") || $(el).attr("href") || "").split("?")[0];
    if (/\/assets\//.test(u)) assets.add(u);
  });
  return [...assets].sort().join("\n");
}

function store() {
  return getStore("cannes");
}

// Clears the baseline so the next run records a fresh one without emailing.
export async function resetState() {
  await store().delete("state");
}

function diffLines(oldStr, newStr) {
  const oldL = (oldStr || "").split("\n").filter(Boolean);
  const newL = (newStr || "").split("\n").filter(Boolean);
  return {
    added: newL.filter((l) => !oldL.includes(l)),
    removed: oldL.filter((l) => !newL.includes(l)),
  };
}

function changeSummaryText(c) {
  if (c.mode === "build") {
    const a = (c.added || []).map((x) => x.split("/").pop());
    const r = (c.removed || []).map((x) => x.split("/").pop());
    let s = "El sitio se reconstruyó (cambiaron archivos del build).";
    if (a.length) s += "\nNuevos: " + a.join(", ");
    if (r.length) s += "\nAnteriores: " + r.join(", ");
    return s;
  }
  let s = "";
  if ((c.added || []).length) s += "NUEVO:\n" + c.added.join("\n");
  if ((c.removed || []).length) s += (s ? "\n\n" : "") + "YA NO ESTÁ:\n" + c.removed.join("\n");
  return s || (c.extract || "(sin texto)");
}

async function sendAlert(changes) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — skipping Cannes email"); return; }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";

  const labels = changes.map((c) => c.label.replace(/\s*—.*$/, "")).join(", ");
  const subject = "Cannes BA Tickets — cambió: " + labels;

  const blocks = changes
    .map((c) => {
      const summary = changeSummaryText(c);
      return `
      <div style="margin:0 0 16px;padding:12px 0;border-top:1px solid #eee">
        <div style="font-weight:600;font-size:15px">${c.label}</div>
        <div style="font-size:12px;margin:3px 0 8px"><a href="${c.url}" style="color:#2563eb">${c.url}</a></div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#333;margin:0;background:#f7f7f6;padding:9px 11px;border-radius:6px">${summary.slice(0, 1200).replace(/</g, "&lt;")}</pre>
      </div>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 6px"><b>Cambió algo en una página que vigilo.</b></p>
    <p style="font-size:13px;color:#555;margin:0 0 14px">Abajo, exactamente qué cambió. Puede ser el anuncio de entradas.</p>
    ${blocks}
    <p style="color:#8e8e93;font-size:12px;margin:14px 0 0">Cannes BA Tickets · revisa cada 5 min</p>
  </div>`;

  const text =
    "Cambió algo en una página vigilada:\n\n" +
    changes.map((c) => `${c.label}\n${c.url}\n\n${changeSummaryText(c)}`).join("\n\n———\n\n");

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
  const firstRun = prev.firstRun !== false;
  const now = new Date().toISOString();
  const changes = [];

  for (const tgt of TARGETS) {
    const rec = targets[tgt.id] || {};
    const mode = tgt.mode || "text";
    try {
      const r = await fetch(tgt.url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" },
      });
      const html = await r.text();

      let extract, uiSnippet, hasMatch;
      if (mode === "build") {
        extract = buildFingerprint(html);
        const n = extract ? extract.split("\n").length : 0;
        uiSnippet = `Monitoreando el build del sitio (${n} archivo${n === 1 ? "" : "s"}). Avisa si el sitio se reconstruye.`;
        hasMatch = n > 0;
      } else {
        const text = extractText(html);
        extract = relevantLines(text, tgt.focus);
        uiSnippet = extract;
        hasMatch = extract.length > 0;
      }

      const hadBaseline = rec.extractHash !== undefined;
      const hash = sha1(extract);
      const changed = hadBaseline && rec.extractHash !== hash;

      targets[tgt.id] = {
        label: tgt.label, url: tgt.url, mode, status: r.status, ok: true,
        extract, extractHash: hash, uiSnippet, hasMatch,
        lastChecked: now,
        lastChanged: changed ? now : rec.lastChanged || null,
      };

      if (changed && !firstRun) {
        const { added, removed } = diffLines(rec.extract, extract);
        changes.push({ ...tgt, extract, added, removed, mode });
      }
    } catch (e) {
      targets[tgt.id] = { ...rec, label: tgt.label, url: tgt.url, mode, ok: false, error: String(e.message || e), lastChecked: now };
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
      snippet: (r.uiSnippet ?? r.extract ?? "").slice(0, 400),
      lastChecked: r.lastChecked || null,
      lastChanged: r.lastChanged || null,
    };
  });
  return { targets: list, lastRun: state.lastRun || null };
}
