"""
묵상집별로 글을 모아 meditations/<묵상집>/ 에 마크다운으로 저장합니다.

  python importer.py                     # 자동 묵상집 전부, 최근 것만 (매일 아침용)
  python importer.py --collection tozer  # 한 묵상집만
  python importer.py --backfill --max 8  # 밀린 것 따라잡기 (수동 실행용)

가져올 곳은 collections.json 의 importer 항목이 정합니다.

  "importer": { "kind": "email", "search": "(SUBJECT \\"Tozer\\")", "translate": true }
  "importer": { "kind": "web", "url_template": "https://.../{date}", "translate": true }

Gemini 무료 등급은 하루 20회가 한도입니다. 그래서
 - 글 한 편을 '한 번의 호출'로 한국어+영어 두 벌을 받고,
 - 실행 전체에서 BUDGET 회를 넘지 않으며,
 - 이미 파일이 있는 날짜는 건너뜁니다.
"""

from __future__ import annotations

import argparse
import imaplib
import email
import email.utils          # import email 만으로는 utils 를 쓸 수 없습니다
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from email.header import decode_header, make_header
from pathlib import Path
from zoneinfo import ZoneInfo

from google import genai    # pip install google-genai

ROOT = Path(__file__).resolve().parent
CONTENT_DIR = ROOT / os.environ.get("CONTENT_DIR", "meditations")
CONFIG = ROOT / "collections.json"

DEFAULT_LANG = os.environ.get("DEFAULT_LANG", "ko")
TZ = ZoneInfo(os.environ.get("TIMEZONE", "America/New_York"))
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

# 무료 등급 하루 20회. 재시도 여유를 두고 조금 낮게 잡습니다.
BUDGET = int(os.environ.get("GEMINI_BUDGET", "18"))

SPLIT = "===LANG:EN==="

PROMPT = f"""당신은 묵상 콘텐츠 편집자입니다.
아래 글에서 묵상 본문만 골라내어 웹사이트용 마크다운 두 벌을 만들어 주세요.

먼저 한국어본, 그 다음 줄에 {SPLIT} 한 줄, 그 다음 영어본을 출력합니다.
영어본은 번역하지 말고 원문의 표현을 그대로 살려 정리만 하세요.
원문이 한국어라면 영어본은 자연스러운 영어로 번역하세요.

두 벌 모두 아래 구조를 정확히 따르세요. 설명, 인사말,
"다음은 …입니다" 같은 안내 문장, 코드펜스(```)는 절대 넣지 마세요.

---
date: {{date}}
lang: ko
title: (묵상 제목 한 줄, 기호 없이)
series: (원문의 시리즈명. 없으면 이 줄을 빼세요)
scripture_ref: (예: 이사야 51:16)
scripture_text: |
  (성경 본문. 각 줄 앞에 공백 두 칸)
status: published
---

(묵상 본문. 원문의 단락 구분을 유지하고, 강조는 **굵게**,
기도문은 > 인용으로. 책 제목·쪽수 등 출처는 본문 끝에 그대로 남기세요.)

{SPLIT}
---
date: {{date}}
lang: en
title: (English title)
series: (English series name; omit this line if none)
scripture_ref: (e.g. Isaiah 51:16)
scripture_text: |
  (English scripture text, two spaces of indent per line)
status: published
---

(English devotional body, same structure)

광고, 상품 추천, 웹에서 보기 링크, 구독 안내, 수신자 안내, 발송자 주소,
사이트 메뉴·바닥글 등 묵상과 무관한 부분은 모두 버리세요.

[제목]: {{subject}}
[본문]:
{{body}}
"""

ONE_LANG_PROMPT = f"""아래 글에서 묵상 본문만 골라 웹사이트용 마크다운으로 정리해 주세요.
번역하지 말고 원문 언어를 그대로 두세요. 설명이나 코드펜스(```)는 넣지 마세요.

---
date: {{date}}
lang: {{lang}}
title: (제목 한 줄)
series: (시리즈명. 없으면 이 줄을 빼세요)
scripture_ref: (성경 구절 위치)
scripture_text: |
  (성경 본문, 각 줄 앞에 공백 두 칸)
status: published
---

(본문)

광고·메뉴·구독 안내 등 묵상과 무관한 부분은 버리세요.

[제목]: {{subject}}
[본문]:
{{body}}
"""


class Budget:
    """이번 실행에서 Gemini 를 몇 번 불렀는지 세어 한도를 지킵니다."""

    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0

    def take(self) -> bool:
        if self.used >= self.limit:
            return False
        self.used += 1
        return True


