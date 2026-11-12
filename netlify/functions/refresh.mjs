// Manual "Refresh now" — scrapes on demand. Has a short cooldown so the
// button can't hammer the store if pressed repeatedly.
import { run, getData } from "../lib/core.mjs";

const json = (x) =>
  new Response(JSON.stringify(x), { headers: { "content-type": "application/json" } });

export default async () => {
  const { stock } = await getData();
  if (stock.updatedAt && Date.now() - new Date(stock.updatedAt).getTime() < 90_000) {
    return json({ ok: true, skipped: "cooldown", updatedAt: stock.updatedAt });
  }
  const result = await run();
  return json(result);
};
