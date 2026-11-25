// Manual watchlist check — run now. ?reset=1 clears all state and re-baselines
// without emailing.
import { run, resetState } from "../lib/watchlist.mjs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("reset") === "1") await resetState();
  const result = await run();
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};
