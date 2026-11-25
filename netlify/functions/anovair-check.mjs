// Scheduled Anovair bootcut stock check — runs hourly, server-side.
import { run } from "../lib/anovair.mjs";

export default async () => {
  const result = await run();
  console.log("anovair check:", JSON.stringify(result));
  return new Response("ok");
};

export const config = { schedule: "0 * * * *" };
