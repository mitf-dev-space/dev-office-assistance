/**
 * Parse ClickUp task / workspace URLs.
 * Examples:
 *   https://app.clickup.com/t/9012077309/869dtxu9r
 *   https://app.clickup.com/t/869dtxu9r
 *   https://app.clickup.com/9012077309/...
 */

export type ParsedClickUpUrl = {
  workspaceId: string | null;
  taskId: string | null;
};

export function parseClickUpUrl(input: string): ParsedClickUpUrl {
  const raw = input.trim();
  if (!raw) return { workspaceId: null, taskId: null };

  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const parts = u.pathname.split("/").filter(Boolean);

    // /t/{workspaceId}/{taskId} or /t/{taskId}
    const tIdx = parts.indexOf("t");
    if (tIdx >= 0) {
      const a = parts[tIdx + 1];
      const b = parts[tIdx + 2];
      if (a && b) {
        return { workspaceId: a, taskId: b };
      }
      if (a) {
        return { workspaceId: null, taskId: a };
      }
    }

    // /{workspaceId}/...
    if (parts[0] && /^\d+$/.test(parts[0])) {
      return { workspaceId: parts[0], taskId: null };
    }
  } catch {
    /* fall through */
  }

  // Bare task id
  if (/^[a-z0-9]+$/i.test(raw) && raw.length >= 6) {
    return { workspaceId: null, taskId: raw };
  }

  return { workspaceId: null, taskId: null };
}
