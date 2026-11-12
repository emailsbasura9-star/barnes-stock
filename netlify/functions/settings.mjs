// GET returns the alerts setting; POST {alertsEnabled: bool} updates it.
import { setAlerts, getData } from "../lib/core.mjs";

const json = (x) =>
  new Response(JSON.stringify(x), { headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    return json(await setAlerts(body.alertsEnabled));
  }
  const { settings } = await getData();
  return json(settings);
};
