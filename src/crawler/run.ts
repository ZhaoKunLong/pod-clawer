import { log } from 'crawlee';
import path from 'node:path';
import { findTodaysEpisode, resolveVideoInfo } from './cctv.js';
import { config } from '../config.js';
import { todayInTimezone } from '../services/date.js';
import { ensureEpisodeDir, episodeAudioPath, episodeExists, writeMeta } from '../services/storage.js';
import { extractMp3 } from '../media/ffmpeg.js';
import type { EpisodeMeta } from '../types.js';

export async function crawlDailyEpisode(targetDate = todayInTimezone(config.timezone)): Promise<EpisodeMeta> {
  log.setLevel(log.LEVELS.INFO);
  log.info(`Starting CCTV 朝闻天下 crawl for ${targetDate}`);

  if (await episodeExists(targetDate)) {
    log.info(`Episode ${targetDate} already exists; skipping media processing.`);
    const { readMeta } = await import('../services/storage.js');
    return readMeta(targetDate);
  }

  const episode = await findTodaysEpisode(targetDate);
  const videoInfo = await resolveVideoInfo(episode);
  await ensureEpisodeDir(targetDate);

  const audioPath = episodeAudioPath(targetDate);
  const mediaSources = uniqueSources([videoInfo.audioSourceUrl, videoInfo.hlsUrl, videoInfo.videoUrl]);
  const mediaSource = await extractFromFirstWorkingSource(mediaSources, audioPath);

  const meta: EpisodeMeta = {
    ...episode,
    guid: videoInfo.guid,
    title: videoInfo.title ?? episode.title,
    image: videoInfo.image ?? episode.image,
    sourcePageUrl: episode.url,
    videoUrl: videoInfo.videoUrl,
    audioSourceUrl: mediaSource,
    hlsUrl: videoInfo.hlsUrl,
    audioPath: path.relative(config.dataDir, audioPath),
    createdAt: new Date().toISOString(),
    durationSeconds: videoInfo.durationSeconds,
  };

  await writeMeta(meta);
  log.info(`Saved episode ${targetDate} to ${audioPath}`);
  return meta;
}

async function extractFromFirstWorkingSource(sources: string[], audioPath: string): Promise<string> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      log.info(`Extracting MP3 from ${source}`);
      await extractMp3(source, audioPath);
      return source;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${source}: ${message}`);
      log.warning(`Media source failed, trying next source if available: ${message}`);
    }
  }

  throw new Error(`All media sources failed:\n${errors.join('\n')}`);
}

function uniqueSources(sources: Array<string | undefined>): string[] {
  return [...new Set(sources.filter((source): source is string => Boolean(source)))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetDate = process.argv[2];
  crawlDailyEpisode(targetDate).catch((error: unknown) => {
    log.exception(error as Error, 'Crawler failed');
    process.exitCode = 1;
  });
}
