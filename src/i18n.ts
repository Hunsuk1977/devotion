import type { LangCode } from "./types";

/** 콘텐츠 언어. 새 언어를 추가하려면 여기에 한 줄 추가 + UI 문자열(선택). */
export const LANGUAGES: { code: LangCode; label: string; locale: string }[] = [
  { code: "ko", label: "한국어", locale: "ko-KR" },
  { code: "en", label: "English", locale: "en-US" },
  // { code: "es", label: "Español", locale: "es-ES" },
];

export const DEFAULT_LANG: LangCode = "ko";

type Dict = Record<string, string>;

const ko: Dict = {
  appName: "매일 묵상",
  today: "오늘",
  prev: "이전 묵상",
  next: "다음 묵상",
  pickDate: "날짜 선택",
  scripture: "말씀",
  empty: "이 날짜의 묵상이 아직 준비되지 않았습니다.",
  emptyOtherLangs: "다른 언어로 읽기:",
  admin: "관리",
  reader: "묵상 보기",
  theme: "테마",
  themeLight: "라이트",
  themeDark: "다크",
  themeSystem: "시스템",
  language: "언어",
  collection: "묵상집",
  allCollections: "전체 묵상집",
  noCollections: "묵상집이 아직 없습니다.",
  emptyOtherCollections: "이 날짜에 글이 있는 다른 묵상집:",
  // admin
  adminTitle: "묵상 입력",
  fieldDate: "날짜",
  fieldLang: "언어",
  fieldTitle: "묵상 제목",
  fieldSeries: "시리즈 (선택)",
  fieldSeriesHint: "예: 토저의 기독교 리더십",
  fieldRef: "성경 구절",
  fieldRefHint: "예: 요한복음 3:16",
  fieldScripture: "성경 본문",
  fieldBody: "묵상 내용",
  fieldBodyHint: "마크다운: **굵게**, *기울임*, 빈 줄로 단락 구분, > 인용",
  fieldStatus: "상태",
  statusDraft: "초안",
  statusPublished: "게시",
  save: "저장",
  saved: "저장되었습니다",
  delete: "삭제",
  deleteConfirm: "이 묵상을 삭제할까요?",
  preview: "미리보기",
  edit: "편집",
  recent: "최근 항목",
  exportJson: "JSON 내보내기",
  importJson: "JSON 가져오기",
  imported: "개 항목을 가져왔습니다",
  localMode: "로컬 모드 — 이 브라우저에만 저장됩니다. Supabase 연결 시 실제 배포 데이터로 전환됩니다.",
  signIn: "로그인",
  signOut: "로그아웃",
  email: "이메일",
  password: "비밀번호",
  signInHint: "관리자 계정으로 로그인하세요.",
  signInHintToken: "GitHub 개인용 액세스 토큰으로 로그인하세요. 토큰은 이 브라우저에만 저장됩니다.",
  token: "GitHub 토큰",
  tokenHint: "Settings → Developer settings → Personal access tokens. 이 저장소에 Contents: Read and write 권한이 필요합니다.",
  githubMode: "GitHub 모드 — 저장하면 저장소에 커밋되고, Netlify가 다시 배포하면 사이트에 반영됩니다 (보통 1~2분).",
  newEntry: "새 묵상",
  copyFrom: "다른 언어에서 복사",
  required: "제목과 묵상 내용은 필수입니다.",
  openReader: "이 날짜 보기",
};

const en: Dict = {
  appName: "Daily Devotional",
  today: "Today",
  prev: "Previous",
  next: "Next",
  pickDate: "Pick a date",
  scripture: "Scripture",
  empty: "There is no devotional for this date yet.",
  emptyOtherLangs: "Read in another language:",
  admin: "Admin",
  reader: "Reader",
  theme: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  language: "Language",
  collection: "Collection",
  allCollections: "All collections",
  noCollections: "No collections yet.",
  emptyOtherCollections: "Other collections with an entry on this date:",
  adminTitle: "Devotional Editor",
  fieldDate: "Date",
  fieldLang: "Language",
  fieldTitle: "Title",
  fieldSeries: "Series (optional)",
  fieldSeriesHint: "e.g. Tozer on Christian Leadership",
  fieldRef: "Scripture reference",
  fieldRefHint: "e.g. John 3:16",
  fieldScripture: "Scripture text",
  fieldBody: "Devotional",
  fieldBodyHint: "Markdown: **bold**, *italic*, blank line = paragraph, > quote",
  fieldStatus: "Status",
  statusDraft: "Draft",
  statusPublished: "Published",
  save: "Save",
  saved: "Saved",
  delete: "Delete",
  deleteConfirm: "Delete this devotional?",
  preview: "Preview",
  edit: "Edit",
  recent: "Recent entries",
  exportJson: "Export JSON",
  importJson: "Import JSON",
  imported: " entries imported",
  localMode: "Local mode — saved in this browser only. Connect Supabase to publish for real.",
  signIn: "Sign in",
  signOut: "Sign out",
  email: "Email",
  password: "Password",
  signInHint: "Sign in with an admin account.",
  signInHintToken: "Sign in with a GitHub personal access token. It is stored in this browser only.",
  token: "GitHub token",
  tokenHint: "Settings → Developer settings → Personal access tokens, with Contents: Read and write on this repository.",
  githubMode: "GitHub mode — saving commits to the repository; the site updates once Netlify redeploys (usually 1–2 minutes).",
  newEntry: "New entry",
  copyFrom: "Copy from another language",
  required: "Title and devotional text are required.",
  openReader: "Open in reader",
};

const DICTS: Record<string, Dict> = { ko, en };

export function t(lang: LangCode, key: string): string {
  return DICTS[lang]?.[key] ?? DICTS[DEFAULT_LANG][key] ?? en[key] ?? key;
}

export function localeOf(lang: LangCode): string {
  return LANGUAGES.find((l) => l.code === lang)?.locale ?? "en-US";
}

export function labelOf(lang: LangCode): string {
  return LANGUAGES.find((l) => l.code === lang)?.label ?? lang;
}
