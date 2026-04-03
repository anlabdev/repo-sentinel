import type { Finding, ExternalScannerStatus } from "../../../../shared/src/index.js";
import { runCommand } from "../../utils/process.js";
import type { ExternalScannerAdapter } from "./types.js";

class ToolAdapter implements ExternalScannerAdapter {
  public constructor(public readonly name: string, private readonly command: string, private readonly versionArgs: string[]) {}

  public async isAvailable() {
    try {
      const result = await runCommand(this.command, this.versionArgs);
      return result.code === 0;
    } catch {
      return false;
    }
  }

  public async run(_repoPath: string): Promise<{ findings: Finding[]; details: string }> {
    return {
      findings: [],
      details: `${this.name} is available, but the MVP adapter currently reports availability only and does not yet parse native findings.`
    };
  }
}

export class ExternalScannerRegistry {
  private readonly adapters: Record<string, ExternalScannerAdapter> = {
    semgrep: new ToolAdapter("Semgrep", "semgrep", ["--version"]),
    trivy: new ToolAdapter("Trivy", "trivy", ["--version"]),
    osvScanner: new ToolAdapter("OSV-Scanner", "osv-scanner", ["--version"]),
    yara: new ToolAdapter("YARA", "yara", ["--version"])
  };

  public async getAvailability(): Promise<ExternalScannerStatus[]> {
    const entries = Object.entries(this.adapters);
    const statuses: ExternalScannerStatus[] = [];

    for (const [key, adapter] of entries) {
      const available = await adapter.isAvailable();
      statuses.push({
        name: adapter.name,
        available,
        status: available ? "available" : "not_available",
        details: available ? `${adapter.name} detected on PATH.` : `${adapter.name} not found on PATH.`
      });
    }

    return statuses;
  }

  public async runEnabled(repoPath: string, toggles: Record<string, boolean>) {
    const findings: Finding[] = [];
    const statuses: ExternalScannerStatus[] = [];

    for (const [key, adapter] of Object.entries(this.adapters)) {
      if (!toggles[key]) {
        statuses.push({
          name: adapter.name,
          available: false,
          status: "skipped",
          details: "Disabled in settings."
        });
        continue;
      }

      const available = await adapter.isAvailable();
      if (!available) {
        statuses.push({
          name: adapter.name,
          available: false,
          status: "not_available",
          details: `${adapter.name} not found on PATH.`
        });
        continue;
      }

      const result = await adapter.run(repoPath);
      findings.push(...result.findings);
      statuses.push({
        name: adapter.name,
        available: true,
        status: "available",
        details: result.details
      });
    }

    return { findings, statuses };
  }

  public buildRemoteModeStatuses(toggles: Record<string, boolean>) {
    return Object.entries(this.adapters).map(([key, adapter]) => ({
      name: adapter.name,
      available: false,
      status: "skipped" as const,
      details: toggles[key] ? "Skipped in remote mode because no local filesystem is available." : "Disabled in settings."
    }));
  }
}
