import { useId, type CSSProperties } from "react";
import { BRAND_NAME } from "../brand";

const MARK_SIZES = { sm: 28, md: 36, lg: 44 } as const;

type Props = {
  variant?: "mark" | "full";
  size?: keyof typeof MARK_SIZES;
  className?: string;
  style?: CSSProperties;
  color?: string;
};

/** Steering-wheel mark — wayfinding + command (Helm). Uses currentColor from the wrapper. */
function HelmMark({ px, gradId }: { px: number; gradId: string }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="32" x2="32" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="15" stroke={`url(#${gradId})`} strokeWidth="3.5" />
      <circle cx="20" cy="20" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1="20"
          y1="20"
          x2="20"
          y2="6.5"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          transform={`rotate(${deg} 20 20)`}
          opacity={0.9}
        />
      ))}
      <rect x="18.25" y="2" width="3.5" height="5" rx="1.25" fill="currentColor" opacity={0.85} />
    </svg>
  );
}

export function AppLogo({
  variant = "mark",
  size = "md",
  className,
  style,
  color = "var(--accent)",
}: Props) {
  const px = MARK_SIZES[size];
  const gradId = `helm-g-${useId().replace(/:/g, "")}`;
  const mark = (
    <span style={{ color, display: "inline-flex", lineHeight: 0 }}>
      <HelmMark px={px} gradId={gradId} />
    </span>
  );

  if (variant === "mark") {
    return (
      <span className={className} style={{ display: "inline-flex", lineHeight: 0, ...style }}>
        {mark}
      </span>
    );
  }

  return (
    <span
      className={["app-logo app-logo--full", className].filter(Boolean).join(" ")}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", ...style }}
    >
      {mark}
      <span className="app-logo__word">{BRAND_NAME}</span>
    </span>
  );
}

export { MARK_SIZES };
