import { spawn } from "node:child_process";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export function runCommand(command: string, args: string[], options?: RunCommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;

    if (options?.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);
    }

    const abortHandler = () => {
      child.kill();
    };

    options?.signal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      options?.onStdout?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      options?.onStderr?.(text);
    });

    child.on("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      options?.signal?.removeEventListener("abort", abortHandler);
      reject(error);
    });
    child.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      options?.signal?.removeEventListener("abort", abortHandler);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}
