import { useNavigate } from "react-router-dom";
import type { Collection } from "../types";
import { collectionName } from "../lib/content";
import { t } from "../i18n";

/**
 * 묵상집 전환. 4개까지는 탭으로, 그보다 많으면 드롭다운으로 바뀝니다.
 * `available` 에 든 묵상집은 지금 날짜에 글이 있다는 표시(점)를 답니다.
 */
export function CollectionTabs({
  collections,
  current,
  lang,
  date,
  available,
}: {
  collections: Collection[];
  current: string;
  lang: string;
  date: string;
  available: string[];
}) {
  const nav = useNavigate();
  if (collections.length < 2) return null;

  const go = (slug: string) => nav(`/${slug}/${lang}/${date}`);
  const has = (slug: string) => available.includes(slug);

  if (collections.length > 4) {
    return (
      <div className="colbar">
        <label className="colbar-select">
          <span className="visually-hidden">{t(lang, "collection")}</span>
          <select value={current} onChange={(e) => go(e.target.value)}>
            {collections.map((c) => (
              <option key={c.slug} value={c.slug}>
                {collectionName(c, lang)}
                {has(c.slug) ? " ·" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div className="colbar">
      <nav className="coltabs" aria-label={t(lang, "collection")}>
        {collections.map((c) => (
          <button
            key={c.slug}
            type="button"
            className="coltab"
            aria-current={c.slug === current ? "page" : undefined}
            onClick={() => go(c.slug)}
          >
            {collectionName(c, lang)}
            {has(c.slug) && c.slug !== current ? <span className="coldot" aria-hidden="true" /> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
