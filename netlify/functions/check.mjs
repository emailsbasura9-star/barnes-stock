// Scheduled check — runs every hour, server-side, whether or not your
// computer is on. Scrapes, updates storage, emails on a restock.
import { run } from "../lib/core.mjs";

export default async () => {
  const result = await run();
  console.log("scheduled check:", JSON.stringify(result));
  return new Response("ok");
};

export const config = { schedule: "@hourly" };

