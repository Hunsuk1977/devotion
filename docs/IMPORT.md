# 묵상집과 자동 가져오기

## 묵상집이란

묵상집은 성격이 다른 묵상 묶음입니다. 어떤 것은 매일 아침 이메일로 오고, 어떤 것은 웹에서 긁어오며, 어떤 것은 직접 씁니다. 독자에게는 화면 위쪽 탭으로 보이고, 탭을 누르면 **같은 날짜의 다른 묵상집**으로 바로 넘어갑니다. 지금 보고 있지 않은 탭에 그 날짜의 글이 있으면 작은 점이 붙습니다. 묵상집이 다섯 개를 넘으면 탭 대신 드롭다운으로 바뀝니다.

주소는 `/<묵상집>/<언어>/<날짜>` 입니다. 예: `/tozer/ko/2026-09-10`. 옛 주소 `/ko/2026-09-10` 으로 들어와도 기본 묵상집으로 자동 연결됩니다.

## 묵상집 추가하기

`collections.json` 에 한 덩어리를 더하면 끝입니다.

```json
{
  "slug": "daily-bread",
  "order": 3,
  "source": "web",
  "name": { "ko": "오늘의 양식", "en": "Daily Bread" },
  "description": { "ko": "웹에서 매일 가져오는 묵상.", "en": "Imported daily from the web." },
  "importer": {
    "kind": "web",
    "url_template": "https://example.com/devotions/{date}",
    "translate": true
  }
}
```

| 항목 | 뜻 |
|---|---|
| `slug` | 주소와 폴더 이름 (`meditations/daily-bread/`) |
| `order` | 탭 순서 |
| `source` | `email` / `web` / `manual` — 화면 표시와 정리용 |
| `name`, `description` | 언어별 이름과 소개 |
| `importer` | 없으면 직접 입력 전용 묵상집이 됩니다 |

글이 한 편도 없는 묵상집은 탭에 나타나지 않습니다. 단, `source: "manual"` 인 묵상집은 직접 쓰려고 만든 것이므로 비어 있어도 남습니다.

파일은 `meditations/<slug>/2026-09-10.md` (기본 언어)와 `meditations/<slug>/2026-09-10.en.md` (영어)로 저장됩니다. 폴더 없이 `meditations/` 바로 아래 있는 옛 파일은 기본 묵상집으로 들어가며, 빌드할 때 옮기라는 안내가 뜹니다.

## 가져오기 방식

### 이메일

```json
"importer": {
  "kind": "email",
  "search": "(SUBJECT \"Tozer\")",
  "mailbox": "INBOX",
  "translate": true
}
```

`search` 는 IMAP 검색식입니다. 매일 실행에서는 여기에 `SINCE` 가 자동으로 붙어 최근 것만 훑습니다.

메일은 **읽음 표시를 남기지 않고** 가져옵니다(`readonly` + `BODY.PEEK`). 중간에 실패해도 메일이 사라지지 않고, 다음 실행에서 다시 시도합니다. 중복은 읽음 여부가 아니라 **파일이 이미 있는지**로 판단하므로 몇 번을 돌려도 안전합니다.

날짜는 메일의 Date 헤더를 뉴욕 시간으로 바꿔 씁니다. 저녁에 온 메일이 다음 날로 밀리지 않습니다.

### 웹

```json
"importer": {
  "kind": "web",
  "url_template": "https://example.com/devotions/{date}",
  "content_regex": "(?is)<article[^>]*>(.*?)</article>",
  "translate": true
}
```

`url_template` 의 `{date}` 자리에 `2026-09-10` 이 들어갑니다. `%Y/%m/%d` 같은 strftime 형식도 됩니다. `content_regex` 로 본문 영역을 좁혀 주면 메뉴나 바닥글이 덜 섞입니다. 사이트마다 구조가 달라서 이 부분은 실제 사이트를 보고 한 번 맞춰야 합니다.

### 직접 입력

`importer` 를 빼면 됩니다. 관리자 화면(`/admin`)에서 묵상집을 고르고 쓰면 그 폴더에 커밋됩니다.

## 실행

### 매일 아침 (기본)

`.github/workflows/import-daily.yml` 이 매일 11:00 UTC(뉴욕 오전 7시)에 돕니다. 최근 3일 안에서 아직 없는 것만, 묵상집당 최대 2편을 가져옵니다. Actions 탭에서 손으로 돌릴 수도 있습니다.

### 처음 한 번, 밀린 것 따라잡기

`.github/workflows/import-backfill.yml` 을 Actions 탭에서 **Run workflow** 로 실행합니다.

| 입력 | 기본값 | 설명 |
|---|---|---|
| `collection` | `tozer` | 비우면 전체 |
| `max` | `8` | 묵상집당 최대 편수 |
| `since_days` | (비움) | 비우면 전체 기간 |
| `budget` | `18` | Gemini 호출 한도 |

**Gemini 무료 등급은 하루 20회가 한도입니다.** 글 한 편에 한 번 호출하므로 한 번 실행에 18편까지가 안전선입니다. 밀린 것이 그보다 많으면 다음 날 다시 누르시면 됩니다 — 이미 있는 날짜는 건너뛰므로 이어서 받아집니다. 한도에 걸려 멈춰도 그때까지 저장한 것은 커밋되고, 워크플로는 실패로 뜨지 않습니다.

한 번에 끝내고 싶으시면 Google AI Studio에서 API 키에 결제 수단을 연결해 유료 등급으로 올리시면 됩니다. 그 뒤 `budget` 을 크게 넣고 한 번만 돌리면 됩니다.

## 저장소 시크릿

Settings → Secrets and variables → Actions 에 세 개가 필요합니다.

| 이름 | 값 |
|---|---|
| `EMAIL_USER` | Gmail 주소 |
| `EMAIL_PASS` | Gmail **앱 비밀번호** 16자리 (일반 비밀번호 아님, 2단계 인증 필요) |
| `GEMINI_API_KEY` | Google AI Studio 키 |

## 출력 형식

가져오기 스크립트와 관리자 화면 모두 frontmatter 형식으로 저장합니다.

```markdown
---
date: 2026-09-10
lang: ko
title: 웅변가가 아닌 선지자
series: 토저의 기독교 리더십
scripture_ref: 이사야 51:16
scripture_text: |
  내가 내 말을 네 입에 두고 내 손 그늘로 너를 덮었나니
status: published
---

**기독교 사역자는 그리스 웅변가의 후예가 아니라 히브리 선지자의 후예입니다.**

> "주님, 이번 한 주간 저의 선지자적인 시각이 이와 같게 하옵소서. 아멘."
```

`status: draft` 로 두면 사이트에 보이지 않습니다. 미리 받아두고 나중에 공개할 때 씁니다.

제목·구절 줄이 없는 자유 형식 마크다운도 빌드 스크립트가 읽습니다. `##` 줄에서 시리즈명과 원문 날짜를 나누고, `###` 줄을 제목으로, 그 뒤 첫 인용문을 성경 본문으로 잡습니다. 다만 결과가 매번 일정하지는 않으니 frontmatter 쪽을 권합니다.

## 손으로 돌려보기

```bash
pip install google-genai
export EMAIL_USER=... EMAIL_PASS=... GEMINI_API_KEY=...

python importer.py                         # 매일 실행과 같은 동작
python importer.py --collection tozer      # 한 묵상집만
python importer.py --backfill --max 8      # 밀린 것 따라잡기
python importer.py --backfill --since-days 30 --max 20
```

가져온 뒤 `npm run build` 를 돌리면 `meditations/` 를 읽어 사이트 데이터를 다시 만듭니다.
