/** Validate a shared delivery folder path (UNC or absolute local). Rejects traversal. */
export function normalizeSharedDeliveryPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..")) {
    throw new Error("invalid_shared_path_traversal");
  }
  // Allow Windows UNC \\server\share\... or drive paths C:\... or POSIX /...
  const unc = trimmed.startsWith("\\\\") || trimmed.startsWith("//");
  const winDrive = /^[A-Za-z]:[\\/]/.test(trimmed);
  const posixAbs = trimmed.startsWith("/");
  if (!unc && !winDrive && !posixAbs) {
    throw new Error("invalid_shared_path_absolute");
  }
  return trimmed.replace(/\//g, "\\");
}

export function resolveApplicationSharedPath(input: {
  applicationPath: string | null | undefined;
  bankPath: string | null | undefined;
}): string | null {
  const app = input.applicationPath?.trim();
  if (app) return normalizeSharedDeliveryPath(app);
  const bank = input.bankPath?.trim();
  if (bank) return normalizeSharedDeliveryPath(bank);
  return null;
}

export function sanitizeDeliveryFileToken(value: string, max = 48): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return (cleaned || "build").slice(0, max);
}
