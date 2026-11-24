// Scheduled Nudie Tuff Tony stock check — runs hourly, server-side.
import { run } from "../lib/nudie.mjs";

export default async () => {
  const result = await run();
  console.log("nudie check:", JSON.stringify(result));
  return new Response("ok");
};

export const config = { schedule: "0 * * * *" };
