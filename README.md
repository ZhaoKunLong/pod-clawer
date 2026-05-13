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

## 最新更改

• 我已经把方案收口到你要的部署形态了。

  现在的结构是：

  - 抓取结果只写 data/YYYY-MM-DD/meta.json 和 data/index.json
  - 前端不再依赖 /episodes API，而是直接读取静态 JSON
  - 根目录新增了 pod-clawer/index.html 和 pod-clawer/episode.html，可以直接给 GitHub Pages / Cloudflare Pages 用
  - GitHub Actions 已改成只提交 data/**/*.json，不再安装 ffmpeg
  - 每次更新会保留最近 31 天，过期目录会被删掉并重建 data/index.json
  - 播放器会优先走 HLS，m3u8 用 hls.js，mp4 走原生媒体标签

  关键代码在这里：

  - 网络层流提取：pod-clawer/src/parser/media.ts
  - 抓取与 31 天清理：pod-clawer/src/crawler/run.ts
  - 静态数据存储：pod-clawer/src/services/storage.ts
  - 静态播放器：pod-clawer/src/web/episode.js
  - Actions: pod-clawer/.github/workflows/daily-crawl.yml

  我已经确认 npm run build 通过。
  没有完成的只有“最终一次真实联网抓取验证”，原因不是代码，而是当前环境限制：

  - tsx 在沙箱里会因为 IPC socket 被拒绝
  - 直接跑编译后的 node dist/crawler/run.js 又被当前环境的 DNS 限制拦住了，zy.api.cntv.cn 无法解析
  - 额外的提权联网运行也被平台当次额度限制拒绝

  这意味着代码层面的重构已经完成，但我没法在这个会话里做最后一次外网实抓闭环。你在自己机器或 GitHub Actions 上跑下面这两条就能完成最终验证：

  npm run build
  npm run crawl

  验收标准很直接：

  - data/2026-05-13/meta.json 里应当是外部 streamUrl
  - fallback 应当是 false
  - 仓库里不应再出现 audio.mp3
  - data/index.json 只保留最近 31 天
  - 根目录 index.html 打开后能列出节目，episode.html 能直接播放