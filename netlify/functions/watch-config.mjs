// Edits the watchlist: addTab / removeTab / renameTab / addItem / removeItem.
import { mutate } from "../lib/watchlist.mjs";

export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const result = await mutate(body);
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};
