// Runs the end-to-end suites against an already-running API and web app
// (see e2e/README.md). `node e2e/run.mjs` runs everything; pass `api`,
// `web`, or suite names (`sets`, `web/sets`) to run a subset.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const all = ["api", "web"].flatMap((dir) =>
  readdirSync(path.join(root, dir))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort()
    .map((file) => `${dir}/${file.replace(/\.test\.mjs$/, "")}`),
);
const filters = process.argv.slice(2);
const suites = filters.length === 0 ? all : all.filter((suite) => filters.some((f) => suite === f || suite.startsWith(`${f}/`) || suite.endsWith(`/${f}`)));
if (suites.length === 0) {
  console.error(`No suite matches ${filters.join(" ")}. Suites: ${all.join(", ")}`);
  process.exit(1);
}

const summary = [];
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const started = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, `${suite}.test.mjs`)], { stdio: "inherit" });
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  summary.push({ suite, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

console.log("\n=== Summary ===");
for (const { suite, ok, seconds } of summary) console.log(`${ok ? "PASS" : "FAIL"}  ${suite} (${seconds}s)`);
const failed = summary.filter((s) => !s.ok).length;
console.log(`\n${summary.length - failed}/${summary.length} suites passed`);
process.exitCode = failed > 0 ? 1 : 0;
