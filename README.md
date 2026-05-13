# pod-clawer

`pod-clawer` crawls CCTV's `朝闻天下` page, resolves the latest daily full episode, extracts audio with `ffmpeg`, stores it under `data/YYYY-MM-DD`, and serves a small mobile-friendly web player.

## Requirements

- Node.js 20+
- npm
- ffmpeg available on `PATH`
- Chromium dependencies for Playwright if the rendered-page fallback is needed

## Setup

```bash
npm install
cp .env.example .env
npm run start
```

The default server runs at `http://localhost:3000`.

Useful commands:

```bash
npm run crawl          # crawl and process today's episode
npm run start:server   # serve existing data without crawling
npm run build          # type-check and compile TypeScript
```

You can crawl a specific date for testing:

```bash
npx tsx src/crawler/run.ts 2023-07-16
```

## Data Layout

Each processed day is stored as:

```text
data/
  YYYY-MM-DD/
    audio.mp3
    meta.json
```

The crawler is idempotent. If both `audio.mp3` and `meta.json` already exist for a date, it skips downloading and conversion.

## API

- `GET /episodes` returns all available episodes sorted newest first.
- `GET /episodes/:date` returns one episode and its `audioUrl`.
- `GET /data/YYYY-MM-DD/audio.mp3` serves the audio file.

## How Video URL Extraction Works

The CCTV column page includes a script that calls:

```text
https://zy.api.cntv.cn/NewVideo/getVideoListByColumn
```

with `id=TOPC1451558496100826`, `bd=YYYYMMDD`, `mode=2`, and `serviceId=tvcctv`. The crawler uses that API first and filters for the full `《朝闻天下》 YYYYMMDD HH:MM` episode for the target day.

For the selected episode page, the crawler parses the page-level `guid` variable, then calls:

```text
https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=<guid>
```

That response provides `manifest.audio_mp3`, `manifest.hls_audio_url`, and `hls_url`. The media pipeline prefers the audio-only HLS source and falls back to the video HLS URL when needed. `ffmpeg` writes the final MP3 at 128 kbps.

If the API list changes or returns empty, a PlaywrightCrawler fallback loads the column page and extracts rendered `VIDE...shtml` links.

## Scheduling

`.github/workflows/daily-crawl.yml` runs daily at `0 0 * * *` UTC, which is 08:00 in China Standard Time. The workflow:

1. Checks out the repository.
2. Installs Node dependencies and ffmpeg.
3. Installs the Playwright Chromium browser.
4. Runs `npm run crawl`.
5. Commits new files under `data/**/*`.

## Extending To Other CCTV Programs

Create a new `.env` or deployment config with:

- `CCTV_COLUMN_URL` set to the target program page.
- `CCTV_COLUMN_ID` set to that page's `topicID` from the page script.

If the title pattern differs, update `selectLatestMorningEpisode` in `src/crawler/cctv.ts` to match the new program name and broadcast window. The rest of the pipeline can stay the same because CCTV episode pages generally expose `guid` and use the same `getHttpVideoInfo.do` API.

