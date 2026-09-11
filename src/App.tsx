import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { PrefsProvider, usePrefs } from "./lib/prefs";
import { Reader } from "./pages/Reader";
import { Admin } from "./pages/Admin";
import { db } from "./lib/data";
import { isISODate, todayISO } from "./lib/date";
import { LANGUAGES } from "./i18n";

/** "/" → 마지막으로 보던 묵상집(없으면 기본)의 오늘 글 */
function Home() {
  const { lang, collection } = usePrefs();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cols = await db.collections();
      const fallback = await db.defaultCollection();
      const wanted = collection && cols.some((c) => c.slug === collection) ? collection : fallback;
      if (alive) setSlug(wanted || "");
    })();
    return () => {
      alive = false;
    };
  }, [collection]);

  if (slug === null) return null;
  if (!slug) return <div className="empty">묵상집이 아직 없습니다.</div>;
  return <Navigate to={`/${slug}/${lang}/${todayISO()}`} replace />;
}

/** 옛 주소 /ko/2026-09-10 → /tozer/ko/2026-09-10 */
function LegacyRedirect() {
  const { lang, date } = useParams();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    db.defaultCollection().then((s) => setSlug(s || ""));
  }, []);

  const looksLegacy = !!lang && LANGUAGES.some((l) => l.code === lang) && isISODate(date);
  if (!looksLegacy) return <Home />;
  if (slug === null) return null;
  return <Navigate to={`/${slug}/${lang}/${date}`} replace />;
}

// 단일 파일 데모(파일/아티팩트로 열 때)는 서버 리라이트가 없으므로 HashRouter 사용
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <PrefsProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/:collection/:lang/:date" element={<Reader />} />
          <Route path="/:lang/:date" element={<LegacyRedirect />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Router>
    </PrefsProvider>
  );
}
