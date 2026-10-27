import type { SessionGroup, SessionListItem } from "../shared/protocol";

export function groupSessionsByUpdateDate(
  sessions: readonly SessionListItem[],
  now: Date = new Date(),
): SessionGroup[] {
  const groups = new Map<string, SessionListItem[]>();

  for (const session of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const label = dateLabel(new Date(session.updatedAt), now);
    const existing = groups.get(label);

    if (existing) {
      existing.push(session);
    } else {
      groups.set(label, [session]);
    }
  }

  return [...groups.entries()].map(([label, items]) => ({ label, sessions: items }));
}

function dateLabel(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const dayDifference = calendarDaysBetween(now, date);

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function calendarDaysBetween(later: Date, earlier: Date): number {
  const laterDay = startOfDay(later);
  const earlierDay = startOfDay(earlier);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round((laterDay.getTime() - earlierDay.getTime()) / millisecondsPerDay);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
