// Scheduled Cannes watcher — runs every 5 minutes, server-side.
import { run } from "../lib/cannes.mjs";

export default async () => {
  const result = await run();
  console.log("cannes check:", JSON.stringify(result));
  return new Response("ok");
};

export const config = { schedule: "*/5 * * * *" };
