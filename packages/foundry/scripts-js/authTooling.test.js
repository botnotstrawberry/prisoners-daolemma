import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const artifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "AgentAuthRegistry.sol", "AgentAuthRegistry.json"),
    "utf8"
  )
);

const RPC_URL = "http://127.0.0.1:8547";
const ANVIL_PORT = "8547";
const ANVIL_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
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
  anvilProcess = spawn("anvil", ["--port", ANVIL_PORT, "--chain-id", "31337"], {
    cwd: packageDir,
    stdio: "ignore",
  });

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

test("auth CLI signs, registers, and inspects AgentAuthRegistry auth state with keystores", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const permitFile = join(tempDir, "auth-permit.json");

  const unsignedStatus = JSON.parse(
    runCli([
      "status",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--wallet",
      gameplay.address,
      "--json",
    ])
  );

  assert.equal(unsignedStatus.isAuthorized, false);
  assert.equal(unsignedStatus.hasRecord, false);

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--wallet",
      gameplay.address,
      "--agent-key-text",
      "agent-alpha",
      "--manifest-uri",
      "manifest://agent-alpha",
      "--ttl-seconds",
      "3600",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );

  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const preRegisterStatus = JSON.parse(
    runCli([
      "status",
      "--rpc-url",
      RPC_URL,
      "--permit-file",
      permitFile,
      "--json",
    ])
  );

  assert.equal(preRegisterStatus.bundleInspection.registerable, true);
  assert.deepEqual(preRegisterStatus.bundleInspection.problems, []);
  assert.equal(
    preRegisterStatus.bundleInspection.recoveredSigner.toLowerCase(),
    verifier.address.toLowerCase()
  );

  const registration = JSON.parse(
    runCli([
      "register",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--permit-file",
      permitFile,
      "--wallet-keystore",
      gameplaySetup.keystorePath,
      "--wallet-keystore-password-file",
      gameplaySetup.passwordFile,
      "--json",
    ])
  );

  assert.equal(
    registration.registry.toLowerCase(),
    registry.address.toLowerCase()
  );
  assert.equal(
    registration.wallet.toLowerCase(),
    gameplay.address.toLowerCase()
  );
  assert.equal(registration.status.isAuthorized, true);
  assert.equal(registration.status.nonceUsed, true);
  assert.equal(registration.status.record.agentKey, bundle.permit.agentKey);
  assert.equal(
    registration.status.record.manifestHash,
    bundle.permit.manifestHash
  );
  assert.equal(
    registration.status.record.issuer.toLowerCase(),
    verifier.address.toLowerCase()
  );

  const finalStatus = JSON.parse(
    runCli([
      "status",
      "--rpc-url",
      RPC_URL,
      "--permit-file",
      permitFile,
      "--json",
    ])
  );

  assert.equal(finalStatus.isAuthorized, true);
  assert.equal(finalStatus.nonceUsed, true);
  assert.equal(finalStatus.record.active, true);
  assert.equal(finalStatus.record.agentKey, bundle.permit.agentKey);
  assert.equal(finalStatus.record.manifestHash, bundle.permit.manifestHash);
  assert.equal(finalStatus.bundleInspection.registerable, false);
  assert.match(
    finalStatus.bundleInspection.problems.join("\n"),
    /already used/
  );
});

