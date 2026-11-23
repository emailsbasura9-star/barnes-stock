// Serves the Cannes watcher state for the page's "Cannes" tab.
import { getData } from "../lib/cannes.mjs";

export default async () => {
  const data = await getData();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
