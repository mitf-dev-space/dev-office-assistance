import type { ClickUpClient } from "./client.js";

export type FlattenedList = {
  workspaceId: string;
  spaceId: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
  listId: string;
  listName: string;
  /** Owned workspace hierarchy vs Shared-with-me hierarchy */
  source: "owned" | "shared";
  taskCount: number | null;
};

function parseTaskCount(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ClickUp shared folders expose space id as status_group `proj_{spaceId}`. */
export function spaceIdFromSharedStatuses(
  statuses: Array<{ status_group?: string }> | undefined,
): string | null {
  for (const s of statuses ?? []) {
    const m = /^proj_(\d+)$/.exec(s.status_group ?? "");
    if (m) return m[1];
  }
  return null;
}

function pushUnique(out: FlattenedList[], row: FlattenedList, seen: Set<string>) {
  if (seen.has(row.listId)) return;
  seen.add(row.listId);
  out.push(row);
}

async function discoverOwnedLists(
  client: ClickUpClient,
  workspaceId: string,
  seen: Set<string>,
): Promise<FlattenedList[]> {
  const out: FlattenedList[] = [];
  let spacesRes: { spaces?: Array<{ id?: string; name?: string }> };
  try {
    spacesRes = await client.getSpaces(workspaceId);
  } catch {
    return out;
  }
  for (const space of spacesRes.spaces ?? []) {
    if (!space.id) continue;
    const spaceName = space.name ?? space.id;
    try {
      const foldersRes = await client.getFolders(space.id);
      for (const folder of foldersRes.folders ?? []) {
        if (!folder.id) continue;
        const listsRes = await client.getListsInFolder(folder.id);
        for (const list of listsRes.lists ?? []) {
          if (!list.id) continue;
          pushUnique(
            out,
            {
              workspaceId,
              spaceId: space.id,
              spaceName,
              folderId: folder.id,
              folderName: folder.name ?? folder.id,
              listId: list.id,
              listName: list.name ?? list.id,
              source: "owned",
              taskCount: null,
            },
            seen,
          );
        }
      }
    } catch {
      /* guest/shared spaces often 401 on folder enumeration */
    }
    try {
      const folderless = await client.getFolderlessLists(space.id);
      for (const list of folderless.lists ?? []) {
        if (!list.id) continue;
        pushUnique(
          out,
          {
            workspaceId,
            spaceId: space.id,
            spaceName,
            folderId: null,
            folderName: null,
            listId: list.id,
            listName: list.name ?? list.id,
            source: "owned",
            taskCount: null,
          },
          seen,
        );
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function discoverSharedLists(
  client: ClickUpClient,
  workspaceId: string,
  seen: Set<string>,
): Promise<FlattenedList[]> {
  const out: FlattenedList[] = [];
  let sharedRes: Awaited<ReturnType<ClickUpClient["getSharedHierarchy"]>>;
  try {
    sharedRes = await client.getSharedHierarchy(workspaceId);
  } catch {
    return out;
  }
  const shared = sharedRes.shared;
  if (!shared) return out;

  for (const folder of shared.folders ?? []) {
    if (!folder.id) continue;
    const spaceId =
      spaceIdFromSharedStatuses(folder.statuses) ?? `shared:${workspaceId}`;
    const spaceName = "Shared with me";
    for (const list of folder.lists ?? []) {
      if (!list.id) continue;
      pushUnique(
        out,
        {
          workspaceId,
          spaceId,
          spaceName,
          folderId: folder.id,
          folderName: folder.name ?? folder.id,
          listId: list.id,
          listName: list.name ?? list.id,
          source: "shared",
          taskCount: parseTaskCount(list.task_count),
        },
        seen,
      );
    }
  }

  for (const list of shared.lists ?? []) {
    if (!list.id) continue;
    pushUnique(
      out,
      {
        workspaceId,
        spaceId: list.space?.id ?? `shared:${workspaceId}`,
        spaceName: list.space?.name ?? "Shared with me",
        folderId: list.folder?.id ?? null,
        folderName: list.folder?.name ?? null,
        listId: list.id,
        listName: list.name ?? list.id,
        source: "shared",
        taskCount: parseTaskCount(list.task_count),
      },
      seen,
    );
  }

  return out;
}

/** Owned spaces + Shared-with-me hierarchy for one workspace. */
export async function discoverFlattenedLists(
  client: ClickUpClient,
  workspaceId: string,
): Promise<FlattenedList[]> {
  const seen = new Set<string>();
  const owned = await discoverOwnedLists(client, workspaceId, seen);
  const shared = await discoverSharedLists(client, workspaceId, seen);
  return [...owned, ...shared].sort((a, b) => {
    const sa = `${a.source}:${a.spaceName}:${a.folderName ?? ""}:${a.listName}`;
    const sb = `${b.source}:${b.spaceName}:${b.folderName ?? ""}:${b.listName}`;
    return sa.localeCompare(sb);
  });
}

/**
 * Discover lists across every workspace the token can access
 * (owned Team Spaces + Shared with me).
 */
export async function discoverAllAccessibleLists(
  client: ClickUpClient,
  preferredWorkspaceId?: string | null,
): Promise<FlattenedList[]> {
  const teams = await client.getTeams();
  const teamIds = (teams.teams ?? [])
    .map((t) => t.id)
    .filter((id): id is string => Boolean(id));
  const ordered = preferredWorkspaceId
    ? [
        preferredWorkspaceId,
        ...teamIds.filter((id) => id !== preferredWorkspaceId),
      ]
    : teamIds;

  const seen = new Set<string>();
  const out: FlattenedList[] = [];
  for (const workspaceId of ordered) {
    const owned = await discoverOwnedLists(client, workspaceId, seen);
    const shared = await discoverSharedLists(client, workspaceId, seen);
    out.push(...owned, ...shared);
  }
  return out.sort((a, b) => {
    const sa = `${a.workspaceId}:${a.source}:${a.folderName ?? ""}:${a.listName}`;
    const sb = `${b.workspaceId}:${b.source}:${b.folderName ?? ""}:${b.listName}`;
    return sa.localeCompare(sb);
  });
}

/** Skip CSV dumps that lose assignees and pollute Triage. */
export function shouldSkipAutoMapList(listName: string | null | undefined): boolean {
  const n = (listName ?? "").toLowerCase();
  return n.includes("imported from csv") || n.includes("csv import");
}
