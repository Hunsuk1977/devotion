import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, LANGUAGES } from "../i18n";

export type Theme = "system" | "light" | "dark";

interface Prefs {
  lang: string;
  setLang: (l: string) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<Prefs | null>(null);

function lsGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function initialLang(): string {
  const saved = lsGet("devotional.lang");
  if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  const nav = (navigator.language || "").slice(0, 2);
  return LANGUAGES.some((l) => l.code === nav) ? nav : DEFAULT_LANG;
}

function initialTheme(): Theme {
  const saved = lsGet("devotional.theme") as Theme | null;
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  const stamped = document.documentElement.getAttribute("data-theme");
  return stamped === "light" || stamped === "dark" ? stamped : "system";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang);
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    root.lang = lang;
  }, [theme, lang]);

  const value = useMemo<Prefs>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        lsSet("devotional.lang", l);
      },
      theme,
      setTheme: (t) => {
        setThemeState(t);
        lsSet("devotional.theme", t);
      },
    }),
    [lang, theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("PrefsProvider missing");
  return v;
}
