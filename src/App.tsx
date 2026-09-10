import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { PrefsProvider, usePrefs } from "./lib/prefs";
import { Reader } from "./pages/Reader";
import { Admin } from "./pages/Admin";
import { todayISO } from "./lib/date";

function Home() {
  const { lang } = usePrefs();
  return <Navigate to={`/${lang}/${todayISO()}`} replace />;
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
          <Route path="/:lang/:date" element={<Reader />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Router>
    </PrefsProvider>
  );
}