client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def ask(prompt: str) -> str:
    """429(할당량)는 몇 번만 기다렸다 재시도하고, 그래도 안 되면 QUOTA 로 알립니다."""
    delay = 20
    for attempt in range(3):
        try:
            resp = client.models.generate_content(model=MODEL, contents=prompt)
            return resp.text or ""
        except Exception as exc:
            text = str(exc)
            if "RESOURCE_EXHAUSTED" in text or "429" in text:
                if attempt == 2:
                    raise RuntimeError("QUOTA") from exc
                print(f"    · 할당량 대기 {delay}초 후 재시도")
                time.sleep(delay)
                delay *= 2
                continue
            raise
    return ""


def clean(md: str) -> str:
    md = md.strip()
    md = re.sub(r"^```(?:markdown|md)?\s*\n", "", md)
    md = re.sub(r"\n```\s*$", "", md)
    return md.strip() + "\n"


def paths_for(slug: str, date_str: str) -> tuple[Path, Path]:
    d = CONTENT_DIR / slug
    return d / f"{date_str}.md", d / f"{date_str}.en.md"


def save(slug: str, date_str: str, out: str, translate: bool) -> list[Path]:
    ko_path, en_path = paths_for(slug, date_str)
    ko_path.parent.mkdir(parents=True, exist_ok=True)
    written = []
    if translate and SPLIT in out:
        ko, en = out.split(SPLIT, 1)
    else:
        ko, en = out, ""
    ko_path.write_text(clean(ko), encoding="utf-8")
    written.append(ko_path)
    if en.strip():
        en_path.write_text(clean(en), encoding="utf-8")
        written.append(en_path)
    return written


def process(slug: str, date_str: str, subject: str, body: str, translate: bool, budget: Budget) -> list[Path]:
    if not budget.take():
        raise RuntimeError("BUDGET")
    template = PROMPT if translate else ONE_LANG_PROMPT
    prompt = template.format(date=date_str, subject=subject, body=body[:60000], lang=DEFAULT_LANG)
    return save(slug, date_str, ask(prompt), translate)


# ------------------------------------------------------------------ #
# 이메일에서 가져오기                                                   #
# ------------------------------------------------------------------ #

def hdr(raw) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return str(raw)


