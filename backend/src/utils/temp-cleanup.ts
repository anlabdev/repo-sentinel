import fs from "node:fs/promises";
import path from "node:path";

const TEMP_ENTRY_PATTERNS = [/^scan-/i, /^snapshot-/i, /^upload-/i, /^incoming$/i];

export async function cleanupTempWorkspace(tempDir: string) {
  await fs.mkdir(tempDir, { recursive: true });
  const entries = await fs.readdir(tempDir, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (!TEMP_ENTRY_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      return;
    }

    await fs.rm(path.join(tempDir, entry.name), {
      recursive: true,
      force: true
    });
  }));
}
