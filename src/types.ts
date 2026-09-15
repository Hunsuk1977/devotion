/** 지원 언어 코드. 새 언어는 i18n.ts의 LANGUAGES에 추가하면 됩니다. */
export type LangCode = string;

export type DevotionalStatus = "draft" | "published";

/** 묵상집의 글이 어디서 오는지 */
export type SourceKind = "email" | "web" | "manual";

/** 묵상집 (예: 토저 / 목회자 칼럼 / 웹에서 가져오는 묵상) */
export interface Collection {
  slug: string;
  order?: number;
  source: SourceKind;
  /** 언어별 이름. 해당 언어가 없으면 아무 언어나 씁니다. */
  name: Record<LangCode, string>;
  description?: Record<LangCode, string>;
  /** 빌드 시 계산된 글 수 */
  count?: number;
}

/**
 * 묵상집을 만들거나 고칠 때 관리자 화면이 넘기는 값.
 * source·importer 같은 나머지 설정은 저장소에 있는 것을 그대로 둡니다.
 */
export interface CollectionInput {
  slug: string;
  name: Record<LangCode, string>;
  description?: Record<LangCode, string>;
  order?: number;
}

/** 묵상집 × 날짜 × 언어 하나가 글 한 편입니다. */
export interface Devotional {
  id?: string;
  collection: string;
  /** YYYY-MM-DD */
  date: string;
  lang: LangCode;
  title: string;
  /** 시리즈명, 예: "토저의 기독교 리더십" (원문의 큰 제목) */
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
  collection: string;
  date: string;
  lang: LangCode;
}

/** { "tozer": { "2026-09-10": { "ko": {...}, "en": {...} } } } */
export type EntryMap = Record<string, Record<string, Record<LangCode, Devotional>>>;

/** 빌드 결과 / 내보내기 형식 */
export interface ContentBundle {
  defaultCollection: string;
  collections: Collection[];
  entries: EntryMap;
}

export interface DataSource {
  readonly mode: "local" | "supabase" | "github";
  /** 관리자 인증 방식: 없음 / 이메일+비밀번호(Supabase) / 토큰(GitHub PAT) */
  readonly authKind: "none" | "password" | "token";

  /** 관리자 화면용: 빈 묵상집을 포함한 전체 목록 */
  collections(): Promise<Collection[]>;
  /** 독자 화면용: 글이 한 편이라도 게시된 묵상집만 */
  readerCollections(): Promise<Collection[]>;
  defaultCollection(): Promise<string>;

  /** 묵상집 만들기·이름 고치기. 저장 후의 전체 목록을 돌려줍니다. */
  saveCollection(input: CollectionInput): Promise<Collection[]>;
  /** 묵상집 지우기. 글이 남아 있으면 거절합니다. */
  removeCollection(slug: string): Promise<Collection[]>;

  get(key: DevotionalKey): Promise<Devotional | null>;
  /** 해당 묵상집·날짜에 있는 언어 목록 (published만, 관리자에서는 draft 포함) */
  langsFor(collection: string, date: string, includeDrafts?: boolean): Promise<LangCode[]>;
  /** 같은 날짜에 글이 있는 다른 묵상집 목록 */
  collectionsOn(date: string, lang: LangCode): Promise<string[]>;
  /** 이전/다음 글이 있는 날짜 (없으면 null) */
  neighbor(key: DevotionalKey, dir: -1 | 1): Promise<string | null>;
  /** 관리자 목록용: 최근 항목 */
  list(collection: string | null, limit?: number): Promise<Devotional[]>;

  upsert(d: Devotional): Promise<Devotional>;
  remove(key: DevotionalKey): Promise<void>;
  exportAll(): Promise<ContentBundle>;
  importAll(bundle: ContentBundle): Promise<number>;

  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentUser(): Promise<string | null>;
}
