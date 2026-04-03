import fs from "node:fs/promises";
import path from "node:path";
import type { RepositoryFetchMode } from "../../../../shared/src/index.js";
import type { FileRecord } from "../../utils/file-system.js";
import { ensureDirectory } from "../../utils/file-system.js";
import { runCommand } from "../../utils/process.js";

interface RepositoryFetchOptions {
  timeoutMs?: number;
  onOutput?: (message: string, stream: "stdout" | "stderr") => void;
  signal?: AbortSignal;
  preferredMode?: RepositoryFetchMode;
}

interface PreparedRepository {
  repoPath: string;
  repoName: string;
  workspacePath: string;
  mode: RepositoryFetchMode;
}

interface PreparedRemoteRepository {
  repoName: string;
  mode: "remote";
  files: FileRecord[];
  resolvedBranch: string;
}

interface UploadedArchiveInput {
  archivePath: string;
  originalName: string;
  repoName?: string;
}

interface SnapshotPlan {
  repoName: string;
  archiveUrl: string;
  archiveKind: "zip";
}

export class GitService {
  public constructor(private readonly tempDir: string, private readonly githubToken?: string) {}

  public async prepareRepository(repoUrl: string, branch?: string, options?: RepositoryFetchOptions): Promise<PreparedRepository> {
    const preferredMode = options?.preferredMode ?? "clone";
    if (preferredMode === "snapshot") {
      try {
        return await this.fetchRepositorySnapshot(repoUrl, branch, options);
      } catch (error) {
        options?.onOutput?.(`snapshot mode unavailable, falling back to clone: ${compactOutput(error instanceof Error ? error.message : String(error))}`, "stderr");
      }
    }

    return this.cloneRepository(repoUrl, branch, options);
  }

  public async cloneRepository(repoUrl: string, branch?: string, options?: RepositoryFetchOptions): Promise<PreparedRepository> {
    await ensureDirectory(this.tempDir);
    const targetDir = await fs.mkdtemp(path.join(this.tempDir, "scan-"));
    const args = ["clone", "--depth", "1"];

    if (branch) {
      args.push("--branch", branch);
    }

    args.push(repoUrl, targetDir);
    const result = await runCommand("git", args, {
      cwd: this.tempDir,
      timeoutMs: options?.timeoutMs,
      onStdout: (chunk) => options?.onOutput?.(chunk, "stdout"),
      onStderr: (chunk) => options?.onOutput?.(chunk, "stderr"),
      signal: options?.signal
    });
    if (result.timedOut) {
      throw new Error(`Clone timed out after ${options?.timeoutMs ?? 0} ms. ${compactOutput(result.stderr || result.stdout)}`);
    }
    if (result.code !== 0) {
      throw new Error(`Failed to clone repository: ${compactOutput(result.stderr || result.stdout || "unknown git error")}`);
    }

    return {
      repoPath: targetDir,
      repoName: inferRepoName(repoUrl),
      workspacePath: targetDir,
      mode: "clone"
    };
  }

  public async fetchRepositorySnapshot(repoUrl: string, branch?: string, options?: RepositoryFetchOptions): Promise<PreparedRepository> {
    const plan = buildSnapshotPlan(repoUrl, branch);
    if (!plan) {
      throw new Error("Snapshot mode is currently supported for GitHub URLs and for GitLab URLs when a branch is provided.");
    }

    await ensureDirectory(this.tempDir);
    const workspaceDir = await fs.mkdtemp(path.join(this.tempDir, "snapshot-"));
    const archivePath = path.join(workspaceDir, `repository.${plan.archiveKind}`);
    const extractRoot = path.join(workspaceDir, "extract");
    await ensureDirectory(extractRoot);

    const response = await fetchWithTimeout(plan.archiveUrl, options?.timeoutMs ?? 180000, options?.signal);
    if (!response.ok) {
      throw new Error(`Snapshot download failed with status ${response.status}`);
    }

    options?.onOutput?.(`downloading snapshot archive from ${new URL(plan.archiveUrl).host}`, "stdout");
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(archivePath, buffer);
    options?.onOutput?.(`downloaded ${formatBytes(buffer.byteLength)} snapshot archive`, "stdout");

    await extractArchive(archivePath, extractRoot, options);
    const repoPath = await resolveExtractedRepositoryPath(extractRoot);

    return {
      repoPath,
      repoName: plan.repoName,
      workspacePath: workspaceDir,
      mode: "snapshot"
    };
  }

