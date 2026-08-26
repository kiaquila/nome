#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { findRepoRoot, parseArgs, pathMatches, readConfig, repositoryRoot } from "./shared.mjs";

const args = parseArgs();
const repoRoot = resolve(args.target || findRepoRoot());
const config = readConfig(repoRoot);
const positional = args._ || [];
const inspectWorktree = Boolean(args.worktree);
const baseRef = positional[0] || "origin/main";
const headRef = positional[1] || "HEAD";
const specsDir = config.specsDir || "specs";

function git(commandArgs, options = {}) {
  return execFileSync("git", commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"]
  }).trim();
}

function changedFiles() {
  if (inspectWorktree) {
    const staged = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
    const unstagedAndUntracked = git(["ls-files", "--modified", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
    return [...new Set([...staged, ...unstagedAndUntracked])].sort();
  }
  // Three-dot: only the pull request's own changes, never commits the base
  // branch gained after the branch was cut.
  return git(["diff", "--name-only", `${baseRef}...${headRef}`]).split("\n").filter(Boolean);
}

function hasFileAtRef(ref, path) {
  if (inspectWorktree || ref === "WORKTREE") {
    return existsSync(join(repoRoot, path));
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], {
      cwd: repoRoot,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

// The exemption widens what passes the gate, so its policy must come from the
// checkout that owns this script rather than from the inspected workspace.
// pr-guard.yml runs the default-branch copy against PR content, so reading the
// workspace config would let a pull request grant itself the exemption.
const policyConfig = readConfig(repositoryRoot);

const DEFAULT_EXEMPT_ACTORS = ["dependabot[bot]"];
// Only these pull_request actions create the revision under test. On the others
// GitHub names whoever performed the action as the sender, so a maintainer
// reopening an untouched bot pull request must not be read as its producer.
const REVISION_PRODUCING_ACTIONS = ["opened", "synchronize"];
const WORKFLOW_DIR = ".github/workflows/";
const WORKFLOW_USES_PATTERN = /^\s*uses:\s*(\S+)@\S+/;
const PYPROJECT_REQUIREMENT_PATTERN =
  /^\s*"([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?)\s*[<>=!~][^"]*",?\s*$/;
// File classes whose content is checked, not just their path. Each changed line
// must declare a version, and the identity it declares must be unchanged.
// Lockfiles are absent on purpose: they are generated artifacts, not authored.
const VERSION_ONLY_RULES = [
  {
    covers: (file) => file.startsWith(WORKFLOW_DIR),
    identityOf: (line) => line.match(WORKFLOW_USES_PATTERN)?.[1] ?? null
  },
  {
    covers: (file) => file === "pyproject.toml",
    identityOf: (line) => line.match(PYPROJECT_REQUIREMENT_PATTERN)?.[1] ?? null
  }
];
const DEFAULT_DEPENDENCY_MANIFEST_PATHS = [
  "pyproject.toml",
  "uv.lock",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  ".github/workflows/"
];

function eventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  try {
    return JSON.parse(readFileSync(eventPath, "utf8")) || {};
  } catch {
    return {};
  }
}

const event = eventPayload();

function revisionSender() {
  const login = event?.sender?.login;
  return login ? String(login).toLowerCase() : "";
}

function senderProducedRevision() {
  return REVISION_PRODUCING_ACTIONS.includes(String(event?.action || ""));
}

// Authors of the pull request's own commits, or null when undeterminable.
// Merge commits are skipped: on pull_request runs the checked-out revision is a
// merge commit that GitHub, not the contributor, creates.
function revisionAuthors() {
  if (inspectWorktree) return null;
  try {
    return git(["log", "--no-merges", "--format=%an", `${baseRef}..${headRef}`])
      .split("\n")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return null;
  }
}

// Automated dependency bumps carry no product decision, so they skip the
// feature-memory requirement. Every condition must hold, and each fails closed:
// the pull request is opened by a configured automation actor, the event that
// produced this revision names that same actor as its sender, every commit in
// the range is authored by that actor, every changed file is a dependency
// manifest or a workflow file, and every authored change only moves a version
// without changing which action or package it names. A maintainer pushing onto a bot branch is therefore not covered by the
// bot's exemption, and cannot launder workflow content through a spoofed author
// name either.
function patchHunks(patch) {
  const hunks = [];
  let current = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      current = { removed: [], added: [] };
      hunks.push(current);
      continue;
    }
    if (!current || /^(\+\+\+|---)/.test(line)) continue;
    if (line.startsWith("-")) current.removed.push(line.slice(1));
    else if (line.startsWith("+")) current.added.push(line.slice(1));
  }
  return hunks;
}

