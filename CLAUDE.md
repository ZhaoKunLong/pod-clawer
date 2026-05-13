# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pod-clawer** is a TypeScript crawler and PWA media player for CCTV news programs. It crawls daily episodes for multiple programs (currently 朝闻天下 and 新闻联播), extracts HLS/MP4 streaming URLs, stores metadata as static JSON, and serves a mobile-first web player. Designed to run on a GitHub Actions schedule and deploy the frontend to GitHub Pages as a PWA.

**Live URL:** https://zhaokunlong.github.io/pod-clawer/

## Commands

```bash
npm run build            # Compile TypeScript to dist/
npm run crawl -- zwtx    # Crawl 朝闻天下 (auto-resolves correct date)
npm run crawl -- xwlb    # Crawl 新闻联播 (auto-resolves correct date)
npm run crawl:zwtx       # Shorthand for above
npm run crawl:xwlb       # Shorthand for above
npm run serve            # Start Express server (port 3000)
npm run start            # Crawl zwtx then serve
npm run start:server     # Serve existing data without crawling
npm run lint             # Type-check only (tsc --noEmit)
```

Crawl a specific program and date:
```bash
npx tsx src/crawler/run.ts zwtx 2026-05-13
npx tsx src/crawler/run.ts xwlb 2026-05-12
```

Local static preview (fully simulates GitHub Pages):
```bash
npx http-server . -p 8080
```

## Architecture

### Data Flow

1. **Date Resolution** (`src/services/date.ts`): `latestEpisodeDateForProgram()` computes the correct target date based on the program's broadcast cutoff time. If the current Beijing time is past the cutoff, today's date is used; otherwise yesterday's. This means crawling before 08:10 CST fetches yesterday's 朝闻天下, and crawling before 21:10 CST fetches yesterday's 新闻联播.

2. **Episode Discovery** (`src/crawler/cctv.ts`): Calls the CCTV column API (no date filter — fetches latest 20 items) to find the target episode. Falls back to Playwright scraping the column page if the API returns no match.

3. **Stream Extraction** (`src/parser/media.ts`): Launches a Playwright browser, monitors network traffic while loading the episode page, and scores candidate URLs (HLS m3u8 > MP4; audio-only > video). Validates each candidate with a HEAD/GET request.

4. **Orchestration** (`src/crawler/run.ts`): Idempotent — skips if `data/{programId}/YYYY-MM-DD/meta.json` already exists. Runs old-data migration on startup. Falls back to ffmpeg MP3 extraction if stream extraction fails. Prunes episodes older than `retentionDays` and rebuilds the per-program index.

5. **Storage** (`src/services/storage.ts`): Writes `data/{programId}/YYYY-MM-DD/meta.json` per episode and maintains `data/{programId}/index.json` (all episodes, newest first). Includes `migrateOldEpisodes()` which auto-moves legacy flat `data/YYYY-MM-DD/` dirs to `data/zwtx/YYYY-MM-DD/` on first run.

6. **API Server** (`src/api/server.ts`): Express server for local development only. Exposes `GET /episodes?program=zwtx` and `GET /episodes/:date?program=zwtx`. Not used in production (GitHub Pages is fully static).

7. **Frontend** (`src/web/` + root `index.html`/`episode.html`): Program tab navigation via `?program=` query param. `app.js` lists episodes per program; `episode.js` plays them using hls.js with native media fallback. Fetches data directly from static JSON files — no API dependency.

8. **PWA** (`manifest.json`, `sw.js`, `icons/`): Service worker with network-first strategy for `data/` JSON and cache-first for shell assets. Installable on Android (Chrome) and iOS (Safari).

### Program Registry (`src/programs/registry.ts`)

All program-specific configuration lives here. To add a new program, add one entry to `PROGRAMS`:

```typescript
export const PROGRAMS: Record<string, ProgramConfig> = {
  zwtx: {
    id: 'zwtx',
    name: '朝闻天下',
    columnId: 'TOPC1451558496100826',
    columnUrl: 'https://tv.cctv.cn/lm/zwtx/index.shtml',
    titlePattern: /朝闻天下/,
    fullEpisodePattern: /《朝闻天下》/,
    broadcastTimeWindow: { startHour: 5, endHour: 8, endMinute: 10 },
    retentionDays: 31,
  },
  xwlb: {
    id: 'xwlb',
    name: '新闻联播',
    columnId: 'TOPC1451528971114112',
    columnUrl: 'https://tv.cctv.com/lm/xwlb/',
    titlePattern: /新闻联播/,
    fullEpisodePattern: /《新闻联播》/,
    broadcastTimeWindow: { startHour: 19, endHour: 21, endMinute: 10 },
    retentionDays: 31,
  },
};
```

`broadcastTimeWindow.endHour/endMinute` is the cutoff: if current Beijing time > cutoff, today's episode is expected to be available; otherwise yesterday's is the latest.

After adding a program to the registry, also add it to the hardcoded list in `src/web/app.js` (frontend tab nav) and create a new GitHub Actions workflow.

### Key Types (`src/types.ts`)

- `EpisodeCandidate` — discovered episode (title, url, broadcastTime, image)
- `VideoInfo` — CCTV API video details (hlsUrl, audioSourceUrl, durationSeconds)
- `StreamInfo` — selected stream (streamUrl, type: `'m3u8' | 'mp4'`)
- `EpisodeMeta` — final stored record: all above + `program`, fallback flag, createdAt

### Storage Layout

```
data/
├── zwtx/
│   ├── index.json          # all zwtx episodes, newest first
│   └── 2026-05-13/
│       └── meta.json
└── xwlb/
    ├── index.json          # all xwlb episodes, newest first
    └── 2026-05-12/
        └── meta.json
```

### Configuration (`src/config.ts`)

Program-specific config (columnId, columnUrl, patterns) has moved to the registry. Remaining env vars:

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | Episode storage root |
| `CRAWLER_HEADLESS` | `true` | Playwright headless mode |
| `CRAWLER_TIMEZONE` | `Asia/Shanghai` | Date calculations |
| `FFMPEG_BIN` | `ffmpeg` | ffmpeg binary path |
| `FORCE_DOWNLOAD_FALLBACK` | unset | Force ffmpeg MP3 path |

Copy `.env.example` to `.env` to configure locally.

## CI/CD

Two scheduled workflows, both on the `master` branch:

| Workflow | Schedule | Crawls | Commits |
|---|---|---|---|
| `.github/workflows/crawl-zwtx.yml` | `15 0 * * *` (08:15 CST) | `npm run crawl:zwtx` | `data/zwtx/**/*.json` |
| `.github/workflows/crawl-xwlb.yml` | `15 13 * * *` (21:15 CST) | `npm run crawl:xwlb` | `data/xwlb/**/*.json` |

Both require `contents: write` permission and Playwright Chromium installed in the workflow.

GitHub Pages is deployed from the `master` branch root. The `develop` branch is used for feature development.

## PWA

- `manifest.json` — Web App Manifest with `start_url: /pod-clawer/`, `display: standalone`
- `sw.js` — Service Worker: cache-first for shell assets, network-first for `data/` JSON
- `icons/icon-192.png`, `icons/icon-512.png` — red (#e63946) background with white play triangle

## Module System

The project uses ES modules (`"type": "module"` in package.json) with `"moduleResolution": "bundler"` in tsconfig. Use `.js` extensions in imports even for `.ts` source files.
