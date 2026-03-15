import { parseCliArgs } from "./authTooling.js";
import {
  QUERY_BOUNDARY_NOTE,
  collectGameEvidence,
  exportGameEvidence,
  printEvidenceSummary,
  printExportSummary,
  printJson,
  printMessagesJsonl,
} from "./queryTooling.js";

function printMainHelp() {
  console.log(`
Prisoners DAOllema evidence/query tooling

${QUERY_BOUNDARY_NOTE}

Usage:
  node scripts-js/queryCli.js <command> [options]

Commands:
  summary   Inspect the current game snapshot, roster, causes, auth, and round context.
  auth      Inspect current auth records and related auth events for game participants.
  messages  Export GameChat message rows for one game as JSON or JSONL.
  export    Write evidence artifacts to a local directory.

Run a command with --help for details.
`);
}

function printSharedOptions() {
  return `Common options:
  --rpc-url <url|network>     Required unless AUTH_RPC_URL/RPC_URL is set.
  --game <address|name>       Game contract address or deployment name. Defaults to deployed PrisonersDaollema for the connected chain when available.
  --game-id <uint256>         Optional. Defaults to activeGameId, then currentGameId.
  --registry <address|name>   Optional override. Defaults to game.authRegistry().
  --chat <address|name>       Optional GameChat contract address or deployment name. Defaults to deployed GameChat for the connected chain when available.
  --from-block <block>        Optional log lower bound. Default: 0.
  --to-block <block|latest>   Optional log upper bound. Default: latest. Numeric values also attempt to snapshot contract state at that same block when the RPC provider supports historical eth_call.
  --json                      Print machine-readable JSON.
`;
}

function printSummaryHelp() {
  console.log(`
Usage:
  node scripts-js/queryCli.js summary --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [--registry <address|name>] [--chat <address|name>] [--from-block <block>] [--to-block <block|latest>] [--json]

${printSharedOptions()}
Examples:
  node scripts-js/queryCli.js summary --rpc-url localhost --game-id 1
  node scripts-js/queryCli.js summary --rpc-url baseSepolia --game 0xGame --chat 0xChat --game-id 7 --json
`);
}

function printAuthHelp() {
  console.log(`
Usage:
  node scripts-js/queryCli.js auth --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [--registry <address|name>] [--from-block <block>] [--to-block <block|latest>] [--json]

${printSharedOptions()}
Examples:
  node scripts-js/queryCli.js auth --rpc-url localhost --game-id 1 --json
`);
}

function printMessagesHelp() {
  console.log(`
Usage:
  node scripts-js/queryCli.js messages --rpc-url <url|network> [--game <address|name>] [--chat <address|name>] [--game-id <id>] [--from-block <block>] [--to-block <block|latest>] [--json]

${printSharedOptions()}
Notes:
  - Without --json, this command prints JSONL rows to stdout.
  - If no chat contract is configured or discoverable, the command returns an empty list instead of claiming there were zero messages.

Examples:
  node scripts-js/queryCli.js messages --rpc-url localhost --game-id 1
  node scripts-js/queryCli.js messages --rpc-url baseSepolia --game 0xGame --chat 0xChat --game-id 7 --json
`);
}

function printExportHelp() {
  console.log(`
Usage:
  node scripts-js/queryCli.js export --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [--registry <address|name>] [--chat <address|name>] [--from-block <block>] [--to-block <block|latest>] [--out <directory>] [--json]

${printSharedOptions()}
Additional options:
  --out <directory>           Output directory. Defaults to packages/foundry/exports/game-<timestamp>.

Artifacts written when available:
  - game-summary.json
  - roster.json
  - causes.json
  - rounds.json
  - auth.json
  - payouts.json
  - messages.jsonl
  - export-manifest.json

Examples:
  node scripts-js/queryCli.js export --rpc-url localhost --game-id 1 --out exports/game-1
  node scripts-js/queryCli.js export --rpc-url baseSepolia --game 0xGame --chat 0xChat --game-id 7 --json
`);
}

async function main() {
  const { subcommand, args } = parseCliArgs();

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || args.help) {
    if (subcommand === "summary") {
      printSummaryHelp();
      return;
    }
    if (subcommand === "auth") {
      printAuthHelp();
      return;
    }
    if (subcommand === "messages") {
      printMessagesHelp();
      return;
    }
    if (subcommand === "export") {
      printExportHelp();
      return;
    }
    printMainHelp();
    return;
  }

  if (subcommand === "summary") {
    const evidence = await collectGameEvidence(args);
    if (args.json) {
      printJson(evidence.summary);
    } else {
      printEvidenceSummary(evidence.summary);
    }
    return;
  }

  if (subcommand === "auth") {
    const evidence = await collectGameEvidence(args);
    if (args.json) {
      printJson(evidence.auth);
    } else {
      printJson(evidence.auth);
    }
    return;
  }

  if (subcommand === "messages") {
    const evidence = await collectGameEvidence(args);
    if (args.json) {
      printJson(evidence.messages);
    } else {
      printMessagesJsonl(evidence.messages);
    }
    return;
  }

  if (subcommand === "export") {
    const result = await exportGameEvidence(args);
    if (args.json) {
      printJson(result.manifest);
    } else {
      printExportSummary(result);
    }
    return;
  }

  throw new Error(`Unknown query command '${subcommand}'. Use summary, auth, messages, or export.`);
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
