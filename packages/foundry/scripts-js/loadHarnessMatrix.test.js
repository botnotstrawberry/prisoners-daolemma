import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { runNode } from "./testHelpers.js";

test("load harness matrix can execute a single live preset run", () => {
  const outDir = mkdtempSync(join(tmpdir(), "load-harness-matrix-"));
  const report = JSON.parse(
    runNode([
      "scripts-js/loadHarnessMatrixCli.js",
      "--preset",
      "medium-local",
      "--runs",
      "medium-mixed-a",
      "--out",
      outDir,
      "--json",
    ])
  );

  assert.equal(report.status, "ok");
  assert.equal(report.plan.plannedRunCount, 1);
  assert.equal(report.runStatusSummary.find((entry) => entry.key === "ok")?.count, 1);
  assert.equal(report.coverage.authChaosEnabledRuns, 0);
});
