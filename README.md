# Reels Stats

See how many Instagram Reels you watch **per day** — your daily average, median, busiest day,
weekday pattern and a day-by-day breakdown with a chart.

It's a single static page: no server, no build step, no login. Your Instagram export is read
**entirely in your browser** and never uploaded anywhere.

## How it works

Instagram has no public API for your watch history, but its
**Download your information** export contains `videos_watched.json`, a log of every video
you watched with a timestamp. Reels Stats reads that file (straight from the `.zip`), groups
the timestamps by calendar day in your local time zone, and fills in days with zero views
so the averages are honest.

### Getting your export

1. Instagram → **Settings → Accounts Center → Your information and permissions → Download your information**
2. **Some of your information** → tick **Ads information** (or export everything)
3. **Download to device**, Date range **All time**, **Format: JSON** (not HTML)
4. When the email arrives, download the `.zip` and drop it on the page.

> Limitations: Instagram's log doesn't separate Reels from other videos, and it may only keep a
> limited recent window. Treat the numbers as a close estimate.

## Hosting

### GitHub Pages (already set up)

1. Push to `main`.
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs the tests and publishes the site to
   `https://<your-user>.github.io/<repo-name>/`.

### Anywhere else

It's plain static files (`index.html` + `src/`), so any static host works:

- **Netlify / Cloudflare Pages / Vercel** — import the repo, leave the build command empty,
  set the output/publish directory to the repo root.
- **Netlify Drop** — drag the project folder onto <https://app.netlify.com/drop>.

## Run locally

```sh
npm start        # serves the folder at http://localhost:3000
npm test         # unit tests for the parser and stats (Node 18+)
```

Opening `index.html` directly from disk won't work, because browsers block ES modules on
`file://` — use any local web server.

## Project layout

```
index.html        page markup
src/app.js        file loading, rendering (chart, weekday bars, table, CSV export)
src/stats.js      export parsing + statistics (pure, unit-tested)
src/styles.css    styles (light + dark)
tests/            node:test unit tests
```
