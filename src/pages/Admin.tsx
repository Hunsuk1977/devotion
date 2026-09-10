import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { DevotionalView } from "../components/DevotionalView";
import { db } from "../lib/data";
import { isISODate, todayISO } from "../lib/date";
import { LANGUAGES, labelOf, t } from "../i18n";
import { usePrefs } from "../lib/prefs";
import type { Devotional, DevotionalMap } from "../types";

const blank = (date: string, lang: string): Devotional => ({
  date,
  lang,
  title: "",
  series: "",
  scriptureRef: "",
  scriptureText: "",
  bodyMd: "",
  status: "published",
});

/* ---------------- 로그인 (Supabase 모드) ---------------- */
function SignIn({ onDone, ui }: { onDone: () => void; ui: string }) {
  const isToken = db.authKind === "token";
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await db.signIn(email, pw);
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="auth" onSubmit={submit}>
      <h1>{t(ui, "signIn")}</h1>
      <p>{t(ui, isToken ? "signInHintToken" : "signInHint")}</p>
      {!isToken && (
        <div className="field">
          <label htmlFor="email">{t(ui, "email")}</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">{t(ui, isToken ? "token" : "password")}</label>
        <input id="password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {isToken && <span className="hint">{t(ui, "tokenHint")}</span>}
      </div>
      {err && <p className="status-msg err">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {t(ui, "signIn")}
      </button>
    </form>
  );
}

/* ---------------- 편집기 ---------------- */
export function Admin() {
  const { lang: ui } = usePrefs();
  const [sp, setSp] = useSearchParams();
  const [user, setUser] = useState<string | null | undefined>(undefined);

  const initDate = isISODate(sp.get("date") ?? undefined) ? sp.get("date")! : todayISO();
  const initLang = LANGUAGES.some((l) => l.code === sp.get("lang")) ? sp.get("lang")! : ui;

  const [form, setForm] = useState<Devotional>(() => blank(initDate, initLang));
  const [exists, setExists] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [recent, setRecent] = useState<Devotional[]>([]);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [otherLangs, setOtherLangs] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    db.currentUser().then(setUser);
  }, []);

  const refreshRecent = useCallback(() => db.list(60).then(setRecent), []);
  useEffect(() => {
    if (user) refreshRecent();
  }, [user, refreshRecent]);

  // 날짜/언어가 바뀌면 기존 항목 로드
  const load = useCallback(
    async (date: string, lang: string) => {
      const [d, langs] = await Promise.all([db.get({ date, lang }), db.langsFor(date, true)]);
      setForm(d ?? blank(date, lang));
      setExists(!!d);
      setOtherLangs(langs.filter((l) => l !== lang));
      setMsg(null);
      setSp({ date, lang }, { replace: true });
    },
    [setSp],
  );
  useEffect(() => {
    if (user) load(initDate, initLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const set = <K extends keyof Devotional>(k: K, v: Devotional[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.bodyMd.trim()) {
      setMsg({ text: t(ui, "required"), err: true });
      return;
    }
    try {
      const saved = await db.upsert(form);
      setForm(saved);
      setExists(true);
      setMsg({ text: t(ui, "saved") });
      refreshRecent();
    } catch (ex) {
      setMsg({ text: (ex as Error).message, err: true });
    }
  };

  const remove = async () => {
    if (!confirm(t(ui, "deleteConfirm"))) return;
    await db.remove({ date: form.date, lang: form.lang });
    await load(form.date, form.lang);
    refreshRecent();
  };

  const copyFrom = async (lang: string) => {
    const src = await db.get({ date: form.date, lang });
    if (!src) return;
    setForm((f) => ({
      ...f,
      title: src.title,
      series: src.series,
      scriptureRef: src.scriptureRef,
      scriptureText: src.scriptureText,
      bodyMd: src.bodyMd,
    }));
  };

  const exportJson = async () => {
    const map = await db.exportAll();
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `devotionals-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const map = JSON.parse(await file.text()) as DevotionalMap;
      const n = await db.importAll(map);
      setMsg({ text: `${n}${t(ui, "imported")}` });
      refreshRecent();
      load(form.date, form.lang);
    } catch (ex) {
      setMsg({ text: (ex as Error).message, err: true });
    }
  };

  if (user === undefined) return <div className="app"><Header mode="admin" /></div>;
  if (!user)
    return (
      <div className="app">
        <Header mode="admin" />
        <SignIn ui={ui} onDone={() => db.currentUser().then(setUser)} />
      </div>
    );

  return (
    <div className="app">
      <Header mode="admin" />
      <main className="admin">
        <div className="admin-head">
          <h1>{t(ui, "adminTitle")}</h1>
          <div className="admin-actions">
            <button type="button" className="btn" onClick={() => load(todayISO(), form.lang)}>
              {t(ui, "newEntry")}
            </button>
            <button type="button" className="btn" onClick={exportJson}>
              {t(ui, "exportJson")}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {t(ui, "importJson")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
            {db.authKind !== "none" && (
              <button type="button" className="btn" onClick={() => db.signOut().then(() => setUser(null))}>
                {t(ui, "signOut")}
              </button>
            )}
          </div>
        </div>

        {db.mode === "local" && <p className="banner">{t(ui, "localMode")}</p>}
        {db.mode === "github" && <p className="banner">{t(ui, "githubMode")}</p>}

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={pane === "edit"} onClick={() => setPane("edit")}>
            {t(ui, "edit")}
          </button>
          <button type="button" role="tab" aria-selected={pane === "preview"} onClick={() => setPane("preview")}>
            {t(ui, "preview")}
          </button>
        </div>

        <div className="grid" data-pane={pane}>
          <form className="form pane" onSubmit={save}>
            <div className="row">
              <div className="field">
                <label htmlFor="f-date">{t(ui, "fieldDate")}</label>
                <input id="f-date" type="date" value={form.date} onChange={(e) => e.target.value && load(e.target.value, form.lang)} />
              </div>
              <div className="field">
                <label htmlFor="f-lang">{t(ui, "fieldLang")}</label>
                <select id="f-lang" value={form.lang} onChange={(e) => load(form.date, e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-status">{t(ui, "fieldStatus")}</label>
                <select id="f-status" value={form.status} onChange={(e) => set("status", e.target.value as Devotional["status"])}>
                  <option value="published">{t(ui, "statusPublished")}</option>
                  <option value="draft">{t(ui, "statusDraft")}</option>
                </select>
              </div>
            </div>

            {otherLangs.length > 0 && !exists && (
              <div className="admin-actions">
                <span className="hint" style={{ fontSize: "0.8125rem", color: "var(--ink-3)" }}>
                  {t(ui, "copyFrom")}:
                </span>
                {otherLangs.map((l) => (
                  <button key={l} type="button" className="chip" onClick={() => copyFrom(l)}>
                    {labelOf(l)}
                  </button>
                ))}
              </div>
            )}

            <div className="field">
              <label htmlFor="f-title">{t(ui, "fieldTitle")}</label>
              <input id="f-title" className="title" value={form.title} onChange={(e) => set("title", e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="f-series">{t(ui, "fieldSeries")}</label>
              <input
                id="f-series"
                value={form.series ?? ""}
                placeholder={t(ui, "fieldSeriesHint")}
                onChange={(e) => set("series", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-ref">{t(ui, "fieldRef")}</label>
              <input id="f-ref" value={form.scriptureRef} placeholder={t(ui, "fieldRefHint")} onChange={(e) => set("scriptureRef", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-scripture">{t(ui, "fieldScripture")}</label>
              <textarea id="f-scripture" value={form.scriptureText} onChange={(e) => set("scriptureText", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-body">{t(ui, "fieldBody")}</label>
              <textarea id="f-body" className="body" value={form.bodyMd} onChange={(e) => set("bodyMd", e.target.value)} required />
              <span className="hint">{t(ui, "fieldBodyHint")}</span>
            </div>

            <div className="form-foot">
              <button type="submit" className="btn primary" id="save-btn">
                {t(ui, "save")}
              </button>
              {exists && (
                <>
                  <Link to={`/${form.lang}/${form.date}`} className="btn">
                    {t(ui, "openReader")}
                  </Link>
                  <button type="button" className="btn danger" onClick={remove}>
                    {t(ui, "delete")}
                  </button>
                </>
              )}
              {msg && <span className={`status-msg${msg.err ? " err" : ""}`}>{msg.text}</span>}
            </div>
          </form>

          <aside className="preview pane" aria-label={t(ui, "preview")}>
            <p className="preview-cap">{t(ui, "preview")}</p>
            <DevotionalView d={form} />
          </aside>
        </div>

        <section className="recent">
          <h2>{t(ui, "recent")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t(ui, "fieldDate")}</th>
                  <th>{t(ui, "fieldLang")}</th>
                  <th>{t(ui, "fieldTitle")}</th>
                  <th>{t(ui, "fieldRef")}</th>
                  <th>{t(ui, "fieldStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.date}/${r.lang}`} onClick={() => load(r.date, r.lang)}>
                    <td className="date">{r.date}</td>
                    <td>{labelOf(r.lang)}</td>
                    <td>{r.title}</td>
                    <td>{r.scriptureRef}</td>
                    <td>
                      <span className={`tag${r.status === "published" ? " pub" : ""}`}>
                        {t(ui, r.status === "published" ? "statusPublished" : "statusDraft")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
