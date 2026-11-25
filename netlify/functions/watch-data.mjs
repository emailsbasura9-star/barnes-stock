// Serves the watchlist (tabs + items + current stock) for the page.
import { getData } from "../lib/watchlist.mjs";

export default async () => {
  const data = await getData();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
