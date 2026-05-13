export function todayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function compactDate(date: string): string {
  return date.replaceAll('-', '');
}

export function normalizeDateParts(year: number, month: number, day: number): string {
  return [year, month, day].map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0'))).join('-');
}

