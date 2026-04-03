import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { cleanupTempWorkspace } from "./utils/temp-cleanup.js";

async function bootstrap() {
  await cleanupTempWorkspace(env.tempDir);
  const app = await createApp();
  app.listen(env.port, () => {
    console.log(`RepoSentinel backend listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start RepoSentinel backend", error);
  process.exitCode = 1;
});
