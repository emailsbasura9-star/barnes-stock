# Barnes Muscle Tees — stock tracker

A self-running website that checks the Barnes store every hour, shows Talle 1 / Talle 2
stock for nine muscle tees (colour-coded), and emails you when a watched item returns in
size 1. It runs on Netlify's servers, so it works while your computer is off.

- **Green** = size 1 available · **Yellow** = only size 2 · **Red** = neither
- **Watched (bell + email):** White, Black, Slub Black, Slub Habano, Brown
- **Email alert** fires when a watched item goes from no size 1 → size 1 in stock.

## What's in here

```
index.html                     the page
netlify.toml                   Netlify config
package.json                   dependencies (installed by Netlify)
netlify/lib/core.mjs           scrape + compare + email + storage (the brains)
netlify/functions/check.mjs    hourly scheduled check
netlify/functions/refresh.mjs  "Refresh now" button (scrape on demand)
netlify/functions/data.mjs     serves current stock to the page
netlify/functions/settings.mjs reads/writes the alerts on/off switch
```

Storage uses **Netlify Blobs** (built in, nothing to set up). Email uses **Resend**.

## One-time setup

### 1. Resend (email)
1. Create a Resend account **using mfaigenbaum@gmail.com** as the account email.
   (With no custom domain, Resend's default sender `onboarding@resend.dev` only delivers
   to the account owner's own address — so the account email must be the one you want
   alerts at.)
2. Create an API key (Resend dashboard → API Keys). Copy it.

### 2. Deploy to Netlify
The easiest reliable way (so Netlify installs dependencies and bundles the functions):
1. Put these files in a GitHub repo (new repo → upload all files).
2. Netlify → **Add new site → Import an existing project** → pick the repo.
   Leave the build command empty; publish directory `.`. Deploy.

(Netlify's drag-and-drop upload skips dependency install, so the functions won't work that
way — use the Git import above, or the Netlify CLI `netlify deploy --build`.)

### 3. Environment variables (Netlify → Site settings → Environment variables)
| Key | Value | Required |
|-----|-------|----------|
| `RESEND_API_KEY` | your Resend API key | yes |
| `ALERT_TO` | `mfaigenbaum@gmail.com` | optional (this is the default) |
| `ALERT_FROM` | `Barnes Tracker <onboarding@resend.dev>` | optional (this is the default) |

Redeploy after adding the variables so the functions pick them up.

## First run
The hourly check starts on its own. To see data immediately, open the site and press
**Refresh now** once — it scrapes on the spot and fills the page.

## Staying out of spam
The first real alert may land in Promotions or Spam. Open it once, mark **Not spam** /
move to Primary, and add the sender to contacts — Gmail then keeps future ones in the
inbox. (Getting your own domain later and verifying it in Resend is the strongest fix, but
isn't needed for mail to your own address.)

## If the scheduled check logs show fetch failures
Barnes sits behind Cloudflare. A plain server request almost always works, but if Cloudflare
starts blocking it you'll see errors in **Netlify → Functions → check → logs** and the page
items will show a small "stale" tag. If that happens, that's the signal to add a scraping
workaround — tell me and I'll wire one in.

## Changing things later
- **Watched items / which get emailed:** edit `WATCHED` in `netlify/lib/core.mjs`.
- **Products or their order:** edit `PRODUCTS` in the same file (and `FALLBACK` in `index.html`).
- **How often it checks:** change `schedule: "@hourly"` in `netlify/functions/check.mjs`
  (e.g. `"0 */6 * * *"` for every 6 hours; cron is in UTC).
- **Alert trigger (size 1 vs. size 1 or 2):** edit the flip check in `core.mjs` (`run()`).
