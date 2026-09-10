import type { Devotional, DevotionalMap } from "../types";
import { DEFAULT_LANG } from "../i18n";
import generated from "../generated/devotionals.json";

/** 빌드 시점에 meditations/*.md 에서 생성된 콘텐츠 (scripts/build-content.mjs) */
export const GENERATED: DevotionalMap = generated as DevotionalMap;

/**
 * 저장소 안의 파일 경로.
 * 기본 언어는 Make 시나리오와 같은 `meditations/2026-09-10.md`,
 * 그 외 언어는 `meditations/2026-09-10.en.md` 를 씁니다.
 */
export function contentPath(date: string, lang: string, dir = "meditations"): string {
  return lang === DEFAULT_LANG ? `${dir}/${date}.md` : `${dir}/${date}.${lang}.md`;
}

function block(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => "  " + l)
    .join("\n");
}

/**
 * Devotional → frontmatter 마크다운.
 * 관리자 화면에서 저장할 때 쓰는 형식이며, 빌드 스크립트가 이 형식을 우선 인식합니다.
 * (Make 가 만드는 자유 형식도 빌드 스크립트가 함께 읽습니다.)
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
