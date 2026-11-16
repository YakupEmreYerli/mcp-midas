#!/usr/bin/env node
/** stdio üzerinden MCP sunucusu (Claude Desktop, Claude Code ve benzeri istemciler için). */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { session } from "./session.js";

// İstemci süreci kapatınca tarayıcı da kapansın ve son oturum kaydedilsin.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    session
      .close()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}

await createServer().connect(new StdioServerTransport());
