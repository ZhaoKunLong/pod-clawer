# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pod-clawer** is a TypeScript crawler and media player for CCTV's "朝闻天下" (Morning News) program. It crawls daily episodes, extracts streaming URLs, stores metadata as JSON, and serves a web player. Designed to run on a GitHub Actions schedule and optionally deploy the frontend to GitHub Pages.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run crawl          # Crawl today's episode
npm run serve          # Start Express server (port 3000)
npm run start          # Crawl then serve
npm run start:server   # Serve existing data without crawling
npm run lint           # Type-check only (tsc --noEmit)
```

Run the crawler for a specific date:
```bash
npx tsx src/crawler/run.ts 2023-07-16
```

## Architecture

### Data Flow

1. **Episode Discovery** (`src/crawler/cctv.ts`): Calls CCTV API to find the day's "朝闻天下" episode. Falls back to Playwright scraping the column page if the API fails.

2. **Stream Extraction** (`src/parser/media.ts`): Launches a Playwright browser, monitors network traffic while loading the episode page, and scores candidate URLs (HLS m3u8 > MP4; audio-only > video). Validates each candidate with a HEAD/GET request.

3. **Orchestration** (`src/crawler/run.ts`): Idempotent — skips if `data/YYYY-MM-DD/meta.json` already exists. Falls back to ffmpeg MP3 extraction if stream extraction fails. Prunes episodes older than 31 days and rebuilds the index.

4. **Storage** (`src/services/storage.ts`): Writes `data/YYYY-MM-DD/meta.json` per episode and maintains `data/index.json` (all episodes, newest first).

5. **API Server** (`src/api/server.ts`): Express server exposing `GET /episodes` and `GET /episodes/:date`. Also serves static web assets from `src/web/` and root-level HTML files.

6. **Frontend** (`src/web/`): `index.html`/`app.js` lists episodes; `episode.html`/`episode.js` plays them using hls.js with native media fallback.

### Key Types (`src/types.ts`)

- `EpisodeCandidate` — discovered episode (title, url, broadcastTime, image)
- `VideoInfo` — CCTV API video details (hlsUrl, audioSourceUrl, durationSeconds)
- `StreamInfo` — selected stream (streamUrl, type: `'m3u8' | 'mp4'`)
- `EpisodeMeta` — final stored record combining all above + fallback flag, createdAt

### Configuration (`src/config.ts`)

All config comes from environment variables. Key ones:

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | Episode storage root |
| `CRAWLER_HEADLESS` | `true` | Playwright headless mode |
| `CRAWLER_TIMEZONE` | `Asia/Shanghai` | Date calculations |
| `CCTV_COLUMN_ID` | `TOPC1451558496100826` | CCTV API column ID |
| `FORCE_DOWNLOAD_FALLBACK` | unset | Force ffmpeg MP3 path |

Copy `.env.example` to `.env` to configure locally.

## CI/CD

`.github/workflows/daily-crawl.yml` runs `npm run crawl` daily at 00:00 UTC (08:00 CST), then auto-commits any new `data/**/*.json` files. Requires `contents: write` permission and Playwright Chromium installed in the workflow.

## Module System

The project uses ES modules (`"type": "module"` in package.json) with `"moduleResolution": "bundler"` in tsconfig. Use `.js` extensions in imports even for `.ts` source files.
