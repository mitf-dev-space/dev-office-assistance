# Forge — build lifecycle

Platform build states (PRD §11 — enforced in domain logic starting Loop 2):

`Queued` → `WaitingForCompatibleRunner` → `Claimed` → `PreparingWorkspace` → `CloningRepository` → `Building` → `Signing` → `CollectingArtifact` → `UploadingArtifact` → `Succeeded`

Terminal: `Succeeded`, `Failed`, `Cancelled`, `TimedOut`, `SimulationCompleted`

Combined Android+iOS requests create **two** `ForgePlatformBuild` rows. Overall `ForgeBuildRequest.overallStatus` derives from both.

Retries create new attempts — historical rows are preserved.
