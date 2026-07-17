type Props = {
  status: string;
  className?: string;
};

function toneForStatus(status: string): "success" | "danger" | "progress" | "neutral" {
  if (status === "Succeeded" || status === "SimulationCompleted") return "success";
  if (
    status === "Failed" ||
    status === "PartiallySucceeded" ||
    status === "Cancelled" ||
    status === "TimedOut"
  ) {
    return "danger";
  }
  if (
    status === "InProgress" ||
    status === "Queued" ||
    status === "Claimed" ||
    status === "Building" ||
    status === "PreparingWorkspace" ||
    status === "CloningRepository" ||
    status === "UploadingArtifact" ||
    status === "CollectingArtifact"
  ) {
    return "progress";
  }
  return "neutral";
}

/** Shared status pill — matches Forge build states and triage-style labels. */
export function StatusBadge({ status, className }: Props) {
  const tone = toneForStatus(status);
  const extra = className ? ` ${className}` : "";
  return <span className={`status-badge status-badge--${tone}${extra}`}>{status}</span>;
}
