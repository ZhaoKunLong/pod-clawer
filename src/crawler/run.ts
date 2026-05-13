import { log } from 'crawlee';
import path from 'node:path';
import { findTodaysEpisode, resolveVideoInfo } from './cctv.js';
import { config } from '../config.js';
import { extractStreamFromEpisodePage } from '../parser/media.js';
import { todayInTimezone } from '../services/date.js';
import {
  ensureEpisodeDir,
  episodeAudioPath,
  episodeExists,
  listEpisodes,
  pruneExpiredEpisodes,
  writeEpisodeIndex,
  writeMeta,
} from '../services/storage.js';
import { extractMp3 } from '../media/ffmpeg.js';
import type { EpisodeMeta, StreamInfo } from '../types.js';

export async function crawlDailyEpisode(targetDate = todayInTimezone(config.timezone)): Promise<EpisodeMeta> {
  log.setLevel(log.LEVELS.INFO);
  log.info(`Starting CCTV 朝闻天下 crawl for ${targetDate}`);

  if (await episodeExists(targetDate)) {
    const { readMeta } = await import('../services/storage.js');
    const existing = await readMeta(targetDate);
    const removed = await pruneExpiredEpisodes(31, targetDate);
    const episodes = await listEpisodes();
    await writeEpisodeIndex(episodes);
    log.info(`Episode ${targetDate} metadata already exists; skipped crawl and refreshed index.`);
    if (removed.length) {
      log.info(`Pruned expired episodes: ${removed.join(', ')}`);
    }
    return existing;
  }

  const episode = await findTodaysEpisode(targetDate);
  await ensureEpisodeDir(targetDate);

  let fallback = false;
  let stream: StreamInfo;
  let audioPath: string | undefined;

  try {
    stream = await extractStreamFromEpisodePage(episode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warning(`Streaming extraction failed; using legacy MP3 fallback: ${message}`);
    fallback = true;
    const videoInfo = await resolveVideoInfo(episode);
    audioPath = episodeAudioPath(targetDate);
    const mediaSources = uniqueSources([videoInfo.audioSourceUrl, videoInfo.hlsUrl, videoInfo.videoUrl]);
    const mediaSource = await extractFromFirstWorkingSource(mediaSources, audioPath);
    stream = {
      guid: videoInfo.guid,
      streamUrl: `/data/${targetDate}/audio.mp3`,
      type: 'mp4' as const,
      discoveredFrom: `fallback:${mediaSource}`,
      durationSeconds: videoInfo.durationSeconds,
      image: videoInfo.image,
      title: videoInfo.title,
    };
  }

  if (process.env.FORCE_DOWNLOAD_FALLBACK === 'true') {
    log.warning('FORCE_DOWNLOAD_FALLBACK=true, using legacy MP3 extraction path.');
    fallback = true;
    const videoInfo = await resolveVideoInfo(episode);
    audioPath = episodeAudioPath(targetDate);
    const mediaSources = uniqueSources([videoInfo.audioSourceUrl, videoInfo.hlsUrl, videoInfo.videoUrl]);
    const mediaSource = await extractFromFirstWorkingSource(mediaSources, audioPath);
    stream = {
      guid: videoInfo.guid,
      streamUrl: `/data/${targetDate}/audio.mp3`,
      type: 'mp4',
      discoveredFrom: `fallback:${mediaSource}`,
      durationSeconds: videoInfo.durationSeconds,
      image: videoInfo.image,
      title: videoInfo.title,
    };
  }

  const meta: EpisodeMeta = {
    ...episode,
    guid: stream.guid,
    title: stream.title ?? episode.title,
    image: stream.image ?? episode.image,
    sourcePageUrl: episode.url,
    streamUrl: stream.streamUrl,
    type: stream.type,
    fallback,
    videoUrl: stream.type === 'mp4' ? stream.streamUrl : undefined,
    hlsUrl: stream.type === 'm3u8' ? stream.streamUrl : undefined,
    audioSourceUrl: stream.streamUrl,
    audioPath: audioPath ? path.relative(config.dataDir, audioPath) : undefined,
    createdAt: new Date().toISOString(),
    durationSeconds: stream.durationSeconds,
  };

  await writeMeta(meta);
  const removed = await pruneExpiredEpisodes(31, targetDate);
  const episodes = await listEpisodes();
  await writeEpisodeIndex(episodes);
  log.info(`Saved streaming metadata for ${targetDate}`);
  if (removed.length) {
    log.info(`Pruned expired episodes: ${removed.join(', ')}`);
  }
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
