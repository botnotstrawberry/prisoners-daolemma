import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { parseMessagesJsonl } from "./queryTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const authRegistryArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "AgentAuthRegistry.sol", "AgentAuthRegistry.json"),
    "utf8"
  )
);
const identityRegistryArtifact = JSON.parse(
  readFileSync(
    join(
      packageDir,
      "out",
      "MockAgentIdentityRegistry.sol",
      "MockAgentIdentityRegistry.json"
    ),
    "utf8"
  )
);
const gameArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "PrisonersDaollema.sol", "PrisonersDaollema.json"),
    "utf8"
  )
);
const chatArtifact = JSON.parse(
  readFileSync(join(packageDir, "out", "GameChat.sol", "GameChat.json"), "utf8")
);

const RPC_URL = "http://127.0.0.1:8550";
const ANVIL_PORT = "8550";
const CHAIN_ID = 31337;
const OWNER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AUTH_FLOW_STEPS = [
  "siwa-nonce",
  "siwa-sign",
  "siwa-verify",
  "auth:permit",
  "auth:register",
  "auth:status",
];
const KEYSTORE_OPTIONS = {
  scrypt: {
    N: 1 << 12,
    r: 8,
    p: 1,
  },
};

let anvilProcess;

before(async () => {
  anvilProcess = spawn(
    "anvil",
    [
      "--port",
      ANVIL_PORT,
      "--chain-id",
      String(CHAIN_ID),
      "--code-size-limit",
      "131072",
    ],
    {
      cwd: packageDir,
      stdio: "ignore",
    }
  );

  await waitForAnvil();
});

after(async () => {
  if (!anvilProcess) {
    return;
  }

  await new Promise((resolve) => {
    anvilProcess.once("exit", resolve);
    anvilProcess.kill("SIGTERM");
  });
});

