# Daily Devotional (매일 묵상)

'My Utmost for His Highest' 스타일의 일일 묵상 전용 웹앱. 뷰어 + 관리자 입력 화면, 한국어/영어(확장 가능), 라이트/다크.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
```

콘텐츠는 `meditations/` 폴더의 마크다운 파일에서 옵니다. Make 시나리오(Gmail → Gemini → GitHub)가 커밋하는 파일 형식을 그대로 읽으며, 자세한 내용은 [docs/MAKE.md](docs/MAKE.md) 를 보세요.

## 세 가지 동작 모드

환경변수에 따라 자동으로 결정됩니다.

| 모드 | 조건 | 읽기 | 쓰기(관리자 화면) |
|---|---|---|---|
| 로컬 | 환경변수 없음 | `meditations/` 빌드 결과 | 브라우저에만 저장 |
| GitHub | `VITE_GITHUB_REPO` | `meditations/` 빌드 결과 | 저장소에 커밋 → Netlify 재배포 |
| Supabase | `VITE_SUPABASE_URL` | DB | DB (즉시 반영) |

## GitHub 모드 (Make 연계 — 권장)

Netlify 환경변수:

```
VITE_GITHUB_REPO=Hunsuk1977/devotion
VITE_GITHUB_BRANCH=main
VITE_CONTENT_DIR=meditations
```

관리자 화면 로그인은 GitHub Personal Access Token(Contents: Read and write)으로 하며, 토큰은 브라우저에만 저장됩니다.

## Supabase 연결 (선택)

1. Supabase 프로젝트 생성 → SQL Editor 에 `supabase/schema.sql` 실행
2. Authentication > Users 에서 관리자 계정(이메일/비밀번호) 생성
3. `.env` 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 입력 (Netlify 는 환경변수 설정에 등록)

## Netlify 배포

- 저장소 연결 후 Build command `npm run build`, Publish directory `dist` (netlify.toml 에 포함)
- SPA 리다이렉트도 `netlify.toml` 에 포함되어 있음

## URL 구조

- `/` → 오늘 묵상 (선호 언어)
- `/ko/2026-09-10`, `/en/2026-09-10` → 특정 날짜·언어
- `/admin` → 관리자 입력 화면

## 콘텐츠 파일 형식

`meditations/2026-09-10.md` (기본 언어), `meditations/2026-09-10.en.md` (영어). frontmatter 형식과 Make/Gemini 의 자유 형식을 모두 인식합니다 — [docs/MAKE.md](docs/MAKE.md) 참고.

## 언어 추가

`src/i18n.ts` 의 `LANGUAGES` 에 한 줄 추가하고, Supabase 사용 시 `languages` 테이블에도 같은 코드를 넣으면 됩니다. UI 문자열은 선택(없으면 기본 언어로 폴백).

## 스크립트

- `npm run build` — 배포용 빌드 (`dist/`)
- `npm run build:single` — 모든 자원을 한 파일로 인라인한 데모 빌드 (`dist-single/index.html`; `VITE_HASH_ROUTER=1` 과 함께 사용)
