import type { Finding } from "../../../../shared/src/index.js";

interface CorrelationResult {
  findings: Finding[];
  suppressedCount: number;
}

const CHAIN_RULES = new Set([
  "execution.chain.download-write-execute",
  "execution.chain.secret-read-exfiltration",
  "execution.chain.decode-write-execute"
]);

const COVERAGE_RULES: Record<string, Array<string | RegExp>> = {
  "execution.chain.download-write-execute": [
    "execution.suspicious-shell-spawn",
    /^encoded\./
  ],
  "execution.chain.decode-write-execute": [
    "execution.suspicious-shell-spawn",
    /^encoded\./
  ],
  "execution.chain.secret-read-exfiltration": [
    "execution.exfiltration.secret-over-network"
  ]
};

export function correlateFindings(findings: Finding[]): CorrelationResult {
  const chainFindings = findings.filter((finding) => CHAIN_RULES.has(finding.ruleId));
  if (!chainFindings.length) {
    return { findings, suppressedCount: 0 };
  }

  const suppressed = new Set<string>();

  for (const chain of chainFindings) {
    const coverageRules = COVERAGE_RULES[chain.ruleId] ?? [];
    for (const candidate of findings) {
      if (candidate.id === chain.id) continue;
      if (candidate.filePath !== chain.filePath) continue;
      if (!matchesCoverageRule(candidate.ruleId, coverageRules)) continue;
      if (!isCoveredByChain(chain, candidate)) continue;
      suppressed.add(candidate.id);
    }
  }

  return {
    findings: findings.filter((finding) => !suppressed.has(finding.id)),
    suppressedCount: suppressed.size
  };
}

function matchesCoverageRule(ruleId: string, coverageRules: Array<string | RegExp>) {
  return coverageRules.some((rule) => typeof rule === "string" ? rule === ruleId : rule.test(ruleId));
}

function isCoveredByChain(chain: Finding, candidate: Finding) {
  const chainLines = getRelevantLines(chain);
  const candidateLines = getRelevantLines(candidate);

  if (!chainLines.length || !candidateLines.length) {
    return compact(chain.evidenceSnippet ?? chain.summary) === compact(candidate.evidenceSnippet ?? candidate.summary);
  }

  return candidateLines.some((candidateLine) => chainLines.some((chainLine) => Math.abs(chainLine - candidateLine) <= 8));
}

function getRelevantLines(finding: Finding) {
  return [...new Set([finding.lineNumber, ...(finding.relatedLineNumbers ?? [])].filter((value): value is number => typeof value === "number"))].sort((a, b) => a - b);
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}
