#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { session } from "./session.js";
import { createServer } from "./server.js";

const shutdown = async () => {
  await session.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await createServer().connect(new StdioServerTransport());
