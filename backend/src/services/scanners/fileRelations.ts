import path from "node:path";
import type { Finding, FindingEvidence } from "../../../../shared/src/index.js";
import type { FileRecord } from "../../utils/file-system.js";
import { detectScriptLanguage } from "./detectors/languageProfiles.js";

interface FileReference {
  sourcePath: string;
  relation: "entrypoint" | "script-call" | "workflow-call";
  depth?: number;
}

interface GraphEdge extends FileReference {
  target: string;
}

interface RelationIndex {
  reverse: Map<string, FileReference[]>;
}

interface AliasResolver {
  configPath: string;
  directory: string;
  baseUrl?: string;
  paths: AliasPathRule[];
}

interface AliasPathRule {
  pattern: string;
  prefix: string;
  suffix: string;
  targets: string[];
}

interface WorkspaceMatcher {
  patterns: string[];
}

interface PackageResolver {
  packageName: string;
  directory: string;
  packageJsonPath: string;
  entryTargets: string[];
  exportTargets: Map<string, string[]>;
  scripts: Record<string, string>;
}

interface ProjectResolver {
  projectName: string;
  directory: string;
  projectJsonPath: string;
  targetEntries: Map<string, string[]>;
}

type TaskRunnerKind = "turbo" | "nx" | "moon";

interface TaskRunnerRef {
  kind: TaskRunnerKind;
  selector?: string;
  scriptName: string;
}

interface NxGraph {
  projectDeps: Map<string, string[]>;
  targetDepTasks: Map<string, string[]>;
  workspaceDeps: Map<string, string[]>;
}

export function buildRelationIndex(files: FileRecord[]): RelationIndex {
  const byPath = new Map(files.map((file) => [normalizePath(file.relativePath), file]));
  const workspaceMatcher = buildWorkspaceMatcher(files);
  const aliasResolvers = buildAliasResolvers(files);
  const packageResolvers = buildPackageResolvers(files, byPath, workspaceMatcher);
  const projectResolvers = buildProjectResolvers(files, byPath, workspaceMatcher);
  const turboTaskDeps = buildTurboTaskDependencies(files);
  const nxGraph = buildNxGraph(files, byPath, aliasResolvers, packageResolvers, projectResolvers);
  const graph = new Map<string, GraphEdge[]>();
  const reverse = new Map<string, FileReference[]>();

  for (const file of files) {
    if (!file.content) continue;
    const sourcePath = normalizePath(file.relativePath);

    if (sourcePath === "package.json") {
      for (const edge of extractPackageScriptEdges(file.content, byPath, packageResolvers, projectResolvers, turboTaskDeps, nxGraph)) {
        addGraphEdge(graph, sourcePath, edge.target, { sourcePath: edge.sourcePath, relation: "entrypoint" });
      }
      continue;
    }

    if (sourcePath.endsWith('/package.json') || sourcePath.endsWith('/project.json')) {
      continue;
    }

    if (/^\.github\/workflows\/.*\.(yml|yaml)$/i.test(sourcePath)) {
      for (const target of extractWorkflowTargets(file.content, sourcePath, byPath, aliasResolvers, packageResolvers)) {
        addGraphEdge(graph, sourcePath, target, { sourcePath, relation: "workflow-call" });
      }
      continue;
    }

    for (const target of extractReferencedTargets(file.content, sourcePath, byPath, aliasResolvers, packageResolvers)) {
      addGraphEdge(graph, sourcePath, target, { sourcePath, relation: "script-call" });
    }
  }

  for (const edges of graph.values()) {
    for (const edge of edges) {
      const queue: Array<{ target: string; depth: number }> = [{ target: edge.target, depth: 0 }];
      const seen = new Map<string, number>();
      while (queue.length > 0) {
        const currentItem = queue.shift();
        if (!currentItem) continue;
        const { target: current, depth } = currentItem;
        const seenDepth = seen.get(current);
        if (seenDepth !== undefined && seenDepth <= depth) continue;
        seen.set(current, depth);
        addReference(reverse, current, { sourcePath: edge.sourcePath, relation: edge.relation, depth });
        for (const next of graph.get(current) ?? []) {
          queue.push({ target: next.target, depth: depth + 1 });
        }
      }
    }
  }

  return { reverse };
}

