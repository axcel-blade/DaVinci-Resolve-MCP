#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, loadDotEnv } from "./config/index.js";
import { createAppContext, createServer, SERVER_INFO } from "./server.js";
import { startHttp } from "./transport/http.js";
import { configureLogger, logger } from "./utils/logger.js";

async function main(): Promise<void> {
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    process.stdout.write(`${SERVER_INFO.name} ${SERVER_INFO.version}\n`);
    return;
  }
  const envFile = loadDotEnv();
  const config = loadConfig();
  configureLogger({ level: config.logLevel, dir: config.logDir });
  if (envFile) logger.info("loaded settings file", { file: envFile });
  const app = createAppContext(config);
  logger.info("starting davinci-resolve-mcp", { transport: config.transport, tools: app.registry.tools.size, python: config.resolve.pythonPath });

  let close: () => Promise<void>;
  if (config.transport === "http") {
    const http = await startHttp(app);
    close = () => new Promise((r) => http.close(() => r()));
  } else {
    const server = createServer(app);
    await server.connect(new StdioServerTransport());
    close = () => server.close();
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down", { signal, pending: app.bridge.pending });
    const deadline = Date.now() + 10000;
    while (app.bridge.pending > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    await close().catch(() => undefined);
    await app.bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.stdin.on("close", () => {
    if (config.transport === "stdio") void shutdown("stdin closed");
  });
}

main().catch((err) => {
  console.error(`davinci-resolve-mcp failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
