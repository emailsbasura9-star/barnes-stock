// Reads a pasted product URL and returns its title, image and variants (with
// availability) so the page can show which sizes to track before saving.
import { preview } from "../lib/watchlist.mjs";

export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const result = await preview(body.url);
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};
