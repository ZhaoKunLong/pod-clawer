export type EpisodeCandidate = {
  id: string;
  title: string;
  url: string;
  date: string;
  broadcastTime?: string;
  image?: string;
  description?: string;
};

export type VideoInfo = {
  guid: string;
  videoUrl: string;
  audioSourceUrl?: string;
  hlsUrl?: string;
  durationSeconds?: number;
  image?: string;
  title?: string;
  raw?: unknown;
};

export type StreamType = 'm3u8' | 'mp4';

export type StreamInfo = {
  guid?: string;
  streamUrl: string;
  type: StreamType;
  discoveredFrom: string;
  durationSeconds?: number;
  image?: string;
  title?: string;
};

export type EpisodeMeta = EpisodeCandidate & {
  guid?: string;
  sourcePageUrl: string;
  streamUrl: string;
  type: StreamType;
  fallback: boolean;
  videoUrl?: string;
  audioSourceUrl?: string;
  hlsUrl?: string;
  audioPath?: string;
  createdAt: string;
  durationSeconds?: number;
};