  public async prepareUploadedArchive(input: UploadedArchiveInput, options?: RepositoryFetchOptions): Promise<PreparedRepository> {
    await ensureDirectory(this.tempDir);
    const workspaceDir = await fs.mkdtemp(path.join(this.tempDir, "upload-"));
    const extractRoot = path.join(workspaceDir, "extract");
    await ensureDirectory(extractRoot);

    options?.onOutput?.(`extracting uploaded archive ${input.originalName}`, "stdout");
    await extractArchive(input.archivePath, extractRoot, options);
    const repoPath = await resolveExtractedRepositoryPath(extractRoot);

    return {
      repoPath,
      repoName: sanitizeFileName(input.repoName || input.originalName.replace(/\.zip$/i, "")) || "uploaded-project",
      workspacePath: workspaceDir,
      mode: "upload"
    };
  }

  public async fetchRemoteRepository(repoUrl: string, branch?: string, options?: RepositoryFetchOptions): Promise<PreparedRemoteRepository> {
    const target = parseGithubRepository(repoUrl);
    if (!target) {
      throw new Error("Remote mode currently supports public GitHub repositories only.");
    }

    const resolvedBranch = branch || await this.fetchGithubDefaultBranch(target.owner, target.repo, options);
    const tree = await this.fetchGithubTree(target.owner, target.repo, resolvedBranch, options);
    const files = await this.fetchGithubFiles(target.owner, target.repo, resolvedBranch, tree, options);

    return {
      repoName: target.repo,
      mode: "remote",
      files,
      resolvedBranch
    };
  }

  private async fetchGithubDefaultBranch(owner: string, repo: string, options?: RepositoryFetchOptions) {
    options?.onOutput?.("resolving default branch from GitHub API", "stdout");
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, options?.timeoutMs ?? 180000, options?.signal, buildGitHubHeaders(this.githubToken));
    if (!response.ok) {
      throw new Error(formatGitHubApiError("Could not resolve default branch from GitHub", response.status, this.githubToken));
    }

    const payload = (await response.json()) as { default_branch?: string };
    if (!payload.default_branch) {
      throw new Error("GitHub did not return a default branch for this repository.");
    }

    return payload.default_branch;
  }

  private async fetchGithubTree(owner: string, repo: string, branch: string, options?: RepositoryFetchOptions) {
    options?.onOutput?.(`loading remote tree for ${owner}/${repo}@${branch}`, "stdout");
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, options?.timeoutMs ?? 180000, options?.signal, buildGitHubHeaders(this.githubToken));
    if (!response.ok) {
      throw new Error(formatGitHubApiError("Could not read repository tree from GitHub", response.status, this.githubToken));
    }

    const payload = (await response.json()) as { tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }> };
    if (!Array.isArray(payload.tree)) {
      throw new Error("GitHub did not return a readable tree for this repository.");
    }

    return payload.tree.filter((entry): entry is { path: string; type: string; size?: number; sha?: string } => Boolean(entry.path && entry.type === "blob"));
  }

  private async fetchGithubFiles(
    owner: string,
    repo: string,
    branch: string,
    tree: Array<{ path: string; type: string; size?: number; sha?: string }>,
    options?: RepositoryFetchOptions
  ): Promise<FileRecord[]> {
    const files: FileRecord[] = [];
    const candidates = tree.filter((entry) => !entry.path.startsWith(".git/") && !entry.path.includes("/node_modules/"));
    let textReads = 0;

    for (const entry of candidates) {
      const extension = path.extname(entry.path).toLowerCase();
      const size = entry.size ?? 0;
      const shouldRead = (REMOTE_TEXT_EXTENSIONS.has(extension) || /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i.test(entry.path)) && size <= 1_500_000;
      let content: string | undefined;

      if (shouldRead && entry.sha) {
        content = await this.fetchGithubBlob(owner, repo, entry.sha, options);
        textReads += 1;
        if (textReads % 100 === 0) {
          options?.onOutput?.(`loaded ${textReads} remote text files`, "stdout");
        }
      }

      files.push({
        relativePath: entry.path,
        absolutePath: `remote://${owner}/${repo}/${branch}/${entry.path}`,
        extension,
        content,
        size
      });
    }

    options?.onOutput?.(`prepared ${files.length} remote files in memory`, "stdout");
    return files;
  }

  private async fetchGithubBlob(owner: string, repo: string, sha: string, options?: RepositoryFetchOptions) {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`, options?.timeoutMs ?? 180000, options?.signal, buildGitHubHeaders(this.githubToken));
    if (!response.ok) {
      throw new Error(formatGitHubApiError(`Could not fetch remote blob ${sha.slice(0, 8)}`, response.status, this.githubToken));
    }

    const payload = (await response.json()) as { content?: string; encoding?: string };
    if (payload.encoding !== "base64" || !payload.content) {
      return undefined;
    }

    return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  }
}

const REMOTE_TEXT_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
  ".bash",
  ".ps1",
  ".cmd",
  ".bat",
  ".py",
  ".txt",
  ".env",
  ".lock",
  ".md",
  ".toml",
  ".ini",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs"
]);

async function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Repository fetch timed out after ${timeoutMs} ms.`)), timeoutMs);
  const abortHandler = () => controller.abort(new Error("Repository fetch aborted."));

  signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "RepoSentinel/0.1",
        accept: "application/vnd.github+json",
        ...headers
      }
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortHandler);
  }
}

