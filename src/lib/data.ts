import type {
  Collection,
  ContentBundle,
  DataSource,
  Devotional,
  DevotionalKey,
  EntryMap,
  LangCode,
} from "../types";
import { supabase } from "./supabase";
import { BUNDLE, CONTENT_DIR, contentPath, toMarkdown } from "./content";

/* ------------------------------------------------------------------ */
/* 공통 도우미                                                          */
/* ------------------------------------------------------------------ */

function datesIn(entries: EntryMap, collection: string, lang: string, includeDrafts: boolean) {
  return Object.keys(entries[collection] ?? {})
    .filter((d) => {
      const e = entries[collection]?.[d]?.[lang];
      return e && (includeDrafts || e.status === "published");
    })
    .sort();
}

function flatten(entries: EntryMap, collection: string | null) {
  const slugs = collection ? [collection] : Object.keys(entries);
  return slugs
    .flatMap((slug) => Object.values(entries[slug] ?? {}).flatMap((byLang) => Object.values(byLang)))
    .sort((a, b) =>
      a.date === b.date
        ? a.collection.localeCompare(b.collection) || a.lang.localeCompare(b.lang)
        : b.date.localeCompare(a.date),
    );
}

/** 메모리 위의 EntryMap 을 다루는 공통 읽기 동작 (로컬·GitHub 모드가 공유) */
abstract class MapStore {
  protected entries: EntryMap;
  protected cols: Collection[];
  protected defaultSlug: string;

  constructor() {
    this.entries = structuredClone(BUNDLE.entries ?? {});
    this.cols = structuredClone(BUNDLE.collections ?? []);
    this.defaultSlug = BUNDLE.defaultCollection ?? this.cols[0]?.slug ?? "";
  }

  async collections() {
    return this.cols;
  }
  async defaultCollection() {
    return this.defaultSlug;
  }
  async get({ collection, date, lang }: DevotionalKey) {
    return this.entries[collection]?.[date]?.[lang] ?? null;
  }
  async langsFor(collection: string, date: string, includeDrafts = false) {
    return Object.values(this.entries[collection]?.[date] ?? {})
      .filter((e) => includeDrafts || e.status === "published")
      .map((e) => e.lang);
  }
  async collectionsOn(date: string, lang: LangCode) {
    return this.cols
      .map((c) => c.slug)
      .filter((slug) => {
        const e = this.entries[slug]?.[date]?.[lang];
        return e && e.status === "published";
      });
  }
  async neighbor({ collection, date, lang }: DevotionalKey, dir: -1 | 1) {
    const dates = datesIn(this.entries, collection, lang, false);
    const cands = dir < 0 ? dates.filter((d) => d < date) : dates.filter((d) => d > date);
    return dir < 0 ? (cands.at(-1) ?? null) : (cands[0] ?? null);
  }
  async list(collection: string | null, limit = 60) {
    return flatten(this.entries, collection).slice(0, limit);
  }
  async exportAll(): Promise<ContentBundle> {
    return {
      defaultCollection: this.defaultSlug,
      collections: structuredClone(this.cols),
      entries: structuredClone(this.entries),
    };
  }

  protected put(d: Devotional) {
    const byDate = (this.entries[d.collection] ??= {});
    byDate[d.date] = { ...(byDate[d.date] ?? {}), [d.lang]: d };
  }
  protected drop({ collection, date, lang }: DevotionalKey) {
    const byDate = this.entries[collection];
    if (!byDate?.[date]) return;
    delete byDate[date][lang];
    if (Object.keys(byDate[date]).length === 0) delete byDate[date];
  }
}

/* ------------------------------------------------------------------ */
/* 로컬 모드: localStorage. 환경변수가 없을 때 자동 사용.                 */
/* ------------------------------------------------------------------ */

const LS_KEY = "devotional.v2";

class LocalStore extends MapStore implements DataSource {
  readonly mode = "local" as const;
  readonly authKind = "none" as const;

  constructor() {
    super();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ContentBundle;
        if (saved?.entries) {
          this.entries = saved.entries;
          if (saved.collections?.length) this.cols = saved.collections;
          if (saved.defaultCollection) this.defaultSlug = saved.defaultCollection;
        }
      }
    } catch {
      /* 저장소를 못 읽으면 빌드 결과만 씁니다 */
    }
  }

  private persist() {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ defaultCollection: this.defaultSlug, collections: this.cols, entries: this.entries }),
      );
    } catch {
      /* 저장 불가 환경 — 메모리에만 유지 */
    }
  }

  async upsert(d: Devotional) {
    const rec = { ...d, updatedAt: new Date().toISOString() };
    this.put(rec);
    this.persist();
    return rec;
  }
  async remove(key: DevotionalKey) {
    this.drop(key);
    this.persist();
  }
  async importAll(bundle: ContentBundle) {
    let n = 0;
    for (const [slug, byDate] of Object.entries(bundle.entries ?? {})) {
      for (const [date, byLang] of Object.entries(byDate)) {
        for (const [lang, e] of Object.entries(byLang)) {
          this.put({ ...e, collection: slug, date, lang });
          n++;
        }
      }
    }
    if (bundle.collections?.length) this.cols = bundle.collections;
    this.persist();
    return n;
  }
  async signIn() {}
  async signOut() {}
  async currentUser() {
    return "local";
  }
}

