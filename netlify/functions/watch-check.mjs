// Scheduled check for the editable watchlist — runs hourly.
import { run } from "../lib/watchlist.mjs";

export default async () => {
  const result = await run();
  console.log("watch check:", JSON.stringify(result));
  return new Response("ok");
};

export const config = { schedule: "0 * * * *" };
