import test from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "../../../../../shared/src/index.js";
import { correlateFindings } from "../correlation.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    ruleId: overrides.ruleId ?? "execution.suspicious-shell-spawn",
    title: overrides.title ?? "x",
    description: overrides.description ?? "x",
    summary: overrides.summary ?? "x",
    rationale: overrides.rationale ?? "x",
    recommendation: overrides.recommendation ?? "x",
    severity: overrides.severity ?? "high",
    confidence: overrides.confidence ?? 0.8,
    category: overrides.category ?? "execution",
    scoreContribution: overrides.scoreContribution ?? 10,
    filePath: overrides.filePath ?? "src/file.ts",
    lineNumber: overrides.lineNumber,
    relatedLineNumbers: overrides.relatedLineNumbers,
    matchCount: overrides.matchCount,
    detector: overrides.detector ?? "test",
    evidenceSnippet: overrides.evidenceSnippet ?? "snippet",
    tags: overrides.tags ?? [],
    evidence: overrides.evidence ?? []
  };
}

test("correlateFindings suppresses primitive command findings covered by chain finding", () => {
  const chain = finding({
    id: "chain",
    ruleId: "execution.chain.download-write-execute",
    severity: "critical",
    lineNumber: 20,
    relatedLineNumbers: [12, 16, 20],
    scoreContribution: 50
  });
  const primitive = finding({
    id: "primitive",
    ruleId: "execution.suspicious-shell-spawn",
    lineNumber: 18,
    scoreContribution: 20
  });

  const result = correlateFindings([chain, primitive]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.id, "chain");
  assert.equal(result.suppressedCount, 1);
});

test("correlateFindings keeps secret finding even when exfiltration chain exists", () => {
  const chain = finding({
    id: "chain",
    ruleId: "execution.chain.secret-read-exfiltration",
    severity: "high",
    lineNumber: 30,
    relatedLineNumbers: [22, 30],
    scoreContribution: 40
  });
  const secret = finding({
    id: "secret",
    ruleId: "secret.env.access-token",
    category: "secret",
    lineNumber: 22,
    scoreContribution: 18
  });

  const result = correlateFindings([chain, secret]);
  assert.equal(result.findings.length, 2);
  assert.equal(result.suppressedCount, 0);
});

