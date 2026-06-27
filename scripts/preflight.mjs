#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs, repositoryRoot, walkFiles } from "./shared.mjs";

const args = parseArgs();

function run(commandArgs, label) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`${label} failed.`);
    process.exit(result.status || 1);
  }
}

function syntaxCheck() {
  const files = walkFiles(repositoryRoot, {
    include: (file) => /^scripts\/.+\.mjs$/.test(file)
  });

  let failed = false;

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", join(repositoryRoot, file)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(result.stderr || result.stdout);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`Syntax check passed for ${files.length} files.`);
}

if (args["syntax-only"]) {
  syntaxCheck();
  process.exit(0);
}

run(["scripts/check-feature-memory.mjs", "--worktree"], "Feature memory check");
run(["scripts/check-repo-baseline.mjs"], "Repository baseline check");
run(["scripts/check-context-budget.mjs", "--local-preflight"], "Context budget committed check");
run(["scripts/check-context-budget.mjs", "--worktree"], "Context budget worktree check");
syntaxCheck();

console.log("Preflight passed.");
