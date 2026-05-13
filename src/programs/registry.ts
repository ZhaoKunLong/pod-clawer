export type ProgramConfig = {
  id: string;
  name: string;
  columnId: string;
  columnUrl: string;
  titlePattern: RegExp;
  fullEpisodePattern: RegExp;
  broadcastTimeWindow: { startHour: number; endHour: number; endMinute?: number };
  retentionDays: number;
};

export const PROGRAMS: Record<string, ProgramConfig> = {
  zwtx: {
    id: 'zwtx',
    name: '朝闻天下',
    columnId: 'TOPC1451558496100826',
    columnUrl: 'https://tv.cctv.cn/lm/zwtx/index.shtml',
    titlePattern: /朝闻天下/,
    fullEpisodePattern: /《朝闻天下》/,
    broadcastTimeWindow: { startHour: 5, endHour: 8, endMinute: 10 },
    retentionDays: 31,
  },
  xwlb: {
    id: 'xwlb',
    name: '新闻联播',
    columnId: 'TOPC1451528971114112',
    columnUrl: 'https://tv.cctv.com/lm/xwlb/',
    titlePattern: /新闻联播/,
    fullEpisodePattern: /《新闻联播》/,
    broadcastTimeWindow: { startHour: 19, endHour: 21, endMinute: 10 },
    retentionDays: 31,
  },
};

export function getProgramConfig(id: string): ProgramConfig {
  const program = PROGRAMS[id];
  if (!program) {
    throw new Error(`Unknown program id: "${id}". Available: ${Object.keys(PROGRAMS).join(', ')}`);
  }
  return program;
}

export function listPrograms(): ProgramConfig[] {
  return Object.values(PROGRAMS);
}