def strip_html(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h[1-6]>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&#39;", "'"), ("&quot;", '"')]:
        text = text.replace(a, b)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def mail_body(msg) -> str:
    plain, html = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if str(part.get("Content-Disposition", "")).startswith("attachment"):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            text = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
            if part.get_content_type() == "text/plain" and not plain:
                plain = text
            elif part.get_content_type() == "text/html" and not html:
                html = text
    else:
        payload = msg.get_payload(decode=True) or b""
        text = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
        if msg.get_content_type() == "text/html":
            html = text
        else:
            plain = text
    return plain if plain.strip() else strip_html(html)


def mail_date(msg) -> str:
    raw = msg.get("Date")
    parsed = email.utils.parsedate_to_datetime(raw) if raw else None
    if parsed is None:
        return datetime.now(TZ).strftime("%Y-%m-%d")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
    return parsed.astimezone(TZ).strftime("%Y-%m-%d")


def from_email(slug: str, cfg: dict, translate: bool, max_items: int, since_days: int | None, budget: Budget) -> int:
    server = os.environ.get("IMAP_SERVER", "imap.gmail.com")
    search = cfg.get("search") or "ALL"
    if since_days is not None:
        since = (datetime.now(TZ) - timedelta(days=since_days)).strftime("%d-%b-%Y")
        search = f'({search.strip("()")} SINCE {since})' if search != "ALL" else f"(SINCE {since})"

    mail = imaplib.IMAP4_SSL(server)
    mail.login(os.environ["EMAIL_USER"], os.environ["EMAIL_PASS"])
    # readonly: 읽음 표시를 남기지 않습니다. 실패해도 메일이 사라지지 않습니다.
    mail.select(cfg.get("mailbox", "INBOX"), readonly=True)

    status, data = mail.search(None, search)
    if status != "OK":
        print(f"  IMAP 검색 실패: {status}")
        mail.logout()
        return 0

    ids = data[0].split()
    print(f"  검색 {search} → {len(ids)}통")
    written = 0

    for e_id in reversed(ids):              # 최신 메일부터
        if written >= max_items:
            print(f"  이번 실행 한도({max_items}편)에 도달했습니다.")
            break

        res, msg_data = mail.fetch(e_id, "(BODY.PEEK[])")
        if res != "OK":
            continue
        raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
        if not raw:
            continue

        msg = email.message_from_bytes(raw)
        date_str = mail_date(msg)
        ko_path, en_path = paths_for(slug, date_str)
        if ko_path.exists() and (en_path.exists() or not translate):
            continue

        subject = hdr(msg.get("Subject"))
        body = mail_body(msg)
        if not body.strip():
            print(f"  [{date_str}] 본문 없음 — 건너뜁니다: {subject}")
            continue

        print(f"  [{date_str}] {subject}")
        files = process(slug, date_str, subject, body, translate, budget)
        written += 1
        print("    · 저장: " + ", ".join(str(p.relative_to(ROOT)) for p in files))

    mail.logout()
    return written


# ------------------------------------------------------------------ #
# 웹에서 가져오기                                                       #
# ------------------------------------------------------------------ #

def from_web(slug: str, cfg: dict, translate: bool, max_items: int, since_days: int | None, budget: Budget) -> int:
    """
    url_template 에 날짜를 넣어 하루치씩 가져옵니다.
    예: "https://example.com/devotions/{date}"  ({date} 는 YYYY-MM-DD)
    strftime 형식도 쓸 수 있습니다: "https://example.com/%Y/%m/%d/"
    """
    import urllib.request

    template = cfg.get("url_template")
    if not template:
        print(f"  '{slug}': importer.url_template 이 없어 건너뜁니다.")
        return 0

    days = since_days if since_days is not None else 1
    today = datetime.now(TZ).date()
    written = 0

    for back in range(days):
        if written >= max_items:
            print(f"  이번 실행 한도({max_items}편)에 도달했습니다.")
            break

        day = today - timedelta(days=back)
        date_str = day.strftime("%Y-%m-%d")
        ko_path, en_path = paths_for(slug, date_str)
        if ko_path.exists() and (en_path.exists() or not translate):
            continue

        url = day.strftime(template.replace("{date}", date_str))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "devotion-importer/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                charset = r.headers.get_content_charset() or "utf-8"
                html = r.read().decode(charset, errors="ignore")
        except Exception as exc:
            print(f"  [{date_str}] 가져오기 실패 ({url}): {exc}")
            continue

        # 본문으로 보이는 영역이 지정돼 있으면 그 부분만
        sel = cfg.get("content_regex")
        if sel:
            m = re.search(sel, html, re.S | re.I)
            if m:
                html = m.group(1) if m.groups() else m.group(0)

        body = strip_html(html)
        if len(body) < 200:
            print(f"  [{date_str}] 본문이 너무 짧아 건너뜁니다 ({len(body)}자)")
            continue

        title = ""
        tm = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
        if tm:
            title = strip_html(tm.group(1))

        print(f"  [{date_str}] {url}")
        files = process(slug, date_str, title or date_str, body, translate, budget)
        written += 1
        print("    · 저장: " + ", ".join(str(p.relative_to(ROOT)) for p in files))

    return written


# ------------------------------------------------------------------ #

SOURCES = {"email": from_email, "web": from_web}


def main() -> int:
    ap = argparse.ArgumentParser(description="묵상집별로 글을 가져옵니다.")
    ap.add_argument("--collection", help="특정 묵상집만 (기본: importer 가 있는 모든 묵상집)")
    ap.add_argument("--max", type=int, default=None, help="묵상집당 최대 편수")
    ap.add_argument("--since-days", type=int, default=None, help="며칠 전까지 훑을지")
    ap.add_argument("--backfill", action="store_true", help="밀린 것 따라잡기 모드")
    args = ap.parse_args()

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    collections = config.get("collections", [])

    if args.backfill:
        max_items = args.max if args.max is not None else 8
        since_days = args.since_days                     # None = 전체
    else:
        max_items = args.max if args.max is not None else 2
        since_days = args.since_days if args.since_days is not None else 3

    budget = Budget(BUDGET)
    total = 0
    stopped = False

    for c in collections:
        slug = c.get("slug")
        cfg = c.get("importer")
        if not slug or not cfg:
            continue
        if args.collection and slug != args.collection:
            continue
        kind = cfg.get("kind")
        fn = SOURCES.get(kind)
        if not fn:
            print(f"'{slug}': 알 수 없는 가져오기 방식 '{kind}' — 건너뜁니다.")
            continue

        print(f"\n▸ {slug} ({kind})")
        try:
            total += fn(slug, cfg, bool(cfg.get("translate", True)), max_items, since_days, budget)
        except RuntimeError as exc:
            if str(exc) == "QUOTA":
                print("  · Gemini 하루 할당량을 다 썼습니다. 여기서 멈춥니다.")
            elif str(exc) == "BUDGET":
                print(f"  · 이번 실행의 호출 한도({BUDGET}회)에 도달했습니다.")
            else:
                raise
            stopped = True
            break
        except Exception as exc:
            print(f"  · '{slug}' 처리 중 오류: {exc}")

    print(f"\n완료 — {total}편 저장, Gemini 호출 {budget.used}회")
    if stopped and total == 0:
        print("이번 실행에서는 아무것도 저장하지 못했습니다. 내일 다시 시도하거나 백필을 나눠 돌리세요.")
    # 할당량으로 멈춘 것은 실패가 아닙니다 — 저장한 것은 커밋되어야 합니다.
    return 0


if __name__ == "__main__":
    sys.exit(main())
