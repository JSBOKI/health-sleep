# Health & Sleep

A private, client-side record of Jeremy’s Apple Health and sleep data. He is a USAF flight surgeon in Okinawa. Times are shown in Asia/Tokyo.

The site is a static single-page app. Health data never leaves the browser. Imports are parsed in a Web Worker and stored in IndexedDB on the device. There is no backend and no analytics.

## Run locally

```bash
npm ci
npm run dev
```

The dev server listens on port **4179**. A production build is:

```bash
npm run build
npm run preview
```

`npm run verify` checks dates, sleep dedupe, Mann–Kendall, the demo trends, and a small synthetic `export.xml`. `npm run verify:big` also builds a ~100 MB synthetic `export.zip` in `/tmp` and streams it through the same parser.

## Using it

1. On iPhone, open the site in Safari and use **Add to Home Screen**. The manifest makes it a standalone app.
2. In the Health app, export all health data. That produces `export.zip` (often 150–300 MB).
3. On the Data tab, choose that zip, or the `export.xml` inside it. Progress stays on screen while a worker streams the archive. The full XML is not loaded into memory.
4. Importing a newer export **merges** samples and skips ones already stored.
5. **Load demo data** fills every page with synthetic history so the app can be tried with no export. It replaces any demo already stored. Clear demo data before a real import if you loaded it first — a real import does that replacement automatically.
6. **Clear all data** deletes the on-device record, including events.

Events such as “Started Epitalon course” are vertical lines on the charts. Any metric’s daily summary, and the sleep nights, can be downloaded as CSV.

## What it reads

Quantity records: blood oxygen (fraction or percent), resting heart rate, heart rate, HRV (SDNN), respiratory rate, steps, active energy, VO₂ max, sleeping wrist temperature, and weight. Sleep categories: In Bed, Awake, Asleep / AsleepUnspecified, Core, Deep, and REM.

A night belongs to the evening it starts. Segments that begin before noon stay with the previous evening. When two sources overlap, Apple Watch is kept.

## Deploy on Render

This repo includes `render.yaml` for a static site.

| Setting | Value |
| --- | --- |
| Runtime | Static site (`type: web`, `runtime: static`) |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

In the Render dashboard you can also create a **Static Site** by hand with that build command and publish directory. Routes rewrite to `index.html` so a refresh still loads the app. Navigation itself uses the URL hash (`#/sleep`), which works even without the rewrite.

Do not add a server, a database, or an analytics snippet. The publish output is only HTML, CSS, JS, and icons.

## iPhone sync API (`api/`)

A tiny Node web service (`health-sleep-api` on Render, free plan) receives daily
Apple Health summaries from an Apple Shortcuts automation and stores them in a
Render Key Value (Redis) hash `health:daily`, keyed by date (upsert/merge).

- `POST /api/health/ingest` — header `X-Ingest-Token`, JSON body, all fields optional:
  `date, steps, active_energy, resting_hr, avg_hr, hrv, sleep_hours, sleep_start, sleep_end, weight, vo2max, workouts[]`.
  Strings like `"1,234"`, `"62 bpm"`, and newline-separated lists are accepted
  (steps/active_energy/sleep_hours lists are summed, others averaged). `date` defaults to today (JST).
- `DELETE /api/health/data?date=YYYY-MM-DD` — same header; removes one day.
- `GET /api/health/data[?from=YYYY-MM-DD&to=YYYY-MM-DD]` — same header.
- Env: `INGEST_TOKEN`, `REDIS_URL`.

The dashboard's **Synced** tab (`#/synced`) reads this API.
