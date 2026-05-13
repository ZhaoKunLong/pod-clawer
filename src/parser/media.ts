import { PlaywrightCrawler } from '@crawlee/playwright';
import { log, RequestQueue } from 'crawlee';
import { randomUUID } from 'node:crypto';
import type { Page, Response } from 'playwright';
import { config } from '../config.js';
import { fetchJson } from '../services/http.js';
import type { EpisodeCandidate, StreamInfo, StreamType } from '../types.js';

type CctvMediaPayload = {
  title?: string;
  image?: string;
  hls_url?: string;
  manifest?: Record<string, string | undefined>;
  video?: {
    totalLength?: string;
    url?: string;
  };
};

type Candidate = {
  url: string;
  type: StreamType;
  source: string;
  score: number;
  payload?: CctvMediaPayload;
};

export async function extractStreamFromEpisodePage(episode: EpisodeCandidate): Promise<StreamInfo> {
  const candidates: Candidate[] = [];
  const requestQueue = await RequestQueue.open(`stream-${randomUUID()}`);
  await requestQueue.addRequest({ url: episode.url });

  const crawler = new PlaywrightCrawler({
    requestQueue,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 90,
    launchContext: {
      launchOptions: {
        headless: config.headless,
      },
    },
    preNavigationHooks: [
      async ({ page }) => {
        await page.setExtraHTTPHeaders({
          'user-agent': config.userAgent,
          referer: config.columnUrl,
        });
        page.on('request', (request) => {
          const direct = candidateFromUrl(request.url(), `request:${request.resourceType()}`);
          if (direct) candidates.push(direct);
        });
        page.on('response', (response) => {
          void collectResponseCandidate(response, candidates);
        });
      },
    ],
    async requestHandler({ page }) {
      await page.waitForLoadState('domcontentloaded');
      await triggerCctvMediaApi(page, candidates);
      await page.waitForTimeout(5000);
    },
  });

  await crawler.run();

  const selected = await selectBestCandidate(candidates);
  if (!selected) {
    throw new Error(`No playable m3u8/mp4 stream discovered from network for ${episode.url}`);
  }

  const payload = selected.payload;
  return {
    guid: extractGuidFromUrl(episode.url) ?? extractGuidFromStreamUrl(selected.url),
    streamUrl: selected.url,
    type: selected.type,
    discoveredFrom: selected.source,
    durationSeconds: payload?.video?.totalLength ? Number(payload.video.totalLength) : undefined,
    image: payload?.image,
    title: payload?.title,
  };
}

async function collectResponseCandidate(response: Response, candidates: Candidate[]): Promise<void> {
  const url = response.url();
  const direct = candidateFromUrl(url, `network:${response.request().resourceType()}`);
  if (direct) {
    candidates.push(direct);
  }

  const contentType = response.headers()['content-type'] ?? '';
  const looksLikeJson = contentType.includes('json') || /getHttpVideoInfo|videoinfo/i.test(url);
  if (!looksLikeJson) return;

  try {
    const payload = (await response.json()) as CctvMediaPayload;
    candidates.push(...candidatesFromPayload(payload, `network-json:${url}`));
  } catch {
    try {
      const text = await response.text();
      candidates.push(...candidatesFromText(text, `network-text:${url}`));
    } catch {
      // Some media responses cannot be consumed by Playwright. Ignore them.
    }
  }
}

async function triggerCctvMediaApi(page: Page, candidates: Candidate[]): Promise<void> {
  const html = await page.content();
  const guid = html.match(/var\s+guid\s*=\s*["']([a-f0-9]{32})["']/i)?.[1];
  if (!guid) return;

  try {
    const endpoint = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${encodeURIComponent(guid)}`;
    const payload = await fetchJson<CctvMediaPayload>(endpoint, {
      headers: {
        referer: page.url(),
      },
    });
    candidates.push(...candidatesFromPayload(payload, 'node-fetch:getHttpVideoInfo'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warning(`Failed to fetch CCTV media API for guid ${guid}: ${message}`);
  }
}

function candidatesFromPayload(payload: CctvMediaPayload, source: string): Candidate[] {
  const urls = [
    payload.manifest?.audio_mp3,
    payload.manifest?.hls_audio_url,
    payload.hls_url,
    payload.video?.url,
    payload.manifest?.hls_h5e_url,
    payload.manifest?.hls_enc_url,
    payload.manifest?.hls_enc2_url,
  ];

  return urls.flatMap((url, index) => {
    const candidate = url ? candidateFromUrl(url, source, 100 - index, payload) : undefined;
    return candidate ? [candidate] : [];
  });
}

function candidatesFromText(text: string, source: string): Candidate[] {
  const matches = text.match(/https?:\/\/[^"'\s\\]+(?:\.m3u8|\.mp4)(?:\?[^"'\s\\]*)?/gi) ?? [];
  return matches.flatMap((url) => {
    const candidate = candidateFromUrl(url.replaceAll('\\/', '/'), source);
    return candidate ? [candidate] : [];
  });
}

function candidateFromUrl(url: string, source: string, bonus = 0, payload?: CctvMediaPayload): Candidate | undefined {
  const cleanUrl = url.replaceAll('\\/', '/');
  const type = streamType(cleanUrl);
  if (!type) return undefined;
  return {
    url: cleanUrl,
    type,
    source,
    score: scoreUrl(cleanUrl, type) + bonus,
    payload,
  };
}

function streamType(url: string): StreamType | undefined {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.m3u8')) return 'm3u8';
  if (pathname.endsWith('.mp4')) return 'mp4';
  return undefined;
}

function scoreUrl(url: string, type: StreamType): number {
  let score = type === 'm3u8' ? 50 : 20;
  if (/audio|hlsaudio|mp3/i.test(url)) score += 30;
  if (/main\.m3u8/i.test(url)) score += 10;
  if (/enc|h5e/i.test(url)) score -= 5;
  return score;
}

async function selectBestCandidate(candidates: Candidate[]): Promise<Candidate | undefined> {
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
  }

  const sorted = [...unique.values()].sort((a, b) => b.score - a.score);
  for (const candidate of sorted) {
    if (await isPlayableStream(candidate)) {
      log.info(`Selected stream from ${candidate.source}: ${candidate.url}`);
      return candidate;
    }
    log.warning(`Rejected non-playable stream candidate from ${candidate.source}: ${candidate.url}`);
  }

  return undefined;
}

async function isPlayableStream(candidate: Candidate): Promise<boolean> {
  try {
    const response = await fetch(candidate.url, {
      headers: {
        'user-agent': config.userAgent,
        referer: config.columnUrl,
      },
    });

    if (!response.ok) return false;

    if (candidate.type === 'm3u8') {
      const text = await response.text();
      return text.includes('#EXTM3U');
    }

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('video') || contentType.includes('audio') || contentType.includes('mp4');
  } catch {
    return false;
  }
}

function extractGuidFromUrl(url: string): string | undefined {
  return url.match(/\/([a-f0-9]{32})(?:\/|$)/i)?.[1];
}

function extractGuidFromStreamUrl(url: string): string | undefined {
  return url.match(/\/([a-f0-9]{32})\/(?:main\.m3u8|mp3\/main\.m3u8)/i)?.[1];
}
