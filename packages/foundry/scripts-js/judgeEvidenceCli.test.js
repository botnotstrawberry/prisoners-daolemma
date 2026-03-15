import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveFromPackageRoot } from "./authTooling.js";
import {
  buildJudgeEvidenceIndex,
  renderJudgeEvidenceReadme,
  writeJudgeEvidencePack,
} from "./judgeEvidenceCli.js";

test("buildJudgeEvidenceIndex summarizes the tracked local load-harness bundle honestly", () => {
  const bundleDir = resolveFromPackageRoot(
    "load-harness/manual-scale-proof-2026-03-15-64x3"
  );

  const index = buildJudgeEvidenceIndex({
    bundleDir,
    outputDir: bundleDir,
  });

  assert.equal(index.bundleType, "local-load-harness");
  assert.equal(index.localProof.status, "present");
  assert.equal(index.liveSepoliaProof.status, "pending");
  assert.equal(index.localProof.report.playerCount, 64);
  assert.equal(index.localProof.report.gamesRequested, 3);
  assert.equal(index.localProof.report.replayConsistentGames, 3);
  assert.deepEqual(
    index.localProof.exports.map((entry) => entry.outcome),
    ["Winners", "NoWinners", "Winners"]
  );
  assert.ok(
    index.recommendedOpenOrder.some((entry) => entry.path === "report.json")
  );

  const readme = renderJudgeEvidenceReadme(index);
  assert.match(readme, /Local proof: present/);
  assert.match(readme, /Live Base Sepolia proof: pending/);
  assert.match(readme, /game-2\/evidence\/payouts\.json/);
});

test("writeJudgeEvidencePack emits judge-facing files for a live canary-style bundle", () => {
  const bundleDir = mkdtempSync(join(tmpdir(), "pd-judge-evidence-"));
  mkdirSync(join(bundleDir, "query", "export"), { recursive: true });
  mkdirSync(join(bundleDir, "auth", "player-1"), { recursive: true });
  mkdirSync(join(bundleDir, "game"), { recursive: true });
  mkdirSync(join(bundleDir, "screenshots"), { recursive: true });

  writeFileSync(
    join(bundleDir, "preflight.json"),
    JSON.stringify(
      {
        target: { chainId: 84532, latestBlock: 123 },
        profileComparison: { matchesRecommendedProfile: true },
        warnings: [],
      },
      null,
      2
    ),
    "utf8"
  );

  writeFileSync(
    join(bundleDir, "deployment-summary.json"),
    JSON.stringify(
      {
        target: { chainId: 84532, latestBlock: 456 },
        addresses: {
          registry: "0x00000000000000000000000000000000000000aa",
          game: "0x00000000000000000000000000000000000000bb",
          chat: "0x00000000000000000000000000000000000000cc",
        },
        onchain: {
          currentGameId: 7,
          activeGameId: 0,
          messageCount: 2,
          activeCauseCount: 3,
        },
        profileComparison: { matchesRecommendedProfile: true },
        warnings: [],
      },
      null,
      2
    ),
    "utf8"
  );

  writeFileSync(
    join(bundleDir, "operator-notes.md"),
    [
      "# Operator notes",
      "",
      "- auth flavor: minimal permit/register",
      "- create tx: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ].join("\n"),
    "utf8"
  );

  writeFileSync(
    join(bundleDir, "verify.log"),
    "verification output captured here\n",
    "utf8"
  );

  writeFileSync(
    join(bundleDir, "game", "create.json"),
    JSON.stringify({ gameId: 7 }, null, 2),
    "utf8"
  );

  const gameSummary = {
    gameId: 7,
    chainId: 84532,
    addresses: {
      game: "0x00000000000000000000000000000000000000bb",
      registry: "0x00000000000000000000000000000000000000aa",
      chat: "0x00000000000000000000000000000000000000cc",
    },
    game: {
      outcome: "Winners",
      terminalOutcome: { terminalPath: "winner-claims" },
      counts: {
        joined: 3,
        committed: 3,
        revealed: 3,
        messages: 2,
      },
    },
    notes: ["Live export captured after terminal settlement."],
  };

  writeFileSync(
    join(bundleDir, "query", "game-summary-live.json"),
    JSON.stringify(gameSummary, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "game-summary.json"),
    JSON.stringify(gameSummary, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "rounds.json"),
    JSON.stringify({ rounds: [] }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "payouts.json"),
    JSON.stringify({ settlement: { finalized: true } }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "roster.json"),
    JSON.stringify({ participants: [] }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "causes.json"),
    JSON.stringify({ causes: [] }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "auth.json"),
    JSON.stringify({ participants: [] }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "messages.jsonl"),
    '{"content":"hello judges"}\n',
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "query", "export", "export-manifest.json"),
    JSON.stringify(
      {
        gameId: 7,
        chainId: 84532,
        produced: [
          { artifact: "game-summary.json" },
          { artifact: "rounds.json" },
          { artifact: "payouts.json" },
          { artifact: "messages.jsonl" },
          { artifact: "export-manifest.json" },
        ],
        skipped: [],
      },
      null,
      2
    ),
    "utf8"
  );

  writeFileSync(
    join(bundleDir, "auth", "player-1", "auth-status.json"),
    JSON.stringify({ active: true }, null, 2),
    "utf8"
  );
  writeFileSync(
    join(bundleDir, "auth", "player-1", "auth-permit.json"),
    JSON.stringify({ permit: true }, null, 2),
    "utf8"
  );
  writeFileSync(join(bundleDir, "screenshots", "observer.png"), "png", "utf8");

  const result = writeJudgeEvidencePack({
    bundleDir,
    outputDir: bundleDir,
    mode: "sepolia",
  });

  assert.equal(result.index.bundleType, "base-sepolia-canary");
  assert.equal(result.index.localProof.status, "missing");
  assert.equal(result.index.liveSepoliaProof.status, "present");
  assert.equal(result.index.liveSepoliaProof.auth.authStatusCount, 1);
  assert.equal(result.index.liveSepoliaProof.auth.authPermitCount, 1);
  assert.equal(result.index.liveSepoliaProof.operatorNotes.txHashCount, 1);
  assert.equal(result.index.liveSepoliaProof.screenshots.length, 1);
  assert.equal(result.index.liveSepoliaProof.queryExport.gameId, 7);
  assert.equal(result.index.liveSepoliaProof.queryExport.outcome, "Winners");
  assert.ok(
    result.index.recommendedOpenOrder.some(
      (entry) => entry.path === "query/export/payouts.json"
    )
  );

  assert.equal(existsSync(result.readmePath), true);
  assert.equal(existsSync(result.indexPath), true);

  const savedReadme = readFileSync(result.readmePath, "utf8");
  const savedIndex = JSON.parse(readFileSync(result.indexPath, "utf8"));

  assert.match(savedReadme, /Live Base Sepolia proof: present/);
  assert.match(savedReadme, /screenshots\/observer\.png/);
  assert.equal(savedIndex.liveSepoliaProof.queryExport.gameId, 7);
});
