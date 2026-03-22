import { spawn, execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_DIR = join(__dirname, "..");
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

function loadArtifact(relativePath) {
  return JSON.parse(readFileSync(join(PACKAGE_DIR, relativePath), "utf8"));
}

export const artifacts = {
  identityRegistry: loadArtifact(
    "out/MockAgentIdentityRegistry.sol/MockAgentIdentityRegistry.json"
  ),
  authAdapter: loadArtifact("out/ERC8004AuthAdapter.sol/ERC8004AuthAdapter.json"),
  game: loadArtifact("out/PrisonersDAOlemma.sol/PrisonersDAOlemma.json"),
  chat: loadArtifact("out/GameChat.sol/GameChat.json"),
};

export function defaultGameConfig() {
  return {
    entryFeeWei: ethers.utils.parseEther("0.001"),
    creatorFeeBps: 500,
    causeFeeBps: 500,
    joinDurationSeconds: 60,
    commitDurationBlocks: 5,
    revealDurationBlocks: 5,
    minPlayers: 2,
    maxPlayers: 32,
    maxCauses: 8,
  };
}

export async function startAnvil({ port = 9545, chainId = 31337 } = {}) {
  const proc = spawn(
    "anvil",
    [
      "--port",
      String(port),
      "--chain-id",
      String(chainId),
      "--mnemonic",
      DEFAULT_MNEMONIC,
      "--disable-code-size-limit",
      "--silent",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${port}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await provider.getBlockNumber();
      return { proc, provider, rpcUrl: `http://127.0.0.1:${port}` };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  proc.kill("SIGTERM");
  throw new Error(`anvil failed to start on port ${port}: ${stderr}`);
}

export async function stopAnvil(proc) {
  if (!proc || proc.killed) {
    return;
  }
  proc.kill("SIGTERM");
  await new Promise((resolve) => proc.once("exit", resolve));
}

export function deriveWallet(index, provider) {
  return ethers.Wallet.fromMnemonic(
    DEFAULT_MNEMONIC,
    `m/44'/60'/0'/0/${index}`
  ).connect(provider);
}

export async function deployStack(provider) {
  const owner = deriveWallet(0, provider);
  const treasury = deriveWallet(50, provider).address;

  const identityFactory = new ethers.ContractFactory(
    artifacts.identityRegistry.abi,
    artifacts.identityRegistry.bytecode.object,
    owner
  );
  const identityRegistry = await identityFactory.deploy();
  await identityRegistry.deployed();

  const adapterFactory = new ethers.ContractFactory(
    artifacts.authAdapter.abi,
    artifacts.authAdapter.bytecode.object,
    owner
  );
  const authRegistry = await adapterFactory.deploy(identityRegistry.address);
  await authRegistry.deployed();

  const gameFactory = new ethers.ContractFactory(
    artifacts.game.abi,
    artifacts.game.bytecode.object,
    owner
  );
  const game = await gameFactory.deploy(
    owner.address,
    treasury,
    authRegistry.address,
    defaultGameConfig()
  );
  await game.deployed();

  const chatFactory = new ethers.ContractFactory(
    artifacts.chat.abi,
    artifacts.chat.bytecode.object,
    owner
  );
  const chat = await chatFactory.deploy(game.address);
  await chat.deployed();

  return { owner, treasury, identityRegistry, authRegistry, game, chat };
}

export async function registerIdentity(identityRegistry, wallet, agentUri = "") {
  const predicted = await identityRegistry.connect(wallet).callStatic.register(agentUri);
  const tx = await identityRegistry.connect(wallet).register(agentUri);
  await tx.wait();
  return predicted.toString();
}

export async function whitelistCause(game, owner, causeId, recipient, metadata = `cause-${causeId}`) {
  const tx = await game
    .connect(owner)
    .whitelistCause(causeId, recipient, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(metadata)));
  await tx.wait();
}

export async function createGame(game, owner) {
  const tx = await game.connect(owner).createGame();
  const receipt = await tx.wait();
  const created = receipt.events.find((event) => event.event === "GameCreated");
  return Number(created.args.gameId.toString());
}

export async function mineBlocks(provider, count) {
  for (let i = 0; i < count; i += 1) {
    await provider.send("evm_mine", []);
  }
}

export function runNode(args, { env = {}, cwd = PACKAGE_DIR } = {}) {
  return execFileSync("node", args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

export function parseJsonOutput(output) {
  return JSON.parse(output.trim());
}
