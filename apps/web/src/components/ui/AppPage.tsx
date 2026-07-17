import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional BEM modifier, e.g. `dashboard` → `app-page--dashboard`. */
  variant?: string;
  className?: string;
};

/** Consistent page wrapper used across Helm core and Forge modules. */
export function AppPage({ children, variant, className }: Props) {
  const mod = variant ? ` app-page--${variant}` : "";
  const extra = className ? ` ${className}` : "";
  return <div className={`app-page${mod}${extra}`}>{children}</div>;
}
