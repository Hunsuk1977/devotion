import os
import imaplib
import email
from email.header import decode_header
from datetime import datetime
import google.generativeai as genai

# 환경변수 설정
EMAIL_USER = os.environ.get("EMAIL_USER")
EMAIL_PASS = os.environ.get("EMAIL_PASS")
IMAP_SERVER = os.environ.get("IMAP_SERVER", "imap.gmail.com")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Gemini API 키 설정
genai.configure(api_key=GEMINI_API_KEY)

def decode_mime_words(s):
    if not s:
        return ""
    decoded_fragments = decode_header(s)
    text = ""
    for fragment, encoding in decoded_fragments:
        if isinstance(fragment, bytes):
            text += fragment.decode(encoding or "utf-8", errors="ignore")
        else:
            text += fragment
    return text

def process_with_gemini(subject, body, prompt_template):
    model = genai.GenerativeModel("gemini-3.6-flash")  # 모델명 변경
    prompt = prompt_template.format(subject=subject, body=body)
    response = model.generate_content(prompt)
    return response.text
    
# 프롬프트 정의
PROMPT_KO = """당신은 묵상 콘텐츠 전담 번역가이자 편집자입니다.
다음 이메일의 핵심 묵상 본문을 자연스럽고 명확한 한국어 마크다운 문서로 번역해 주세요.

지침:
1. 출력은 한국어 번역본만 반환하세요. 영어 원문은 포함하지 마세요.
2. 제목, 문단 순서, 성경 구절, 기도문, 본문에 포함된 출처 정보를 빠뜨리지 마세요.
3. 성경 구절이나 핵심 문장은 인용구(>) 또는 강조(**) 형식으로 표시하세요.
4. 이메일 상단과 하단의 광고, 상품 추천, 웹보기 링크, 구독 안내, 수신자 안내 등 묵상 본문과 무관한 내용은 제거하세요.
5. 출력은 마크다운 본문만 반환하고 설명이나 사과 문구는 추가하지 마세요.

[이메일 제목]: {subject}
[이메일 본문]: {body}"""

PROMPT_EN = """당신은 영어 묵상 콘텐츠를 정리하는 편집자입니다.
다음 이메일의 영어 원문을 번역하지 말고, 자연스럽고 읽기 쉬운 영어 Markdown 문서로 정리해 주세요.

지침:
1. 원문의 영어 표현과 의미를 그대로 유지하세요. 요약하거나 새로 쓰거나 번역하지 마세요.
2. 제목, 문단 순서, 성경 구절, 기도문, 본문에 포함된 출처 정보를 보존하세요.
3. 제목과 소제목은 Markdown 형식으로 정리하고, 성경 구절이나 핵심 문장은 인용구(>) 또는 강조(**) 형식으로 표시하세요.
4. 이메일 상단과 하단의 광고, 상품 추천, 웹보기 링크, 구독 안내, 수신자 안내 등 묵상 본문과 무관한 내용은 제거하세요.
5. 불필요한 HTML, 깨진 줄바꿈, 중복 공백은 정리하세요.
6. 출력은 정리된 영어 Markdown 본문만 반환하고 설명이나 사과 문구는 추가하지 마세요.

[이메일 제목]: {subject}
[영어 원문]: {body}"""

def main():
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL_USER, EMAIL_PASS)
    mail.select("INBOX")

    status, messages = mail.search(None, '(UNSEEN SUBJECT "Tozer")')
    email_ids = messages[0].split()

    if not email_ids:
        print("새로운 Tozer 이메일이 없습니다.")
        return

    os.makedirs("meditations", exist_ok=True)

    for e_id in email_ids:
        res, msg_data = mail.fetch(e_id, "(RFC822)")
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                subject = decode_mime_words(msg.get("Subject"))
                
                date_tuple = email.utils.parsedate_tz(msg.get("Date"))
                if date_tuple:
                    local_date = datetime.fromtimestamp(email.utils.mktime_tz(date_tuple))
                    date_str = local_date.strftime("%Y-%m-%d")
                else:
                    date_str = datetime.now().strftime("%Y-%m-%d")

                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                            break
                else:
                    body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")

                print(f"[{date_str}] 메일 처리 중: {subject}")

                ko_content = process_with_gemini(subject, body, PROMPT_KO)
                with open(f"meditations/{date_str}.md", "w", encoding="utf-8") as f:
                    f.write(ko_content)

                en_content = process_with_gemini(subject, body, PROMPT_EN)
                with open(f"meditations/{date_str}.en.md", "w", encoding="utf-8") as f:
                    f.write(en_content)

    mail.logout()

if __name__ == "__main__":
    main()
