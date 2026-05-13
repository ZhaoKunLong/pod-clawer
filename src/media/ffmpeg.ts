import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export async function extractMp3(inputUrl: string, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.part`;
  await fs.rm(tempPath, { force: true });

  try {
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'warning',
      '-y',
      '-headers',
      `User-Agent: ${config.userAgent}\r\nReferer: ${config.columnUrl}\r\n`,
      '-i',
      inputUrl,
      '-vn',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-f',
      'mp3',
      tempPath,
    ]);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  await fs.rename(tempPath, outputPath);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start ffmpeg: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
