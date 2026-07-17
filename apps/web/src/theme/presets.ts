export const THEME_STORAGE_KEY = "office-app-theme";

const ok = (x: string): x is AppThemeId =>
  x === "ember" || x === "teal" || x === "violet";

export type AppThemeId = "ember" | "teal" | "violet";

export type AppThemePreset = {
  id: AppThemeId;
  /** Shown in the top bar. */
  label: string;
  shortLabel: string;
  /** PWA / mobile chrome hint (light mode). */
  metaThemeColor: string;
  /** PWA / mobile chrome hint (dark mode). */
  metaThemeColorDark: string;
  /** Mantine primary palette name. */
  mantinePrimary: "red" | "teal" | "violet";
  swatch: string;
  /** Gradient for Mantine defaultGradient. */
  gradient: { from: string; to: string; deg: number };
  /** For Segmented / swatch a11y. */
  description: string;
};

export const THEME_PRESETS: AppThemePreset[] = [
  {
    id: "ember",
    label: "Ember",
    shortLabel: "Ember",
    metaThemeColor: "#dc2626",
    metaThemeColorDark: "#0c0a0a",
    mantinePrimary: "red",
    swatch: "#dc2626",
    gradient: { from: "red.8", to: "red.4", deg: 128 },
    description: "Red, black, and white — high contrast, editorial heat.",
  },
  {
    id: "teal",
    label: "Harbor",
    shortLabel: "Harbor",
    metaThemeColor: "#0f766e",
    metaThemeColorDark: "#0f1419",
    mantinePrimary: "teal",
    swatch: "#0d9488",
    gradient: { from: "teal.8", to: "teal.3", deg: 140 },
    description: "Warm paper, teal ink — the original office calm.",
  },
  {
    id: "violet",
    label: "Nebula",
    shortLabel: "Nebula",
    metaThemeColor: "#5b21b6",
    metaThemeColorDark: "#120f1f",
    mantinePrimary: "violet",
    swatch: "#7c3aed",
    gradient: { from: "violet.8", to: "violet.3", deg: 132 },
    description: "Violet and ink — a soft midnight dashboard glow.",
  },
];

export function getPreset(id: string): AppThemePreset {
  const p = THEME_PRESETS.find((t) => t.id === id);
  return p ?? THEME_PRESETS[0]!;
}

export function parseStoredThemeId(raw: string | null): AppThemeId {
  if (raw && ok(raw)) return raw;
  return "ember";
}
