# Make 시나리오 연계

Gmail → Gemini → GitHub 시나리오(`Hunsuk1977/devotion`)가 커밋하는 마크다운을 이 앱이 그대로 읽습니다.

```
Gmail 새 메일
   ↓ Gemini 가 마크다운으로 변환·번역
GitHub  meditations/2026-09-10.md   ← Make 가 커밋
   ↓ push 감지
Netlify 빌드 (npm run build)
   ↓ scripts/build-content.mjs 가 md → JSON
웹사이트에 반영 (1~2분)
```

관리자 화면에서 손으로 쓰거나 고친 것도 **같은 폴더에 같은 형식으로 커밋**되므로, 자동으로 들어온 것과 손으로 올린 것이 한 저장소에서 함께 관리됩니다.

## 앱이 읽는 형식

`meditations/` 폴더의 `YYYY-MM-DD.md` 파일을 읽습니다. 다른 언어는 `YYYY-MM-DD.en.md` 처럼 언어 코드를 붙입니다. 두 가지 형식을 모두 인식합니다.

### 형식 A — 지금 Make 가 만드는 자유 형식 (그대로 동작함)

```markdown
## 토저의 기독교 리더십 - 2025년 5월 13일

### 설교: 웅변가가 아닌 선지자

> 내가 내 말을 네 입에 두고 … —이사야 51:16

**누군가 지적했듯이, 기독교 사역자는 …**

선지자는 메시지를 명확하게 듣고 … 『하나님은 관심을 가진 자에게 말씀하신다』, 85쪽.

> "주님, 오늘 아침 … 아멘."
```

읽는 규칙은 이렇습니다.

`##` 줄은 시리즈명과 원문 날짜로 나뉩니다(가운데 `-` 기준). `###` 줄이 묵상 제목이 됩니다. 제목 바로 다음의 첫 인용문(`>`)이 성경 본문이고, 끝의 `—이사야 51:16` 부분을 구절 위치로 떼어냅니다. 그 뒤부터가 묵상 본문이며, 마지막 기도문 인용도 본문에 그대로 남아 인용 서식으로 표시됩니다. 맨 앞의 안내 문장("다음은 요청하신 이메일 내용을…")과 앞뒤의 `---` 구분선은 자동으로 버립니다.

### 형식 B — frontmatter (권장, 관리자 화면이 저장하는 형식)

```markdown
---
date: 2026-09-10
lang: ko
title: 설교: 웅변가가 아닌 선지자
series: 토저의 기독교 리더십
scripture_ref: 이사야 51:16
scripture_text: |
  내가 내 말을 네 입에 두고 내 손 그늘로 너를 덮었나니 …
status: published
---

**누군가 지적했듯이, 기독교 사역자는 …**

> "주님, 오늘 아침 … 아멘."
```

형식 A도 잘 동작하지만, 형식 B는 제목·구절을 추측할 필요가 없어 결과가 항상 정확합니다. `status: draft` 로 두면 사이트에 보이지 않으므로 미리 받아두고 나중에 공개할 수도 있습니다.

## 지금 시나리오에서 손보면 좋을 세 가지

**1. 파일 이름이 겹쳐 이전 글을 덮어씁니다.** 커밋 b97d647 에서 `meditations/2026-09-10.md` 의 "2025년 5월 12일" 내용이 "5월 13일" 내용으로 통째로 바뀌었습니다. 파일명을 실행 날짜로 짓기 때문에, 하루에 메일이 두 통 오거나 시나리오를 두 번 돌리면 먼저 것이 사라집니다. 파일명을 **메일 본문의 날짜**로 짓거나, 같은 이름이 있으면 `-2` 를 붙이도록 바꾸는 것이 안전합니다.

**2. 파일 이름의 날짜와 본문의 날짜가 다릅니다.** 파일은 `2026-09-10`, 본문은 "2025년 5월 13일" 입니다. 앱은 **파일 이름의 날짜**로 달력에 배치하므로 지금도 문제는 없지만, 원문 날짜대로 배치하시려면 파일명을 본문 날짜로 맞추면 됩니다. 본문 날짜는 시리즈 줄에서 읽어 화면 상단에 함께 표시됩니다.

**3. 영어판이 아직 없습니다.** Gemini 모듈을 하나 더 두거나 한 번의 응답에서 두 언어를 받아 `2026-09-10.en.md` 로 한 번 더 커밋하면, 웹에서 한국어/English 전환이 바로 동작합니다.

## Gemini 프롬프트 (형식 B + 두 언어)

두 언어를 한 번에 받고 싶다면 다음처럼 요청하고, 응답을 `===EN===` 기준으로 잘라 두 번 커밋하면 됩니다.

```
아래 이메일 본문을 묵상 웹사이트용 마크다운 두 벌로 변환해 주세요.
설명, 인사말, "다음은 …입니다" 같은 안내 문장은 절대 넣지 마세요.
출력은 아래 구조만 그대로 따르세요.

---
date: {{오늘 날짜 YYYY-MM-DD}}
lang: ko
title: (묵상 제목 한 줄)
series: (이메일의 시리즈명, 없으면 생략)
scripture_ref: (예: 이사야 51:16)
scripture_text: |
  (성경 본문. 각 줄 앞에 공백 두 칸)
status: published
---

(묵상 본문. 원문의 단락을 유지하고, 강조는 **굵게**, 기도문은 > 인용으로)

===EN===
---
date: {{오늘 날짜 YYYY-MM-DD}}
lang: en
title: (English title)
series: (English series name, omit if none)
scripture_ref: (e.g. Isaiah 51:16)
scripture_text: |
  (English scripture text, two spaces of indent per line)
status: published
---

(English devotional body, same structure)

이메일 본문:
{{Gmail 본문}}
```

## GitHub 모듈 설정

기존 "Make an API Call" 모듈을 그대로 쓰시면 됩니다.

- URL: `/repos/Hunsuk1977/devotion/contents/meditations/{{날짜}}.md`
- Method: `PUT`
- Body: `{ "message": "Feat: {{날짜}} 묵상 자동 등록", "content": "{{base64(본문)}}", "branch": "main" }`
- 이미 있는 파일을 고칠 때는 `sha` 가 필요합니다. 새 파일만 만들 거라면 위 1번 제안대로 이름이 겹치지 않게 하는 편이 간단합니다.

영어판은 같은 모듈을 복제해 경로만 `{{날짜}}.en.md` 로 바꾸고 `===EN===` 뒷부분을 넣으면 됩니다.

## 앱 쪽 설정

Netlify 환경변수에 다음을 넣으면 관리자 화면이 GitHub 모드로 동작합니다. Supabase 변수는 비워 두세요.

```
VITE_GITHUB_REPO=Hunsuk1977/devotion
VITE_GITHUB_BRANCH=main
VITE_CONTENT_DIR=meditations
```

관리자 화면 로그인에는 GitHub Personal Access Token(이 저장소에 Contents: Read and write)이 필요하며, 토큰은 브라우저에만 저장되고 저장소나 서버에 남지 않습니다.
