export const COLOR_SCHEME_STORAGE_KEY = "office-app-color-scheme";

export type AppColorScheme = "light" | "dark";

export function parseStoredColorScheme(raw: string | null): AppColorScheme {
  if (raw === "dark" || raw === "light") return raw;
  return "light";
}

export function resolveInitialColorScheme(): AppColorScheme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-color-scheme");
    if (attr === "dark" || attr === "light") return attr;
  }
  if (typeof window === "undefined") return "light";
  try {
    return parseStoredColorScheme(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}
