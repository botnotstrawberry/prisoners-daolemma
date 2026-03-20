import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { parseCliArgs, resolveRpcTarget } from "./authTooling.js";

function printHelp() {
  console.log(`
Prisoners DAOlemma verification helper

Usage:
  node scripts-js/verifyCli.js [--network <name> | --rpc-url <url|network>] [--help]

Options:
  --network <name>         Network alias from foundry.toml.
  --rpc-url <url|network>  Full RPC URL or foundry.toml alias.
  --help, -h               Show this help message.

Notes:
  - Defaults to localhost when no target is provided.
  - BASESCAN_API_KEY must be present in packages/foundry/.env or the shell environment for Base / Base Sepolia explorer verification.
  - This wrapper exists so the repo-native verify command accepts explicit args reliably, instead of depending on shell positional expansion.

Examples:
  node scripts-js/verifyCli.js --network baseSepolia
  node scripts-js/verifyCli.js --rpc-url https://sepolia.base.org
`);
}

const moduleFilePath = fileURLToPath(import.meta.url);

export function main() {
  const { args } = parseCliArgs(["verify", ...process.argv.slice(2)]);

  if (args.help) {
    printHelp();
    return;
  }

  const rpcTarget = args.rpcUrl ?? args.network ?? args.rpc ?? "localhost";
  resolveRpcTarget({ rpcUrl: rpcTarget });

  const result = spawnSync("make", ["verify", `RPC_URL=${rpcTarget}`], {
    stdio: "inherit",
    shell: true,
  });

  process.exit(result.status ?? 1);
}

if (process.argv[1] === moduleFilePath) {
  main();
}
