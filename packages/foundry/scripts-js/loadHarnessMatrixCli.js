import { parseCliArgs, printJson } from "./authTooling.js";
import {
  DEFAULT_LOAD_HARNESS_MATRIX_PRESET,
  LOAD_HARNESS_MATRIX_BOUNDARY_NOTE,
  LOAD_HARNESS_MATRIX_PRESETS,
  runLoadHarnessMatrix,
  printLoadHarnessMatrixSummary,
} from "./loadHarnessMatrix.js";

function printHelp() {
  console.log(`
Prisoners DAOllema load harness matrix runner

${LOAD_HARNESS_MATRIX_BOUNDARY_NOTE}

Usage:
  node scripts-js/loadHarnessMatrixCli.js [options]

Options:
  --preset <name>                Matrix preset. Defaults to ${DEFAULT_LOAD_HARNESS_MATRIX_PRESET}.
                                 Presets: ${Object.keys(
                                   LOAD_HARNESS_MATRIX_PRESETS
                                 ).join(", ")}
  --runs <id[,id...]>            Optional comma-separated subset of preset run ids.
  --instance-concurrency <n>     How many isolated harness + Anvil instances to run at once.
                                 1 = sequential. Defaults to the preset value (parallel-local defaults to 2; others to 1).
  --out <dir>                    Output directory root. Defaults to load-harness-matrix/<timestamp>.
                                 Writes matrix-report.json plus MATRIX_SUMMARY.md.
  --stop-on-error                Stop dispatching new runs after the first harness-level failure.
                                 In parallel mode, already-running instances are allowed to finish.
  --json                         Print the final matrix report JSON instead of the human summary.
  --help                         Show this help text.

Preset summary:
${Object.entries(LOAD_HARNESS_MATRIX_PRESETS)
  .map(
    ([name, preset]) =>
      `  - ${name}: ${preset.description}\n      runs: ${preset.runs
        .map((run) => run.id)
        .join(", ")}\n      default instance concurrency: ${
        preset.instanceConcurrency ?? 1
      }`
  )
  .join("\n")}

Examples:
  node scripts-js/loadHarnessMatrixCli.js --preset broader-local
  node scripts-js/loadHarnessMatrixCli.js --preset medium-local --instance-concurrency 2
  node scripts-js/loadHarnessMatrixCli.js --preset parallel-local
  node scripts-js/loadHarnessMatrixCli.js --preset parallel-local --instance-concurrency 3
  node scripts-js/loadHarnessMatrixCli.js --preset large-local
  node scripts-js/loadHarnessMatrixCli.js --preset xlarge-local
  node scripts-js/loadHarnessMatrixCli.js --preset adversarial-smoke --json
  node scripts-js/loadHarnessMatrixCli.js --preset broader-local --runs adversarial-a,adversarial-b
`);
}

async function main() {
  const { args } = parseCliArgs(["run", ...process.argv.slice(2)]);

  if (args.help) {
    printHelp();
    return;
  }

  const result = await runLoadHarnessMatrix(args);
  if (args.json) {
    printJson(result.report);
    return;
  }

  printLoadHarnessMatrixSummary(result.report);
}

main().catch((error) => {
  console.error(`\n❌ Load harness matrix failed: ${error.message}`);
  process.exitCode = 1;
});
