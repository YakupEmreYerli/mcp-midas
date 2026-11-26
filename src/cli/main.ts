#!/usr/bin/env node
/** `midas` komutu: MCP araçlarını yerel paketten ya da çalışan HTTP servisinden çağırır. */
import { run } from "./commands.js";
import { connect } from "./connect.js";

const code = await run(process.argv.slice(2), {
  connect,
  out: (text) => process.stdout.write(text + "\n"),
  err: (text) => process.stderr.write(text + "\n"),
});
process.exit(code);
