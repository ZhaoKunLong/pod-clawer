import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  headless: (process.env.CRAWLER_HEADLESS ?? 'true') !== 'false',
  timezone: process.env.CRAWLER_TIMEZONE ?? 'Asia/Shanghai',
  columnId: process.env.CCTV_COLUMN_ID ?? 'TOPC1451558496100826',
  columnUrl: process.env.CCTV_COLUMN_URL ?? 'https://tv.cctv.cn/lm/zwtx/index.shtml',
  ffmpegBin: process.env.FFMPEG_BIN ?? 'ffmpeg',
  userAgent:
    process.env.HTTP_USER_AGENT ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

