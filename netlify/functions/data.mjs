// Returns current stock + settings for the page to render.
import { getData } from "../lib/core.mjs";

export default async () => {
  const data = await getData();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