export function enrichFindingWithRelations(finding: Finding, index: RelationIndex): Finding {
  const refs = index.reverse.get(normalizePath(finding.filePath)) ?? [];
  if (!refs.length) {
    return finding;
  }

  const orderedRefs = [...refs].sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99));
  const topRefs = orderedRefs.slice(0, 3);
  const relationLabels = topRefs.map((ref) => {
    const suffix = typeof ref.depth === "number" ? ` [d=${ref.depth}]` : "";
    return `${ref.relation}: ${ref.sourcePath}${suffix}`;
  });
  const entrypointRefs = orderedRefs.filter((ref) => ref.relation === "entrypoint" || ref.relation === "workflow-call");
  const entrypointLinked = entrypointRefs.length > 0;
  const prioritizedRefs = entrypointLinked ? entrypointRefs : orderedRefs;
  const minDepth = prioritizedRefs[0]?.depth ?? orderedRefs[0]?.depth ?? 0;
  const depthBonus = minDepth <= 0 ? 0.08 : minDepth === 1 ? 0.06 : minDepth === 2 ? 0.04 : 0.02;
  const scoreBonus = minDepth <= 0 ? 8 : minDepth === 1 ? 6 : minDepth === 2 ? 4 : 2;
  const uniqueEntrypoints = new Set(entrypointRefs.map((ref) => ref.sourcePath));
  const nearestDepth = orderedRefs[0]?.depth ?? 0;
  const nearestRefs = orderedRefs.filter((ref) => (ref.depth ?? 99) === nearestDepth);
  const relationFanout = new Set(nearestRefs.map((ref) => ref.sourcePath)).size;
  const pathStrength = Math.max(uniqueEntrypoints.size, relationFanout);
  const workflowLinked = orderedRefs.some((ref) => ref.relation === "workflow-call");
  const directWorkflowLinked = orderedRefs.some((ref) => ref.relation === "workflow-call" && (ref.depth ?? 99) <= 1);
  const rootScriptEntrypoints = new Set(entrypointRefs.filter((ref) => ref.sourcePath.startsWith("package.json#")).map((ref) => ref.sourcePath));
  const mixedEntrypointKinds = new Set(entrypointRefs.map((ref) => (ref.relation === "workflow-call" ? "workflow" : ref.sourcePath.startsWith("package.json#") ? "root-script" : "entrypoint")));
  const pathMultiplicityBonus = Math.min(0.06, Math.max(0, pathStrength - 1) * 0.03);
  const pathMultiplicityScore = Math.min(6, Math.max(0, pathStrength - 1) * 3);
  const ownershipBonus = (directWorkflowLinked ? 0.03 : workflowLinked ? 0.02 : 0) + Math.min(0.03, Math.max(0, mixedEntrypointKinds.size - 1) * 0.015);
  const ownershipScore = (directWorkflowLinked ? 3 : workflowLinked ? 2 : 0) + Math.min(3, Math.max(0, mixedEntrypointKinds.size - 1) * 2);
  const supportingPath = isSupportingPath(finding.filePath);
  const generatedPath = isGeneratedPath(finding.filePath);
  const primaryExecutionPath = !supportingPath && !generatedPath && minDepth <= 1 && !workflowLinked;
  const supportPenalty = supportingPath && !workflowLinked ? 0.04 : 0;
  const generatedPenalty = generatedPath && !workflowLinked ? 0.03 : 0;
  const generatedScorePenalty = generatedPath && !workflowLinked ? 3 : 0;
  const supportScorePenalty = supportingPath && !workflowLinked ? 4 : 0;
  const boostedConfidence = Math.min(
    0.98,
    Math.max(
      0.05,
      finding.confidence
        + (entrypointLinked ? depthBonus : Math.max(0.02, depthBonus - 0.02))
        + (entrypointLinked ? pathMultiplicityBonus : 0)
        + ownershipBonus
        - supportPenalty
        - generatedPenalty
    )
  );
  const boostedScore = Math.max(0, finding.scoreContribution + (entrypointLinked ? scoreBonus + pathMultiplicityScore + ownershipScore : Math.max(2, scoreBonus - 2)) - supportScorePenalty - generatedScorePenalty);

  return {
    ...finding,
    confidence: Number(boostedConfidence.toFixed(2)),
    scoreContribution: boostedScore,
    tags: [...new Set([...finding.tags, "reachable", ...(entrypointLinked ? ["entrypoint-linked"] : []), ...(workflowLinked ? ["workflow-linked"] : []), ...(primaryExecutionPath ? ["primary-execution-path"] : []), ...(supportingPath ? ["supporting-path"] : []), ...(generatedPath ? ["generated-path"] : []), ...(minDepth <= 0 ? ["directly-reachable"] : []), ...(pathStrength > 1 ? ["multi-entrypoint"] : []), ...(mixedEntrypointKinds.size > 1 ? ["mixed-entrypoints"] : []), ...(rootScriptEntrypoints.size > 1 ? ["multi-root-script"] : [])])],
    evidence: [
      ...finding.evidence,
      { kind: "path", label: entrypointLinked ? "Referenced by entrypoint" : "Referenced by", value: relationLabels.join(" | ") },
      ...(pathStrength > 1
        ? ([{ kind: "metadata", label: "Execution path strength", value: `${pathStrength} independent execution paths reference this file` }] as FindingEvidence[])
        : []),
      ...(workflowLinked
        ? ([{ kind: "metadata", label: "Execution ownership", value: directWorkflowLinked ? "Linked directly to a workflow execution path" : "Linked to a workflow-driven execution path" }] as FindingEvidence[])
        : []),
      ...(mixedEntrypointKinds.size > 1
        ? ([{ kind: "metadata", label: "Execution ownership", value: `Referenced by ${mixedEntrypointKinds.size} execution source types` }] as FindingEvidence[])
        : []),
      ...(primaryExecutionPath
        ? ([{ kind: "metadata", label: "Execution ownership", value: "Falls on a primary execution path" }] as FindingEvidence[])
        : []),
      ...(supportingPath
        ? ([{ kind: "metadata", label: "Execution ownership", value: "Located in a supporting path such as tests, fixtures, docs, or examples" }] as FindingEvidence[])
        : [])
    ]
  };
}

function extractPackageScriptEdges(
  content: string,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[],
  turboTaskDeps: Map<string, string[]>,
  nxGraph: NxGraph
) {
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const scriptNames = new Set(Object.keys(scripts));
    const deps = new Map<string, string[]>();
    const fileTargets = new Map<string, string[]>();

    for (const [name, command] of Object.entries(scripts)) {
      deps.set(name, extractScriptReferencesFromCommand(command, scriptNames));
      fileTargets.set(name, [
        ...extractTargetsFromCommand(command, `package.json#${name}`, byPath),
        ...extractWorkspaceScriptTargets(command, byPath, packageResolvers, projectResolvers),
        ...extractTaskRunnerTargets(command, byPath, packageResolvers, projectResolvers, turboTaskDeps, nxGraph)
      ]);
    }

    const resolveTargets = (name: string, stack = new Set<string>()) => {
      if (stack.has(name)) return [];
      stack.add(name);
      const targets = new Set(fileTargets.get(name) ?? []);
      for (const dep of deps.get(name) ?? []) {
        for (const target of resolveTargets(dep, new Set(stack))) {
          targets.add(target);
        }
      }
      return [...targets];
    };

    return Object.keys(scripts).flatMap((name) => resolveTargets(name).map((target) => ({ sourcePath: `package.json#${name}`, target })));
  } catch {
    return [];
  }
}

