import type { Collection, ContentBundle, Devotional, LangCode } from "../types";
import { DEFAULT_LANG } from "../i18n";
import generated from "../generated/devotionals.json";

/** 빌드 시점에 meditations/<묵상집>/*.md 에서 생성된 콘텐츠 */
export const BUNDLE: ContentBundle = generated as unknown as ContentBundle;

export const CONTENT_DIR = (import.meta.env.VITE_CONTENT_DIR as string | undefined) || "meditations";

/**
 * 저장소 안의 파일 경로.
 * 기본 언어는 `meditations/tozer/2026-09-10.md`,
 * 그 외 언어는 `meditations/tozer/2026-09-10.en.md`.
 */
export function contentPath(collection: string, date: string, lang: string, dir = CONTENT_DIR): string {
  const base = `${dir}/${collection}/${date}`;
  return lang === DEFAULT_LANG ? `${base}.md` : `${base}.${lang}.md`;
}

/** 묵상집 이름을 화면 언어로 (없으면 아무 언어나) */
export function collectionName(c: Collection | undefined, lang: LangCode): string {
  if (!c) return "";
  return c.name?.[lang] ?? c.name?.[DEFAULT_LANG] ?? Object.values(c.name ?? {})[0] ?? c.slug;
}

export function collectionDescription(c: Collection | undefined, lang: LangCode): string {
  if (!c?.description) return "";
  return c.description[lang] ?? c.description[DEFAULT_LANG] ?? Object.values(c.description)[0] ?? "";
}

function block(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => "  " + l)
    .join("\n");
}

/**
 * Devotional → frontmatter 마크다운.
 * 관리자 화면과 가져오기 스크립트가 같은 형식을 씁니다.
 */
export function toMarkdown(d: Devotional): string {
  const lines = ["---", `date: ${d.date}`, `lang: ${d.lang}`, `title: ${d.title.trim()}`];
  if (d.series?.trim()) lines.push(`series: ${d.series.trim()}`);
  if (d.sourceLabel?.trim()) lines.push(`source_label: ${d.sourceLabel.trim()}`);
  if (d.scriptureRef.trim()) lines.push(`scripture_ref: ${d.scriptureRef.trim()}`);
  if (d.scriptureText.trim()) lines.push("scripture_text: |", block(d.scriptureText.trim()));
  lines.push(`status: ${d.status}`, `updated_at: ${new Date().toISOString()}`, "---", "", d.bodyMd.trim(), "");
  return lines.join("\n");
}