async function extractArchive(archivePath: string, destinationDir: string, options?: RepositoryFetchOptions) {
  if (process.platform === "win32") {
    const script = `Expand-Archive -LiteralPath '${escapePowerShell(archivePath)}' -DestinationPath '${escapePowerShell(destinationDir)}' -Force`;
    const result = await runCommand("powershell", ["-NoProfile", "-Command", script], {
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
      onStdout: (chunk) => options?.onOutput?.(chunk, "stdout"),
      onStderr: (chunk) => options?.onOutput?.(chunk, "stderr")
    });
    if (result.timedOut || result.code !== 0) {
      throw new Error(`Snapshot extraction failed: ${compactOutput(result.stderr || result.stdout || "unknown extraction error")}`);
    }
    return;
  }

  const result = await runCommand("tar", ["-xf", archivePath, "-C", destinationDir], {
    timeoutMs: options?.timeoutMs,
    signal: options?.signal,
    onStdout: (chunk) => options?.onOutput?.(chunk, "stdout"),
    onStderr: (chunk) => options?.onOutput?.(chunk, "stderr")
  });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`Snapshot extraction failed: ${compactOutput(result.stderr || result.stdout || "unknown extraction error")}`);
  }
}

async function resolveExtractedRepositoryPath(extractRoot: string) {
  const entries = await fs.readdir(extractRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  const firstDirectory = directories[0];
  if (directories.length === 1 && firstDirectory) {
    return path.join(extractRoot, firstDirectory.name);
  }

  return extractRoot;
}

function buildSnapshotPlan(repoUrl: string, branch?: string): SnapshotPlan | null {
  const parsed = new URL(repoUrl);
  const segments = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "").split("/").filter(Boolean);

  if (parsed.hostname === "github.com" && segments.length >= 2) {
    const owner = segments[0];
    const repo = segments[1];
    if (!owner || !repo) {
      return null;
    }
    const refSuffix = branch ? `/${encodeURIComponent(branch)}` : "";
    return {
      repoName: repo,
      archiveKind: "zip",
      archiveUrl: `https://api.github.com/repos/${owner}/${repo}/zipball${refSuffix}`
    };
  }

  if ((parsed.hostname === "gitlab.com" || parsed.hostname.includes("gitlab")) && segments.length >= 2 && branch) {
    const repo = segments[segments.length - 1];
    if (!repo) {
      return null;
    }
    const projectPath = segments.map((segment) => encodeURIComponent(segment)).join("/");
    const archiveName = `${repo}-${sanitizeFileName(branch)}.zip`;
    return {
      repoName: repo,
      archiveKind: "zip",
      archiveUrl: `${parsed.protocol}//${parsed.host}/${projectPath}/-/archive/${encodeURIComponent(branch)}/${archiveName}`
    };
  }

  return null;
}

function parseGithubRepository(repoUrl: string) {
  const parsed = new URL(repoUrl);
  if (parsed.hostname !== "github.com") {
    return null;
  }

  const segments = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "").split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1];
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function buildGitHubHeaders(token?: string) {
  if (!token) {
    return undefined;
  }

  return {
    authorization: `Bearer ${token}`
  };
}

function formatGitHubApiError(prefix: string, status: number, hasToken?: string) {
  if (status === 403) {
    return hasToken
      ? `${prefix}: 403. GitHub denied the request. The token may be missing scopes, expired, or the API limit has been hit.`
      : `${prefix}: 403. GitHub API rate limit likely blocked the unauthenticated request. Set GITHUB_TOKEN to use remote mode reliably.`;
  }

  if (status === 404) {
    return `${prefix}: 404. The repository, branch, or file was not found, or the repository is private.`;
  }

  return `${prefix}: ${status}`;
}

function inferRepoName(repoUrl: string) {
  return repoUrl.split("/").slice(-1)[0]?.replace(/\.git$/i, "") || "repository";
}

function sanitizeFileName(input: string) {
  return input.replace(/[^a-z0-9._-]+/gi, "-");
}

function escapePowerShell(value: string) {
  return value.replace(/'/g, "''");
}

function compactOutput(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
