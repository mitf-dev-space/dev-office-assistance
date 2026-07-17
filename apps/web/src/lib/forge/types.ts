import type {
  ForgeBankDto,
  ForgeBuildRequestSummaryDto,
  ForgeDashboardDto,
} from "@office/types";

export type ForgeApplicationDto = {
  id: string;
  bankId: string;
  bankName: string;
  bankCode: string;
  name: string;
  description: string | null;
  repositoryProvider: string;
  repositoryUrl: string;
  projectSubpath: string | null;
  defaultBranch: string;
  requiredFlutterVersion: string | null;
  androidEnabled: boolean;
  iosEnabled: boolean;
  isActive: boolean;
  profileCount: number;
  buildCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ForgeBuildProfileDto = {
  id: string;
  applicationId: string;
  applicationName: string;
  name: string;
  description: string | null;
  flutterFlavor: string | null;
  dartEntryPoint: string;
  environmentName: string | null;
  androidArtifactType: string;
  androidBuildMode: string;
  iosExportMethod: string | null;
  timeoutMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ForgeCatalogApplicationDto = {
  id: string;
  name: string;
  bankId: string;
  bankName: string;
  bankCode: string;
  defaultBranch: string;
  androidEnabled: boolean;
  iosEnabled: boolean;
  profiles: Array<{
    id: string;
    name: string;
    androidBuildMode: string;
    androidArtifactType: string;
  }>;
};

export type ForgeBuildRequestDetailDto = {
  id: string;
  overallStatus: string;
  gitReferenceType: string;
  gitReference: string;
  requestNote: string | null;
  createdAt: string;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  application: { id: string; name: string; bankName: string };
  buildProfile: { id: string; name: string; androidBuildMode: string };
  requestedBy: string;
  platformBuilds: Array<{
    id: string;
    platform: string;
    status: string;
    failureCategory: string | null;
    failureSummary: string | null;
    startedAtUtc: string | null;
    completedAtUtc: string | null;
    runnerName: string | null;
    artifacts: Array<{
      id: string;
      fileName: string;
      contentType: string;
      fileSizeBytes: string;
      checksumSha256: string | null;
      createdAt: string;
    }>;
  }>;
};

export type { ForgeBankDto, ForgeBuildRequestSummaryDto, ForgeDashboardDto };
