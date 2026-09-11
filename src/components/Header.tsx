import { Link, useLocation, useNavigate } from "react-router-dom";
import { LANGUAGES, t } from "../i18n";
import { usePrefs, type Theme } from "../lib/prefs";

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Header({ mode }: { mode: "reader" | "admin" }) {
  const { lang, setLang, theme, setTheme } = usePrefs();
  const nav = useNavigate();
  const loc = useLocation();

  const themeLabel = t(lang, theme === "system" ? "themeSystem" : theme === "light" ? "themeLight" : "themeDark");

  const switchLang = (code: string) => {
    setLang(code);
    if (mode === "reader") {
      // /tozer/ko/2026-09-10 → /tozer/en/2026-09-10
      const parts = loc.pathname.split("/");
      if (parts.length >= 4) {
        parts[2] = code;
        nav(parts.join("/"), { replace: true });
      }
    }
  };

  return (
    <header className="hdr">
      <div className="hdr-in">
        <Link to="/" className="brand">
          {t(lang, "appName")}
        </Link>
        <div className="hdr-tools">
          <div className="seg" role="group" aria-label={t(lang, "language")}>
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" aria-pressed={l.code === lang} onClick={() => switchLang(l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            id="theme-toggle"
            title={`${t(lang, "theme")}: ${themeLabel}`}
            aria-label={`${t(lang, "theme")}: ${themeLabel}`}
            onClick={() => setTheme(NEXT_THEME[theme])}
          >
            <ThemeIcon theme={theme} />
          </button>
          {mode === "reader" ? (
            <Link to="/admin" className="link-btn">
              {t(lang, "admin")}
            </Link>
          ) : (
            <Link to="/" className="link-btn">
              {t(lang, "reader")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
