import type { Finding, FindingCategory } from "../../../../shared/src/index.js";

const KNOWN_CATEGORIES = new Set<FindingCategory>([
  "secret",
  "key-material",
  "execution",
  "encoded-content",
  "artifact",
  "filename-risk",
  "dependency",
  "workflow",
  "config-risk"
]);

export function normalizeFindingCategory(input: Pick<Finding, "ruleId" | "title" | "category" | "detector" | "filePath">): FindingCategory {
  const direct = typeof input.category === "string" ? input.category.trim() : "";
  if (KNOWN_CATEGORIES.has(direct as FindingCategory) && direct !== "other") {
    return direct as FindingCategory;
  }

  const ruleId = input.ruleId.toLowerCase();
  const title = input.title.toLowerCase();
  const detector = input.detector.toLowerCase();
  const filePath = input.filePath.toLowerCase();

  if (ruleId.startsWith("command.execution") || ruleId.startsWith("execution.") || detector.includes("command")) return "execution";
  if (ruleId.startsWith("secret.")) return "secret";
  if (ruleId.startsWith("key.") || ruleId.includes("private-key") || title.includes("private key") || detector.includes("keymaterial")) return "key-material";
  if (ruleId.startsWith("encoded.")) return "encoded-content";
  if (ruleId.startsWith("suspiciousfilename.") || ruleId.startsWith("filename.")) return filePath.startsWith(".env") ? "config-risk" : "filename-risk";
  if (ruleId.startsWith("installhooks.") || ruleId.startsWith("workflow.install-hook") || detector.includes("installhooks")) return "workflow";
  if (ruleId.includes("artifact") || ruleId.includes("binary") || detector.includes("artifact")) return "artifact";
  if (ruleId.startsWith("workflow.") || detector.includes("workflow")) return "workflow";
  if (ruleId.startsWith("config.")) return "config-risk";
  if (ruleId.startsWith("dependency.")) return "dependency";

  return filePath.startsWith(".env") ? "config-risk" : "filename-risk";
}

export function normalizeFindingRecord<T extends Finding>(finding: T): T {
  return {
    ...finding,
    category: normalizeFindingCategory(finding)
  };
}
