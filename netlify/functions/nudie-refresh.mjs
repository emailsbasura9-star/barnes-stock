// Manual Nudie check — run a check now. ?reset=1 clears the baseline first
// and re-records it without emailing.
import { run, resetState } from "../lib/nudie.mjs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("reset") === "1") await resetState();
  const result = await run();
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};
