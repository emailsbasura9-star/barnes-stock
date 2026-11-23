// Manual Cannes check — hit this URL to run a check now (also seeds the baseline
// right after deploy). The first run just records a baseline and sends no email.
import { run } from "../lib/cannes.mjs";

export default async () => {
  const result = await run();
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
};
