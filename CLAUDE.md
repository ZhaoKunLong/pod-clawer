# CLAUDE.md

This file gives future coding agents the operational context for `pod-clawer`.

## Project Summary

`pod-clawer` is a TypeScript/Node.js Crawlee project that fetches the daily CCTV `朝闻天下` full episode, extracts audio with `ffmpeg`, stores it under `data/YYYY-MM-DD`, and serves it through a lightweight Express web player.

Current target program:

- Column page: `https://tv.cctv.cn/lm/zwtx/index.shtml`
- Column ID: `TOPC1451558496100826`
- Timezone for "today": `Asia/Shanghai`
- Expected daily target: latest full morning episode, normally `08:00`

## Important Commands

Run from project root:

```bash
npm install
npm run build
npm run crawl
npm run start:server
```

Useful test command for a specific historical date:

```bash
npx tsx src/crawler/run.ts 2023-07-16
```

Current local server URL:

```text
http://localhost:3000
```

## Directory Map

```text
src/
  api/server.ts          Express API and static web server
  crawler/cctv.ts        CCTV-specific list/page/video API extraction
  crawler/run.ts         Daily crawl orchestration and media-source fallback
  media/ffmpeg.ts        ffmpeg MP3 extraction
  services/date.ts       timezone/date helpers
  services/http.ts       fetch JSON/JSONP helpers
  services/storage.ts    data/YYYY-MM-DD storage helpers
  web/                   mobile-first static UI

data/
  YYYY-MM-DD/
    audio.mp3
    meta.json

.github/workflows/
  daily-crawl.yml        Runs at 00:00 UTC, 08:00 China time
```

## CCTV Extraction Flow

1. The crawler calls:

```text
https://zy.api.cntv.cn/NewVideo/getVideoListByColumn
```

with:

```text
id=TOPC1451558496100826
n=100
sort=desc
p=1
bd=YYYYMMDD
mode=2
serviceId=tvcctv
```

2. It filters for full `《朝闻天下》 YYYYMMDD HH:MM` entries and selects the latest valid morning broadcast between 05:00 and 10:00.

3. It opens the selected episode page and parses:

```js
var guid = "..."
```

4. It calls:

```text
https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=<guid>
```

5. It prefers audio-only HLS, then falls back to video HLS:

- `manifest.audio_mp3`
- `manifest.hls_audio_url`
- `hls_url`
- `manifest.hls_h5e_url`
- `manifest.hls_enc_url`
- `manifest.hls_enc2_url`

## Known Runtime Behaviors

- On `2026-05-13`, CCTV returned a broken audio-only HLS URL with HTTP 404.
- The current implementation handles this by trying all media sources in order and falling back to video HLS extraction.
- `ffmpeg` output uses a temporary `.mp3.part` path and explicitly sets `-f mp3`; without this, ffmpeg may fail to infer the muxer.
- Crawlee queues should not be named by stable episode IDs for one-shot page parsing. Reusing a named queue can cause reruns to process zero requests because Crawlee remembers the request as handled. Use the default temporary queue unless implementing durable multi-page crawl state intentionally.
- Crawlee local runtime state appears under `storage/`; compiled JS appears under `dist/`. Both are ignored by `.gitignore`.

## Current Verified State

The crawler has successfully generated:

```text
data/2026-05-13/audio.mp3
data/2026-05-13/meta.json
```

The generated MP3 was checked with `ffprobe`:

```text
duration=3137.536000
size=50201517
```

API checks:

```bash
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/episodes
curl -s http://localhost:3000/episodes/2026-05-13
```

## API

- `GET /episodes`
- `GET /episodes/:date`
- `GET /data/YYYY-MM-DD/audio.mp3`
- `GET /healthz`

## Web UI

- Homepage: `/`
- Detail page: `/episode.html?date=YYYY-MM-DD`
- The detail page uses `<audio controls autoplay>`. Browser autoplay policies may block autoplay until the user interacts.

## GitHub Actions

Workflow file:

```text
.github/workflows/daily-crawl.yml
```

Schedule:

```yaml
cron: '0 0 * * *'
```

This is 08:00 China Standard Time. The workflow installs `ffmpeg`, installs npm dependencies, installs Playwright Chromium, runs `npm run crawl`, and commits new `data/**/*` files.

## Development Notes

- Keep the project TypeScript strict.
- Run `npm run build` after code changes.
- If testing the real crawler, expect a full episode conversion to take around 1-2 minutes and produce a roughly 45-55 MB MP3.
- Do not mock CCTV data for crawler fixes. Use a historical date if today's page is temporarily unavailable.
- If the CCTV list API changes, inspect the live column page script around `getVideoListByColumn`.
- If the video API changes, inspect the episode page for `guid` and the player scripts, then update `resolveVideoInfo`.

## Extending To Other CCTV Programs

For another CCTV program:

1. Set `CCTV_COLUMN_URL` to the target column page.
2. Set `CCTV_COLUMN_ID` to that page's `topicID`.
3. Update title filtering in `selectLatestMorningEpisode` if the program name or broadcast window differs.
4. Keep the same `guid -> getHttpVideoInfo.do` media resolution pipeline unless the target program uses a different player.

