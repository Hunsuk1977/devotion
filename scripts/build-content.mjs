#!/usr/bin/env node
/**
 * collections.json + meditations/<묵상집>/*.md  →  src/generated/devotionals.json
 *
 * 폴더 구조
 *
 *   collections.json                 묵상집 목록 (이름, 설명, 출처 종류)
 *   meditations/
 *     tozer/
 *       2026-09-10.md                기본 언어(ko)
 *       2026-09-10.en.md             영어
 *     pastor/
 *       2026-09-13.md
 *     2026-09-10.md                  ← 폴더 없이 놓인 옛 파일은 기본 묵상집으로
 *
 * 파일 형식은 두 가지를 모두 읽습니다.
 *
 * (A) frontmatter — 가져오기 스크립트와 관리자 화면이 쓰는 형식
 *
 *     ---
 *     date: 2026-09-10
 *     lang: ko
 *     title: 웅변가가 아닌 선지자
 *     series: 토저의 기독교 리더십
 *     scripture_ref: 이사야 51:16
 *     scripture_text: |
 *       내가 내 말을 네 입에 두고 …
 *     status: published
 *     ---
 *     본문 …
 *
 * (B) 자유 형식 — 제목/구절을 글 모양에서 추측합니다
 *
 *     ## 토저의 기독교 리더십 - 2025년 5월 13일
 *     ### 설교: 웅변가가 아닌 선지자
 *     > 내가 내 말을 … —이사야 51:16
 *     본문 …
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, process.env.CONTENT_DIR || "meditations");
const CONFIG = join(root, "collections.json");
const OUT = join(root, "src", "generated", "devotionals.json");
const DEFAULT_LANG = process.env.DEFAULT_LANG || "ko";

/* ------------------------------------------------------------------ */
/* (A) frontmatter                                                     */
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
/* (B) 자유 형식                                                        */
/* ------------------------------------------------------------------ */

function takeQuote(lines, from) {
  let i = from;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || !lines[i].trim().startsWith(">")) return null;
  const buf = [];
  while (i < lines.length && lines[i].trim().startsWith(">")) {
    buf.push(lines[i].replace(/^\s*>\s?/, ""));
    i++;
  }
  return { text: buf.join("\n").trim(), end: i };
}

function splitRef(quote) {
  // 앞뒤를 감싼 ** 는 벗겨냅니다 (성경 구절을 통째로 굵게 쓴 경우)
  let flat = quote.replace(/\n+/g, " ").trim();
  const bold = flat.match(/^\*\*([\s\S]+)\*\*$/);
  if (bold) flat = bold[1].trim();

  // "…본문… —이사야 51:16" / "…본문… -고린도전서 3:1" / "…본문… - 전도서 3:11"
  // 구분자 뒤 공백은 없어도 됩니다.
  const m = flat.match(/^([\s\S]+?)\s*[—–]\s*([^—–]{2,40}\d[^—–]{0,10})\s*$/);
  if (m) return { text: m[1].trim(), ref: m[2].trim() };
  const m2 = flat.match(/^([\s\S]+?)\s+-\s*([^-\n]{2,40}\d{1,3}(?::\d[\d,\-–]*)?)\s*$/);
  if (m2) return { text: m2[1].trim(), ref: m2[2].trim() };

  const parts = quote.split("\n").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && /\d+:\d+/.test(parts.at(-1)) && parts.at(-1).length < 40) {
    return { text: parts.slice(0, -1).join(" "), ref: parts.at(-1).replace(/^[—–-]\s*/, "") };
  }
  return { text: flat, ref: "" };
}

/** 굵게만 써 놓은 한 문단을 성경 본문으로 봅니다 (제목 표시가 없는 형식) */
function takeBold(lines, from) {
  let i = from;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return null;
  const buf = [];
  while (i < lines.length && lines[i].trim() !== "") {
    buf.push(lines[i].trim());
    i++;
  }
  const text = buf.join(" ").trim();
  return /^\*\*[\s\S]+\*\*$/.test(text) ? { text, end: i } : null;
}

