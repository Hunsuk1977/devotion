# Daily Devotional (매일 묵상)

'My Utmost for His Highest' 스타일의 일일 묵상 사이트. 여러 **묵상집**을 탭으로 나눠 보고, 각 묵상집은 이메일·웹에서 자동으로 가져오거나 직접 입력합니다. 한국어/영어, 라이트/다크, 모바일 대응.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
```

## 구조

```
collections.json              묵상집 목록 (이름, 소개, 가져오기 설정)
meditations/
  tozer/2026-09-10.md         묵상집별 폴더, 날짜별 파일
  tozer/2026-09-10.en.md      영어판
  pastor/2026-09-13.md
importer.py                   이메일·웹에서 가져오는 스크립트
.github/workflows/
  import-daily.yml            매일 아침 자동 실행
  import-backfill.yml         밀린 것 따라잡기 (수동)
```

묵상집을 늘리고, 가져오기를 설정하고, 밀린 것을 따라잡는 방법은 **[docs/IMPORT.md](docs/IMPORT.md)** 에 정리했습니다.

## 세 가지 동작 모드

환경변수에 따라 자동으로 결정됩니다.

| 모드 | 조건 | 읽기 | 쓰기(관리자 화면) |
|---|---|---|---|
| 로컬 | 환경변수 없음 | `meditations/` 빌드 결과 | 브라우저에만 저장 |
| GitHub | `VITE_GITHUB_REPO` | `meditations/` 빌드 결과 | 저장소에 커밋 → Netlify 재배포 |
| Supabase | `VITE_SUPABASE_URL` | DB | DB (즉시 반영) |

### GitHub 모드 (권장)

Netlify 환경변수:

```
VITE_GITHUB_REPO=Hunsuk1977/devotion
VITE_GITHUB_BRANCH=main
VITE_CONTENT_DIR=meditations
```

관리자 화면 로그인은 GitHub Personal Access Token(Contents: Read and write)으로 하며, 토큰은 브라우저에만 저장됩니다.

### Supabase 모드 (선택)

`supabase/schema.sql` 을 SQL Editor 에 실행하고, Authentication > Users 에서 관리자 계정을 만든 뒤 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 넣습니다. DB 방식이라 저장이 즉시 반영됩니다.

## Netlify 배포

저장소를 연결하면 끝입니다. Build command `npm run build`, Publish directory `dist`, SPA 리다이렉트가 모두 `netlify.toml` 에 있습니다. 가져오기 워크플로가 커밋하면 Netlify가 자동으로 다시 배포합니다.

## URL 구조

- `/` → 마지막으로 보던 묵상집의 오늘 글
- `/tozer/ko/2026-09-10` → 묵상집·언어·날짜
- `/ko/2026-09-10` → 옛 주소, 기본 묵상집으로 연결
- `/admin` → 관리자 입력 화면

## 언어 추가

`src/i18n.ts` 의 `LANGUAGES` 에 한 줄 추가합니다. Supabase 사용 시 `languages` 테이블에도 같은 코드를 넣으세요. UI 문자열은 선택이며, 없으면 기본 언어로 폴백합니다.

## 스크립트

- `npm run build` — `meditations/` 를 읽어 데이터를 만들고 배포용으로 빌드 (`dist/`)
- `npm run content` — 콘텐츠 데이터만 다시 생성
- `npm run build:single` — 모든 자원을 한 파일로 인라인한 데모 빌드 (`VITE_HASH_ROUTER=1` 과 함께)
