import {
  buildAndSignAuthPermit,
  getAuthStatus,
  parseCliArgs,
  PERMIT_BOUNDARY_NOTE,
  printJson,
  printPermitSummary,
  printRegistrationSummary,
  printStatusSummary,
  registerSignedPermit,
  writeJson,
} from "./authTooling.js";

function printMainHelp() {
  console.log(`
Prisoners DAOllema auth tooling

${PERMIT_BOUNDARY_NOTE}

Usage:
  node scripts-js/authCli.js <command> [options]

Commands:
  permit    Build and sign a verifier-backed AuthPermit for AgentAuthRegistry.
  status    Inspect onchain auth status for a wallet.
  register  Submit a signed permit onchain from the gameplay wallet.

Run a command with --help for details.
`);
}

function printPermitHelp() {
  console.log(`
Usage:
  node scripts-js/authCli.js permit --rpc-url <url|network> --registry <address> --wallet <address> \
    (--agent-key <bytes32> | --agent-key-text <text>) \
    (--manifest-hash <bytes32> | --manifest-text <text> | --manifest-uri <text>) \
    [--expires-at <unix-seconds> | --ttl-seconds <seconds>] \
    [--nonce <bytes32> | --nonce-text <text>] \
    [--issued-at <unix-seconds>] \
    [--verifier-private-key <hex>] \
    [--input <json-file>] \
    [--out <json-file>] [--json] [--register --wallet-private-key <hex>]

Notes:
  - For local chains (31337/1337), expiry defaults to 0 if you omit --expires-at/--ttl-seconds.
  - For non-local chains, expiry is required.
  - --input lets a future SIWA verifier hand this CLI already-verified fields. This command does NOT verify SIWA.

Examples:
  node scripts-js/authCli.js permit --rpc-url localhost --registry 0xRegistry --wallet 0xWallet \
    --agent-key-text agent-alpha --manifest-uri manifest://agent-alpha \
    --ttl-seconds 3600 --verifier-private-key 0xVerifierKey --out auth-permit.json

  node scripts-js/authCli.js permit --rpc-url baseSepolia --registry 0xRegistry --input verified-auth.json \
    --expires-at 1760000000 --verifier-private-key 0xVerifierKey --json
`);
}

function printStatusHelp() {
  console.log(`
Usage:
  node scripts-js/authCli.js status --rpc-url <url|network> --registry <address> --wallet <address> [--nonce <bytes32>] [--json]
  node scripts-js/authCli.js status --rpc-url <url|network> --permit-file <permit-bundle.json> [--json]

Examples:
  node scripts-js/authCli.js status --rpc-url localhost --registry 0xRegistry --wallet 0xWallet
  node scripts-js/authCli.js status --rpc-url localhost --permit-file auth-permit.json --json
`);
}

function printRegisterHelp() {
  console.log(`
Usage:
  node scripts-js/authCli.js register --rpc-url <url|network> --permit-file <permit-bundle.json> \
    [--registry <address>] [--wallet-private-key <hex>] [--json]

Notes:
  - The gameplay wallet key must match permit.wallet exactly.
  - This command submits registerAuth(...) only. It does not perform SIWA verification.

Example:
  node scripts-js/authCli.js register --rpc-url localhost --permit-file auth-permit.json \
    --wallet-private-key 0xGameplayWalletKey --json
`);
}

async function main() {
  const { subcommand, args } = parseCliArgs();

  if (
    !subcommand ||
    subcommand === "--help" ||
    subcommand === "-h" ||
    args.help
  ) {
    if (subcommand === "permit") {
      printPermitHelp();
      return;
    }
    if (subcommand === "status") {
      printStatusHelp();
      return;
    }
    if (subcommand === "register") {
      printRegisterHelp();
      return;
    }
    printMainHelp();
    return;
  }

  if (subcommand === "permit") {
    const bundle = await buildAndSignAuthPermit(args);
    const outputPath = args.out ? writeJson(args.out, bundle) : null;

    if (args.register) {
      const result = await registerSignedPermit({ ...args, bundle });
      if (args.json) {
        printJson({ bundle, registration: result });
      } else {
        printPermitSummary(bundle, outputPath);
        printRegistrationSummary(result);
      }
      return;
    }

    if (args.json) {
      printJson(bundle);
    } else {
      printPermitSummary(bundle, outputPath);
    }
    return;
  }

  if (subcommand === "status") {
    const status = await getAuthStatus(args);
    if (args.json) {
      printJson(status);
    } else {
      printStatusSummary(status);
    }
    return;
  }

  if (subcommand === "register") {
    const result = await registerSignedPermit(args);
    if (args.json) {
      printJson(result);
    } else {
      printRegistrationSummary(result);
    }
    return;
  }

  throw new Error(
    `Unknown auth command '${subcommand}'. Use permit, status, or register.`
  );
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
