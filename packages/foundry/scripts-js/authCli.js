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
import {
  issueSiwaChallenge,
  printSiwaChallengeSummary,
  printSiwaSignSummary,
  printSiwaVerificationSummary,
  signIssuedSiwaChallenge,
  SIWA_CHALLENGE_BOUNDARY_NOTE,
  SIWA_SIGN_BOUNDARY_NOTE,
  SIWA_VERIFY_BOUNDARY_NOTE,
  verifySiwaAuthInput,
} from "./siwaTooling.js";

const MAIN_BOUNDARY_NOTE =
  "Local SIWA verification is available through siwa-nonce + siwa-sign + siwa-verify. The permit/register commands still only consume verifier-approved inputs and never parse SIWA payloads directly.";

function printMainHelp() {
  console.log(`
Prisoners DAOllema auth tooling

${MAIN_BOUNDARY_NOTE}

Usage:
  node scripts-js/authCli.js <command> [options]

Commands:
  siwa-nonce   Issue a local SIWA challenge after checking ERC-8004 ownerOf(agentId).
  siwa-sign    Sign a local SIWA challenge with the gameplay wallet.
  siwa-verify  Verify a signed SIWA message and output JSON consumable by permit.
  permit       Build and sign a verifier-backed AuthPermit for AgentAuthRegistry.
  status       Inspect onchain auth status for a wallet.
  register     Submit a signed permit onchain from the gameplay wallet.

Run a command with --help for details.
Keystore-based signing is the preferred local path for siwa-sign, permit, and register.
For a thin local wrapper that runs the six-step happy path with temp files and explicit stage artifacts, use scripts-js/authFlowCli.js (workspace scripts: auth:flow / auth:smoke).
`);
}

function printSiwaNonceHelp() {
  console.log(`
${SIWA_CHALLENGE_BOUNDARY_NOTE}

Usage:
  node scripts-js/authCli.js siwa-nonce --rpc-url <url|network> --wallet <address> \
    --agent-id <uint256> --agent-registry <eip155:chainId:address> --domain <text> \
    [--uri <https-url>] [--chain-id <uint256>] [--statement <text>] [--request-id <text>] \
    [--ttl-seconds <seconds>] [--nonce-store <json-file>] [--registry <auth-registry-address>] \
    [--input <json-file>] [--out <json-file>] [--json]

Notes:
  - --rpc-url must point at the chain that serves the ERC-8004 identity registry used in --agent-registry.
  - --chain-id must match the chain encoded in --agent-registry for this local CLI flow.
  - The challenge is stored in a local nonce store (default: packages/foundry/.siwa-nonces.json).
  - The returned JSON is meant to feed directly into siwa-sign for a keystore-first local signing flow.

Example:
  node scripts-js/authCli.js siwa-nonce --rpc-url localhost --wallet 0xWallet \
    --agent-id 42 --agent-registry eip155:31337:0xMockIdentityRegistry \
    --domain prisoners.local --uri https://prisoners.local/siwa \
    --chain-id 31337 --nonce-store tmp/siwa-nonces.json --out siwa-challenge.json
`);
}

function printSiwaSignHelp() {
  console.log(`
${SIWA_SIGN_BOUNDARY_NOTE}

Usage:
  node scripts-js/authCli.js siwa-sign --input <siwa-challenge.json> \
    [--wallet-keystore <name|path>] \
    [--wallet-keystore-password-env <ENV> | --wallet-keystore-password-file <file>] \
    [--out <json-file>] [--json]

Notes:
  - --input should normally be the JSON output from siwa-nonce and must include the SIWA fields to sign.
  - The gameplay signer must match the challenge wallet exactly.
  - Prefer Foundry keystores for local use. If no keystore password env/file is supplied, the CLI prompts interactively.
  - Raw --wallet-private-key is disabled unless you also pass --allow-unsafe-private-key.
  - When the challenge file includes nonceStore / registry context, this command carries it forward so the signed JSON can flow directly into siwa-verify.
  - The output JSON can flow directly into: node scripts-js/authCli.js siwa-verify --rpc-url <url|network> --input signed-siwa.json ...

Example:
  node scripts-js/authCli.js siwa-sign --input siwa-challenge.json \
    --wallet-keystore gameplay-demo \
    --wallet-keystore-password-env GAMEPLAY_KEYSTORE_PASSWORD \
    --out signed-siwa.json
`);
}

