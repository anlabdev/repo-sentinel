import type { Finding } from "../../../../../shared/src/index.js";
import type { Detector } from "../types.js";
import { compactValue, createEvidence, createFinding, lineNumberFromIndex } from "./common.js";

const KEY_MARKERS = [
  { marker: /-----BEGIN PRIVATE KEY-----/g, ruleId: "key-material.private-key.pem", title: "PEM private key material committed" },
  { marker: /-----BEGIN RSA PRIVATE KEY-----/g, ruleId: "key-material.rsa-private-key.pem", title: "RSA private key committed" },
  { marker: /-----BEGIN OPENSSH PRIVATE KEY-----/g, ruleId: "key-material.openssh-private-key", title: "OpenSSH private key committed" },
  { marker: /-----BEGIN EC PRIVATE KEY-----/g, ruleId: "key-material.ec-private-key.pem", title: "EC private key committed" }
] as const;

export const keyMaterialDetector: Detector = {
  name: "keyMaterialDetector",
  detect({ files }) {
    const findings: Finding[] = [];

    for (const file of files) {
      if (!file.content) continue;

      for (const rule of KEY_MARKERS) {
        const pattern = new RegExp(rule.marker);
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(file.content)) !== null) {
          const lineNumber = lineNumberFromIndex(file.content, match.index);
          const line = file.content.split(/\r?\n/)[lineNumber - 1] ?? match[0];
          findings.push(createFinding({
            ruleId: rule.ruleId,
            title: rule.title,
            summary: "Phát hiện private key hoặc key material theo định dạng PEM/OpenSSH trong repository.",
            description: "Private key or key material marker was committed directly into repository content.",
            rationale: "Marker PEM/OpenSSH cho private key là tín hiệu rất mạnh của key material thật. Những khóa này không nên xuất hiện trong repository vì có thể bị lạm dụng ngay nếu còn hiệu lực.",
            recommendation: "Thu hồi hoặc rotate khóa nếu còn hiệu lực, xóa khỏi repository, và thay bằng template an toàn hơn hoặc secret manager.",
            severity: "high",
            confidence: 0.99,
            category: "key-material",
            filePath: file.relativePath,
            lineNumber,
            detector: "keyMaterialDetector",
            evidenceSnippet: compactValue(line),
            tags: ["private-key", "pem", "key-material"],
            evidence: [
              createEvidence("Key marker", match[0], "pattern"),
              createEvidence("Matched line", compactValue(line))
            ]
          }));
        }
      }
    }

    return findings;
  }
};