test("permit still honors manual wallet and agentKey overrides for non-SIWA input files", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const inputWallet = ethers.Wallet.createRandom();
  const overrideWallet = ethers.Wallet.createRandom();

  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const inputFile = join(tempDir, "manual-input.json");
  writeFileSync(
    inputFile,
    `${JSON.stringify(
      {
        wallet: inputWallet.address,
        agentKeyText: "input-agent",
        manifestUri: "manifest://input-agent",
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--input",
      inputFile,
      "--wallet",
      overrideWallet.address,
      "--agent-key-text",
      "override-agent",
      "--manifest-uri",
      "manifest://override-agent",
      "--ttl-seconds",
      "3600",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );

  assert.equal(
    bundle.permit.wallet.toLowerCase(),
    overrideWallet.address.toLowerCase()
  );
  assert.equal(
    bundle.permit.agentKey,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("override-agent"))
  );
  assert.equal(
    bundle.permit.manifestHash,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("manifest://override-agent"))
  );
});

test("permit rejects raw verifier private keys on the command line by default", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);
  const registry = await deployRegistry(owner, verifier.address);

  const error = runCliFailure([
    "permit",
    "--rpc-url",
    RPC_URL,
    "--registry",
    registry.address,
    "--wallet",
    gameplay.address,
    "--agent-key-text",
    "agent-alpha",
    "--manifest-uri",
    "manifest://agent-alpha",
    "--ttl-seconds",
    "3600",
    "--verifier-private-key",
    verifier.privateKey,
    "--json",
  ]);

  assert.match(error, /Raw verifier private keys on the command line are disabled/);
  assert.match(error, /--allow-unsafe-private-key/);
});

test("permit fails fast when the verifier signer does not match the registry verifier", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();
  const wrongVerifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);
  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const wrongVerifierSetup = await writeKeystoreFixture(
    tempDir,
    "wrong-verifier",
    wrongVerifier
  );

  const error = runCliFailure([
    "permit",
    "--rpc-url",
    RPC_URL,
    "--registry",
    registry.address,
    "--wallet",
    gameplay.address,
    "--agent-key-text",
    "agent-alpha",
    "--manifest-uri",
    "manifest://agent-alpha",
    "--ttl-seconds",
    "3600",
    "--verifier-keystore",
    wrongVerifierSetup.keystorePath,
    "--verifier-keystore-password-file",
    wrongVerifierSetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Verifier key mismatch/);
  assert.match(error, new RegExp(verifier.address, "i"));
  assert.match(error, new RegExp(wrongVerifier.address, "i"));
});

test("register fails fast when the gameplay wallet signer does not match permit.wallet", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const wrongGameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);
  await fundWallet(owner, wrongGameplay.address);

  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const wrongGameplaySetup = await writeKeystoreFixture(
    tempDir,
    "wrong-gameplay",
    wrongGameplay
  );
  const permitFile = join(tempDir, "auth-permit.json");

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--wallet",
      gameplay.address,
      "--agent-key-text",
      "agent-alpha",
      "--manifest-uri",
      "manifest://agent-alpha",
      "--ttl-seconds",
      "3600",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );
  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const error = runCliFailure([
    "register",
    "--rpc-url",
    RPC_URL,
    "--permit-file",
    permitFile,
    "--wallet-keystore",
    wrongGameplaySetup.keystorePath,
    "--wallet-keystore-password-file",
    wrongGameplaySetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Gameplay wallet mismatch/);
  assert.match(error, new RegExp(gameplay.address, "i"));
  assert.match(error, new RegExp(wrongGameplay.address, "i"));
});

test("register fails fast on registry or bundle mismatch", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const registryA = await deployRegistry(owner, verifier.address);
  const registryB = await deployRegistry(owner, verifier.address);

  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const permitFile = join(tempDir, "auth-permit.json");

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registryA.address,
      "--wallet",
      gameplay.address,
      "--agent-key-text",
      "agent-alpha",
      "--manifest-uri",
      "manifest://agent-alpha",
      "--ttl-seconds",
      "3600",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );
  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const error = runCliFailure([
    "register",
    "--rpc-url",
    RPC_URL,
    "--registry",
    registryB.address,
    "--permit-file",
    permitFile,
    "--wallet-keystore",
    gameplaySetup.keystorePath,
    "--wallet-keystore-password-file",
    gameplaySetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Bundle registry mismatch/);
  assert.match(error, new RegExp(registryA.address, "i"));
  assert.match(error, new RegExp(registryB.address, "i"));
});

test("status and register surface stale bundles after verifier rotation", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();
  const nextVerifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const permitFile = join(tempDir, "auth-permit.json");

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--wallet",
      gameplay.address,
      "--agent-key-text",
      "agent-alpha",
      "--manifest-uri",
      "manifest://agent-alpha",
      "--ttl-seconds",
      "3600",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );
  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  await (await registry.connect(owner).setVerifier(nextVerifier.address)).wait();

  const status = JSON.parse(
    runCli([
      "status",
      "--rpc-url",
      RPC_URL,
      "--permit-file",
      permitFile,
      "--json",
    ])
  );

  assert.equal(status.bundleInspection.registerable, false);
  assert.match(
    status.bundleInspection.problems.join("\n"),
    /Permit verifier mismatch/
  );
  assert.match(
    status.bundleInspection.problems.join("\n"),
    /rotated/
  );

  const error = runCliFailure([
    "register",
    "--rpc-url",
    RPC_URL,
    "--permit-file",
    permitFile,
    "--wallet-keystore",
    gameplaySetup.keystorePath,
    "--wallet-keystore-password-file",
    gameplaySetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Permit bundle is not registerable/);
  assert.match(error, /Permit verifier mismatch/);
});

test("status and register surface expired bundles before sending the transaction", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const registry = await deployRegistry(owner, verifier.address);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const permitFile = join(tempDir, "auth-permit.json");

  const bundle = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--wallet",
      gameplay.address,
      "--agent-key-text",
      "agent-alpha",
      "--manifest-uri",
      "manifest://agent-alpha",
      "--ttl-seconds",
      "1",
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );
  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  await provider.send("evm_increaseTime", [5]);
  await provider.send("evm_mine", []);

  const status = JSON.parse(
    runCli([
      "status",
      "--rpc-url",
      RPC_URL,
      "--permit-file",
      permitFile,
      "--json",
    ])
  );

  assert.equal(status.bundleInspection.registerable, false);
  assert.match(
    status.bundleInspection.problems.join("\n"),
    /Permit already expired/
  );

  const error = runCliFailure([
    "register",
    "--rpc-url",
    RPC_URL,
    "--permit-file",
    permitFile,
    "--wallet-keystore",
    gameplaySetup.keystorePath,
    "--wallet-keystore-password-file",
    gameplaySetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Permit bundle is not registerable/);
  assert.match(error, /Permit already expired/);
});

async function deployRegistry(owner, verifierAddress) {
  const registryFactory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    owner
  );
  const registry = await registryFactory.deploy(owner.address, verifierAddress);
  await registry.deployed();
  return registry;
}

async function fundWallet(owner, target) {
  await (
    await owner.sendTransaction({
      to: target,
      value: ethers.utils.parseEther("1"),
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

  throw new Error("Timed out waiting for anvil to start.");
}

function runCli(args, options = {}) {
  return execFileSync("node", ["scripts-js/authCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
}

function runCliFailure(args, options = {}) {
  try {
    runCli(args, options);
    throw new Error("Expected CLI command to fail.");
  } catch (error) {
    if (error.message === "Expected CLI command to fail.") {
      throw error;
    }

    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}