function extractWorkflowTargets(
  content: string,
  sourcePath: string,
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[]
) {
  const targets = new Set(extractReferencedTargets(content, sourcePath, byPath, aliasResolvers, packageResolvers));
  for (const match of content.matchAll(/^\s*uses:\s+(.+)$/gim)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw.startsWith("./")) continue;
    const normalized = normalizeTargetPath(raw, sourcePath, byPath, { allowDirectoryAction: true });
    if (normalized) targets.add(normalized);
  }
  return [...targets];
}

function extractReferencedTargets(
  content: string,
  sourcePath: string,
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[]
) {
  const commandTargets = content.split(/\r?\n/).flatMap((line) => extractTargetsFromCommand(line, sourcePath, byPath));
  const moduleTargets = extractModuleTargets(content, sourcePath, byPath, aliasResolvers, packageResolvers);
  return [...new Set([...commandTargets, ...moduleTargets])];
}

function extractModuleTargets(
  content: string,
  sourcePath: string,
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[]
) {
  const language = detectScriptLanguage(sourcePath, content);
  const targets = new Set<string>();

  if (language === "javascript") {
    const patterns = [
      /require\(\s*["']([^"']+)["']\s*\)/g,
      /from\s+["']([^"']+)["']/g,
      /import\(\s*["']([^"']+)["']\s*\)/g
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const normalized = resolveModuleTarget(match[1] ?? "", sourcePath, byPath, aliasResolvers, packageResolvers);
        if (normalized) targets.add(normalized);
      }
    }
  }

  if (language === "python") {
    for (const match of content.matchAll(/(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/g)) {
      const rawModule = (match[1] || match[2] || "").trim();
      if (!rawModule) continue;
      for (const candidate of buildPythonModuleCandidates(rawModule, sourcePath)) {
        const normalized = findExistingPath(candidate, byPath);
        if (normalized) {
          targets.add(normalized);
          break;
        }
      }
    }
  }

  return [...targets];
}

function buildPythonModuleCandidates(rawModule: string, sourcePath: string) {
  const sourceBase = normalizePath(sourcePath);
  const baseDir = path.posix.dirname(sourceBase);
  const sourceStem = path.posix.basename(sourceBase, path.posix.extname(sourceBase));
  const packageDir = sourceStem === "__init__" ? baseDir : baseDir;
  const results = new Set<string>();

  if (rawModule.startsWith(".")) {
    const leadingDots = rawModule.match(/^\.+/)?.[0].length ?? 0;
    const remainder = rawModule.slice(leadingDots).replaceAll(".", "/");
    let anchor = packageDir;
    for (let i = 1; i < leadingDots; i += 1) {
      anchor = path.posix.dirname(anchor);
    }
    results.add(remainder ? path.posix.join(anchor, remainder) : anchor);
  }

  if (!rawModule.startsWith(".")) {
    results.add(rawModule.replaceAll(".", "/"));
  }

  return [...results].flatMap((base) => [base, `${base}.py`, `${base}/__init__.py`]);
}

function extractScriptReferencesFromCommand(command: string, scriptNames: Set<string>) {
  const refs = new Set<string>();
  const patterns = [
    /\bnpm\s+run\s+([\w:-]+)/gi,
    /\bpnpm\s+(?:run\s+)?([\w:-]+)/gi,
    /\byarn\s+([\w:-]+)/gi,
    /\bbun\s+run\s+([\w:-]+)/gi
  ];

  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name && scriptNames.has(name)) refs.add(name);
    }
  }

  return [...refs];
}

function extractTargetsFromCommand(command: string, sourcePath: string, byPath: Map<string, FileRecord>) {
  const targets = new Set<string>();
  const patterns = [
    /(?:node|python|python3|bash|sh|pwsh|powershell|cmd(?:\.exe)?\s+\/c|Start-Process)\s+(?:-File\s+)?([.~\w\\/-]+(?:\.[\w-]+)?)/gi,
    /(?:^|\s)(\.\/?[\w./-]+(?:\.[\w-]+)?)(?=\s|$)/g,
    /\bsource\s+([.~\w\\/-]+(?:\.[\w-]+)?)/gi,
    /(?:^|\s)\.\s+([.~\w\\/-]+(?:\.[\w-]+)?)/g,
    /&\s+([.~\w\\/-]+(?:\.[\w-]+)?)/g,
    /chmod\s+\+x\s+([.~\w\\/-]+(?:\.[\w-]+)?)/gi,
    /cat\s+((?:[.~\w\\/-]+(?:\.[\w-]+)?\s+){1,5})/gi
  ];

  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      const raw = (match[1] || match[2] || "").trim();
      if (!raw) continue;
      if (/\s/.test(raw) && /^cat\s/i.test(match[0] || "")) {
        for (const part of raw.split(/\s+/)) {
          const normalizedPart = normalizeTargetPath(part, sourcePath, byPath);
          if (normalizedPart) targets.add(normalizedPart);
        }
        continue;
      }
      const normalized = normalizeTargetPath(raw, sourcePath, byPath);
      if (normalized) targets.add(normalized);
    }
  }

  return [...targets];
}

