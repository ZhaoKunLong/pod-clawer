import { config } from '../config.js';

const CCTV_REFERER = 'https://tv.cctv.cn/';

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'user-agent': config.userAgent,
      referer: CCTV_REFERER,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  const text = await response.text();
  const json = stripJsonp(text);
  return JSON.parse(json) as T;
}

export function stripJsonp(payload: string): string {
  const trimmed = payload.trim();
  const match = trimmed.match(/^[\w$]+\(([\s\S]*)\);?$/);
  return match?.[1] ?? trimmed;
}