/* ------------------------------------------------------------------ */
/* GitHub 모드: 저장소의 meditations/<묵상집>/*.md 가 원본.               */
/*  - 읽기: 빌드 시 생성된 JSON (+ 이 세션에서 저장한 항목 덮어쓰기)       */
/*  - 쓰기: GitHub Contents API 로 커밋 → Netlify 가 자동 재배포          */
/* ------------------------------------------------------------------ */

const GH_REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined; // "owner/repo"
const GH_BRANCH = (import.meta.env.VITE_GITHUB_BRANCH as string | undefined) || "main";
const GH_TOKEN_KEY = "devotional.gh_token";

function ghToken(): string | null {
  try {
    return localStorage.getItem(GH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

class GitHubStore extends MapStore implements DataSource {
  readonly mode = "github" as const;
  readonly authKind = "token" as const;

  private async api(path: string, init: RequestInit = {}) {
    const token = ghToken();
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`GitHub ${res.status}: ${j.message ?? res.statusText}`);
    }
    return res.json();
  }

  private async fetchSha(key: DevotionalKey): Promise<string | null> {
    const p = contentPath(key.collection, key.date, key.lang, CONTENT_DIR);
    const j = (await this.api(`/contents/${p}?ref=${GH_BRANCH}`)) as { sha?: string } | null;
    return j?.sha ?? null;
  }

  async upsert(d: Devotional) {
    const rec = { ...d, updatedAt: new Date().toISOString() };
    const sha = await this.fetchSha(rec);
    await this.api(`/contents/${contentPath(rec.collection, rec.date, rec.lang, CONTENT_DIR)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `devotional(${rec.collection}): ${rec.date} ${rec.lang} — ${rec.title}`,
        content: utf8ToBase64(toMarkdown(rec)),
        branch: GH_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    this.put(rec);
    return rec;
  }

  async remove(key: DevotionalKey) {
    const sha = await this.fetchSha(key);
    if (sha) {
      await this.api(`/contents/${contentPath(key.collection, key.date, key.lang, CONTENT_DIR)}`, {
        method: "DELETE",
        body: JSON.stringify({
          message: `devotional(${key.collection}): remove ${key.date} ${key.lang}`,
          sha,
          branch: GH_BRANCH,
        }),
      });
    }
    this.drop(key);
  }

  async importAll(bundle: ContentBundle) {
    let n = 0;
    for (const [slug, byDate] of Object.entries(bundle.entries ?? {})) {
      for (const [date, byLang] of Object.entries(byDate)) {
        for (const [lang, e] of Object.entries(byLang)) {
          await this.upsert({ ...e, collection: slug, date, lang });
          n++;
        }
      }
    }
    return n;
  }

  /** GitHub 모드에서는 password 자리에 Personal Access Token 을 넣습니다 */
  async signIn(_email: string, token: string) {
    const t = token.trim();
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}`, {
      headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      throw new Error(res.status === 401 ? "토큰이 올바르지 않습니다." : `저장소에 접근할 수 없습니다 (${res.status}).`);
    }
    const j = (await res.json()) as { permissions?: { push?: boolean } };
    if (j.permissions && !j.permissions.push) {
      throw new Error("이 토큰에는 저장소 쓰기(Contents: Read and write) 권한이 없습니다.");
    }
    try {
      localStorage.setItem(GH_TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  }
  async signOut() {
    try {
      localStorage.removeItem(GH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
  async currentUser() {
    return ghToken() ? `github:${GH_REPO}` : null;
  }
}

/* ------------------------------------------------------------------ */
/* Supabase 모드: supabase/schema.sql 의 devotionals 테이블 사용           */
/* ------------------------------------------------------------------ */

type Row = {
  id: string;
  collection: string;
  date: string;
  lang: string;
  title: string;
  series: string | null;
  source_label: string | null;
  scripture_ref: string | null;
  scripture_text: string | null;
  body_md: string;
  status: "draft" | "published";
  updated_at: string;
};

const fromRow = (r: Row): Devotional => ({
  id: r.id,
  collection: r.collection,
  date: r.date,
  lang: r.lang,
  title: r.title,
  series: r.series ?? "",
  sourceLabel: r.source_label ?? "",
  scriptureRef: r.scripture_ref ?? "",
  scriptureText: r.scripture_text ?? "",
  bodyMd: r.body_md,
  status: r.status,
  updatedAt: r.updated_at,
});

const toRow = (d: Devotional) => ({
  collection: d.collection,
  date: d.date,
  lang: d.lang,
  title: d.title,
  series: d.series || null,
  source_label: d.sourceLabel || null,
  scripture_ref: d.scriptureRef || null,
  scripture_text: d.scriptureText || null,
  body_md: d.bodyMd,
  status: d.status,
});

class SupabaseStore implements DataSource {
  readonly mode = "supabase" as const;
  readonly authKind = "password" as const;
  private sb = supabase!;
  private colCache: Collection[] | null = null;

  async collections() {
    if (this.colCache) return this.colCache;
    const { data, error } = await this.sb.from("collections").select("*").eq("enabled", true).order("sort");
    if (error) throw error;
    this.colCache = (data ?? []).map((r) => ({
      slug: r.slug as string,
      order: r.sort as number,
      source: (r.source as Collection["source"]) ?? "manual",
      name: (r.name as Record<string, string>) ?? {},
      description: (r.description as Record<string, string>) ?? undefined,
    }));
    return this.colCache;
  }
  async defaultCollection() {
    return (await this.collections())[0]?.slug ?? "";
  }
  async get({ collection, date, lang }: DevotionalKey) {
    const { data, error } = await this.sb
      .from("devotionals")
      .select("*")
      .eq("collection", collection)
      .eq("date", date)
      .eq("lang", lang)
      .maybeSingle<Row>();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }
  async langsFor(collection: string, date: string, includeDrafts = false) {
    let q = this.sb.from("devotionals").select("lang,status").eq("collection", collection).eq("date", date);
    if (!includeDrafts) q = q.eq("status", "published");
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => r.lang as string);
  }
  async collectionsOn(date: string, lang: LangCode) {
    const { data, error } = await this.sb
      .from("devotionals")
      .select("collection")
      .eq("date", date)
      .eq("lang", lang)
      .eq("status", "published");
    if (error) throw error;
    const found = new Set((data ?? []).map((r) => r.collection as string));
    return (await this.collections()).map((c) => c.slug).filter((s) => found.has(s));
  }
  async neighbor({ collection, date, lang }: DevotionalKey, dir: -1 | 1) {
    const q = this.sb
      .from("devotionals")
      .select("date")
      .eq("collection", collection)
      .eq("lang", lang)
      .eq("status", "published")
      .limit(1);
    const { data, error } =
      dir < 0 ? await q.lt("date", date).order("date", { ascending: false }) : await q.gt("date", date).order("date");
    if (error) throw error;
    return (data?.[0]?.date as string) ?? null;
  }
  async list(collection: string | null, limit = 60) {
    let q = this.sb.from("devotionals").select("*").order("date", { ascending: false }).order("lang").limit(limit);
    if (collection) q = q.eq("collection", collection);
    const { data, error } = await q;
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  }
  async upsert(d: Devotional) {
    const { data, error } = await this.sb
      .from("devotionals")
      .upsert(toRow(d), { onConflict: "collection,date,lang" })
      .select()
      .single<Row>();
    if (error) throw error;
    return fromRow(data);
  }
  async remove({ collection, date, lang }: DevotionalKey) {
    const { error } = await this.sb
      .from("devotionals")
      .delete()
      .eq("collection", collection)
      .eq("date", date)
      .eq("lang", lang);
    if (error) throw error;
  }
  async exportAll(): Promise<ContentBundle> {
    const { data, error } = await this.sb.from("devotionals").select("*").order("date");
    if (error) throw error;
    const entries: EntryMap = {};
    for (const r of data as Row[]) {
      const rec = fromRow(r);
      const byDate = (entries[rec.collection] ??= {});
      byDate[rec.date] = { ...(byDate[rec.date] ?? {}), [rec.lang]: rec };
    }
    return { defaultCollection: await this.defaultCollection(), collections: await this.collections(), entries };
  }
  async importAll(bundle: ContentBundle) {
    const rows = Object.entries(bundle.entries ?? {}).flatMap(([slug, byDate]) =>
      Object.entries(byDate).flatMap(([date, byLang]) =>
        Object.entries(byLang).map(([lang, e]) => toRow({ ...e, collection: slug, date, lang })),
      ),
    );
    if (!rows.length) return 0;
    const { error } = await this.sb.from("devotionals").upsert(rows, { onConflict: "collection,date,lang" });
    if (error) throw error;
    return rows.length;
  }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  async currentUser() {
    const { data } = await this.sb.auth.getUser();
    return data.user?.email ?? null;
  }
}

export const db: DataSource = supabase ? new SupabaseStore() : GH_REPO ? new GitHubStore() : new LocalStore();