function resolveModuleTarget(
  rawTarget: string,
  sourcePath: string,
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[]
) {
  if (!rawTarget || /^https?:\/\//i.test(rawTarget) || rawTarget.startsWith("node:")) return undefined;
  if (rawTarget.startsWith(".") || rawTarget.startsWith("/")) {
    return normalizeTargetPath(rawTarget, sourcePath, byPath);
  }

  const packageTarget = resolvePackageModuleTarget(rawTarget, byPath, packageResolvers);
  if (packageTarget) return packageTarget;

  for (const resolver of getRelevantResolvers(sourcePath, aliasResolvers)) {
    for (const candidate of buildAliasCandidates(rawTarget, resolver)) {
      const normalized = findExistingPath(candidate, byPath);
      if (normalized) return normalized;
    }
  }

  return undefined;
}

function extractWorkspaceScriptTargets(
  command: string,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[]
) {
  const targets = new Set<string>();
  for (const ref of extractWorkspaceScriptRefs(command)) {
    for (const target of resolveWorkspaceScriptTargets(ref.selector, ref.scriptName, byPath, packageResolvers, projectResolvers)) {
      targets.add(target);
    }
  }
  return [...targets];
}

function extractWorkspaceScriptRefs(command: string) {
  const refs: Array<{ selector: string; scriptName: string }> = [];
  const patterns = [
    /npm\s+(?:run\s+)?([\w:-]+)\s+--workspace\s+([@\w./-]+)/gi,
    /npm\s+--workspace\s+([@\w./-]+)\s+run\s+([\w:-]+)/gi,
    /pnpm\s+(?:--filter|-F)\s+([@\w./-]+)\s+run\s+([\w:-]+)/gi,
    /yarn\s+workspace\s+([@\w./-]+)\s+([\w:-]+)/gi
  ];

  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      if (pattern === patterns[0]) {
        refs.push({ selector: match[2] ?? "", scriptName: match[1] ?? "" });
      } else {
        refs.push({ selector: match[1] ?? "", scriptName: match[2] ?? "" });
      }
    }
  }

  return refs.filter((ref) => ref.selector && ref.scriptName);
}

function resolveWorkspaceScriptTargets(
  selector: string,
  scriptName: string,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[]
) {
  const normalizedSelector = normalizeTaskSelector(selector) ?? selector;
  const targets = new Set<string>();

  for (const resolver of findWorkspaceResolvers(normalizedSelector, packageResolvers, projectResolvers)) {
    if ("scripts" in resolver) {
      for (const target of resolvePackageScriptTargets(resolver, scriptName, byPath)) {
        targets.add(target);
      }
    } else {
      for (const target of resolveProjectTargetEntries(resolver, scriptName)) {
        targets.add(target);
      }
    }
  }

  return [...targets];
}

function findWorkspaceResolvers(selector: string, packageResolvers: PackageResolver[], projectResolvers: ProjectResolver[]) {
  const matchesPackage = packageResolvers.filter((resolver) => matchesWorkspaceSelector(selector, resolver.packageName, resolver.directory));
  const matchesProject = projectResolvers.filter((resolver) => matchesWorkspaceSelector(selector, resolver.projectName, resolver.directory));
  return [...matchesPackage, ...matchesProject];
}

function matchesWorkspaceSelector(selector: string, name: string, directory: string) {
  const baseName = path.posix.basename(directory);
  return name === selector || baseName === selector || directory === selector || directory.endsWith(`/${selector}`);
}

function resolvePackageScriptTargets(resolver: PackageResolver, scriptName: string, byPath: Map<string, FileRecord>) {
  if (!resolver.scripts[scriptName]) {
    return resolver.entryTargets;
  }

  const scriptNames = new Set(Object.keys(resolver.scripts));
  const deps = new Map<string, string[]>();
  const fileTargets = new Map<string, string[]>();

  for (const [name, command] of Object.entries(resolver.scripts)) {
    deps.set(name, extractScriptReferencesFromCommand(command, scriptNames));
    fileTargets.set(name, extractTargetsFromCommand(command, `${resolver.packageJsonPath}#${name}`, byPath));
  }

  const resolveTargets = (name: string, stack = new Set<string>()) => {
    if (stack.has(name)) return [];
    stack.add(name);
    const targets = new Set(fileTargets.get(name) ?? []);
    for (const dep of deps.get(name) ?? []) {
      for (const target of resolveTargets(dep, new Set(stack))) {
        targets.add(target);
      }
    }
    return [...targets];
  };

  const resolved = resolveTargets(scriptName);
  return resolved.length ? resolved : resolver.entryTargets;
}

function extractTaskRunnerTargets(
  command: string,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[],
  turboTaskDeps: Map<string, string[]>,
  nxGraph: NxGraph
) {
  const targets = new Set<string>();
  for (const ref of extractTaskRunnerRefs(command)) {
    for (const target of resolveTaskRunnerTargets(ref, byPath, packageResolvers, projectResolvers, turboTaskDeps, nxGraph)) {
      targets.add(target);
    }
  }
  return [...targets];
}

