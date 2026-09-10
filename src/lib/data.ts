import type { DataSource, Devotional, DevotionalKey, DevotionalMap } from "../types";
import { supabase } from "./supabase";
import { GENERATED, contentPath, toMarkdown } from "./content";

/* ------------------------------------------------------------------ */
/* 로컬 모드: localStorage. Supabase 환경변수가 없을 때 자동 사용.        */
/* ------------------------------------------------------------------ */

const LS_KEY = "devotional.v1";

function safeRead(): DevotionalMap | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as DevotionalMap) : null;
  } catch {
    return null;
  }
}
function safeWrite(map: DevotionalMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* 저장 불가 환경 — 메모리에만 유지 */
  }
}

function sortedDates(map: DevotionalMap, lang: string, includeDrafts: boolean) {
  return Object.keys(map)
    .filter((d) => {
      const e = map[d]?.[lang];
      return e && (includeDrafts || e.status === "published");
    })
    .sort();
}

class LocalStore implements DataSource {
  readonly mode = "local" as const;
  readonly authKind = "none" as const;
  private map: DevotionalMap;
  constructor() {
    this.map = safeRead() ?? structuredClone(GENERATED);
  }
  private persist() {
    safeWrite(this.map);
  }
  async get({ date, lang }: DevotionalKey) {
    return this.map[date]?.[lang] ?? null;
  }
  async langsFor(date: string, includeDrafts = false) {
    return Object.values(this.map[date] ?? {})
      .filter((e) => includeDrafts || e.status === "published")
      .map((e) => e.lang);
  }
  async neighbor({ date, lang }: DevotionalKey, dir: -1 | 1) {
    const dates = sortedDates(this.map, lang, false);
    const cands = dir < 0 ? dates.filter((d) => d < date) : dates.filter((d) => d > date);
    return dir < 0 ? cands[cands.length - 1] ?? null : cands[0] ?? null;
  }
  async list(limit = 50) {
    return Object.values(this.map)
      .flatMap((byLang) => Object.values(byLang))
      .sort((a, b) => (a.date === b.date ? a.lang.localeCompare(b.lang) : b.date.localeCompare(a.date)))
      .slice(0, limit);
  }
  async upsert(d: Devotional) {
    const rec = { ...d, updatedAt: new Date().toISOString() };
    this.map[d.date] = { ...(this.map[d.date] ?? {}), [d.lang]: rec };
    this.persist();
    return rec;
  }
  async remove({ date, lang }: DevotionalKey) {
    if (this.map[date]) {
      delete this.map[date][lang];
      if (Object.keys(this.map[date]).length === 0) delete this.map[date];
      this.persist();
    }
  }
  async exportAll() {
    return structuredClone(this.map);
  }
  async importAll(map: DevotionalMap) {
    let n = 0;
    for (const [date, byLang] of Object.entries(map)) {
      for (const [lang, e] of Object.entries(byLang)) {
        this.map[date] = { ...(this.map[date] ?? {}), [lang]: { ...e, date, lang } };
        n++;
      }
    }
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
/* Supabase 모드: supabase/schema.sql 의 devotionals 테이블 사용           */
/* ------------------------------------------------------------------ */

type Row = {
  id: string;
  date: string;
  lang: string;
  title: string;
  scripture_ref: string | null;
  scripture_text: string | null;
  body_md: string;
  status: "draft" | "published";
  updated_at: string;
};

const fromRow = (r: Row): Devotional => ({
  id: r.id,
  date: r.date,
  lang: r.lang,
  title: r.title,
  scriptureRef: r.scripture_ref ?? "",
  scriptureText: r.scripture_text ?? "",
  bodyMd: r.body_md,
  status: r.status,
  updatedAt: r.updated_at,
});

const toRow = (d: Devotional) => ({
  date: d.date,
  lang: d.lang,
  title: d.title,
  scripture_ref: d.scriptureRef || null,
  scripture_text: d.scriptureText || null,
  body_md: d.bodyMd,
  status: d.status,
});

class SupabaseStore implements DataSource {
  readonly mode = "supabase" as const;
  readonly authKind = "password" as const;
  private sb = supabase!;

  async get({ date, lang }: DevotionalKey) {
    const { data, error } = await this.sb
      .from("devotionals")
      .select("*")
      .eq("date", date)
      .eq("lang", lang)
      .maybeSingle<Row>();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }
  async langsFor(date: string, includeDrafts = false) {
    let q = this.sb.from("devotionals").select("lang,status").eq("date", date);
    if (!includeDrafts) q = q.eq("status", "published");
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => r.lang as string);
  }
  async neighbor({ date, lang }: DevotionalKey, dir: -1 | 1) {
    const q = this.sb
      .from("devotionals")
      .select("date")
      .eq("lang", lang)
      .eq("status", "published")
      .limit(1);
    const { data, error } =
      dir < 0 ? await q.lt("date", date).order("date", { ascending: false }) : await q.gt("date", date).order("date");
    if (error) throw error;
    return (data?.[0]?.date as string) ?? null;
  }
  async list(limit = 50) {
    const { data, error } = await this.sb
      .from("devotionals")
      .select("*")
      .order("date", { ascending: false })
      .order("lang")
      .limit(limit);
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  }
  async upsert(d: Devotional) {
    const { data, error } = await this.sb
      .from("devotionals")
      .upsert(toRow(d), { onConflict: "date,lang" })
      .select()
      .single<Row>();
    if (error) throw error;
    return fromRow(data);
  }
  async remove({ date, lang }: DevotionalKey) {
    const { error } = await this.sb.from("devotionals").delete().eq("date", date).eq("lang", lang);
    if (error) throw error;
  }
  async exportAll() {
    const { data, error } = await this.sb.from("devotionals").select("*").order("date");
    if (error) throw error;
    const map: DevotionalMap = {};
    for (const r of data as Row[]) {
      map[r.date] = { ...(map[r.date] ?? {}), [r.lang]: fromRow(r) };
    }
    return map;
  }
  async importAll(map: DevotionalMap) {
    const rows = Object.values(map).flatMap((byLang) => Object.values(byLang).map(toRow));
    if (rows.length === 0) return 0;
    const { error } = await this.sb.from("devotionals").upsert(rows, { onConflict: "date,lang" });
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

/* ------------------------------------------------------------------ */
/* GitHub 모드: 저장소의 content/devotionals/*.md 가 원본.                */
/*  - 읽기: 빌드 시 생성된 JSON (+ 이 세션에서 저장한 항목 오버레이)        */
/*  - 쓰기: GitHub Contents API 로 커밋 → Netlify 가 자동 재배포          */
/*  - Make 시나리오도 같은 경로·형식으로 커밋하면 그대로 반영됩니다.        */
/* ------------------------------------------------------------------ */

const GH_REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined; // "owner/repo"
const GH_BRANCH = (import.meta.env.VITE_GITHUB_BRANCH as string | undefined) || "main";
const GH_DIR = (import.meta.env.VITE_CONTENT_DIR as string | undefined) || "meditations";
const GH_TOKEN_KEY = "devotional.gh_token";

function ghToken(): string | null {
  try {
    return localStorage.getItem(GH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function utf8ToBase64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

class GitHubStore implements DataSource {
  readonly mode = "github" as const;
  readonly authKind = "token" as const;
  private map: DevotionalMap = structuredClone(GENERATED);
  private sha = new Map<string, string>();

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
      const j = await res.json().catch(() => ({}));
      throw new Error(`GitHub ${res.status}: ${(j as { message?: string }).message ?? res.statusText}`);
    }
    return res.json();
  }

  /** 저장소의 현재 파일 sha (수정/삭제 시 필요) */
  private async fetchSha(date: string, lang: string): Promise<string | null> {
    const key = `${date}/${lang}`;
    const j = (await this.api(`/contents/${contentPath(date, lang, GH_DIR)}?ref=${GH_BRANCH}`)) as { sha?: string } | null;
    if (j?.sha) this.sha.set(key, j.sha);
    else this.sha.delete(key);
    return j?.sha ?? null;
  }

  async get({ date, lang }: DevotionalKey) {
    return this.map[date]?.[lang] ?? null;
  }
  async langsFor(date: string, includeDrafts = false) {
    return Object.values(this.map[date] ?? {})
      .filter((e) => includeDrafts || e.status === "published")
      .map((e) => e.lang);
  }
  async neighbor({ date, lang }: DevotionalKey, dir: -1 | 1) {
    const dates = sortedDates(this.map, lang, false);
    const cands = dir < 0 ? dates.filter((d) => d < date) : dates.filter((d) => d > date);
    return dir < 0 ? cands[cands.length - 1] ?? null : cands[0] ?? null;
  }
  async list(limit = 50) {
    return Object.values(this.map)
      .flatMap((byLang) => Object.values(byLang))
      .sort((a, b) => (a.date === b.date ? a.lang.localeCompare(b.lang) : b.date.localeCompare(a.date)))
      .slice(0, limit);
  }
  async upsert(d: Devotional) {
    const rec = { ...d, updatedAt: new Date().toISOString() };
    const sha = await this.fetchSha(d.date, d.lang);
    const j = (await this.api(`/contents/${contentPath(d.date, d.lang, GH_DIR)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `devotional: ${d.date} ${d.lang} — ${d.title}`,
        content: utf8ToBase64(toMarkdown(rec)),
        branch: GH_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })) as { content?: { sha?: string } };
    if (j?.content?.sha) this.sha.set(`${d.date}/${d.lang}`, j.content.sha);
    this.map[d.date] = { ...(this.map[d.date] ?? {}), [d.lang]: rec };
    return rec;
  }
  async remove({ date, lang }: DevotionalKey) {
    const sha = await this.fetchSha(date, lang);
    if (sha) {
      await this.api(`/contents/${contentPath(date, lang, GH_DIR)}`, {
        method: "DELETE",
        body: JSON.stringify({ message: `devotional: remove ${date} ${lang}`, sha, branch: GH_BRANCH }),
      });
    }
    if (this.map[date]) {
      delete this.map[date][lang];
      if (Object.keys(this.map[date]).length === 0) delete this.map[date];
    }
  }
  async exportAll() {
    return structuredClone(this.map);
  }
  async importAll(map: DevotionalMap) {
    let n = 0;
    for (const byLang of Object.values(map)) {
      for (const e of Object.values(byLang)) {
        await this.upsert(e);
        n++;
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
    if (!res.ok) throw new Error(res.status === 401 ? "토큰이 올바르지 않습니다." : `저장소에 접근할 수 없습니다 (${res.status}).`);
    const j = (await res.json()) as { permissions?: { push?: boolean } };
    if (j.permissions && !j.permissions.push) throw new Error("이 토큰에는 저장소 쓰기(Contents: Read and write) 권한이 없습니다.");
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

export const db: DataSource = supabase ? new SupabaseStore() : GH_REPO ? new GitHubStore() : new LocalStore();
