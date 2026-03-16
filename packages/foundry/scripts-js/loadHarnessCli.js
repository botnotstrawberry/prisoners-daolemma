import { parseCliArgs, printJson } from "./authTooling.js";
import {
  LOAD_HARNESS_BOUNDARY_NOTE,
  runLoadHarness,
  printLoadHarnessSummary,
} from "./loadHarness.js";

function printHelp() {
  console.log(`
Prisoners DAOllema local load/chaos harness

${LOAD_HARNESS_BOUNDARY_NOTE}

Usage:
  node scripts-js/loadHarnessCli.js [options]

Core options:
  --profile <smoke|scale>        Harness config profile. Defaults to smoke.
  --player-count <n>             Synthetic player count. Defaults to a profile-specific practical local value.
  --cause-count <n>              Cause count to whitelist and distribute across players.
  --games <n>                    Number of games to run sequentially. Defaults to 1.
  --scenario <name[,name...]>    Scenario type or rotating list. Supports winner-all-share, cancelled-underfilled,
                                 no-winner-all-catch, adversarial-random, plus aliases like winner, cancelled,
                                 no-winner, adversarial, chaos, random, or mixed.
  --concurrency <n>              Max concurrent player txs per batch.
  --join-duration-seconds <n>    Override the deployed join duration for this local run.
  --commit-duration-blocks <n>   Override the deployed commit duration for this local run.
  --reveal-duration-blocks <n>   Override the deployed reveal duration for this local run.
  --skip-commit-rate <0..1>      Fraction of players that intentionally miss commit each round in winner-all-share games.
  --skip-reveal-rate <0..1>      Fraction of committed players that intentionally miss reveal each round in winner-all-share/adversarial games.
  --underfilled-rate <0..1>      In adversarial-random mode, fraction of games that intentionally stay underfilled and cancel.
  --invalid-reveal-rate <0..1>   In adversarial-random mode, fraction of revealers that first try a wrong reveal preimage.
  --probe-rate <0..1>            In adversarial-random mode, rate for invalid timing/path/duplicate probes.
  --share-weight <n>             In adversarial-random mode, relative weight for SHARE choices. Defaults to 1.
  --catch-weight <n>             In adversarial-random mode, relative weight for CATCH choices. Defaults to 1.
  --steal-weight <n>             In adversarial-random mode, relative weight for STEAL choices. Defaults to 1.
  --expected-failures            Intentionally submit deterministic duplicate/invalid follow-up operations and count them as expected failures.
  --same-block-probes            On supported local dev RPCs, temporarily disable automine and mine short ordered same-block batches for per-round edge-ordering and duplicate-settlement contention probes.
  --skip-claims                  Stop after winner-path games resolve; do not submit winner claims.
  --seed <text>                  Deterministic sampling seed for chaos decisions.

Chain options:
  --rpc-url <url>                Optional existing local RPC URL. If omitted, the harness spawns a fresh Anvil.
                                 When you supply one, it should be a local dev chain compatible with the selected mnemonic-derived accounts.
  --anvil-port <port>            Port for spawned Anvil. Defaults to 8555.
  --chain-id <id>                Chain id for spawned Anvil. Defaults to 31337.
  --mnemonic <words>             Mnemonic used for owner/verifier/player wallets. Defaults to the Anvil test mnemonic.

Output:
  --out <dir>                    Output directory (package-relative or absolute). Defaults to load-harness/<timestamp>.
  --json                         Print the final report JSON instead of the human summary.
  --help                         Show this help text.

Examples:
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 8 --cause-count 4 --scenario winner-all-share
  node scripts-js/loadHarnessCli.js --profile scale --player-count 64 --games 3 --scenario mixed --concurrency 16 --commit-duration-blocks 96 --reveal-duration-blocks 96
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 12 --scenario no-winner-all-catch --expected-failures --json
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 6 --scenario winner-all-share --same-block-probes --expected-failures
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 12 --games 8 --scenario adversarial-random --concurrency 6 --commit-duration-blocks 24 --reveal-duration-blocks 24 --skip-commit-rate 0.25 --skip-reveal-rate 0.25 --invalid-reveal-rate 0.15 --underfilled-rate 0.2 --probe-rate 0.6 --same-block-probes
`);
}

async function main() {
  const { args } = parseCliArgs(["run", ...process.argv.slice(2)]);

  if (args.help) {
    printHelp();
    return;
  }

  const result = await runLoadHarness(args);
  if (args.json) {
    printJson(result.report);
    return;
  }

  printLoadHarnessSummary(result.report);
}

main().catch((error) => {
  console.error(`\n❌ Load harness failed: ${error.message}`);
  process.exitCode = 1;
});
