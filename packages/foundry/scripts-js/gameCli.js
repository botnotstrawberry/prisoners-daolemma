import { parseCliArgs, printJson } from "./authTooling.js";
import {
  GAMEPLAY_BOUNDARY_NOTE,
  PREPARED_COMMIT_SECRET_NOTE,
  advancePhaseAction,
  cancelIfInsufficientPlayersAction,
  claimAction,
  commitAction,
  createGameAction,
  joinGameAction,
  postCauseAction,
  postGlobalAction,
  prepareCommitAction,
  printGameplayResult,
  refundAction,
  revealAction,
  whitelistCauseAction,
  withdrawCauseAction,
  withdrawTreasuryAction,
} from "./gameTooling.js";

function printMainHelp() {
  console.log(`
Prisoners DAOlemma gameplay/operator CLI

${GAMEPLAY_BOUNDARY_NOTE}

Usage:
  node scripts-js/gameCli.js <command> [options]

Commands:
  whitelist-cause           Owner-only: whitelist or update a cause while the contract is idle.
  create                    Create a new game from the current default config.
  advance                   Advance the selected game to its next onchain phase.
  cancel-if-insufficient    Cancel a joining game after the join window closes without enough players.
  join                      Join a game with the current wallet and selected cause.
  prepare-commit            Build a local commit bundle (choice + salt + commitment) for the current round.
  commit                    Submit a commitment for the current round.
  reveal                    Reveal a committed move for the current round.
  claim                     Claim a finalized winner payout.
  refund                    Claim a finalized cancelled-game refund.
  withdraw-treasury         Withdraw currently claimable treasury funds for a game.
  withdraw-cause            Withdraw currently claimable cause funds for a game/cause.
  post-global               Post a global GameChat message.
  post-cause                Post a cause-scoped GameChat message.

Reads/evidence:
  Use queryCli.js / yarn query:* for state snapshots, messages, and evidence export.

Run a command with --help for details.
`);
}

function sharedSignerOptions() {
  return `Common signer options:
  --wallet <address>                      Optional expected wallet address. Useful for extra safety checks and for prepare-commit.
  --wallet-keystore <name|path>           Preferred gameplay signer input.
  --wallet-keystore-password-env <ENV>    Read keystore password from ENV.
  --wallet-keystore-password-file <file>  Read keystore password from a file.
  --wallet-private-key <hex>              Disabled unless paired with --allow-unsafe-private-key.
  --allow-unsafe-private-key              Re-enable raw private key CLI flags for ephemeral local tests only.
  --json                                  Print machine-readable JSON.
`;
}

function sharedGameOptions({ includeGameId = true, includeChat = false } = {}) {
  return `Common contract options:
  --rpc-url <url|network>                 Required unless AUTH_RPC_URL/RPC_URL is set.
  --game <address|name>                   Game contract address or deployment name. Defaults to deployed PrisonersDAOlemma for the connected chain when available.
${
  includeGameId
    ? "  --game-id <uint256>                     Optional. Defaults to activeGameId, then currentGameId.\n"
    : ""
}${
    includeChat
      ? "  --chat <address|name>                   Chat contract address or deployment name. Defaults to deployed GameChat for the connected chain when available.\n"
      : ""
  }`;
}

function printWhitelistCauseHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js whitelist-cause --rpc-url <url|network> [--game <address|name>] \
    --cause-id <uint16> --recipient <address> (--metadata-hash <bytes32> | --metadata-text <text>) \
    [signer options] [--json]

${sharedGameOptions({ includeGameId: false })}
${sharedSignerOptions()}
Additional options:
  --cause-id <uint16>                     Required cause identifier to whitelist.
  --recipient <address>                   Required payout recipient for that cause.
  --metadata-hash <bytes32>               Use an explicit metadata hash.
  --metadata-text <text>                  Hash a human-readable cause label into bytes32 locally.

Notes:
  - This wraps whitelistCause(causeId, recipient, metadataHash).
  - The selected wallet must be the game owner's wallet.
  - The contract must still be idle; whitelisting is not allowed once a game is active.
  - A fresh deployment needs at least one active cause before createGame() will succeed.

Example:
  node scripts-js/gameCli.js whitelist-cause --rpc-url baseSepolia --game 0xGame \
    --cause-id 1 --recipient 0xCauseRecipient --metadata-text "cause-alpha" \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printCreateHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js create --rpc-url <url|network> [--game <address|name>] [signer options] [--json]

${sharedGameOptions({ includeGameId: false })}
${sharedSignerOptions()}
Notes:
  - The selected wallet must be the game owner's wallet.
  - This command only wraps the contract's existing createGame() entrypoint.

Example:
  node scripts-js/gameCli.js create --rpc-url localhost --game 0xGame \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printAdvanceHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js advance --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Notes:
  - If --game-id is omitted, the command falls back to activeGameId, then currentGameId.
  - The command checks canAdvancePhase(gameId) before submitting the transaction.

