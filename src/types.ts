/** 지원 언어 코드. 새 언어는 i18n.ts의 LANGUAGES에 추가하면 됩니다. */
export type LangCode = string;

export type DevotionalStatus = "draft" | "published";

/** 날짜 × 언어 한 쌍이 하나의 묵상 레코드입니다. */
export interface Devotional {
  id?: string;
  /** YYYY-MM-DD */
  date: string;
  lang: LangCode;
  title: string;
  /** 시리즈명, 예: "토저의 기독교 리더십" (원문 메일의 큰 제목) */
  series?: string;
  /** 원문에 적힌 날짜 표기, 예: "2025년 5월 13일" */
  sourceLabel?: string;
  /** 성경 구절 위치, 예: "요한복음 3:16", "John 3:16" */
  scriptureRef: string;
  /** 성경 본문 (마크다운 허용) */
  scriptureText: string;
  /** 묵상 내용 (마크다운) */
  bodyMd: string;
  status: DevotionalStatus;
  updatedAt?: string;
}

export interface DevotionalKey {
  date: string;
  lang: LangCode;
}

/**
 * JSON 내보내기/가져오기 형식.
 * { "2026-09-10": { "ko": {...}, "en": {...} }, ... }
 */
export type DevotionalMap = Record<string, Record<LangCode, Devotional>>;

export interface DataSource {
  readonly mode: "local" | "supabase" | "github";
  /** 관리자 인증 방식: 없음 / 이메일+비밀번호(Supabase) / 토큰(GitHub PAT) */
  readonly authKind: "none" | "password" | "token";
  get(key: DevotionalKey): Promise<Devotional | null>;
  /** 해당 날짜에 존재하는 언어 목록 (published만, 관리자에서는 draft 포함) */
  langsFor(date: string, includeDrafts?: boolean): Promise<LangCode[]>;
  /** 이전/다음 묵상이 존재하는 날짜 (없으면 null) */
  neighbor(key: DevotionalKey, dir: -1 | 1): Promise<string | null>;
  /** 관리자 목록용: 최근 항목 */
  list(limit?: number): Promise<Devotional[]>;
  upsert(d: Devotional): Promise<Devotional>;
  remove(key: DevotionalKey): Promise<void>;
  exportAll(): Promise<DevotionalMap>;
  importAll(map: DevotionalMap): Promise<number>;
  // 인증 (Supabase 모드에서만 의미 있음)
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentUser(): Promise<string | null>;
}
