// Editable watchlist: tabs → items (product URL + watched sizes), stored in the
// site's database so they can be added/removed from the page. The hourly checker
// reads this list, checks each item via the universal engine, and emails (from
// "Stock Watcher") when a watched size goes out → in.
//
// Baselining is per-item: a newly added item records its current state on the
// next run and only alerts on a later out → in, so adding something never fires
// a spurious "restock".

import { getStore } from "@netlify/blobs";
import { fetchProduct } from "./engine.mjs";

const SENDER = process.env.ALERT_FROM_WATCH || "Stock Watcher <onboarding@resend.dev>";
const NU = "https://www.nudiejeans.com/en-AR/product/";
const AN = "https://anovair.com/products/";
const NUIMG = "https://nudie.centracdn.net/client/dynamic/images/";
const SHIMG = "https://cdn.shopify.com/s/files/1/0507/8948/2693/files/";

const TUFF = ["W28/L32", "W29/L32", "W30/L32"];
const ANSZ = ["28", "30"];

const DEFAULT_CONFIG = {
  tabs: [
    {
      id: "tuff-tony", name: "Tuff Tony",
      items: [
        { id: "tt-black-vintage",    url: NU + "tuff-tony-black-vintage",    label: "Black Vintage",    img: NUIMG + "8572_06e4f52cce-114756_tuff_tony_black_vintage_7.jpg", sizes: TUFF },
        { id: "tt-black-water",      url: NU + "tuff-tony-black-water",      label: "Black Water",      img: NUIMG + "9089_67cd3b774d-115070_tuff_tony_black_water1_lifestyle.jpg", sizes: TUFF },
        { id: "tt-dirt-path",        url: NU + "tuff-tony-dirt-path",        label: "Dirt Path",        img: NUIMG + "9572_68ea6adac9-115281-tuff-tony-dirt-path-1-1.jpg", sizes: TUFF },
        { id: "tt-dry-deadstock-23", url: NU + "tuff-tony-dry-deadstock-23", label: "Dry Deadstock 23", img: NUIMG + "9479_c2b716ee94-tuff-tony-deadstock-23-pc-1-flatshot.jpg", sizes: TUFF },
        { id: "tt-dry-ecru-waves",   url: NU + "tuff-tony-dry-ecru-waves",   label: "Dry Ecru Waves",   img: NUIMG + "9430_95f4c4b30e-01-tuff-tony-dry-ecru-waves-back.jpg", sizes: TUFF },
        { id: "tt-dry-old",          url: NU + "tuff-tony-dry-old",          label: "Dry Old",          img: NUIMG + "9011_4f0790c6e7-115015_tuff_tony_dry_old-flatshot-hover.jpg", sizes: TUFF },
        { id: "tt-dry-sunburns",     url: NU + "tuff-tony-dry-sunburns",     label: "Dry Sunburns",     img: NUIMG + "8931_527e04f8a9-tuff-tony-sunburns-product-image-flatshot.jpg", sizes: TUFF },
        { id: "tt-one-wash",         url: NU + "tuff-tony-one-wash-115068",  label: "One Wash",         img: NUIMG + "9061_cee00ca64f-115068_tuff-tony-one-wash-14-1-flatshot.jpg", sizes: TUFF },
      ],
    },
    {
      id: "anovair", name: "Anovair bootcut",
      items: [
        { id: "an-raw-denim",  url: AN + "bootcut-denim-jeans-selvedge",   label: "Raw Denim",  img: SHIMG + "Bootcut_Jeans_-_Raw_Denim_1.jpg?v=1770565887", sizes: ANSZ },
        { id: "an-light-blue", url: AN + "bootcut-denim-jeans-light-blue",  label: "Light Blue", img: SHIMG + "BootcutJeans-LightBlue1_289eb1c7-2fe2-4870-a854-f6e9557475a1.jpg?v=1770565845", sizes: ANSZ },
        { id: "an-charcoal",   url: AN + "bootcut-denim-jeans-charcoal",    label: "Charcoal",   img: SHIMG + "Bootcut_Jeans_-_Charcoal_1.jpg?v=1770565820", sizes: ANSZ },
      ],
    },
  ],
};

function store() { return getStore("watch"); }

async function getConfig() {
  const db = store();
  let cfg = await db.get("config", { type: "json" });
  if (!cfg || !Array.isArray(cfg.tabs)) { cfg = DEFAULT_CONFIG; await db.setJSON("config", cfg); }
  return cfg;
}
async function setConfig(cfg) { await store().setJSON("config", cfg); }
async function getState() { return (await store().get("state", { type: "json" })) || { items: {}, lastRun: null }; }
async function setState(s) { await store().setJSON("state", s); }

export async function resetState() { await store().delete("state"); }

export async function preview(url) {
  if (!url) return { ok: false, error: "No URL given." };
  return await fetchProduct(url);
}

