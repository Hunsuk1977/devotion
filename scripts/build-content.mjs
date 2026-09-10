#!/usr/bin/env node
/**
 * meditations/*.md  →  src/generated/devotionals.json
 *
 * 두 가지 형식을 모두 읽습니다.
 *
 * (A) Make + Gemini 가 만드는 자유 형식 (현재 devotion 저장소의 형식)
 *
 *     다음은 요청하신 이메일 내용을 …            ← 안내 문장. 자동으로 버림
 *     ---
 *     ## 토저의 기독교 리더십 - 2025년 5월 13일   ← 시리즈명 + 원문 날짜
 *     ### 설교: 웅변가가 아닌 선지자              ← 묵상 제목
 *     > 내가 내 말을 … —이사야 51:16             ← 성경 본문 + 구절 위치
 *     본문 …
 *     > "주님, … 아멘."                          ← 기도문 (본문에 그대로 둠)
 *     ---
 *
 * (B) frontmatter 형식 (관리자 화면에서 저장할 때 쓰는 형식)
 *
 *     ---
 *     date: 2026-09-10
 *     lang: ko
 *     title: …
 *     scripture_ref: 이사야 51:16
 *     scripture_text: |
 *       내가 내 말을 …
 *     status: published
 *     ---
 *     본문 …
 *
 * 파일명: YYYY-MM-DD.md (언어 없으면 기본 언어) 또는 YYYY-MM-DD.<lang>.md
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, process.env.CONTENT_DIR || "meditations");
const OUT = join(root, "src", "generated", "devotionals.json");
const DEFAULT_LANG = process.env.DEFAULT_LANG || "ko";

/* ------------------------------------------------------------------ */
/* (B) frontmatter                                                     */
/* ------------------------------------------------------------------ */

const KEY_RE = /^([a-zA-Z_][a-zA-Z0-9_]*):(?:\s+(.*))?$/;

function parseFrontmatter(norm) {
  const m = norm.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  // 첫 블록에 key: value 가 하나도 없으면 frontmatter 가 아니라 그냥 구분선
  if (!m || !m[1].split("\n").some((l) => KEY_RE.test(l))) return null;
  const lines = m[1].split("\n");
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const km = lines[i].match(KEY_RE);
    if (!km) {
      i++;
      continue;
    }
    const key = km[1];
    let val = (km[2] ?? "").trim();
    if (["|", ">", "|-", ">-"].includes(val)) {
      const buf = [];
      i++;
      while (i < lines.length && !KEY_RE.test(lines[i])) {
        buf.push(lines[i].replace(/^ {1,4}/, ""));
        i++;
      }
      val = buf.join(val.startsWith(">") ? " " : "\n").trim();
    } else {
      i++;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
    }
    meta[key] = val;
  }
  return { meta, body: m[2].trim() };
}

/* ------------------------------------------------------------------ */
/* (A) 자유 형식                                                        */
/* ------------------------------------------------------------------ */

/** 블록인용(>) 덩어리 하나를 앞에서 떼어냄 */
function takeQuote(lines, from) {
  let i = from;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || !lines[i].trim().startsWith(">")) return null;
  const buf = [];
  while (i < lines.length && (lines[i].trim().startsWith(">") || (buf.length && lines[i].trim() !== "" && !/^#{1,6}\s/.test(lines[i])))) {
    if (!lines[i].trim().startsWith(">")) break;
    buf.push(lines[i].replace(/^\s*>\s?/, ""));
    i++;
  }
  return { text: buf.join("\n").trim(), end: i };
}

/** "…본문… —이사야 51:16" → { text, ref } */
function splitRef(quote) {
  const flat = quote.replace(/\n+/g, " ").trim();
  // 줄 끝의 —/–/- 뒤에 오는 짧은 구절 표기
  const m = flat.match(/^([\s\S]+?)\s*[—–]\s*([^—–]{2,40}\d[^—–]{0,10})\s*$/);
  if (m) return { text: m[1].trim(), ref: m[2].trim() };
  const m2 = flat.match(/^([\s\S]+?)\s+-\s+([^-]{2,40}\d[^-]{0,10})\s*$/);
  if (m2) return { text: m2[1].trim(), ref: m2[2].trim() };
  // 별도 줄에 구절만 있는 경우
  const parts = quote.split("\n").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && /\d+:\d+/.test(parts[parts.length - 1]) && parts[parts.length - 1].length < 40) {
    return { text: parts.slice(0, -1).join(" "), ref: parts[parts.length - 1].replace(/^[—–-]\s*/, "") };
  }
  return { text: flat, ref: "" };
}

