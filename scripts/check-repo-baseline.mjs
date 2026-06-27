#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findRepoRoot, parseArgs, readConfig } from "./shared.mjs";

const args = parseArgs();
const root = resolve(args.target || findRepoRoot());
const config = readConfig(root);
const missing = [];

function requirePath(path) {
  if (!existsSync(join(root, path))) missing.push(path);
}

requirePath("README.md");
requirePath("package.json");
requirePath(".unicorn-hub/config.json");
requirePath(config.docsDir || "docs_project");
requirePath(".env.example");
requirePath("docs_project/project/product-brief.md");
requirePath("docs_project/project/architecture.md");

const PROFILE_EXCLUDABLE = new Set([".github/workflows/ci.yml"]);
const requestedExclusions = new Set(config.excludeTemplates || []);
const excluded = new Set([...requestedExclusions].filter((path) => PROFILE_EXCLUDABLE.has(path)));
for (const path of [
  "AGENTS.md",
  "CLAUDE.md",
  ".specify/memory/constitution.md",
  config.specsDir || "specs",
  "scripts/check-context-budget.mjs",
  "scripts/check-feature-memory.mjs",
  "scripts/check-repo-baseline.mjs",
  "scripts/ai-command-policy.mjs",
  "scripts/ai-review-gate.mjs",
  "scripts/ai-review-rerun.mjs",
  "scripts/set-implementation-agent.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/pr-guard.yml",
  ".github/workflows/ai-review.yml",
  ".github/workflows/ai-review-rerun.yml",
  ".github/workflows/ai-command-policy.yml"
]) {
  if (excluded.has(path)) continue;
  requirePath(path);
}

if (missing.length) {
  console.error("Missing required baseline files:");
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!packageJson.packageManager?.startsWith("pnpm@")) {
  console.error("package.json must pin packageManager to pnpm@<version>.");
  process.exit(1);
}

console.log("Repository baseline check passed.");