export async function mutate(a) {
  const cfg = await getConfig();
  if (a.type === "addTab") {
    const id = "t" + Date.now().toString(36);
    cfg.tabs.push({ id, name: (a.name || "New tab").slice(0, 40), items: [] });
    await setConfig(cfg); return { ok: true, tabId: id };
  }
  if (a.type === "removeTab") {
    cfg.tabs = cfg.tabs.filter((t) => t.id !== a.tabId);
    await setConfig(cfg); return { ok: true };
  }
  if (a.type === "renameTab") {
    const t = cfg.tabs.find((t) => t.id === a.tabId); if (t) t.name = (a.name || t.name).slice(0, 40);
    await setConfig(cfg); return { ok: true };
  }
  if (a.type === "addItem") {
    const t = cfg.tabs.find((t) => t.id === a.tabId); if (!t) return { ok: false, error: "tab not found" };
    if (!a.url || !Array.isArray(a.sizes) || !a.sizes.length) return { ok: false, error: "need a url and at least one size" };
    const id = "i" + Date.now().toString(36);
    t.items.push({ id, url: a.url, label: (a.label || a.url).slice(0, 80), img: a.img || "", sizes: a.sizes });
    await setConfig(cfg); return { ok: true, itemId: id };
  }
  if (a.type === "removeItem") {
    const t = cfg.tabs.find((t) => t.id === a.tabId); if (t) t.items = t.items.filter((i) => i.id !== a.itemId);
    await setConfig(cfg); return { ok: true };
  }
  return { ok: false, error: "unknown action" };
}

async function sendAlert(restocks) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — skipping email"); return; }
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";
  const labels = [...new Set(restocks.map((r) => r.label))].join(", ");
  const subject = "Stock Watcher — back in stock: " + labels;

  const rows = restocks.map((r) => `
    <tr>
      <td style="padding:8px 10px 8px 0;vertical-align:top">${r.img ? `<img src="${r.img}" width="56" style="border-radius:6px;display:block">` : ""}</td>
      <td style="padding:8px 0;vertical-align:top">
        <a href="${r.url}" style="font-weight:600;color:#1a1a1a;text-decoration:none;font-size:15px">${r.label}</a>
        <div style="color:#8e8e93;font-size:12px">${r.tab}</div>
        <div style="color:#16a34a;font-size:13px;margin-top:2px">${r.size} — in stock</div>
      </td>
    </tr>`).join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;color:#1a1a1a;line-height:1.5">
    <p style="font-size:15px;margin:0 0 12px"><b>Back in stock</b></p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="color:#8e8e93;font-size:12px;margin:16px 0 0">Stock Watcher</p>
  </div>`;
  const text = "Back in stock:\n\n" +
    restocks.map((r) => `${r.label} (${r.tab}) — ${r.size}\n${r.url}`).join("\n\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER, to, subject, html, text }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
}

export async function run() {
  const cfg = await getConfig();
  const st = await getState();
  const items = st.items || {};
  const now = new Date().toISOString();
  const restocks = [];

  for (const tab of cfg.tabs) {
    for (const it of tab.items) {
      const rec = items[it.id] || {};
      const prod = await fetchProduct(it.url);
      if (!prod.ok) { items[it.id] = { ...rec, ok: false, error: prod.error, lastChecked: now }; continue; }
      const map = {};
      for (const v of prod.variants) map[v.name] = v.available ? "in" : "out";

      const avail = {};
      let changed = false;
      for (const s of it.sizes) {
        const cur = map[s] || "—";
        avail[s] = cur;
        const was = rec.avail ? rec.avail[s] : undefined;   // undefined = first sighting → baseline only
        if (cur === "in") {
          if (was !== undefined && was !== "in") restocks.push({ tab: tab.name, label: it.label, url: it.url, img: it.img || prod.image, size: s });
          if (was !== "in") changed = true;
        } else if (was !== cur) {
          changed = true;
        }
      }
      items[it.id] = { ok: true, avail, lastChecked: now, lastChanged: changed ? now : rec.lastChanged || null };
    }
  }

  // prune state for items no longer in config
  const liveIds = new Set(cfg.tabs.flatMap((t) => t.items.map((i) => i.id)));
  for (const id of Object.keys(items)) if (!liveIds.has(id)) delete items[id];

  await setState({ items, lastRun: now });
  if (restocks.length) { try { await sendAlert(restocks); } catch (e) { console.error("email failed", e); } }
  return { ok: true, lastRun: now, restocked: restocks.length };
}

export async function getData() {
  const cfg = await getConfig();
  const st = await getState();
  const items = st.items || {};
  const tabs = cfg.tabs.map((t) => ({
    id: t.id, name: t.name,
    items: t.items.map((it) => {
      const r = items[it.id] || {};
      const sizes = {};
      for (const s of it.sizes) sizes[s] = (r.avail && r.avail[s]) || "—";
      return { id: it.id, url: it.url, label: it.label, img: it.img, ok: r.ok !== false, error: r.error ?? null, sizes, lastChecked: r.lastChecked || null, lastChanged: r.lastChanged || null };
    }),
  }));
  return { tabs, lastRun: st.lastRun || null };
}
