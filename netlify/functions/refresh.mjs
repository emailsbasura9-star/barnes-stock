// Manual "Refresh now" — scrapes on demand. Has a short cooldown so the
// button can't hammer the store if pressed repeatedly.
//
// Also supports a one-off email test: GET/POST .../refresh?test=1 sends a
// single sample alert through Resend, using the same RESEND_API_KEY and
// ALERT_TO as real alerts. Use it to confirm email works without waiting
// for an actual restock. It's clearly marked TEST and only emails ALERT_TO.
import { run, getData } from "../lib/core.mjs";

const json = (x) =>
  new Response(JSON.stringify(x), { headers: { "content-type": "application/json" } });

async function sendTestEmail() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set in Netlify" };
  const to = process.env.ALERT_TO || "mfaigenbaum@gmail.com";
  const from = process.env.ALERT_FROM || "Barnes Tracker <onboarding@resend.dev>";

  const subject = "Barnes restock: White back in size 1 (TEST)";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;color:#1a1a1a;line-height:1.5">
    <div style="background:#fff8e1;border:1px solid #f0d98a;border-radius:6px;padding:8px 11px;font-size:12px;color:#8a6d1f;margin-bottom:16px"><b>TEST</b> — a test of your alert email, not a real restock.</div>
    <p style="font-size:15px;margin:0 0 14px"><b>Back in stock in Talle 1</b></p>
    <table style="border-collapse:collapse;width:100%"><tr><td style="padding:10px 0;border-top:1px solid #eee">
      <a href="https://barnesindustries.com.ar/productos/muscle-tee-white-t503w/" style="color:#1a1a1a;text-decoration:none;font-weight:600;font-size:15px">White</a>
      <div style="color:#16a34a;font-size:13px;margin-top:2px">Talle 1 &middot; 3 left</div>
    </td></tr></table>
    <p style="color:#8e8e93;font-size:12px;margin:18px 0 0;border-top:1px solid #eee;padding-top:12px">Barnes stock tracker</p>
  </div>`;
  const text =
    "TEST — a test of your alert email, not a real restock.\n\n" +
    "Back in stock in Talle 1:\n\nWhite — Talle 1: 3 left\n" +
    "https://barnesindustries.com.ar/productos/muscle-tee-white-t503w/\n\n— Barnes stock tracker";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, to, resend: body.slice(0, 300) };
}

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("test") === "1") {
    return json(await sendTestEmail());
  }

  const { stock } = await getData();
  if (stock.updatedAt && Date.now() - new Date(stock.updatedAt).getTime() < 90_000) {
    return json({ ok: true, skipped: "cooldown", updatedAt: stock.updatedAt });
  }
  const result = await run();
  return json(result);
};