test(
  "integration smoke covers local auth wrapper, join/commit/reveal, chat, and evidence export",
  { concurrency: false },
  async () => {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const owner = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    const verifier = ethers.Wallet.createRandom();
    const player1 = ethers.Wallet.createRandom().connect(provider);
    const player2 = ethers.Wallet.createRandom().connect(provider);

    await fundWallet(owner, player1.address, "2");
    await fundWallet(owner, player2.address, "2");

    const authRegistry = await deployAuthRegistry(owner, verifier.address);
    const identityRegistry = await deployIdentityRegistry(owner);
    const game = await deployGame(owner, authRegistry.address);
    const chat = await deployChat(owner, game.address);

    await (await identityRegistry.setOwner("101", player1.address)).wait();
    await (await identityRegistry.setOwner("202", player2.address)).wait();

    await (await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))).wait();
    await (await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))).wait();

    const tempDir = mkdtempSync(join(tmpdir(), "pd-integration-smoke-"));
    const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
    const player1Setup = await writeKeystoreFixture(tempDir, "player-1", player1);
    const player2Setup = await writeKeystoreFixture(tempDir, "player-2", player2);
    const agentRegistry = `eip155:${CHAIN_ID}:${identityRegistry.address}`;

    const player1Flow = runAuthFlow({
      authRegistry: authRegistry.address,
      agentRegistry,
      agentId: "101",
      manifestUri: "manifest://agent-alpha",
      verifierSetup,
      walletSetup: player1Setup,
      workDir: join(tempDir, "player-1-auth"),
    });
    const player2Flow = runAuthFlow({
      authRegistry: authRegistry.address,
      agentRegistry,
      agentId: "202",
      manifestUri: "manifest://agent-beta",
      verifierSetup,
      walletSetup: player2Setup,
      workDir: join(tempDir, "player-2-auth"),
    });

    assert.equal(player1Flow.localOnly, true);
    assert.equal(player2Flow.localOnly, true);
    assert.equal(player1Flow.results.status.isAuthorized, true);
    assert.equal(player2Flow.results.status.isAuthorized, true);
    assert.equal(
      player1Flow.results.registration.wallet.toLowerCase(),
      player1.address.toLowerCase()
    );
    assert.equal(
      player2Flow.results.registration.wallet.toLowerCase(),
      player2.address.toLowerCase()
    );
    assert.deepEqual(
      player1Flow.steps.map((step) => step.name),
      AUTH_FLOW_STEPS
    );
    assert.deepEqual(
      player2Flow.steps.map((step) => step.name),
      AUTH_FLOW_STEPS
    );

    for (const filePath of Object.values(player1Flow.files)) {
      assert.equal(existsSync(filePath), true);
    }
    for (const filePath of Object.values(player2Flow.files)) {
      assert.equal(existsSync(filePath), true);
    }

    await (await game.createGame()).wait();

    const entryFee = ethers.utils.parseEther("0.001");
    await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
    await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

    await provider.send("evm_increaseTime", [2]);
    await provider.send("evm_mine", []);
    await (await game.advancePhase(1)).wait();

    await (await chat.connect(player1).postGlobal(1, "hello judges")).wait();

    const round = Number((await game.getGame(1)).round);
    const shareChoice = 1;
    const catchChoice = 2;
    const salt1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-alpha"));
    const salt2 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-beta"));
    const commitment1 = await game.computeCommitment(
      1,
      round,
      player1.address,
      shareChoice,
      salt1
    );
    const commitment2 = await game.computeCommitment(
      1,
      round,
      player2.address,
      catchChoice,
      salt2
    );

    await (await game.connect(player1).commit(1, commitment1)).wait();
    await (await game.connect(player2).commit(1, commitment2)).wait();
    await (await game.advancePhase(1)).wait();

    await (await game.connect(player1).reveal(1, shareChoice, salt1)).wait();
    await (await game.connect(player2).reveal(1, catchChoice, salt2)).wait();
    await (await chat.connect(player2).postCause(1, 2, "cause two reporting in")).wait();

    assert.equal(await game.isRoundReadyForResolution(1), true);

    const exportDir = join(tempDir, "evidence-export");
    const manifest = JSON.parse(
      runQueryCli([
        "export",
        "--rpc-url",
        RPC_URL,
        "--game",
        game.address,
        "--registry",
        authRegistry.address,
        "--chat",
        chat.address,
        "--game-id",
        "1",
        "--out",
        exportDir,
        "--json",
      ])
    );

    const summary = JSON.parse(
      readFileSync(join(exportDir, "game-summary.json"), "utf8")
    );
    const roster = JSON.parse(readFileSync(join(exportDir, "roster.json"), "utf8"));
    const causes = JSON.parse(readFileSync(join(exportDir, "causes.json"), "utf8"));
    const rounds = JSON.parse(readFileSync(join(exportDir, "rounds.json"), "utf8"));
    const auth = JSON.parse(readFileSync(join(exportDir, "auth.json"), "utf8"));
    const payouts = JSON.parse(
      readFileSync(join(exportDir, "payouts.json"), "utf8")
    );
    const messages = parseMessagesJsonl(
      readFileSync(join(exportDir, "messages.jsonl"), "utf8")
    );

    assert.equal(manifest.gameId, 1);
    assert.ok(
      manifest.produced.some((artifact) => artifact.artifact === "messages.jsonl")
    );
    assert.ok(
      manifest.produced.some(
        (artifact) => artifact.artifact === "export-manifest.json"
      )
    );
    assert.ok(
      manifest.produced.some((artifact) => artifact.artifact === "payouts.json")
    );

    assert.equal(summary.game.phase, "Reveal");
    assert.equal(summary.game.round, 1);
    assert.equal(summary.game.counts.joined, 2);
    assert.equal(summary.game.counts.committed, 2);
    assert.equal(summary.game.counts.revealed, 2);
    assert.equal(summary.game.counts.messages, 2);
    assert.ok(
      summary.capabilities.available.includes("game-chat-message-export")
    );
    assert.ok(
      summary.capabilities.available.includes("round-resolution-outcomes")
    );
    assert.ok(
      summary.capabilities.available.includes("claim-refund-settlement-data")
    );
    assert.ok(
      summary.capabilities.available.includes("payout-destination-audit")
    );
    assert.deepEqual(summary.capabilities.unavailable, []);

    assert.equal(roster.participants.length, 2);
    assert.deepEqual(
      roster.participants.map((participant) => participant.causeId),
      [1, 2]
    );
    assert.deepEqual(
      roster.participants.map((participant) => participant.auth.status),
      ["active", "active"]
    );

    assert.equal(causes.usedCauses.length, 2);
    assert.deepEqual(
      causes.usedCauses.map((cause) => cause.causeId),
      [1, 2]
    );

    assert.equal(rounds.rounds.length, 1);
    assert.equal(rounds.rounds[0].round, 1);
    assert.equal(rounds.rounds[0].commits.length, 2);
    assert.equal(rounds.rounds[0].reveals.length, 2);
    assert.equal(rounds.rounds[0].resolutionAvailable, false);
    assert.equal(rounds.rounds[0].settlementAvailable, false);

    assert.equal(payouts.settlement.finalized, false);
    assert.equal(payouts.events.prizeClaims.length, 0);
    assert.equal(payouts.causes.length, 2);

    assert.equal(auth.participants.length, 2);
    assert.ok(
      auth.participants.every((participant) =>
        participant.events.some((event) => event.type === "AuthRegistered")
      )
    );

    assert.equal(messages.length, 2);
    assert.equal(messages[0].scope, "global");
    assert.equal(messages[0].phase, "Commit");
    assert.equal(messages[0].round, 1);
    assert.equal(
      messages[0].senderWallet.toLowerCase(),
      player1.address.toLowerCase()
    );
    assert.equal(messages[1].scope, "cause");
    assert.equal(messages[1].phase, "Reveal");
    assert.equal(messages[1].round, 1);
    assert.equal(messages[1].causeId, 2);
    assert.equal(messages[1].senderCause, 2);
    assert.equal(messages[1].isActualCauseSpeaker, true);
    assert.equal(
      messages[1].senderWallet.toLowerCase(),
      player2.address.toLowerCase()
    );
  }
);

