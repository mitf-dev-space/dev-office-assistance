import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../db.js";
import {
  resolveApplicationSharedPath,
  sanitizeDeliveryFileToken,
} from "../sharedDeliveryPath.js";

export type SharedDeliveryResult = {
  status: "copied" | "failed" | "skipped";
  path: string | null;
  fileName: string | null;
  error: string | null;
};

export async function maybePublishArtifactToSharedFolder(input: {
  buildRequestId: string;
  platformBuildId: string;
  sourceStoragePath: string;
  originalFileName: string;
}): Promise<SharedDeliveryResult> {
  const request = await prisma.forgeBuildRequest.findUnique({
    where: { id: input.buildRequestId },
    include: {
      application: { include: { bank: true } },
    },
  });

  if (!request?.publishToSharedFolder) {
    return { status: "skipped", path: null, fileName: null, error: null };
  }

  let sharedRoot: string | null = null;
  try {
    sharedRoot = resolveApplicationSharedPath({
      applicationPath: request.application.sharedDeliveryPath,
      bankPath: request.application.bank.sharedDeliveryPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_shared_path";
    await prisma.forgeBuildRequest.update({
      where: { id: request.id },
      data: {
        sharedDeliveryStatus: "failed",
        sharedDeliveryError: message,
      },
    });
    return { status: "failed", path: null, fileName: null, error: message };
  }

  if (!sharedRoot) {
    const message = "shared_delivery_path_not_configured";
    await prisma.forgeBuildRequest.update({
      where: { id: request.id },
      data: {
        sharedDeliveryStatus: "failed",
        sharedDeliveryError: message,
      },
    });
    return { status: "failed", path: null, fileName: null, error: message };
  }

  const ext = input.originalFileName.includes(".")
    ? input.originalFileName.slice(input.originalFileName.lastIndexOf("."))
    : ".apk";
  const fileName = [
    sanitizeDeliveryFileToken(request.application.bank.code, 16),
    sanitizeDeliveryFileToken(request.application.name, 32),
    sanitizeDeliveryFileToken(request.gitReference, 40),
    sanitizeDeliveryFileToken(input.platformBuildId.slice(0, 8), 8),
  ].join("_") + ext;

  const destPath = join(sharedRoot, fileName);

  try {
    await mkdir(sharedRoot, { recursive: true });
    await copyFile(input.sourceStoragePath, destPath);
    await prisma.forgeBuildRequest.update({
      where: { id: request.id },
      data: {
        sharedDeliveryPath: destPath,
        sharedDeliveryFileName: fileName,
        sharedDeliveryStatus: "copied",
        sharedDeliveryError: null,
      },
    });
    return { status: "copied", path: destPath, fileName, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "shared_copy_failed";
    await prisma.forgeBuildRequest.update({
      where: { id: request.id },
      data: {
        sharedDeliveryPath: sharedRoot,
        sharedDeliveryFileName: fileName,
        sharedDeliveryStatus: "failed",
        sharedDeliveryError: message,
      },
    });
    return { status: "failed", path: destPath, fileName, error: message };
  }
}
