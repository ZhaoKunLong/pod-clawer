export function todayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns the date of the latest expected episode for a program, given its broadcast window.
 * If the current time (in the program's timezone) is past the broadcast window's end hour,
 * today's episode should already be available. Otherwise, the latest available is yesterday's.
 */
export function latestEpisodeDateForProgram(
  broadcastTimeWindow: { startHour: number; endHour: number; endMinute?: number },
  timezone: string,
): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const currentMinutes = get('hour') * 60 + get('minute');
  const endMinutes = broadcastTimeWindow.endHour * 60 + (broadcastTimeWindow.endMinute ?? 0);

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  if (currentMinutes > endMinutes) {
    return todayStr;
  }

  // Before the broadcast cutoff — latest available is yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(yesterday);
}

export function compactDate(date: string): string {
  return date.replaceAll('-', '');
}

export function normalizeDateParts(year: number, month: number, day: number): string {
  return [year, month, day].map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0'))).join('-');
}

