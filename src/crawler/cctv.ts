import { CheerioCrawler, log, RequestQueue } from 'crawlee';
import { PlaywrightCrawler } from '@crawlee/playwright';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { compactDate } from '../services/date.js';
import { fetchJson } from '../services/http.js';
import type { EpisodeCandidate, VideoInfo } from '../types.js';

type CctvListItem = {
  guid?: string;
  id?: string;
  title?: string;
  url?: string;
  image?: string;
  brief?: string;
  focus_date?: string;
  time?: string;
};

type CctvListResponse = {
  data?: {
    list?: CctvListItem[];
  };
};

type CctvVideoInfoResponse = {
  ack?: string;
  title?: string;
  image?: string;
  hls_url?: string;
  manifest?: {
    audio_mp3?: string;
    hls_audio_url?: string;
    hls_enc_url?: string;
    hls_h5e_url?: string;
    hls_enc2_url?: string;
  };
  video?: {
    totalLength?: string;
    url?: string;
  };
};

export async function findTodaysEpisode(date: string): Promise<EpisodeCandidate> {
  const apiCandidate = await findEpisodeViaColumnApi(date);
  if (apiCandidate) {
    log.info(`Selected episode from CCTV column API: ${apiCandidate.title}`);
    return apiCandidate;
  }

  log.warning('Column API returned no episode, falling back to rendered page extraction.');
  return findEpisodeViaRenderedPage(date);
}

async function findEpisodeViaColumnApi(date: string): Promise<EpisodeCandidate | undefined> {
  const target = compactDate(date);
  const endpoint = new URL('https://zy.api.cntv.cn/NewVideo/getVideoListByColumn');
  endpoint.searchParams.set('id', config.columnId);
  endpoint.searchParams.set('n', '100');
  endpoint.searchParams.set('sort', 'desc');
  endpoint.searchParams.set('p', '1');
  endpoint.searchParams.set('bd', target);
  endpoint.searchParams.set('mode', '2');
  endpoint.searchParams.set('serviceId', 'tvcctv');

  const data = await fetchJson<CctvListResponse>(endpoint.toString());
  const candidates = (data.data?.list ?? []).map((item) => normalizeListItem(item, date)).filter(isEpisodeCandidate);
  return selectLatestMorningEpisode(candidates, date);
}

async function findEpisodeViaRenderedPage(date: string): Promise<EpisodeCandidate> {
  const matches: EpisodeCandidate[] = [];
  const requestQueue = await RequestQueue.open();
  await requestQueue.addRequest({ url: config.columnUrl });

  const crawler = new PlaywrightCrawler({
    requestQueue,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 60,
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
      },
    ],
    async requestHandler({ page }) {
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      const hrefs = await page.$$eval('a[href*="/VIDE"]', (anchors) =>
        anchors.map((anchor) => ({
          url: (anchor as HTMLAnchorElement).href,
          title: anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        })),
      );
      for (const href of hrefs) {
        const candidate = normalizeListItem({ url: href.url, title: href.title }, date);
        if (candidate) matches.push(candidate);
      }
    },
  });

  await crawler.run();
  const selected = selectLatestMorningEpisode(matches, date);
  if (!selected) {
    throw new Error(`No 朝闻天下 episode found for ${date}`);
  }
  return selected;
}

function normalizeListItem(item: CctvListItem, date: string): EpisodeCandidate | undefined {
  const title = cleanTitle(item.title);
  const url = item.url;
  if (!title || !url) return undefined;

  const id = item.guid ?? item.id ?? extractContentId(url);
  if (!id) return undefined;

  const broadcastTime = extractBroadcastTime(title);
  return {
    id,
    title,
    url: absolutize(url),
    date,
    broadcastTime,
    image: item.image ? absolutize(item.image) : undefined,
    description: item.brief,
  };
}

function isEpisodeCandidate(candidate: EpisodeCandidate | undefined): candidate is EpisodeCandidate {
  if (!candidate) return false;
  return /朝闻天下/.test(candidate.title) && /VIDE/.test(candidate.url) && Boolean(candidate.broadcastTime);
}

function selectLatestMorningEpisode(candidates: EpisodeCandidate[], date: string): EpisodeCandidate | undefined {
  const compact = compactDate(date);
  const daily = candidates.filter((candidate) => {
    const titleCompact = candidate.title.replace(/\D/g, '');
    return candidate.url.includes(compact.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3')) || titleCompact.includes(compact);
  });

  const fullEpisodes = daily.filter((candidate) => /《朝闻天下》/.test(candidate.title));
  return fullEpisodes.sort((a, b) => scoreBroadcastTime(b.broadcastTime) - scoreBroadcastTime(a.broadcastTime))[0];
}

function scoreBroadcastTime(time?: string): number {
  if (!time) return -1;
  const [hour, minute] = time.split(':').map(Number);
  if (hour < 5 || hour > 10) return -1;
  return hour * 60 + minute;
}

export async function resolveVideoInfo(episode: EpisodeCandidate): Promise<VideoInfo> {
  const guid = await extractGuidFromVideoPage(episode.url);
  const endpoint = new URL('https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do');
  endpoint.searchParams.set('pid', guid);

  const info = await fetchJson<CctvVideoInfoResponse>(endpoint.toString(), {
    headers: {
      referer: episode.url,
    },
  });

  const audioSourceUrl = info.manifest?.audio_mp3 ?? info.manifest?.hls_audio_url;
  const hlsUrl = info.hls_url ?? info.manifest?.hls_h5e_url ?? info.manifest?.hls_enc_url ?? info.manifest?.hls_enc2_url;
  const videoUrl = info.video?.url || hlsUrl || audioSourceUrl;

  if (!videoUrl) {
    throw new Error(`CCTV video API did not return a playable URL for guid ${guid}`);
  }

  return {
    guid,
    videoUrl,
    audioSourceUrl,
    hlsUrl,
    durationSeconds: info.video?.totalLength ? Number(info.video.totalLength) : undefined,
    image: info.image ? absolutize(info.image) : episode.image,
    title: info.title,
    raw: info,
  };
}

async function extractGuidFromVideoPage(url: string): Promise<string> {
  let guid: string | undefined;
  const requestQueue = await RequestQueue.open();
  await requestQueue.addRequest({ url });

  const crawler = new CheerioCrawler({
    requestQueue,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 30,
    async requestHandler({ $, body }) {
      const html = typeof body === 'string' ? body : $.html();
      guid =
        html.match(/var\s+guid\s*=\s*["']([a-f0-9]{32})["']/i)?.[1] ??
        $('meta[name="contentid"]').attr('content') ??
        extractContentId(url);
    },
  });

  await crawler.run();
  if (!guid) {
    throw new Error(`Unable to extract CCTV guid from ${url}`);
  }
  return guid;
}

function cleanTitle(value?: string): string {
  if (!value) return '';
  return cheerio.load(`<span>${value}</span>`)('span').text().replace(/\s+/g, ' ').trim();
}

function extractBroadcastTime(title: string): string | undefined {
  const match = title.match(/20\d{6}\s+(\d{2})[:：]?(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function extractContentId(url: string): string | undefined {
  return url.match(/(VIDE[a-zA-Z0-9]+)\.shtml/)?.[1];
}

function absolutize(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return new URL(url, 'https://tv.cctv.cn').toString();
  return url;
}
