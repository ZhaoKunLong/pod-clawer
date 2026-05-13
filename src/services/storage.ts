import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { EpisodeMeta } from '../types.js';

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function episodeDir(programId: string, date: string): string {
  return path.join(config.dataDir, programId, date);
}

export function episodeAudioPath(programId: string, date: string): string {
  return path.join(episodeDir(programId, date), 'audio.mp3');
}

export function episodeMetaPath(programId: string, date: string): string {
  return path.join(episodeDir(programId, date), 'meta.json');
}

export async function ensureEpisodeDir(programId: string, date: string): Promise<string> {
  const dir = episodeDir(programId, date);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function episodeExists(programId: string, date: string): Promise<boolean> {
  try {
    const meta = await fs.stat(episodeMetaPath(programId, date));
    return meta.isFile();
  } catch {
    return false;
  }
}

export async function writeMeta(meta: EpisodeMeta): Promise<void> {
  await ensureEpisodeDir(meta.program, meta.date);
  await fs.writeFile(episodeMetaPath(meta.program, meta.date), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export async function readMeta(programId: string, date: string): Promise<EpisodeMeta> {
  return JSON.parse(await fs.readFile(episodeMetaPath(programId, date), 'utf8')) as EpisodeMeta;
}

export async function listEpisodes(programId: string): Promise<EpisodeMeta[]> {
  const programDir = path.join(config.dataDir, programId);
  await fs.mkdir(programDir, { recursive: true });
  const entries = await fs.readdir(programDir, { withFileTypes: true });
  const dates = entries
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const metas = await Promise.all(
    dates.map(async (date) => {
      try {
        return await readMeta(programId, date);
      } catch {
        return undefined;
      }
    }),
  );
  return metas.filter((meta): meta is EpisodeMeta => Boolean(meta));
}

export async function writeEpisodeIndex(programId: string, episodes: EpisodeMeta[]): Promise<void> {
  const programDir = path.join(config.dataDir, programId);
  await fs.mkdir(programDir, { recursive: true });
  const indexPath = path.join(programDir, 'index.json');
  await fs.writeFile(indexPath, `${JSON.stringify(episodes, null, 2)}\n`, 'utf8');
}

export async function pruneExpiredEpisodes(programId: string, retainDays: number, referenceDate: string): Promise<string[]> {
  const episodes = await listEpisodes(programId);
  const cutoff = new Date(`${referenceDate}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - (retainDays - 1));
  const removed: string[] = [];

  for (const episode of episodes) {
    const current = new Date(`${episode.date}T00:00:00+08:00`);
    if (current < cutoff) {
      await fs.rm(episodeDir(programId, episode.date), { recursive: true, force: true });
      removed.push(episode.date);
    }
  }

  return removed;
}

/**
 * Migrate old flat data/YYYY-MM-DD/ structure to data/zwtx/YYYY-MM-DD/.
 * Safe to call multiple times — skips dates that already exist in the new location.
 */
export async function migrateOldEpisodes(): Promise<string[]> {
  const migrated: string[] = [];
  let entries: { isDirectory(): boolean; name: string }[];
  try {
    entries = await fs.readdir(config.dataDir, { withFileTypes: true });
  } catch {
    return migrated;
  }

  const oldDates = entries
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name);

  for (const date of oldDates) {
    const oldDir = path.join(config.dataDir, date);
    const newDir = episodeDir('zwtx', date);
    try {
      await fs.access(newDir);
      // Already migrated — remove old dir
      await fs.rm(oldDir, { recursive: true, force: true });
    } catch {
      // New dir doesn't exist — move old dir
      await fs.mkdir(path.dirname(newDir), { recursive: true });
      await fs.rename(oldDir, newDir);
      // Patch the meta.json to add program field if missing
      const metaPath = path.join(newDir, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw) as EpisodeMeta;
        if (!meta.program) {
          meta.program = 'zwtx';
          await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
        }
      } catch {
        // meta.json missing or malformed — skip patching
      }
    }
    migrated.push(date);
  }

  return migrated;
}
