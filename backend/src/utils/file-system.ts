import fs from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
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
  ".html",
  ".htm",
  ".xml",
  ".java",
  ".kt",
  ".kts",
  ".gradle",
  ".properties",
  ".ini",
  ".cfg",
  ".conf",
  ".toml",
  ".sql",
  ".csv",
  ".log",
  ".rb",
  ".php",
  ".go",
  ".rs",
  ".cs"
]);

export interface FileRecord {
  relativePath: string;
  absolutePath: string;
  extension: string;
  content?: string;
  size: number;
  readError?: string;
}

export interface WalkProgress {
  filesEnumerated: number;
  directoriesEnumerated: number;
  textFilesRead: number;
}

interface WalkFilesOptions {
  onProgress?: (progress: WalkProgress) => Promise<void> | void;
  signal?: AbortSignal;
}

export async function ensureDirectory(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function walkFiles(rootDir: string, options?: WalkFilesOptions): Promise<FileRecord[]> {
  const files: FileRecord[] = [];
  const progress: WalkProgress = {
    filesEnumerated: 0,
    directoriesEnumerated: 1,
    textFilesRead: 0
  };

  async function visit(currentDir: string) {
    if (options?.signal?.aborted) {
      throw new Error("Scan cancelled by user");
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (options?.signal?.aborted) {
        throw new Error("Scan cancelled by user");
      }

      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        progress.directoriesEnumerated += 1;
        await options?.onProgress?.(progress);
        await visit(absolutePath);
        continue;
      }

      const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/");
      const stat = await fs.stat(absolutePath);
      const extension = path.extname(entry.name).toLowerCase();
      const shouldRead =
        TEXT_EXTENSIONS.has(extension) ||
        /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Dockerfile|docker-compose\.ya?ml|Makefile|README(?:\.[A-Za-z0-9_-]+)?)$/i.test(relativePath);
      let content: string | undefined;
      let readError: string | undefined;

      if (shouldRead && stat.size <= 1_500_000) {
        try {
          content = await fs.readFile(absolutePath, "utf8");
          progress.textFilesRead += 1;
        } catch (error) {
          content = undefined;
          readError = error instanceof Error ? error.message : "Unknown file read error";
        }
      }

      files.push({
        relativePath,
        absolutePath,
        extension,
        content,
        size: stat.size,
        readError
      });
      progress.filesEnumerated += 1;
      await options?.onProgress?.(progress);
    }
  }

  await visit(rootDir);
  return files;
}

export function isProbablyBinary(file: FileRecord) {
  if (file.content) {
    return false;
  }

  return file.size > 512 || [".exe", ".dll", ".so", ".bin", ".dat", ".jar", ".apk", ".class", ".pyc"].includes(file.extension);
}

export function snippetAtLine(content: string, lineNumber?: number) {
  if (!lineNumber) {
    return content.slice(0, 240);
  }

  const lines = content.split(/\r?\n/);
  return lines[Math.max(0, lineNumber - 1)]?.slice(0, 240) ?? "";
}

export function buildContextSnippet(content: string, lineNumber?: number, radius = 5) {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return "";
  }

  const targetIndex = typeof lineNumber === "number" && lineNumber > 0
    ? Math.min(lines.length - 1, lineNumber - 1)
    : 0;
  const start = Math.max(0, targetIndex - radius);
  const end = Math.min(lines.length, targetIndex + radius + 1);

  return lines
    .slice(start, end)
    .map((line, offset) => {
      const currentLine = start + offset + 1;
      const marker = currentLine === targetIndex + 1 ? ">" : " ";
      return `${marker} ${String(currentLine).padStart(4, " ")} | ${line}`.trimEnd();
    })
    .join("\n")
    .slice(0, 2200);
}
