import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  COLOR_SCHEME_STORAGE_KEY,
  resolveInitialColorScheme,
  type AppColorScheme,
} from "./colorScheme";
import { THEME_STORAGE_KEY, getPreset, parseStoredThemeId, type AppThemeId, type AppThemePreset } from "./presets";
import { buildMantineTheme, getMantineThemeForId, type AppMantineTheme } from "./mantineThemeFor";

type Ctx = {
  themeId: AppThemeId;
  setThemeId: (id: AppThemeId) => void;
  colorScheme: AppColorScheme;
  setColorScheme: (scheme: AppColorScheme) => void;
  toggleColorScheme: () => void;
  preset: AppThemePreset;
  mantineTheme: AppMantineTheme;
};

const AppThemeStateContext = createContext<Ctx | null>(null);

function readInitialId(): AppThemeId {
  if (typeof document !== "undefined") {
    const d = document.documentElement.getAttribute("data-app-theme");
    if (d && (d === "ember" || d === "teal" || d === "violet")) {
      return d;
    }
  }
  if (typeof window === "undefined") return "ember";
  try {
    return parseStoredThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "ember";
  }
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<AppThemeId>(readInitialId);
  const [colorScheme, setColorSchemeState] = useState<AppColorScheme>(resolveInitialColorScheme);

  const setThemeId = useCallback((id: AppThemeId) => {
    setThemeIdState(id);
  }, []);

  const setColorScheme = useCallback((scheme: AppColorScheme) => {
    setColorSchemeState(scheme);
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorSchemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const preset = useMemo(() => getPreset(themeId), [themeId]);
  const mantineTheme = useMemo(() => buildMantineTheme(preset), [preset]);

  useEffect(() => {
    document.documentElement.setAttribute("data-app-theme", themeId);
    document.documentElement.setAttribute("data-color-scheme", colorScheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
    } catch {
      /* ignore */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        "content",
        colorScheme === "dark" ? preset.metaThemeColorDark : preset.metaThemeColor,
      );
    }
  }, [themeId, colorScheme, preset.metaThemeColor, preset.metaThemeColorDark]);

  const value = useMemo<Ctx>(
    () => ({
      themeId,
      setThemeId,
      colorScheme,
      setColorScheme,
      toggleColorScheme,
      preset,
      mantineTheme,
    }),
    [themeId, setThemeId, colorScheme, setColorScheme, toggleColorScheme, preset, mantineTheme],
  );

  return <AppThemeStateContext.Provider value={value}>{children}</AppThemeStateContext.Provider>;
}

export function useAppTheme() {
  const c = useContext(AppThemeStateContext);
  if (!c) {
    throw new Error("useAppTheme must be used under AppThemeProvider");
  }
  return c;
}

export function useMantineThemeForThemeId(themeId: AppThemeId) {
  return useMemo(() => getMantineThemeForId(themeId), [themeId]);
}
