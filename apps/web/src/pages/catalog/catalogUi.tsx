import { Badge } from "@mantine/core";
import type {
  RepositoryConnectivityState,
  RepositoryFreshnessState,
  RepositoryLifecycleState,
  PipelineStatus,
} from "@office/types";

export function connectivityColor(state: RepositoryConnectivityState): string {
  switch (state) {
    case "reachable":
      return "green";
    case "authentication_failed":
    case "permission_denied":
      return "red";
    case "network_error":
    case "provider_error":
      return "orange";
    default:
      return "gray";
  }
}

export function freshnessColor(state: RepositoryFreshnessState): string {
  switch (state) {
    case "current":
      return "teal";
    case "stale":
      return "yellow";
    case "synchronization_failed":
      return "red";
    case "never_synchronized":
      return "gray";
    default:
      return "gray";
  }
}

export function pipelineColor(status: PipelineStatus | string | null | undefined): string {
  switch (status) {
    case "success":
      return "green";
    case "failed":
      return "red";
    case "running":
    case "pending":
      return "blue";
    case "canceled":
      return "gray";
    default:
      return "gray";
  }
}

export function ConnectivityBadge({ state }: { state: RepositoryConnectivityState }) {
  return (
    <Badge color={connectivityColor(state)} variant="light" size="sm">
      {state.replace(/_/g, " ")}
    </Badge>
  );
}

export function FreshnessBadge({ state }: { state: RepositoryFreshnessState }) {
  return (
    <Badge color={freshnessColor(state)} variant="outline" size="sm">
      {state.replace(/_/g, " ")}
    </Badge>
  );
}

export function LifecycleBadge({ state }: { state: RepositoryLifecycleState }) {
  return (
    <Badge variant="dot" size="sm">
      {state}
    </Badge>
  );
}

export function PipelineBadge({ status }: { status: PipelineStatus | string | null | undefined }) {
  return (
    <Badge color={pipelineColor(status)} variant="light" size="sm">
      {status ?? "unknown"}
    </Badge>
  );
}

export function providerLabel(kind: string, slug: string): string {
  return kind === "github" ? "GitHub" : kind === "gitlab" ? "GitLab" : slug;
}
