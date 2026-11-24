// Manual Cannes check — hit this URL to run a check now.
//   ?reset=1  clears the saved baseline first, then re-records it without
//             emailing (use after changing what/how we watch).
import { run, resetState } from "../lib/cannes.mjs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("reset") === "1") {
    await resetState();
  }
  const result = await run();
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
};
