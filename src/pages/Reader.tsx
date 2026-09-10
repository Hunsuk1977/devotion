import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { DevotionalView } from "../components/DevotionalView";
import { db } from "../lib/data";
import { addDays, formatShort, isISODate, todayISO } from "../lib/date";
import { LANGUAGES, labelOf, t } from "../i18n";
import { usePrefs } from "../lib/prefs";
import type { Devotional } from "../types";

function Chevron({ dir }: { dir: "l" | "r" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {dir === "l" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

export function Reader() {
  const { lang: urlLang, date: urlDate } = useParams();
  const { lang: prefLang, setLang } = usePrefs();
  const nav = useNavigate();

  const validLang = !!urlLang && LANGUAGES.some((l) => l.code === urlLang);
  const validDate = isISODate(urlDate);

  // URL의 언어를 선호 언어로 동기화
  useEffect(() => {
    if (validLang && urlLang !== prefLang) setLang(urlLang!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLang]);

  const lang = validLang ? urlLang! : prefLang;
  const date = validDate ? urlDate! : todayISO();

  const [state, setState] = useState<{
    key: string;
    d: Devotional | null;
    others: string[];
    prev: string | null;
    next: string | null;
    loading: boolean;
  }>({ key: "", d: null, others: [], prev: null, next: null, loading: true });

  useEffect(() => {
    if (!validLang || !validDate) return;
    let alive = true;
    const key = `${lang}/${date}`;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [d, langs, prev, next] = await Promise.all([
        db.get({ date, lang }),
        db.langsFor(date),
        db.neighbor({ date, lang }, -1),
        db.neighbor({ date, lang }, 1),
      ]);
      if (!alive) return;
      setState({
        key,
        d: d && d.status === "published" ? d : null,
        others: langs.filter((l) => l !== lang),
        prev,
        next,
        loading: false,
      });
    })().catch(() => alive && setState((s) => ({ ...s, loading: false })));
    return () => {
      alive = false;
    };
  }, [lang, date, validLang, validDate]);

  if (!validLang || !validDate) return <Navigate to={`/${lang}/${date}`} replace />;

  const go = (d: string) => nav(`/${lang}/${d}`);
  const isToday = date === todayISO();

  return (
    <div className="app">
      <Header mode="reader" />
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

        {state.loading && state.key !== `${lang}/${date}` ? (
          <div className="empty" aria-busy="true">
            …
          </div>
        ) : state.d ? (
          <DevotionalView d={state.d} />
        ) : (
          <div className="empty">
            <p>{t(lang, "empty")}</p>
            {state.others.length > 0 && (
              <>
                <p style={{ fontSize: "0.875rem", color: "var(--ink-3)", fontFamily: "var(--sans)" }}>
                  {t(lang, "emptyOtherLangs")}
                </p>
                <div className="empty-langs">
                  {state.others.map((l) => (
                    <Link key={l} to={`/${l}/${date}`} className="chip">
                      {labelOf(l)}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <nav className="footnav" aria-label="prev / next">
          {state.prev ? (
            <Link to={`/${lang}/${state.prev}`}>
              ← {t(lang, "prev")} · {formatShort(state.prev, lang)}
            </Link>
          ) : (
            <span className="muted" />
          )}
          {state.next ? (
            <Link to={`/${lang}/${state.next}`}>
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