Example:
  node scripts-js/gameCli.js advance --rpc-url localhost --game-id 1 \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printCancelHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js cancel-if-insufficient --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Notes:
  - This wraps cancelIfInsufficientPlayers(gameId).
  - Use it after the join window closes when the game stayed below minPlayers.
  - This is the repo-native operator path that unlocks onchain refunds for underfilled games.

Example:
  node scripts-js/gameCli.js cancel-if-insufficient --rpc-url localhost --game-id 2 \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printJoinHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js join --rpc-url <url|network> [--game <address|name>] [--game-id <id>] --cause-id <uint16> [--value-wei <wei>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Additional options:
  --cause-id <uint16>                     Required cause selection for the joining wallet.
  --value-wei <wei>                       Optional explicit msg.value. Defaults to the current game's entryFeeWei.

Notes:
  - The command does not bypass auth; the wallet still must already be authorized onchain.
  - If --value-wei is omitted, the command reads the live entry fee from getGame(gameId).

Example:
  node scripts-js/gameCli.js join --rpc-url localhost --game-id 1 --cause-id 2 \
    --wallet-keystore player-2 --wallet-keystore-password-file .secrets/player-2.pass
`);
}

function printPrepareCommitHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js prepare-commit --rpc-url <url|network> [--game <address|name>] [--game-id <id>] \
    --choice <share|catch|steal|1|2|3> [--salt <bytes32> | --salt-text <text>] [--out <file>] \
    [--wallet <address> | signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Additional options:
  --choice <share|catch|steal|1|2|3>      Required move for this round.
  --salt <bytes32>                        Optional explicit 32-byte salt.
  --salt-text <text>                      Optional UTF-8 text hashed into bytes32.
  --out <file>                            Optional output file for the prepared commit bundle.

Notes:
  - The command reads the live game round and computes the commitment against the current wallet.
  - If no salt flag is provided, it generates a random salt locally.
  - ${PREPARED_COMMIT_SECRET_NOTE}
  - Use --out if you want a reusable bundle for both commit and reveal.

Example:
  node scripts-js/gameCli.js prepare-commit --rpc-url localhost --game-id 1 --choice share \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass \
    --out commit-bundles/game-1-round-1-player-1.json
`);
}

function printCommitHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js commit --rpc-url <url|network> [--game <address|name>] [--game-id <id>] \
    (--commitment <bytes32> | --input <prepared-commit.json>) [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Additional options:
  --commitment <bytes32>                  Submit a precomputed commitment directly.
  --input <prepared-commit.json>          Load a bundle produced by prepare-commit.

Notes:
  - When --input is used, the command checks chain/game/gameId/wallet/round alignment before sending.
  - This command only submits the commitment; it does not hide the salt/reveal boundary.

Example:
  node scripts-js/gameCli.js commit --rpc-url localhost --game-id 1 \
    --input commit-bundles/game-1-round-1-player-1.json \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass
`);
}

function printRevealHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js reveal --rpc-url <url|network> [--game <address|name>] [--game-id <id>] \
    (--input <prepared-commit.json> | (--choice <share|catch|steal|1|2|3> [--salt <bytes32> | --salt-text <text>])) \
    [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Additional options:
  --input <prepared-commit.json>          Preferred: reveal from a prepared bundle.
  --choice <share|catch|steal|1|2|3>      Required when not using --input.
  --salt <bytes32>                        Required when not using --input unless you use --salt-text.
  --salt-text <text>                      Required when not using --input unless you use --salt.

Notes:
  - The command computes the expected commitment locally and checks it against the stored onchain commitment before submitting reveal().
  - Using the same bundle file for commit + reveal avoids accidental round/wallet mismatches.

Example:
  node scripts-js/gameCli.js reveal --rpc-url localhost --game-id 1 \
    --input commit-bundles/game-1-round-1-player-1.json \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass
`);
}

function printClaimHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js claim --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Notes:
  - The command checks previewWinnerClaim(gameId, wallet).availableNow before sending claim().

Example:
  node scripts-js/gameCli.js claim --rpc-url localhost --game-id 1 \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass
`);
}

function printRefundHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js refund --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Notes:
  - This wraps claimRefund(gameId) and checks previewRefund(gameId, wallet).availableNow first.

Example:
  node scripts-js/gameCli.js refund --rpc-url localhost --game-id 2 \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass
`);
}

function printWithdrawTreasuryHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js withdraw-treasury --rpc-url <url|network> [--game <address|name>] [--game-id <id>] [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Notes:
  - The command checks treasuryClaimableAmount(gameId) before sending withdrawTreasury(gameId).

Example:
  node scripts-js/gameCli.js withdraw-treasury --rpc-url localhost --game-id 3 \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printWithdrawCauseHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js withdraw-cause --rpc-url <url|network> [--game <address|name>] [--game-id <id>] --cause-id <uint16> [signer options] [--json]

${sharedGameOptions()}
${sharedSignerOptions()}
Additional options:
  --cause-id <uint16>                     Required cause to withdraw for this game.

Notes:
  - The command checks gameCauseClaimableAmount(gameId, causeId) before sending withdrawCause(gameId, causeId).

Example:
  node scripts-js/gameCli.js withdraw-cause --rpc-url localhost --game-id 3 --cause-id 1 \
    --wallet-keystore owner --wallet-keystore-password-file .secrets/owner.pass
`);
}

function printPostGlobalHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js post-global --rpc-url <url|network> [--game <address|name>] [--chat <address|name>] [--game-id <id>] \
    --text <message> [signer options] [--json]

${sharedGameOptions({ includeGameId: true, includeChat: true })}
${sharedSignerOptions()}
Additional options:
  --text <message>                        Required message text.

Notes:
  - The command checks that the selected chat contract is linked to the selected game contract.
  - Global posting still follows the current onchain GameChat rules.

Example:
  node scripts-js/gameCli.js post-global --rpc-url localhost --game-id 1 --chat 0xChat \
    --text "round one global check-in" \
    --wallet-keystore player-1 --wallet-keystore-password-file .secrets/player-1.pass
`);
}

function printPostCauseHelp() {
  console.log(`
Usage:
  node scripts-js/gameCli.js post-cause --rpc-url <url|network> [--game <address|name>] [--chat <address|name>] [--game-id <id>] \
    --cause-id <uint16> --text <message> [signer options] [--json]

${sharedGameOptions({ includeGameId: true, includeChat: true })}
${sharedSignerOptions()}
Additional options:
  --cause-id <uint16>                     Required cause channel.
  --text <message>                        Required message text.

Notes:
  - Cause posting still follows the current onchain GameChat rules: joined + alive + matching cause.

Example:
  node scripts-js/gameCli.js post-cause --rpc-url localhost --game-id 1 --chat 0xChat --cause-id 2 \
    --text "cause two staying aligned" \
    --wallet-keystore player-2 --wallet-keystore-password-file .secrets/player-2.pass
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
    if (subcommand === "whitelist-cause") {
      printWhitelistCauseHelp();
      return;
    }
    if (subcommand === "create") {
      printCreateHelp();
      return;
    }
    if (subcommand === "advance") {
      printAdvanceHelp();
      return;
    }
    if (subcommand === "cancel-if-insufficient") {
      printCancelHelp();
      return;
    }
    if (subcommand === "join") {
      printJoinHelp();
      return;
    }
    if (subcommand === "prepare-commit") {
      printPrepareCommitHelp();
      return;
    }
    if (subcommand === "commit") {
      printCommitHelp();
      return;
    }
    if (subcommand === "reveal") {
      printRevealHelp();
      return;
    }
    if (subcommand === "claim") {
      printClaimHelp();
      return;
    }
    if (subcommand === "refund") {
      printRefundHelp();
      return;
    }
    if (subcommand === "withdraw-treasury") {
      printWithdrawTreasuryHelp();
      return;
    }
    if (subcommand === "withdraw-cause") {
      printWithdrawCauseHelp();
      return;
    }
    if (subcommand === "post-global") {
      printPostGlobalHelp();
      return;
    }
    if (subcommand === "post-cause") {
      printPostCauseHelp();
      return;
    }

    printMainHelp();
    return;
  }

  let result;

  if (subcommand === "whitelist-cause") {
    result = await whitelistCauseAction(args);
  } else if (subcommand === "create") {
    result = await createGameAction(args);
  } else if (subcommand === "advance") {
    result = await advancePhaseAction(args);
  } else if (subcommand === "cancel-if-insufficient") {
    result = await cancelIfInsufficientPlayersAction(args);
  } else if (subcommand === "join") {
    result = await joinGameAction(args);
  } else if (subcommand === "prepare-commit") {
    result = await prepareCommitAction(args);
  } else if (subcommand === "commit") {
    result = await commitAction(args);
  } else if (subcommand === "reveal") {
    result = await revealAction(args);
  } else if (subcommand === "claim") {
    result = await claimAction(args);
  } else if (subcommand === "refund") {
    result = await refundAction(args);
  } else if (subcommand === "withdraw-treasury") {
    result = await withdrawTreasuryAction(args);
  } else if (subcommand === "withdraw-cause") {
    result = await withdrawCauseAction(args);
  } else if (subcommand === "post-global") {
    result = await postGlobalAction(args);
  } else if (subcommand === "post-cause") {
    result = await postCauseAction(args);
  } else {
    throw new Error(
      `Unknown gameplay command '${subcommand}'. Use whitelist-cause, create, advance, cancel-if-insufficient, join, prepare-commit, commit, reveal, claim, refund, withdraw-treasury, withdraw-cause, post-global, or post-cause.`
    );
  }

  if (args.json) {
    printJson(result);
  } else {
    printGameplayResult(result);
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
