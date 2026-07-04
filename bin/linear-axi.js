#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
}).catch((error) => {
  const message = error && typeof error.message === "string" ? error.message : String(error);
  process.stdout.write(`error: ${message}\n`);
  process.stdout.write("help[1]: Run `linear-axi --help`\n");
  process.exitCode = 1;
});
