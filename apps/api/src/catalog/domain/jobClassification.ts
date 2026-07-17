import type { JobClassification } from "@office/types";

type JobPattern = { pattern: RegExp; classification: JobClassification };

const JOB_PATTERNS: JobPattern[] = [
  { pattern: /unit[_-]?test|test:unit|dotnet test|npm test|vitest|jest|xunit|nunit|mstest|flutter test/i, classification: "unit_test" },
  { pattern: /integration[_-]?test|test:integration/i, classification: "integration_test" },
  { pattern: /e2e|end[_-]?to[_-]?end|playwright|cypress|maestro/i, classification: "end_to_end_test" },
  { pattern: /sonar|static[_-]?analysis|codequality|analyze/i, classification: "static_analysis" },
  { pattern: /lint|eslint|dart analyze|dotnet format/i, classification: "lint" },
  { pattern: /sast|security scan|dependency.?scan|secret.?scan|container.?scan/i, classification: "security_scan" },
  { pattern: /dependency.?scan|npm audit|snyk/i, classification: "dependency_scan" },
  { pattern: /secret.?scan|gitleaks|trufflehog/i, classification: "secret_scan" },
  { pattern: /build|compile|docker build|flutter build|dotnet build|npm run build/i, classification: "build" },
  { pattern: /deploy|deployment|helm|kubectl/i, classification: "deploy" },
  { pattern: /release|publish|package/i, classification: "release" },
];

export function classifyJob(name: string, stage?: string | null): JobClassification {
  const haystack = `${stage ?? ""} ${name}`;
  for (const { pattern, classification } of JOB_PATTERNS) {
    if (pattern.test(haystack)) return classification;
  }
  return "unknown";
}