function printSiwaVerifyHelp() {
  console.log(`
${SIWA_VERIFY_BOUNDARY_NOTE}

Usage:
  node scripts-js/authCli.js siwa-verify --rpc-url <url|network> \
    (--input <signed-siwa.json> | --message-file <message.txt> --signature <hex>) \
    [--nonce-store <json-file>] [--registry <auth-registry-address>] \
    (--manifest-hash <bytes32> | --manifest-uri <text> | --manifest-text <text>) \
    [--out <json-file>] [--json]

Notes:
  - The signed SIWA payload must match a previously issued siwa-nonce challenge.
  - The nonce is consumed on verification attempt; if verification fails, issue a new challenge.
  - The output JSON is shaped to feed directly into: node scripts-js/authCli.js permit --rpc-url <game-chain> --input verified-auth.json
  - Manifest binding is operator-supplied context for the later auth permit, not something SIWA authenticates.

Example:
  node scripts-js/authCli.js siwa-verify --rpc-url localhost --input signed-siwa.json \
    --nonce-store tmp/siwa-nonces.json --manifest-uri manifest://agent-alpha \
    --registry 0xAgentAuthRegistry --out verified-auth.json
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
    [--verifier-keystore <name|path>] \
    [--verifier-keystore-password-env <ENV> | --verifier-keystore-password-file <file>] \
    [--input <json-file>] \
    [--out <json-file>] [--json] \
    [--register [--wallet-keystore <name|path>] [--wallet-keystore-password-env <ENV> | --wallet-keystore-password-file <file>]]

Notes:
  - For local chains (31337/1337), expiry defaults to 0 if you omit --expires-at/--ttl-seconds.
  - For non-local chains, expiry is required.
  - --input lets siwa-verify or another verifier hand this CLI already-approved fields. This command does NOT verify SIWA.
  - When --input includes verified SIWA context, the permit chain/registry must match that verified context or the command rejects.
  - Permit issuedAt defaults to the current chain time at signing; SIWA input timestamps are reference data unless you explicitly pass --issued-at.
  - Prefer Foundry keystores for local use. If no keystore password env/file is supplied, the CLI prompts interactively.
  - Raw --verifier-private-key / --wallet-private-key flags are disabled unless you also pass --allow-unsafe-private-key.
  - For non-interactive local automation, environment fallbacks still exist: AUTH_VERIFIER_PRIVATE_KEY and GAMEPLAY_WALLET_PRIVATE_KEY.

Examples:
  node scripts-js/authCli.js permit --rpc-url localhost --registry 0xRegistry --wallet 0xWallet \
    --agent-key-text agent-alpha --manifest-uri manifest://agent-alpha \
    --ttl-seconds 3600 --verifier-keystore verifier-demo \
    --verifier-keystore-password-env VERIFIER_KEYSTORE_PASSWORD --out auth-permit.json

  node scripts-js/authCli.js permit --rpc-url baseSepolia --registry 0xRegistry --input verified-auth.json \
    --expires-at 1760000000 --verifier-keystore ~/.foundry/keystores/auth-verifier.json \
    --verifier-keystore-password-file ./secrets/verifier.pass --json
`);
}

function printStatusHelp() {
  console.log(`
Usage:
  node scripts-js/authCli.js status --rpc-url <url|network> --registry <address> --wallet <address> [--nonce <bytes32>] [--json]
  node scripts-js/authCli.js status --rpc-url <url|network> --permit-file <permit-bundle.json> [--json]

Notes:
  - When you pass --permit-file, the command also inspects whether that bundle is still registerable against the live registry verifier, nonce state, and expiry window.

Examples:
  node scripts-js/authCli.js status --rpc-url localhost --registry 0xRegistry --wallet 0xWallet
  node scripts-js/authCli.js status --rpc-url localhost --permit-file auth-permit.json --json
`);
}

function printRegisterHelp() {
  console.log(`
Usage:
  node scripts-js/authCli.js register --rpc-url <url|network> --permit-file <permit-bundle.json> \
    [--registry <address>] [--wallet-keystore <name|path>] \
    [--wallet-keystore-password-env <ENV> | --wallet-keystore-password-file <file>] [--json]

Notes:
  - The gameplay wallet signer must match permit.wallet exactly.
  - This command fails fast if the bundle targets the wrong registry, is expired, uses a spent nonce, or no longer matches the registry verifier.
  - This command submits registerAuth(...) only. It does not perform SIWA verification.
  - Raw --wallet-private-key is disabled unless you also pass --allow-unsafe-private-key.
  - For non-interactive local automation, GAMEPLAY_WALLET_PRIVATE_KEY remains available as an environment fallback.

Example:
  node scripts-js/authCli.js register --rpc-url localhost --permit-file auth-permit.json \
    --wallet-keystore gameplay-demo --wallet-keystore-password-env GAMEPLAY_KEYSTORE_PASSWORD --json
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
    if (subcommand === "siwa-nonce") {
      printSiwaNonceHelp();
      return;
    }
    if (subcommand === "siwa-sign") {
      printSiwaSignHelp();
      return;
    }
    if (subcommand === "siwa-verify") {
      printSiwaVerifyHelp();
      return;
    }
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

  if (subcommand === "siwa-nonce") {
    const challenge = await issueSiwaChallenge(args);
    const outputPath = args.out ? writeJson(args.out, challenge) : null;

    if (args.json) {
      printJson(challenge);
    } else {
      printSiwaChallengeSummary(challenge, outputPath);
    }
    return;
  }

  if (subcommand === "siwa-sign") {
    const signed = await signIssuedSiwaChallenge(args);
    const outputPath = args.out ? writeJson(args.out, signed) : null;

    if (args.json) {
      printJson(signed);
    } else {
      printSiwaSignSummary(signed, outputPath);
    }
    return;
  }

  if (subcommand === "siwa-verify") {
    const verified = await verifySiwaAuthInput(args);
    const outputPath = args.out ? writeJson(args.out, verified) : null;

    if (args.json) {
      printJson(verified);
    } else {
      printSiwaVerificationSummary(verified, outputPath);
    }
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
    `Unknown auth command '${subcommand}'. Use siwa-nonce, siwa-sign, siwa-verify, permit, status, or register.`
  );
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
