import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { EpisodeMeta } from '../types.js';

export function episodeDir(date: string): string {
  return path.join(config.dataDir, date);
}

export function episodeAudioPath(date: string): string {
  return path.join(episodeDir(date), 'audio.mp3');
}

export function episodeMetaPath(date: string): string {
  return path.join(episodeDir(date), 'meta.json');
}

export async function ensureEpisodeDir(date: string): Promise<string> {
  const dir = episodeDir(date);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function episodeExists(date: string): Promise<boolean> {
  try {
    const [audio, meta] = await Promise.all([fs.stat(episodeAudioPath(date)), fs.stat(episodeMetaPath(date))]);
    return audio.isFile() && meta.isFile();
  } catch {
    return false;
  }
}

export async function writeMeta(meta: EpisodeMeta): Promise<void> {
  await ensureEpisodeDir(meta.date);
  await fs.writeFile(episodeMetaPath(meta.date), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export async function readMeta(date: string): Promise<EpisodeMeta> {
  return JSON.parse(await fs.readFile(episodeMetaPath(date), 'utf8')) as EpisodeMeta;
}

export async function listEpisodes(): Promise<EpisodeMeta[]> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
  const dates = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  const metas = await Promise.all(
    dates.map(async (date) => {
      try {
        return await readMeta(date);
      } catch {
        return undefined;
      }
    }),
  );
  return metas.filter((meta): meta is EpisodeMeta => Boolean(meta));
}

