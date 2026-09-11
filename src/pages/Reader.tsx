import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { DevotionalView } from "../components/DevotionalView";
import { CollectionTabs } from "../components/CollectionTabs";
import { db } from "../lib/data";
import { addDays, formatShort, isISODate, todayISO } from "../lib/date";
import { collectionName } from "../lib/content";
import { LANGUAGES, labelOf, t } from "../i18n";
import { usePrefs } from "../lib/prefs";
import type { Collection, Devotional } from "../types";

function Chevron({ dir }: { dir: "l" | "r" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {dir === "l" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

interface State {
  key: string;
  d: Devotional | null;
  otherLangs: string[];
  otherCollections: string[];
  prev: string | null;
  next: string | null;
  ready: boolean;
}

const EMPTY: State = {
  key: "",
  d: null,
  otherLangs: [],
  otherCollections: [],
  prev: null,
  next: null,
  ready: false,
};

export function Reader() {
  const { collection: urlCol, lang: urlLang, date: urlDate } = useParams();
  const { lang: prefLang, setLang, setCollection } = usePrefs();
  const nav = useNavigate();

  const [cols, setCols] = useState<Collection[] | null>(null);
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    db.collections().then(setCols);
  }, []);

  const validLang = !!urlLang && LANGUAGES.some((l) => l.code === urlLang);
  const validDate = isISODate(urlDate);
  const validCol = !!cols && !!urlCol && cols.some((c) => c.slug === urlCol);

  const lang = validLang ? urlLang! : prefLang;
  const date = validDate ? urlDate! : todayISO();

  // URL 의 언어·묵상집을 기억해 둡니다
  useEffect(() => {
    if (validLang && urlLang !== prefLang) setLang(urlLang!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLang]);
  useEffect(() => {
    if (validCol) setCollection(urlCol!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCol, validCol]);

  useEffect(() => {
    if (!validCol || !validLang || !validDate) return;
    let alive = true;
    const key = `${urlCol}/${lang}/${date}`;
    (async () => {
      const [d, langs, onDate, prev, next] = await Promise.all([
        db.get({ collection: urlCol!, date, lang }),
        db.langsFor(urlCol!, date),
        db.collectionsOn(date, lang),
        db.neighbor({ collection: urlCol!, date, lang }, -1),
        db.neighbor({ collection: urlCol!, date, lang }, 1),
      ]);
      if (!alive) return;
      setState({
        key,
        d: d && d.status === "published" ? d : null,
        otherLangs: langs.filter((l) => l !== lang),
        otherCollections: onDate,
        prev,
        next,
        ready: true,
      });
    })().catch(() => alive && setState((s) => ({ ...s, ready: true })));
    return () => {
      alive = false;
    };
  }, [urlCol, lang, date, validCol, validLang, validDate]);

  if (cols === null) return <div className="app" />;
  if (!cols.length) {
    return (
      <div className="app">
        <Header mode="reader" />
        <main className="reader">
          <div className="empty">{t(lang, "noCollections")}</div>
        </main>
      </div>
    );
  }
  if (!validCol || !validLang || !validDate) {
    const slug = validCol ? urlCol! : cols[0].slug;
    return <Navigate to={`/${slug}/${lang}/${date}`} replace />;
  }

  const go = (d: string) => nav(`/${urlCol}/${lang}/${d}`);
  const isToday = date === todayISO();
  const current = cols.find((c) => c.slug === urlCol);
  const elsewhere = state.otherCollections.filter((s) => s !== urlCol);

  return (
    <div className="app">
      <Header mode="reader" />
      <CollectionTabs
        collections={cols}
        current={urlCol!}
        lang={lang}
        date={date}
        available={state.otherCollections}
      />
      <main className="reader">
        <nav className="datenav" aria-label={t(lang, "pickDate")}>
          <button type="button" className="icon-btn" id="prev-day" aria-label={t(lang, "prev")} onClick={() => go(addDays(date, -1))}>
            <Chevron dir="l" />
          </button>
          <div className="datenav-mid">
            <label className="date-input" title={t(lang, "pickDate")}>
              <span className="date-label">{date}</span>
              <input
                type="date"
                id="date-picker"
                value={date}
                aria-label={t(lang, "pickDate")}
                onChange={(e) => e.target.value && go(e.target.value)}
              />
            </label>
            <button type="button" className="today-btn" id="today-btn" hidden={isToday} onClick={() => go(todayISO())}>
              {t(lang, "today")}
            </button>
          </div>
          <button type="button" className="icon-btn" id="next-day" aria-label={t(lang, "next")} onClick={() => go(addDays(date, 1))}>
            <Chevron dir="r" />
          </button>
        </nav>

        {!state.ready && state.key !== `${urlCol}/${lang}/${date}` ? (
          <div className="empty" aria-busy="true">
            …
          </div>
        ) : state.d ? (
          <DevotionalView
            d={state.d}
            hideSeries={(state.d.series ?? "").trim() === collectionName(current, lang).trim()}
          />
        ) : (
          <div className="empty">
            <p>{t(lang, "empty")}</p>
            {state.otherLangs.length > 0 && (
              <>
                <p className="empty-hint">{t(lang, "emptyOtherLangs")}</p>
                <div className="empty-langs">
                  {state.otherLangs.map((l) => (
                    <Link key={l} to={`/${urlCol}/${l}/${date}`} className="chip">
                      {labelOf(l)}
                    </Link>
                  ))}
                </div>
              </>
            )}
            {elsewhere.length > 0 && (
              <>
                <p className="empty-hint">{t(lang, "emptyOtherCollections")}</p>
                <div className="empty-langs">
                  {elsewhere.map((s) => (
                    <Link key={s} to={`/${s}/${lang}/${date}`} className="chip">
                      {collectionName(
                        cols.find((c) => c.slug === s),
                        lang,
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <nav className="footnav" aria-label={collectionName(current, lang)}>
          {state.prev ? (
            <Link to={`/${urlCol}/${lang}/${state.prev}`}>
              ← {t(lang, "prev")} · {formatShort(state.prev, lang)}
            </Link>
          ) : (
            <span className="muted" />
          )}
          {state.next ? (
            <Link to={`/${urlCol}/${lang}/${state.next}`}>
              {t(lang, "next")} · {formatShort(state.next, lang)} →
            </Link>
          ) : (
            <span className="muted" />
          )}
        </nav>
      </main>
    </div>
  );
}
