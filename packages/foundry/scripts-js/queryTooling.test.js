import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { parseMessagesJsonl } from "./queryTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const registryArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "AgentAuthRegistry.sol", "AgentAuthRegistry.json"),
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

const RPC_URL = "http://127.0.0.1:8548";
const ANVIL_PORT = "8548";
const ANVIL_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
];
const AUTH_DOMAIN = {
  name: "PrisonersDaollemaAgentAuthRegistry",
  version: "1",
};
const AUTH_TYPES = {
  AuthPermit: [
    { name: "wallet", type: "address" },
    { name: "agentKey", type: "bytes32" },
    { name: "manifestHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "gameNamespace", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
};

let anvilProcess;

before(async () => {
  anvilProcess = spawn(
    "anvil",
    ["--port", ANVIL_PORT, "--chain-id", "31337", "--code-size-limit", "131072"],
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

test("query export writes honest evidence artifacts for current auth/game/chat state", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);
  const chat = await deployChat(owner, game.address);

  await (await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))).wait();
  await (await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))).wait();
  await (await game.createGame()).wait();

  await registerWallet({ provider, registry, verifier, wallet: player1, agentKeyText: "agent-alpha", nonceText: "nonce-alpha" });
  await registerWallet({ provider, registry, verifier, wallet: player2, agentKeyText: "agent-beta", nonceText: "nonce-beta" });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  await (await chat.connect(player1).postGlobal(1, "hello judges")).wait();

  const snapshotAfterCommitStart = await game.getGame(1);
  const round = Number(snapshotAfterCommitStart.round);
  const shareChoice = 1;
  const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-alpha"));
  const commitment = await game.computeCommitment(
    1,
    round,
    player1.address,
    shareChoice,
    salt
  );
  await (await game.connect(player1).commit(1, commitment)).wait();

  await provider.send("evm_mine", []);
  await provider.send("evm_mine", []);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  await (await chat.connect(player2).postCause(1, 2, "cause two reporting in")).wait();
  await (await game.connect(player1).reveal(1, shareChoice, salt)).wait();

  const outputDir = mkdtempSync(join(tmpdir(), "pd-query-export-"));
  const manifest = JSON.parse(
    runCli([
      "export",
      "--rpc-url",
      RPC_URL,
      "--game",
      game.address,
      "--registry",
      registry.address,
      "--chat",
      chat.address,
      "--game-id",
      "1",
      "--out",
      outputDir,
      "--json",
    ])
  );

  const summary = JSON.parse(readFileSync(join(outputDir, "game-summary.json"), "utf8"));
  const roster = JSON.parse(readFileSync(join(outputDir, "roster.json"), "utf8"));
  const causes = JSON.parse(readFileSync(join(outputDir, "causes.json"), "utf8"));
  const rounds = JSON.parse(readFileSync(join(outputDir, "rounds.json"), "utf8"));
  const auth = JSON.parse(readFileSync(join(outputDir, "auth.json"), "utf8"));
  const messages = parseMessagesJsonl(
    readFileSync(join(outputDir, "messages.jsonl"), "utf8")
  );

  assert.equal(manifest.gameId, 1);
  assert.ok(
    manifest.produced.some((artifact) => artifact.artifact === "messages.jsonl")
  );
  assert.ok(
    manifest.skipped.some((artifact) => artifact.artifact === "payouts.json")
  );

  assert.equal(summary.game.phase, "Reveal");
  assert.equal(summary.game.round, 1);
  assert.equal(summary.game.counts.joined, 2);
  assert.equal(summary.game.counts.messages, 2);
  assert.ok(
    summary.capabilities.unavailable.includes("round-resolution-outcomes")
  );

  assert.equal(roster.participants.length, 2);
  assert.deepEqual(
    roster.participants.map((participant) => participant.auth.status),
    ["active", "active"]
  );
  assert.deepEqual(
    roster.participants.map((participant) => participant.causeId),
    [1, 2]
  );

  assert.equal(causes.usedCauses.length, 2);
  assert.deepEqual(
    causes.usedCauses.map((cause) => cause.causeId),
    [1, 2]
  );

  assert.equal(rounds.rounds.length, 1);
  assert.equal(rounds.rounds[0].round, 1);
  assert.equal(rounds.rounds[0].resolutionAvailable, false);
  assert.equal(rounds.rounds[0].commits.length, 1);
  assert.equal(rounds.rounds[0].reveals.length, 1);

  assert.equal(auth.participants.length, 2);
  assert.ok(
    auth.participants.every((participant) => participant.events.some((event) => event.type === "AuthRegistered"))
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0].scope, "global");
  assert.equal(messages[0].isParticipant, true);
  assert.equal(messages[1].scope, "cause");
  assert.equal(messages[1].causeId, 2);
  assert.equal(messages[1].isActualCauseSpeaker, true);
  assert.equal(messages[1].senderCause, 2);
});

async function deployRegistry(owner, verifierAddress) {
  const factory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(owner.address, verifierAddress);
  await contract.deployed();
  return contract;
}

async function deployGame(owner, registryAddress) {
  const factory = new ethers.ContractFactory(
    gameArtifact.abi,
    gameArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(owner.address, owner.address, registryAddress, {
    entryFeeWei: ethers.utils.parseEther("0.001"),
    creatorFeeBps: 100,
    causeFeeBps: 100,
    joinDurationSeconds: 1,
    commitDurationBlocks: 2,
    revealDurationBlocks: 2,
    minPlayers: 2,
    maxPlayers: 4,
    maxCauses: 2,
  });
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

async function registerWallet({ provider, registry, verifier, wallet, agentKeyText, nonceText }) {
  const latestBlock = await provider.getBlock("latest");
  const network = await provider.getNetwork();
  const permit = {
    wallet: wallet.address,
    agentKey: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(agentKeyText)),
    manifestHash: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(`manifest://${agentKeyText}`)
    ),
    chainId: network.chainId,
    gameNamespace: await registry.gameNamespace(),
    issuedAt: latestBlock.timestamp,
    expiresAt: latestBlock.timestamp + 3600,
    nonce: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(nonceText)),
  };
  const signature = await verifier._signTypedData(
    {
      ...AUTH_DOMAIN,
      chainId: network.chainId,
      verifyingContract: registry.address,
    },
    AUTH_TYPES,
    permit
  );

  await (await registry.connect(wallet).registerAuth(permit, signature)).wait();
}

async function fundWallet(owner, target, amountEth) {
  await (
    await owner.sendTransaction({
      to: target,
      value: ethers.utils.parseEther(amountEth),
    })
  ).wait();
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

  throw new Error("Timed out waiting for anvil to start.");
}

function runCli(args) {
  return execFileSync("node", ["scripts-js/queryCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}
