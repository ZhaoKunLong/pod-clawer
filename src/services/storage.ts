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
    const meta = await fs.stat(episodeMetaPath(date));
    return meta.isFile();
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

export async function writeEpisodeIndex(episodes: EpisodeMeta[]): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const indexPath = path.join(config.dataDir, 'index.json');
  await fs.writeFile(indexPath, `${JSON.stringify(episodes, null, 2)}\n`, 'utf8');
}

export async function pruneExpiredEpisodes(retainDays: number, referenceDate: string): Promise<string[]> {
  const episodes = await listEpisodes();
  const cutoff = new Date(`${referenceDate}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - (retainDays - 1));
  const removed: string[] = [];

  for (const episode of episodes) {
    const current = new Date(`${episode.date}T00:00:00+08:00`);
    if (current < cutoff) {
      await fs.rm(episodeDir(episode.date), { recursive: true, force: true });
      removed.push(episode.date);
    }
  }

  return removed;
}
