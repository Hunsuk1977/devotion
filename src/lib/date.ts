import { localeOf } from "../i18n";

const pad = (n: number) => String(n).padStart(2, "0");

/** 로컬 시간 기준 YYYY-MM-DD */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function isISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISODate(s).getTime());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 언어별 긴 날짜 표기: "2026년 9월 10일 목요일" / "Thursday, September 10, 2026" */
export function formatLong(iso: string, lang: string): string {
  return parseISODate(iso).toLocaleDateString(localeOf(lang), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function formatShort(iso: string, lang: string): string {
  return parseISODate(iso).toLocaleDateString(localeOf(lang), {
    month: "short",
    day: "numeric",
  });
}