function runAuthFlow({
  authRegistry,
  agentRegistry,
  agentId,
  manifestUri,
  verifierSetup,
  walletSetup,
  workDir,
}) {
  return JSON.parse(
    runFlowCli([
      "--rpc-url",
      RPC_URL,
      "--registry",
      authRegistry,
      "--agent-registry",
      agentRegistry,
      "--agent-id",
      agentId,
      "--manifest-uri",
      manifestUri,
      "--domain",
      "prisoners.local",
      "--wallet-keystore",
      walletSetup.keystorePath,
      "--wallet-keystore-password-file",
      walletSetup.passwordFile,
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--work-dir",
      workDir,
      "--json",
    ])
  );
}

async function deployAuthRegistry(owner, verifierAddress) {
  const factory = new ethers.ContractFactory(
    authRegistryArtifact.abi,
    authRegistryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(owner.address, verifierAddress);
  await contract.deployed();
  return contract;
}

async function deployIdentityRegistry(owner) {
  const factory = new ethers.ContractFactory(
    identityRegistryArtifact.abi,
    identityRegistryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy();
  await contract.deployed();
  return contract;
}

async function deployGame(owner, authRegistryAddress) {
  const factory = new ethers.ContractFactory(
    gameArtifact.abi,
    gameArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(
    owner.address,
    owner.address,
    authRegistryAddress,
    {
      entryFeeWei: ethers.utils.parseEther("0.001"),
      creatorFeeBps: 100,
      causeFeeBps: 100,
      joinDurationSeconds: 1,
      commitDurationBlocks: 5,
      revealDurationBlocks: 5,
      minPlayers: 2,
      maxPlayers: 4,
      maxCauses: 2,
    }
  );
  await contract.deployed();
  return contract;
}

async function deployChat(owner, gameAddress) {
  const factory = new ethers.ContractFactory(
    chatArtifact.abi,
    chatArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(gameAddress);
  await contract.deployed();
  return contract;
}

async function fundWallet(owner, target, amountEth) {
  await (
    await owner.sendTransaction({
      to: target,
      value: ethers.utils.parseEther(amountEth),
    })
  ).wait();
}

async function writeKeystoreFixture(tempDir, label, wallet) {
  const password = `${label}-password`;
  const keystorePath = join(tempDir, `${label}.keystore.json`);
  const passwordFile = join(tempDir, `${label}.pass`);
  writeFileSync(passwordFile, `${password}\n`, "utf8");
  writeFileSync(
    keystorePath,
    `${await wallet.encrypt(password, KEYSTORE_OPTIONS)}\n`,
    "utf8"
  );

  return { keystorePath, passwordFile, password };
}

async function waitForAnvil() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for anvil to start at ${RPC_URL}.`);
}

function runFlowCli(args) {
  return execFileSync("node", ["scripts-js/authFlowCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}

function runQueryCli(args) {
  return execFileSync("node", ["scripts-js/queryCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}
