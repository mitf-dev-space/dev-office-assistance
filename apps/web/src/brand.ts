/** Product name shown in the shell, auth, and install manifest. */
export const BRAND_NAME = "Helm";

/** Short line under the logo on the login page. */
export const BRAND_TAGLINE =
  "Triage, planning, mobile builds, and your team in one place.";

/** PWA / install short name (kept in sync with the install manifest in `vite.config.ts`). */
export const PWA_SHORT_NAME = BRAND_NAME;

export const brandHomeAriaLabel = `Home, ${BRAND_NAME}` as const;

export const brandFooterLine = `${BRAND_NAME} — ${BRAND_TAGLINE}` as const;
