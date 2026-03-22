#!/usr/bin/env node
import {
  getAuthStatus,
  parseCliArgs,
  printJson,
  printRegistrationSummary,
  printStatusSummary,
  registerIdentity,
  writeJson,
} from "./authTooling.js";

const OVERVIEW = [
  "Permissionless ERC-8004 admission tooling for Prisoners DAOlemma.",
  "",
  "Live path: wallets self-register on the ERC-8004 Identity Registry, and the game reads admission through ERC8004AuthAdapter.",
  "No verifier-backed permits. No hybrid admission mode.",
].join("\n");

const HELP = `${OVERVIEW}

Usage:
  node scripts-js/authCli.js <command> [options]

Commands:
  register   Self-register the signer on the ERC-8004 Identity Registry.
  status     Inspect ERC-8004 admission status for a wallet / agent.
  help       Show this message.

register:
  node scripts-js/authCli.js register --rpc-url <url|network> \
    --identity-registry <address> \
    --wallet-keystore <name|path> --wallet-keystore-password-file <file> \
    [--wallet <address>] [--agent-uri <uri>] [--game <game>] [--auth-registry <adapter>] [--out <file>] [--json]

  Notes:
  - --identity-registry is the ERC-8004 registry that actually performs self-registration.
  - --game or --auth-registry are optional context fields recorded in the output.
  - The signer must match --wallet when provided.

status:
  node scripts-js/authCli.js status --rpc-url <url|network> \
    [--identity-registry <address> | --auth-registry <address> | --game <game> | --registration-file <file>] \
    [--wallet <address>] [--agent-id <id>] [--out <file>] [--json]

Deprecated:
  The old verifier-backed permit/register flow has been removed from the live tooling.
`;

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exitCode = 1;
}

async function main() {
  const { subcommand, args } = parseCliArgs();
  const command = subcommand ?? "help";

  if (args.help || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "permit") {
    throw new Error(
      "The verifier-backed permit flow has been retired. Use 'register' for ERC-8004 self-registration."
    );
  }

  if (command === "register") {
    const result = await registerIdentity(args);
    if (args.out) {
      writeJson(args.out, result);
    }
    if (args.json) {
      printJson(result);
    } else {
      printRegistrationSummary(result);
      if (args.out) {
        console.log(`Output file:       ${args.out}`);
      }
    }
    return;
  }

  if (command === "status") {
    const result = await getAuthStatus(args);
    if (args.out) {
      writeJson(args.out, result);
    }
    if (args.json) {
      printJson(result);
    } else {
      printStatusSummary(result);
      if (args.out) {
        console.log(`Output file:       ${args.out}`);
      }
    }
    return;
  }

  throw new Error(`Unknown auth command '${command}'. Use register, status, or help.`);
}

main().catch((error) => fail(error.message));
