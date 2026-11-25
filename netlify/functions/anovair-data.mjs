// Serves the Anovair bootcut watcher state for the "Anovair" tab.
import { getData } from "../lib/anovair.mjs";

export default async () => {
  const data = await getData();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
