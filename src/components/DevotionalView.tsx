import { useMemo } from "react";
import type { Devotional } from "../types";
import { formatLong } from "../lib/date";
import { renderMarkdown } from "../lib/markdown";
import { t } from "../i18n";

/** 뷰어와 관리자 미리보기가 공유하는 묵상 본문 렌더러 */
export function DevotionalView({ d }: { d: Devotional }) {
  const scriptureHtml = useMemo(() => renderMarkdown(d.scriptureText), [d.scriptureText]);
  const bodyHtml = useMemo(() => renderMarkdown(d.bodyMd), [d.bodyMd]);

  return (
    <article lang={d.lang}>
      <p className="dev-eyebrow">
        {d.series ? <span className="dev-series">{d.series}</span> : null}
        <span>{formatLong(d.date, d.lang)}</span>
      </p>
      <h1 className="dev-title">{d.title || " "}</h1>
      {(d.scriptureRef || d.scriptureText) && (
        <section className="scripture" aria-label={t(d.lang, "scripture")}>
          {d.scriptureRef && <p className="scripture-ref">{d.scriptureRef}</p>}
          {d.scriptureText && <div className="scripture-text" dangerouslySetInnerHTML={{ __html: scriptureHtml }} />}
        </section>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  );
}
