// Serves the Nudie Tuff Tony watcher state for the "Jeans" tab.
import { getData } from "../lib/nudie.mjs";

export default async () => {
  const data = await getData();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