// Commit author names are a user-controlled field, so identity alone must not
// decide whether arbitrary content clears the gate. A bump may move a version;
// it may never introduce different code. Removed and added lines are paired
// positionally inside each hunk, so swapping two identities between steps does
// not cancel out the way a whole-patch comparison would.
function changesOnlyMoveVersions(changed) {
  for (const rule of VERSION_ONLY_RULES) {
    const targets = changed.filter(rule.covers);
    if (!targets.length) continue;
    let patch;
    try {
      patch = git(["diff", "--unified=0", `${baseRef}...${headRef}`, "--", ...targets]);
    } catch {
      return false;
    }
    const hunks = patchHunks(patch);
    if (!hunks.length) return false;
    for (const hunk of hunks) {
      if (!hunk.removed.length || hunk.removed.length !== hunk.added.length) return false;
      for (let index = 0; index < hunk.removed.length; index += 1) {
        const before = rule.identityOf(hunk.removed[index]);
        if (before === null || before !== rule.identityOf(hunk.added[index])) return false;
      }
    }
  }
  return true;
}

function isExemptDependencyUpdate(changed) {
  if (!changed.length) return false;
  const exemptActors = (policyConfig.featureMemoryExemptActors || DEFAULT_EXEMPT_ACTORS)
    .map((actor) => String(actor).toLowerCase());
  // The exemption applies only inside a pull_request event: provenance must be
  // established, never assumed, so an ambient GITHUB_ACTOR does not grant it.
  const actor = String(event?.pull_request?.user?.login || "").toLowerCase();
  if (!actor || !exemptActors.includes(actor)) return false;
  // Either a file's content is inspectable, or the event itself must establish
  // who produced the revision. Lockfiles are generated, so they carry no
  // authored line to check and cannot fall back on content.
  if (senderProducedRevision()) {
    if (revisionSender() !== actor) return false;
  } else if (changed.some((file) => !VERSION_ONLY_RULES.some((rule) => rule.covers(file)))) {
    return false;
  }
  const authors = revisionAuthors();
  if (!authors?.length || !authors.every((name) => name === actor)) return false;
  const manifestPaths = policyConfig.dependencyManifestPaths || DEFAULT_DEPENDENCY_MANIFEST_PATHS;
  if (!changed.every((file) => pathMatches(file, manifestPaths))) return false;
  return changesOnlyMoveVersions(changed);
}

const files = changedFiles();
const productPaths = config.productPaths || ["src/", "app/"];
const productChanges = files.filter((file) => pathMatches(file, productPaths));

if (!productChanges.length) {
  console.log("No configured product paths changed; feature-memory gate passes.");
  process.exit(0);
}

if (isExemptDependencyUpdate(files)) {
  console.log("Automated dependency-only update; feature-memory gate passes.");
  process.exit(0);
}

const featureIds = new Set();
for (const file of files) {
  const match = file.match(new RegExp(`^${specsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/([^/]+)\\/`));
  if (match) featureIds.add(match[1]);
}

for (const featureId of featureIds) {
  const required = ["spec.md", "plan.md", "tasks.md"].map((name) => `${specsDir}/${featureId}/${name}`);
  if (required.every((path) => hasFileAtRef(headRef, path))) {
    console.log(`Feature-memory gate passed via ${specsDir}/${featureId}/{spec,plan,tasks}.md`);
    process.exit(0);
  }
}

console.error("Product paths changed without a complete feature-memory update.");
console.error(`Product changes: ${productChanges.join(", ")}`);
console.error(`Touch one ${specsDir}/<feature-id>/ folder with spec.md, plan.md, and tasks.md in the same PR.`);
process.exit(1);
