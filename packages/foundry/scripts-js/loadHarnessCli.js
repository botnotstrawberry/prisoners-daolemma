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
  --concurrency <n>              Max concurrent player txs per batch.
  --skip-commit-rate <0..1>      Fraction of players that intentionally miss commit each round.
  --skip-reveal-rate <0..1>      Fraction of committed players that intentionally miss reveal each round.
  --skip-claims                  Stop after the game resolves; do not submit winner claims.
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
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 8 --cause-count 4
  node scripts-js/loadHarnessCli.js --profile scale --player-count 64 --games 3 --concurrency 16
  node scripts-js/loadHarnessCli.js --profile smoke --player-count 12 --skip-commit-rate 0.2 --skip-reveal-rate 0.3 --json
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
