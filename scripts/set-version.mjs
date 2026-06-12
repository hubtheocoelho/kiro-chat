// Syncs the app version from a release tag (e.g. "v0.2.1") into the files
// Tauri uses for bundle naming and app metadata. Run by the release workflow
// before `tauri build` so installers are named after the tag being released.
import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2] ?? "";
const version = raw.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`set-version: "${raw}" is not a valid semver tag (expected e.g. v0.2.1)`);
  process.exit(1);
}

for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${file}: version set to ${version}`);
}