function parseLoose(norm) {
  let lines = norm.split("\n");

  // 1) 첫 제목(#/##/###) 앞의 안내 문장·구분선 제거
  const firstHeading = lines.findIndex((l) => /^#{1,6}\s/.test(l));
  if (firstHeading > 0) lines = lines.slice(firstHeading);

  // 2) 꼬리의 --- 구분선 제거
  while (lines.length && (lines[lines.length - 1].trim() === "" || /^-{3,}$/.test(lines[lines.length - 1].trim()))) {
    lines.pop();
  }

  let series = "";
  let sourceLabel = "";
  let title = "";
  let i = 0;

  // 3) 시리즈 제목: # 또는 ## (### 보다 얕은 첫 제목)
  const h = lines[i]?.match(/^(#{1,2})\s+(.*)$/);
  if (h) {
    const whole = h[2].trim();
    const dash = whole.match(/^(.*?)\s+[-–—]\s+(.*)$/);
    if (dash) {
      series = dash[1].trim();
      sourceLabel = dash[2].trim();
    } else {
      series = whole;
    }
    i++;
  }

  // 4) 묵상 제목: 다음 ### (없으면 시리즈 제목을 제목으로)
  while (i < lines.length && lines[i].trim() === "") i++;
  const h3 = lines[i]?.match(/^#{3,6}\s+(.*)$/);
  if (h3) {
    title = h3[1].trim();
    i++;
  } else if (series) {
    title = series;
    series = "";
  }

  // 5) 성경 본문: 제목 바로 뒤의 첫 인용문
  let scriptureText = "";
  let scriptureRef = "";
  const q = takeQuote(lines, i);
  if (q && q.text) {
    const { text, ref } = splitRef(q.text);
    scriptureText = text;
    scriptureRef = ref;
    i = q.end;
  }

  // 6) 나머지가 본문 (마지막 기도문 인용도 그대로 둡니다)
  const bodyMd = lines
    .slice(i)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { series, sourceLabel, title, scriptureRef, scriptureText, bodyMd };
}

/* ------------------------------------------------------------------ */

function fromFilename(name) {
  const m = basename(name, ".md").match(/^(\d{4}-\d{2}-\d{2})(?:[.\-_]([a-z]{2,5}))?$/i);
  return m ? { date: m[1], lang: m[2]?.toLowerCase() } : {};
}

async function main() {
  let files = [];
  try {
    files = (await readdir(SRC)).filter((f) => f.endsWith(".md"));
  } catch {
    console.warn(`[content] ${SRC} 없음 — 빈 콘텐츠로 빌드합니다.`);
  }

  const map = {};
  let ok = 0;
  const warnings = [];

  for (const f of files.sort()) {
    const norm = (await readFile(join(SRC, f), "utf8")).replace(/\r\n/g, "\n");
    const fn = fromFilename(f);
    const fm = parseFrontmatter(norm);

    let rec;
    if (fm) {
      rec = {
        date: fm.meta.date || fn.date,
        lang: (fm.meta.lang || fn.lang || DEFAULT_LANG).toLowerCase(),
        title: fm.meta.title || "",
        series: fm.meta.series || "",
        sourceLabel: fm.meta.source_label || "",
        scriptureRef: fm.meta.scripture_ref || "",
        scriptureText: fm.meta.scripture_text || "",
        bodyMd: fm.body,
        status: fm.meta.status === "draft" ? "draft" : "published",
        updatedAt: fm.meta.updated_at || undefined,
      };
    } else {
      const p = parseLoose(norm);
      rec = {
        date: fn.date,
        lang: (fn.lang || DEFAULT_LANG).toLowerCase(),
        ...p,
        status: "published",
      };
    }

    if (!rec.date) {
      warnings.push(`${f}: 날짜를 알 수 없어 건너뜁니다 (파일명을 YYYY-MM-DD.md 로).`);
      continue;
    }
    if (!rec.title) warnings.push(`${f}: 제목(### 줄)을 찾지 못했습니다.`);
    if (!rec.scriptureRef) warnings.push(`${f}: 성경 구절 위치를 찾지 못했습니다.`);

    map[rec.date] = { ...(map[rec.date] ?? {}), [rec.lang]: rec };
    ok++;
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(map, null, 2) + "\n");
  for (const w of warnings) console.warn(`[content] ${w}`);
  console.log(`[content] ${ok}개 묵상 → src/generated/devotionals.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
