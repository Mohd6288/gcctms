#!/usr/bin/env node
// Fails the build if the string "service_role" (or the env var name that holds
// it) ever ends up in a client-shipped JS bundle. Run AFTER `next build`.
// Golden Rule 3 (tms-react-builder skill): never expose the service_role key
// to the browser or any client bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CLIENT_CHUNK_DIRS = [".next/static"];
const FORBIDDEN = ["service_role", "SUPABASE_SERVICE_ROLE_KEY"];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (entry.endsWith(".js") || entry.endsWith(".js.map")) files.push(full);
  }
  return files;
}

let found = [];
for (const dir of CLIENT_CHUNK_DIRS) {
  let files;
  try {
    files = walk(dir);
  } catch {
    console.error(`Expected build output at ${dir} — run \`next build\` first.`);
    process.exit(1);
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const needle of FORBIDDEN) {
      if (content.includes(needle)) found.push({ file, needle });
    }
  }
}

if (found.length > 0) {
  console.error("Forbidden pattern check FAILED — service_role leaked into a client bundle:");
  for (const { file, needle } of found) console.error(`  - "${needle}" found in ${file}`);
  process.exit(1);
}

console.log("Forbidden pattern check passed — no service_role reference in client bundles.");