function extractTaskRunnerRefs(command: string) {
  const refs: TaskRunnerRef[] = [];

  for (const match of command.matchAll(/\bturbo\s+run\s+([\w:-]+)/gi)) {
    const scriptName = match[1] ?? "";
    const full = match[0] ?? "";
    const start = (match.index ?? 0) + full.length;
    const tail = command.slice(start, Math.min(command.length, start + 160));
    const filterMatch = tail.match(/--filter(?:=|\s+)([@\w./*-]+)/i);
    refs.push({ kind: "turbo", scriptName, selector: normalizeTaskSelector(filterMatch?.[1]) });
  }

  for (const match of command.matchAll(/\bnx\s+run\s+([@\w./-]+):([\w:-]+)/gi)) {
    refs.push({ kind: "nx", selector: normalizeTaskSelector(match[1]), scriptName: match[2] ?? "" });
  }

  for (const match of command.matchAll(/\bmoon\s+run\s+([@\w./-]+):([\w:-]+)/gi)) {
    refs.push({ kind: "moon", selector: normalizeTaskSelector(match[1]), scriptName: match[2] ?? "" });
  }

  return refs.filter((ref) => ref.scriptName);
}

function normalizeTaskSelector(value?: string) {
  if (!value) return undefined;
  return value.replace(/^\.\//, "").replace(/\*+$/g, "").trim() || undefined;
}

function resolveTaskRunnerTargets(
  ref: TaskRunnerRef,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[],
  turboTaskDeps: Map<string, string[]>,
  nxGraph: NxGraph
) {
  const taskNames = expandTaskRunnerScriptNames(ref.kind, ref.scriptName, turboTaskDeps, nxGraph);
  const targets = new Set<string>();

  if (ref.selector) {
    if (ref.kind === "nx") {
      for (const scriptName of taskNames) {
        for (const target of resolveNxProjectTargets(ref.selector, scriptName, byPath, packageResolvers, projectResolvers, nxGraph)) {
          targets.add(target);
        }
      }
      return [...targets];
    }

    for (const scriptName of taskNames) {
      for (const target of resolveWorkspaceScriptTargets(ref.selector, scriptName, byPath, packageResolvers, projectResolvers)) {
        targets.add(target);
      }
    }
    return [...targets];
  }

  for (const scriptName of taskNames) {
    for (const resolver of packageResolvers) {
      for (const target of resolvePackageScriptTargets(resolver, scriptName, byPath)) {
        targets.add(target);
      }
    }
    for (const resolver of projectResolvers) {
      for (const target of resolveProjectTargetEntries(resolver, scriptName)) {
        targets.add(target);
      }
    }
  }

  return [...targets];
}

function expandTaskRunnerScriptNames(
  kind: TaskRunnerKind,
  scriptName: string,
  turboTaskDeps: Map<string, string[]>,
  nxGraph: NxGraph
) {
  if (kind === "turbo") {
    const names = new Set<string>();
    const queue = [scriptName];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || names.has(current)) continue;
      names.add(current);
      for (const dep of turboTaskDeps.get(current) ?? []) {
        queue.push(dep);
      }
    }
    return [...names];
  }

  if (kind === "nx") {
    const names = new Set<string>();
    const queue = [scriptName];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || names.has(current)) continue;
      names.add(current);
      for (const dep of nxGraph.targetDepTasks.get(current) ?? []) {
        queue.push(dep);
      }
    }
    return [...names];
  }

  return [scriptName];
}

function resolveNxProjectTargets(
  selector: string,
  scriptName: string,
  byPath: Map<string, FileRecord>,
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[],
  nxGraph: NxGraph
) {
  const targets = new Set<string>();
  const queue = [normalizeTaskSelector(selector) ?? selector];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const currentSelector = queue.shift();
    if (!currentSelector || seen.has(currentSelector)) continue;
    seen.add(currentSelector);

    for (const resolver of findWorkspaceResolvers(currentSelector, packageResolvers, projectResolvers)) {
      if ("scripts" in resolver) {
        for (const target of resolvePackageScriptTargets(resolver, scriptName, byPath)) {
          targets.add(target);
        }
      } else {
        for (const target of resolveProjectTargetEntries(resolver, scriptName)) {
          targets.add(target);
        }
        for (const dep of [...(nxGraph.projectDeps.get(resolver.projectName) ?? []), ...(nxGraph.workspaceDeps.get(resolver.projectName) ?? [])]) {
          queue.push(dep);
        }
      }
    }
  }

  return [...targets];
}

function buildWorkspaceMatcher(files: FileRecord[]): WorkspaceMatcher | undefined {
  const rootPackage = files.find((file) => normalizePath(file.relativePath) === "package.json" && file.content);
  const patterns = new Set<string>();

  if (rootPackage?.content) {
    const parsed = parseJson(rootPackage.content) as { workspaces?: unknown } | undefined;
    const workspaces = parsed?.workspaces;
    if (Array.isArray(workspaces)) {
      for (const value of workspaces) {
        if (typeof value === "string" && value.trim()) patterns.add(normalizeWorkspacePattern(value));
      }
    } else if (workspaces && typeof workspaces === "object" && Array.isArray((workspaces as { packages?: unknown }).packages)) {
      for (const value of (workspaces as { packages?: unknown[] }).packages ?? []) {
        if (typeof value === "string" && value.trim()) patterns.add(normalizeWorkspacePattern(value));
      }
    }
  }

  const pnpmWorkspace = files.find((file) => normalizePath(file.relativePath) === "pnpm-workspace.yaml" && file.content);
  if (pnpmWorkspace?.content) {
    for (const pattern of parsePnpmWorkspacePackages(pnpmWorkspace.content)) {
      patterns.add(normalizeWorkspacePattern(pattern));
    }
  }

  if (!patterns.size) return undefined;
  return { patterns: [...patterns] };
}

function parsePnpmWorkspacePackages(content: string) {
  const patterns: string[] = [];
  let inPackages = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^packages\s*:\s*$/i.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^[-]\s*["']?([^"']+)["']?$/);
      if (match?.[1]) {
        patterns.push(match[1]);
        continue;
      }
      if (!line.startsWith("-")) {
        inPackages = false;
      }
    }
  }
  return patterns;
}

function normalizeWorkspacePattern(value: string) {
  return normalizePath(value.trim()).replace(/\/\*\*$/g, "/*").replace(/\/$/, "");
}

function matchesWorkspace(directory: string, matcher?: WorkspaceMatcher) {
  if (!matcher) return true;
  return matcher.patterns.some((pattern) => matchWorkspacePattern(directory, pattern));
}

function matchWorkspacePattern(directory: string, pattern: string) {
  if (!pattern.includes("*")) {
    return directory === pattern || directory.startsWith(`${pattern}/`);
  }

  const regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, "[^/]+")}(?:/.*)?$`);
  return regex.test(directory);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPackageResolvers(files: FileRecord[], byPath: Map<string, FileRecord>, workspaceMatcher?: WorkspaceMatcher) {
  const resolvers: PackageResolver[] = [];
  for (const file of files) {
    const relativePath = normalizePath(file.relativePath);
    if (!file.content || path.posix.basename(relativePath) !== "package.json") continue;

    const directory = path.posix.dirname(relativePath);
    if (relativePath !== "package.json" && !matchesWorkspace(directory, workspaceMatcher)) {
      continue;
    }

    const parsed = parseJson(file.content) as {
      name?: unknown;
      main?: unknown;
      module?: unknown;
      exports?: unknown;
    } | undefined;
    if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) continue;

    const entryTargets = new Set<string>();
    for (const rawEntry of [parsed.main, parsed.module]) {
      if (typeof rawEntry === "string") {
        const target = findExistingPath(path.posix.join(directory, rawEntry), byPath);
        if (target) entryTargets.add(target);
      }
    }

    const exportTargets = new Map<string, string[]>();
    for (const [subpath, targets] of collectPackageExports(parsed.exports)) {
      const resolvedTargets = targets
        .map((value) => findExistingPath(path.posix.join(directory, value), byPath))
        .filter((value): value is string => Boolean(value));
      if (!resolvedTargets.length) continue;
      exportTargets.set(subpath, resolvedTargets);
      if (subpath === ".") {
        for (const resolved of resolvedTargets) entryTargets.add(resolved);
      }
    }

    if (!entryTargets.size) {
      const fallback = findExistingPath(path.posix.join(directory, "index"), byPath);
      if (fallback) entryTargets.add(fallback);
    }

    resolvers.push({
      packageName: parsed.name.trim(),
      directory,
      packageJsonPath: relativePath,
      entryTargets: [...entryTargets],
      exportTargets,
      scripts:
        typeof (parsed as { scripts?: unknown }).scripts === "object" && (parsed as { scripts?: unknown }).scripts
          ? Object.fromEntries(
              Object.entries((parsed as { scripts?: Record<string, unknown> }).scripts ?? {}).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {}
    });
  }

  return resolvers.sort((a, b) => b.packageName.length - a.packageName.length);
}

function buildTurboTaskDependencies(files: FileRecord[]) {
  const turboFile = files.find((file) => normalizePath(file.relativePath) === "turbo.json" && file.content);
  const deps = new Map<string, string[]>();
  if (!turboFile?.content) return deps;

  const parsed = parseJson(turboFile.content) as { pipeline?: Record<string, unknown>; tasks?: Record<string, unknown> } | undefined;
  const tasks = parsed?.tasks && typeof parsed.tasks === "object" ? parsed.tasks : parsed?.pipeline && typeof parsed.pipeline === "object" ? parsed.pipeline : undefined;
  if (!tasks) return deps;

  for (const [taskName, config] of Object.entries(tasks)) {
    if (!config || typeof config !== "object") continue;
    const rawDepends = Array.isArray((config as { dependsOn?: unknown }).dependsOn) ? (config as { dependsOn: unknown[] }).dependsOn : [];
    const normalized = rawDepends
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.replace(/^\^/, "").trim())
      .filter((value) => value && !value.includes("#"));
    if (normalized.length) deps.set(taskName, normalized);
  }

  return deps;
}

function buildNxGraph(
  files: FileRecord[],
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[]
): NxGraph {
  const projectDeps = new Map<string, string[]>();
  const targetDepTasks = new Map<string, string[]>();
  const nxFile = files.find((file) => normalizePath(file.relativePath) === "nx.json" && file.content);

  if (nxFile?.content) {
    const parsed = parseJson(nxFile.content) as {
      targetDefaults?: Record<string, { dependsOn?: unknown }>;
      projects?: Record<string, { tags?: unknown; implicitDependencies?: unknown }>;
    } | undefined;

    for (const [targetName, config] of Object.entries(parsed?.targetDefaults ?? {})) {
      const dependsOn = Array.isArray(config?.dependsOn) ? config.dependsOn : [];
      const normalized = dependsOn
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0 && value.startsWith("^"))
        .map((value) => value.replace(/^\^/, "").trim())
        .filter(Boolean);
      if (normalized.length) targetDepTasks.set(targetName, normalized);
    }

    for (const [projectName, projectConfig] of Object.entries(parsed?.projects ?? {})) {
      const deps = Array.isArray(projectConfig?.implicitDependencies) ? projectConfig.implicitDependencies : [];
      const normalized = deps.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
      if (normalized.length) projectDeps.set(projectName, normalized);
    }
  }

  for (const resolver of projectResolvers) {
    const projectFile = files.find((file) => normalizePath(file.relativePath) === resolver.projectJsonPath && file.content);
    if (!projectFile?.content) continue;
    const parsed = parseJson(projectFile.content) as { implicitDependencies?: unknown } | undefined;
    const deps = Array.isArray(parsed?.implicitDependencies) ? parsed.implicitDependencies : [];
    const normalized = deps.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
    if (normalized.length) {
      projectDeps.set(resolver.projectName, [...new Set([...(projectDeps.get(resolver.projectName) ?? []), ...normalized])]);
    }
  }

  return {
    projectDeps,
    targetDepTasks,
    workspaceDeps: buildWorkspaceDependencyGraph(files, byPath, aliasResolvers, packageResolvers, projectResolvers)
  };
}

function buildWorkspaceDependencyGraph(
  files: FileRecord[],
  byPath: Map<string, FileRecord>,
  aliasResolvers: AliasResolver[],
  packageResolvers: PackageResolver[],
  projectResolvers: ProjectResolver[]
) {
  const deps = new Map<string, Set<string>>();
  const owners = [...packageResolvers.map((resolver) => ({ name: resolver.packageName, directory: resolver.directory })), ...projectResolvers.map((resolver) => ({ name: resolver.projectName, directory: resolver.directory }))]
    .sort((a, b) => b.directory.length - a.directory.length);

  for (const file of files) {
    if (!file.content) continue;
    const sourcePath = normalizePath(file.relativePath);
    if (sourcePath.endsWith('/package.json') || sourcePath.endsWith('/project.json')) continue;
    const sourceOwner = findWorkspaceOwner(sourcePath, owners);
    if (!sourceOwner) continue;

    for (const target of extractReferencedTargets(file.content, sourcePath, byPath, aliasResolvers, packageResolvers)) {
      const targetOwner = findWorkspaceOwner(target, owners);
      if (!targetOwner || targetOwner === sourceOwner) continue;
      const bucket = deps.get(sourceOwner) ?? new Set();
      bucket.add(targetOwner);
      deps.set(sourceOwner, bucket);
    }
  }

  return new Map([...deps.entries()].map(([key, value]) => [key, [...value]]));
}

function findWorkspaceOwner(filePath: string, owners: Array<{ name: string; directory: string }>) {
  const normalized = normalizePath(filePath).split('#')[0] ?? normalizePath(filePath);
  return owners.find((owner) => normalized === owner.directory || normalized.startsWith(owner.directory + '/'))?.name;
}

function buildProjectResolvers(files: FileRecord[], byPath: Map<string, FileRecord>, workspaceMatcher?: WorkspaceMatcher) {
  const resolvers: ProjectResolver[] = [];
  for (const file of files) {
    const relativePath = normalizePath(file.relativePath);
    if (!file.content || path.posix.basename(relativePath) !== "project.json") continue;

    const directory = path.posix.dirname(relativePath);
    if (!matchesWorkspace(directory, workspaceMatcher)) continue;

    const parsed = parseJson(file.content) as { name?: unknown; targets?: Record<string, unknown> } | undefined;
    if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) continue;

    const targetEntries = new Map<string, string[]>();
    for (const [targetName, targetConfig] of Object.entries(parsed.targets ?? {})) {
      if (!targetConfig || typeof targetConfig !== "object") continue;
      const options = (targetConfig as { options?: unknown }).options;
      const candidateTargets = new Set<string>();
      if (options && typeof options === "object") {
        for (const rawEntry of [
          (options as { main?: unknown }).main,
          (options as { script?: unknown }).script,
          (options as { entry?: unknown }).entry,
          (options as { outputFileName?: unknown }).outputFileName
        ]) {
          if (typeof rawEntry === "string") {
            const resolved = findExistingPath(path.posix.join(directory, rawEntry), byPath);
            if (resolved) candidateTargets.add(resolved);
          }
        }
      }
      if (candidateTargets.size) targetEntries.set(targetName, [...candidateTargets]);
    }

    if (!targetEntries.size) continue;
    resolvers.push({ projectName: parsed.name.trim(), directory, projectJsonPath: relativePath, targetEntries });
  }

  return resolvers.sort((a, b) => b.projectName.length - a.projectName.length);
}

function resolveProjectTargetEntries(resolver: ProjectResolver, scriptName: string) {
  return resolver.targetEntries.get(scriptName) ?? [];
}

function collectPackageExports(value: unknown, currentKey = ".") {
  const entries: Array<[string, string[]]> = [];
  if (typeof value === "string") {
    entries.push([currentKey, [value]]);
    return entries;
  }

  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string");
    if (values.length) entries.push([currentKey, values]);
    return entries;
  }

  if (!value || typeof value !== "object") {
    return entries;
  }

  const record = value as Record<string, unknown>;
  const subpathKeys = Object.keys(record).filter((key) => key === "." || key.startsWith("./"));
  if (subpathKeys.length > 0) {
    for (const key of subpathKeys) {
      entries.push(...collectPackageExports(record[key], key === "." ? "." : key));
    }
    return entries;
  }

  for (const nested of Object.values(record)) {
    entries.push(...collectPackageExports(nested, currentKey));
  }

  return entries;
}

function resolvePackageModuleTarget(rawTarget: string, byPath: Map<string, FileRecord>, packageResolvers: PackageResolver[]) {
  const resolver = packageResolvers.find((item) => rawTarget === item.packageName || rawTarget.startsWith(`${item.packageName}/`));
  if (!resolver) return undefined;

  if (rawTarget === resolver.packageName) {
    return resolver.entryTargets[0];
  }

  const subpath = rawTarget.slice(resolver.packageName.length + 1);
  const exportKey = `./${subpath}`;
  const exported = resolver.exportTargets.get(exportKey);
  if (exported?.length) {
    return exported[0];
  }

  return findExistingPath(path.posix.join(resolver.directory, subpath), byPath);
}

function buildAliasResolvers(files: FileRecord[]) {
  const resolvers: AliasResolver[] = [];
  for (const file of files) {
    const relativePath = normalizePath(file.relativePath);
    if (!file.content || !/(^|\/)(tsconfig(?:\.[^/]+)?\.json|jsconfig(?:\.[^/]+)?\.json)$/i.test(relativePath)) {
      continue;
    }

    const parsed = parseJson(file.content) as { compilerOptions?: { paths?: unknown; baseUrl?: unknown } } | undefined;
    if (!parsed) continue;

    const compilerOptions = parsed.compilerOptions && typeof parsed.compilerOptions === "object" ? parsed.compilerOptions : {};
    const paths = normalizeAliasPaths(compilerOptions.paths);
    const rawBaseUrl = compilerOptions.baseUrl;
    const baseUrl =
      typeof rawBaseUrl === "string" && rawBaseUrl.trim().length > 0
        ? path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), rawBaseUrl.trim()))
        : undefined;

    if (!paths.length && !baseUrl) continue;

    resolvers.push({
      configPath: relativePath,
      directory: path.posix.dirname(relativePath),
      baseUrl,
      paths
    });
  }

  return resolvers.sort((a, b) => b.directory.length - a.directory.length);
}

function normalizeAliasPaths(value: unknown): AliasPathRule[] {
  if (!value || typeof value !== "object") return [];
  const rules: AliasPathRule[] = [];
  for (const [pattern, targets] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(targets)) continue;
    const starIndex = pattern.indexOf("*");
    const prefix = starIndex >= 0 ? pattern.slice(0, starIndex) : pattern;
    const suffix = starIndex >= 0 ? pattern.slice(starIndex + 1) : "";
    const normalizedTargets = targets.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (!normalizedTargets.length) continue;
    rules.push({ pattern, prefix, suffix, targets: normalizedTargets });
  }
  return rules;
}

function buildAliasCandidates(rawTarget: string, resolver: AliasResolver) {
  const candidates = new Set<string>();

  for (const rule of resolver.paths) {
    const capture = matchAliasPattern(rawTarget, rule);
    if (capture === undefined) continue;
    for (const target of rule.targets) {
      const replaced = target.includes("*") ? target.replaceAll("*", capture) : target;
      candidates.add(path.posix.normalize(path.posix.join(resolver.directory, replaced)));
    }
  }

  if (resolver.baseUrl) {
    candidates.add(path.posix.normalize(path.posix.join(resolver.baseUrl, rawTarget)));
  }

  return [...candidates];
}

function matchAliasPattern(value: string, rule: AliasPathRule) {
  if (!value.startsWith(rule.prefix) || !value.endsWith(rule.suffix)) return undefined;
  const middle = value.slice(rule.prefix.length, value.length - rule.suffix.length || undefined);
  if (!rule.pattern.includes("*")) {
    return middle.length === 0 ? "" : undefined;
  }
  return middle;
}

function getRelevantResolvers(sourcePath: string, resolvers: AliasResolver[]) {
  const normalized = normalizePath(sourcePath).split("#")[0] ?? normalizePath(sourcePath);
  const sourceDir = path.posix.dirname(normalized);
  const relevant = resolvers.filter((resolver) => sourceDir === resolver.directory || sourceDir.startsWith(`${resolver.directory}/`));
  return relevant.length ? relevant : resolvers;
}

function normalizeTargetPath(
  rawTarget: string,
  sourcePath: string,
  byPath: Map<string, FileRecord>,
  options?: { allowDirectoryAction?: boolean }
) {
  if (!rawTarget || /^https?:\/\//i.test(rawTarget) || rawTarget.startsWith("$") || rawTarget.startsWith("@")) return undefined;
  const cleaned = rawTarget.replace(/^['"]|['"]$/g, "").replaceAll("\\", "/");
  const sourceBase = normalizePath(sourcePath).split("#")[0] ?? normalizePath(sourcePath);
  const baseDir = path.posix.dirname(sourceBase);
  const direct = cleaned.replace(/^\.\//, "");
  const joined = path.posix.normalize(path.posix.join(baseDir, cleaned));
  const candidates = new Set<string>([direct, joined]);

  if (options?.allowDirectoryAction) {
    for (const candidate of [...candidates]) {
      candidates.add(path.posix.join(candidate, "action.yml"));
      candidates.add(path.posix.join(candidate, "action.yaml"));
    }
  }

  for (const candidate of candidates) {
    const existing = findExistingPath(candidate, byPath);
    if (existing) return existing;
  }

  return undefined;
}

function findExistingPath(candidate: string, byPath: Map<string, FileRecord>) {
  const normalized = path.posix.normalize(candidate.replaceAll("\\", "/"));
  const extensions = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".py", ".ps1", ".sh", ".bash"];
  const candidates = new Set<string>([normalized]);
  for (const ext of extensions) {
    if (ext) candidates.add(`${normalized}${ext}`);
  }
  candidates.add(path.posix.join(normalized, "index.js"));
  candidates.add(path.posix.join(normalized, "index.ts"));
  candidates.add(path.posix.join(normalized, "index.tsx"));
  candidates.add(path.posix.join(normalized, "index.jsx"));
  candidates.add(path.posix.join(normalized, "__init__.py"));
  candidates.add(path.posix.join(normalized, "action.yml"));
  candidates.add(path.posix.join(normalized, "action.yaml"));

  for (const value of candidates) {
    if (byPath.has(value)) return value;
  }

  return undefined;
}

function parseJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

function normalizePath(value: string) {
  return value.replaceAll("\\", "/");
}

function addGraphEdge(graph: Map<string, GraphEdge[]>, source: string, target: string, edge: FileReference) {
  const list = graph.get(source) ?? [];
  if (!list.some((item) => item.target === target && item.sourcePath === edge.sourcePath && item.relation === edge.relation)) {
    list.push({ ...edge, target });
    graph.set(source, list);
  }
}

function addReference(reverse: Map<string, FileReference[]>, target: string, reference: FileReference) {
  const list = reverse.get(target) ?? [];
  if (!list.some((item) => item.sourcePath === reference.sourcePath && item.relation === reference.relation)) {
    list.push(reference);
    reverse.set(target, list);
  }
}


function isSupportingPath(filePath: string) {
  const normalized = normalizePath(filePath).toLowerCase();
  return /(^|\/)(test|tests|__tests__|spec|specs|fixture|fixtures|example|examples|sample|samples|demo|demos|docs|doc|mock|mocks)(\/|$)/.test(normalized);
}


function isGeneratedPath(filePath: string) {
  const normalized = normalizePath(filePath).toLowerCase();
  return /(^|\/)(dist|build|out|vendor|cache|\.cache|generated|gen|minified|coverage|tmp|temp)(\/|$)/.test(normalized);
}



