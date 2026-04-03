import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

export interface AppEnv {
  port: number;
  dbPath: string;
  tempDir: string;
  openAiApiKey?: string;
  githubToken?: string;
  openAiModel: string;
  pdfFontPath?: string;
}

function resolveProjectPath(input: string, fallback: string) {
  return path.resolve(process.cwd(), "..", input || fallback);
}

export const env: AppEnv = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: resolveProjectPath(process.env.REPOSENTINEL_DB_PATH ?? "./backend/data/reposentinel.sqlite", "./backend/data/reposentinel.sqlite"),
  tempDir: resolveProjectPath(process.env.REPOSENTINEL_TEMP_DIR ?? "./backend/tmp", "./backend/tmp"),
  openAiApiKey: process.env.OPENAI_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  pdfFontPath: process.env.REPOSENTINEL_PDF_FONT_PATH
};
