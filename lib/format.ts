import { format, parseISO } from 'date-fns';

export function formatItemDate(date?: string | null): string {
  if (!date) return 'Date unknown';
  try {
    return format(parseISO(date), 'MMMM d, yyyy');
  } catch (error) {
    return date;
  }
}

export function truncate(value: string, length = 160): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
}