function parseLoose(norm) {
  let lines = norm.split("\n");

  const firstHeading = lines.findIndex((l) => /^#{1,6}\s/.test(l));
  if (firstHeading > 0) lines = lines.slice(firstHeading);
  while (lines.length && (lines.at(-1).trim() === "" || /^-{3,}$/.test(lines.at(-1).trim()))) lines.pop();

  let series = "";
  let sourceLabel = "";
  let title = "";
  let i = 0;

  const splitSeries = (whole) => {
    const dash = whole.match(/^(.*?)\s+[-–—]\s+(.*)$/);
    if (dash) {
      series = dash[1].trim();
      sourceLabel = dash[2].trim();
    } else {
      series = whole;
    }
  };

  const h = lines[i]?.match(/^(#{1,2})\s+(.*)$/);
  if (h) {
    splitSeries(h[2].trim());
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    const h3 = lines[i]?.match(/^#{3,6}\s+(.*)$/);
    if (h3) {
      title = h3[1].trim();
      i++;
    } else if (series) {
      title = series;
      series = "";
    }
  } else {
    // 제목 표시(#)가 전혀 없는 형식:
    //   1줄  시리즈명 - 원문 날짜
    //   2줄  묵상 제목
    //   3줄  성경 본문 (> 인용 또는 **굵게**)
    while (i < lines.length && lines[i].trim() === "") i++;
    const first = lines[i]?.trim() ?? "";
    const looksLikeSeries = /\s[-–—]\s/.test(first) && first.length < 80 && !first.startsWith(">");
    if (looksLikeSeries) {
      splitSeries(first);
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;
      const second = lines[i]?.trim() ?? "";
      // 두 번째 줄이 성경 본문이 아니면 제목으로 봅니다
      if (second && !second.startsWith(">") && !second.startsWith("**") && second.length < 120) {
        title = second;
        i++;
      } else {
        title = series;
        series = "";
      }
    } else if (first && first.length < 120 && !first.startsWith(">")) {
      title = first;
      i++;
    }
  }

  let scriptureText = "";
  let scriptureRef = "";
  const q = takeQuote(lines, i) ?? takeBold(lines, i);
  if (q && q.text) {
    const { text, ref } = splitRef(q.text);
    scriptureText = text;
    scriptureRef = ref;
    i = q.end;
  }

  const bodyMd = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
  return { series, sourceLabel, title, scriptureRef, scriptureText, bodyMd };
}

/* ------------------------------------------------------------------ */

function fromFilename(name) {
  const m = basename(name, ".md").match(/^(\d{4}-\d{2}-\d{2})(?:[.\-_]([a-z]{2,5}))?$/i);
  return m ? { date: m[1], lang: m[2]?.toLowerCase() } : {};
}

async function readDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** 한 폴더의 md 파일들을 읽어 { date: { lang: rec } } 로 */
async function readCollection(dir, slug, warnings) {
  const entries = {};
  for (const ent of (await readDir(dir)).filter((e) => e.isFile() && e.name.endsWith(".md"))) {
    const f = ent.name;
    const norm = (await readFile(join(dir, f), "utf8")).replace(/\r\n/g, "\n");
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
      rec = { date: fn.date, lang: (fn.lang || DEFAULT_LANG).toLowerCase(), ...parseLoose(norm), status: "published" };
    }
    rec.collection = slug;

    if (!rec.date) {
      warnings.push(`${slug}/${f}: 날짜를 알 수 없어 건너뜁니다 (파일명을 YYYY-MM-DD.md 로).`);
      continue;
    }
    if (!rec.title) warnings.push(`${slug}/${f}: 제목을 찾지 못했습니다.`);
    entries[rec.date] = { ...(entries[rec.date] ?? {}), [rec.lang]: rec };
  }
  return entries;
}

async function main() {
  let config = { defaultCollection: "", collections: [] };
  try {
    config = JSON.parse(await readFile(CONFIG, "utf8"));
  } catch {
    console.warn("[content] collections.json 을 읽지 못했습니다 — 기본 묵상집 하나로 처리합니다.");
  }

  const declared = new Map((config.collections ?? []).map((c) => [c.slug, c]));
  const warnings = [];
  const entries = {};

  // 1) 폴더별 묵상집
  for (const ent of await readDir(SRC)) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    if (!declared.has(slug)) {
      warnings.push(`meditations/${slug}/ 폴더가 collections.json 에 없습니다 — 임시 묵상집으로 표시합니다.`);
      declared.set(slug, { slug, order: 900, source: "manual", name: { [DEFAULT_LANG]: slug } });
    }
    entries[slug] = await readCollection(join(SRC, slug), slug, warnings);
  }

  // 2) 폴더 없이 meditations/ 바로 아래 있는 옛 파일 → 기본 묵상집
  const flat = (await readDir(SRC)).filter((e) => e.isFile() && e.name.endsWith(".md"));
  if (flat.length) {
    const fallback = config.defaultCollection || declared.keys().next().value || "default";
    if (!declared.has(fallback)) {
      declared.set(fallback, { slug: fallback, order: 1, source: "manual", name: { [DEFAULT_LANG]: fallback } });
    }
    const legacy = await readCollection(SRC, fallback, warnings);
    entries[fallback] = { ...legacy, ...(entries[fallback] ?? {}) }; // 폴더 안의 것이 우선
    warnings.push(`meditations/ 바로 아래 md 파일 ${flat.length}개를 '${fallback}' 묵상집으로 넣었습니다. meditations/${fallback}/ 로 옮기는 것을 권합니다.`);
  }

  // 3) 콘텐츠가 하나도 없는 묵상집은 목록에서 빼되, 직접 입력용은 남깁니다
  const collections = [...declared.values()]
    .map((c) => {
      const byDate = entries[c.slug] ?? {};
      const count = Object.values(byDate).reduce((n, byLang) => n + Object.keys(byLang).length, 0);
      return { ...c, count };
    })
    .filter((c) => c.count > 0 || c.source === "manual")
    .sort((a, b) => (a.order ?? 500) - (b.order ?? 500) || a.slug.localeCompare(b.slug));

  const defaultCollection =
    collections.find((c) => c.slug === config.defaultCollection)?.slug ?? collections[0]?.slug ?? "";

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ defaultCollection, collections, entries }, null, 2) + "\n");

  for (const w of warnings) console.warn(`[content] ${w}`);
  const total = collections.reduce((n, c) => n + c.count, 0);
  console.log(
    `[content] 묵상집 ${collections.length}개 / 글 ${total}개 → src/generated/devotionals.json` +
      (collections.length ? `  (${collections.map((c) => `${c.slug}:${c.count}`).join(", ")})` : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
