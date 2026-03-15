import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

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

const RPC_URL = "http://127.0.0.1:8548";
const RPC_URL_ALT = "http://127.0.0.1:8549";
const ANVIL_PORT = "8548";
const ANVIL_PORT_ALT = "8549";
const CHAIN_ID = 31337;
const CHAIN_ID_ALT = 31338;
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
let anvilProcessAlt;

before(async () => {
  anvilProcess = spawn("anvil", ["--port", ANVIL_PORT, "--chain-id", String(CHAIN_ID)], {
    cwd: packageDir,
    stdio: "ignore",
  });
  anvilProcessAlt = spawn(
    "anvil",
    ["--port", ANVIL_PORT_ALT, "--chain-id", String(CHAIN_ID_ALT)],
    {
      cwd: packageDir,
      stdio: "ignore",
    }
  );

  await waitForAnvil(RPC_URL);
  await waitForAnvil(RPC_URL_ALT);
});

after(async () => {
  await stopAnvil(anvilProcessAlt);
  await stopAnvil(anvilProcess);
});

test("SIWA CLI issues, signs, verifies, and feeds the permit/register flow", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const authRegistry = await deployAuthRegistry(owner, verifier.address);
  const identityRegistry = await deployIdentityRegistry(owner);
  const agentId = "42";
  await (await identityRegistry.setOwner(agentId, gameplay.address)).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const permitFile = join(tempDir, "auth-permit.json");
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const flow = await runVerifiedSiwaFlow({
    rpcUrl: RPC_URL,
    authRegistry,
    identityRegistry,
    gameplay,
    gameplaySetup,
    agentId,
    tempDir,
    manifestUri: "manifest://agent-alpha",
  });

  assert.equal(flow.challenge.wallet.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(flow.challenge.agentId, agentId);
  assert.equal(flow.challenge.siwaFields.agentId, agentId);
  assert.equal(
    flow.challenge.agentRegistry.toLowerCase(),
    flow.agentRegistry.toLowerCase()
  );
  assert.equal(flow.challenge.challenge.domain, flow.domain);
  assert.equal(flow.challenge.challenge.uri, flow.uri);
  assert.equal(flow.challenge.challenge.chainId, CHAIN_ID);
  assert.equal(existsSync(flow.challengeFile), true);
  assert.equal(existsSync(flow.signedFile), true);
  assert.equal(existsSync(flow.nonceStore), true);
  assert.equal(flow.signed.address.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(flow.signed.nonceStore, flow.nonceStore);
  assert.equal(flow.signed.registry.toLowerCase(), authRegistry.address.toLowerCase());

  const expectedAgentKeyText = `eip155:${CHAIN_ID}:${ethers.utils.getAddress(
    identityRegistry.address
  )}:${agentId}`;
  assert.equal(flow.verified.wallet.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(flow.verified.agentId, agentId);
  assert.equal(flow.verified.agentRegistry, flow.agentRegistry);
  assert.equal(flow.verified.agentKeyText, expectedAgentKeyText);
  assert.equal(
    flow.verified.registry.toLowerCase(),
    authRegistry.address.toLowerCase()
  );
  assert.equal(flow.verified.manifestUri, flow.manifestUri);
  assert.equal(flow.verified.siwa.domain, flow.domain);
  assert.equal(flow.verified.siwa.uri, flow.uri);
  assert.equal(flow.verified.siwa.chainId, CHAIN_ID);
  assert.equal(flow.verified.siwa.signerType, "eoa");
  assert.equal(existsSync(flow.verifiedFile), true);

  const nonceState = JSON.parse(readFileSync(flow.nonceStore, "utf8"));
  assert.deepEqual(nonceState.nonces, {});

  const replayError = runCliFailure([
    "siwa-verify",
    "--rpc-url",
    RPC_URL,
    "--input",
    flow.signedFile,
    "--manifest-uri",
    flow.manifestUri,
    "--json",
  ]);
  assert.match(replayError, /No active SIWA challenge found/);

  const permit = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--input",
      flow.verifiedFile,
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--out",
      permitFile,
      "--json",
    ])
  );

  assert.equal(permit.registry.toLowerCase(), authRegistry.address.toLowerCase());
  assert.equal(permit.permit.wallet.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(
    permit.permit.agentKey,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(expectedAgentKeyText))
  );
  assert.equal(
    permit.permit.manifestHash,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(flow.manifestUri))
  );
  assert.equal(existsSync(permitFile), true);

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

  const registration = JSON.parse(
    runCli([
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
    ])
  );

  assert.equal(
    registration.registry.toLowerCase(),
    authRegistry.address.toLowerCase()
  );
  assert.equal(
    registration.wallet.toLowerCase(),
    gameplay.address.toLowerCase()
  );
  assert.equal(registration.status.isAuthorized, true);
  assert.equal(registration.status.record.agentKey, permit.permit.agentKey);
  assert.equal(
    registration.status.record.manifestHash,
    permit.permit.manifestHash
  );
  assert.equal(
    registration.status.record.issuer.toLowerCase(),
    verifier.address.toLowerCase()
  );
});

test("permit rejects wallet overrides when input comes from verified SIWA output", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const overrideWallet = ethers.Wallet.createRandom();
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const authRegistry = await deployAuthRegistry(owner, verifier.address);
  const identityRegistry = await deployIdentityRegistry(owner);
  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const flow = await runVerifiedSiwaFlow({
    rpcUrl: RPC_URL,
    authRegistry,
    identityRegistry,
    gameplay,
    gameplaySetup,
    agentId: "42",
    tempDir,
    manifestUri: "manifest://agent-alpha",
  });

  const error = runCliFailure([
    "permit",
    "--rpc-url",
    RPC_URL,
    "--input",
    flow.verifiedFile,
    "--wallet",
    overrideWallet.address,
    "--verifier-keystore",
    verifierSetup.keystorePath,
    "--verifier-keystore-password-file",
    verifierSetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Verified SIWA wallet is immutable at permit time/);
  assert.match(error, new RegExp(gameplay.address, "i"));
  assert.match(error, new RegExp(overrideWallet.address, "i"));
});

test("permit rejects agentKey overrides when input comes from verified SIWA output", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const authRegistry = await deployAuthRegistry(owner, verifier.address);
  const identityRegistry = await deployIdentityRegistry(owner);
  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const flow = await runVerifiedSiwaFlow({
    rpcUrl: RPC_URL,
    authRegistry,
    identityRegistry,
    gameplay,
    gameplaySetup,
    agentId: "42",
    tempDir,
    manifestUri: "manifest://agent-alpha",
  });
  const expectedAgentKey = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(flow.verified.agentKeyText)
  );
  const overrideAgentKey = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("agent-spoofed")
  );

  const error = runCliFailure([
    "permit",
    "--rpc-url",
    RPC_URL,
    "--input",
    flow.verifiedFile,
    "--agent-key",
    overrideAgentKey,
    "--verifier-keystore",
    verifierSetup.keystorePath,
    "--verifier-keystore-password-file",
    verifierSetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Verified SIWA agentKey is immutable at permit time/);
  assert.match(error, new RegExp(expectedAgentKey.slice(2), "i"));
  assert.match(error, new RegExp(overrideAgentKey.slice(2), "i"));
});

test("siwa-sign rejects raw wallet private keys on the command line by default", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const identityRegistry = await deployIdentityRegistry(owner);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const challengeFile = join(tempDir, "siwa-challenge.json");
  const nonceStore = join(tempDir, "siwa-nonces.json");

  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  runCli([
    "siwa-nonce",
    "--rpc-url",
    RPC_URL,
    "--wallet",
    gameplay.address,
    "--agent-id",
    "42",
    "--agent-registry",
    `eip155:${CHAIN_ID}:${identityRegistry.address}`,
    "--domain",
    "prisoners.local",
    "--nonce-store",
    nonceStore,
    "--out",
    challengeFile,
    "--json",
  ]);

  const error = runCliFailure([
    "siwa-sign",
    "--input",
    challengeFile,
    "--wallet-private-key",
    gameplay.privateKey,
    "--json",
  ]);

  assert.match(error, /Raw wallet private keys on the command line are disabled/);
  assert.match(error, /--allow-unsafe-private-key/);
});

test("siwa-sign fails fast when the gameplay signer does not match the issued challenge wallet", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const wrongGameplay = ethers.Wallet.createRandom();
  const identityRegistry = await deployIdentityRegistry(owner);
  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const challengeFile = join(tempDir, "siwa-challenge.json");
  const nonceStore = join(tempDir, "siwa-nonces.json");
  const wrongGameplaySetup = await writeKeystoreFixture(
    tempDir,
    "wrong-gameplay",
    wrongGameplay
  );

  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  runCli([
    "siwa-nonce",
    "--rpc-url",
    RPC_URL,
    "--wallet",
    gameplay.address,
    "--agent-id",
    "42",
    "--agent-registry",
    `eip155:${CHAIN_ID}:${identityRegistry.address}`,
    "--domain",
    "prisoners.local",
    "--nonce-store",
    nonceStore,
    "--out",
    challengeFile,
    "--json",
  ]);

  const error = runCliFailure([
    "siwa-sign",
    "--input",
    challengeFile,
    "--wallet-keystore",
    wrongGameplaySetup.keystorePath,
    "--wallet-keystore-password-file",
    wrongGameplaySetup.passwordFile,
    "--json",
  ]);

  assert.match(error, /Address mismatch/);
  assert.match(error, new RegExp(gameplay.address, "i"));
  assert.match(error, new RegExp(wrongGameplay.address, "i"));
});

test("siwa-nonce rejects an RPC chain that does not match the declared agentRegistry chain", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, gameplay.address);

  const identityRegistry = await deployIdentityRegistry(owner);
  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  const error = runCliFailure([
    "siwa-nonce",
    "--rpc-url",
    RPC_URL,
    "--wallet",
    gameplay.address,
    "--agent-id",
    "42",
    "--agent-registry",
    `eip155:${CHAIN_ID_ALT}:${identityRegistry.address}`,
    "--domain",
    "prisoners.local",
    "--json",
  ]);

  assert.match(
    error,
    /Connected RPC chain 31337 does not match declared agentRegistry chain 31338/
  );
});

test("siwa-nonce rejects SIWA chain context that does not match the declared agentRegistry chain", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, gameplay.address);

  const identityRegistry = await deployIdentityRegistry(owner);
  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  const error = runCliFailure([
    "siwa-nonce",
    "--rpc-url",
    RPC_URL,
    "--wallet",
    gameplay.address,
    "--agent-id",
    "42",
    "--agent-registry",
    `eip155:${CHAIN_ID}:${identityRegistry.address}`,
    "--domain",
    "prisoners.local",
    "--chain-id",
    String(CHAIN_ID_ALT),
    "--json",
  ]);

  assert.match(error, /SIWA chainId 31338 must match agentRegistry chain 31337/);
});

test("permit rejects a verified SIWA artifact when the permit chain does not match the verified chain context", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const providerAlt = new ethers.providers.JsonRpcProvider(RPC_URL_ALT);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const ownerAlt = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], providerAlt);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const authRegistry = await deployAuthRegistry(owner, verifier.address);
  const authRegistryAlt = await deployAuthRegistry(ownerAlt, verifier.address);
  const identityRegistry = await deployIdentityRegistry(owner);
  await (await identityRegistry.setOwner("42", gameplay.address)).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const flow = await runVerifiedSiwaFlow({
    rpcUrl: RPC_URL,
    authRegistry,
    identityRegistry,
    gameplay,
    gameplaySetup,
    agentId: "42",
    tempDir,
    manifestUri: "manifest://agent-alpha",
    includeRegistry: false,
  });

  const error = runCliFailure([
    "permit",
    "--rpc-url",
    RPC_URL_ALT,
    "--registry",
    authRegistryAlt.address,
    "--input",
    flow.verifiedFile,
    "--verifier-keystore",
    verifierSetup.keystorePath,
    "--verifier-keystore-password-file",
    verifierSetup.passwordFile,
    "--json",
  ]);

  assert.match(
    error,
    /Verified SIWA agentRegistry chain 31337 does not match connected permit chain 31338/
  );
});

test("SIWA flow preserves large ERC-8004 agent IDs exactly above the JS safe integer range", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await fundWallet(owner, gameplay.address);

  const authRegistry = await deployAuthRegistry(owner, verifier.address);
  const identityRegistry = await deployIdentityRegistry(owner);
  const agentId = "9007199254740993";
  await (await identityRegistry.setOwner(agentId, gameplay.address)).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const flow = await runVerifiedSiwaFlow({
    rpcUrl: RPC_URL,
    authRegistry,
    identityRegistry,
    gameplay,
    gameplaySetup,
    agentId,
    tempDir,
    manifestUri: "manifest://agent-large",
  });

  const checksumRegistry = ethers.utils.getAddress(identityRegistry.address);
  const expectedAgentKeyText = `eip155:${CHAIN_ID}:${checksumRegistry}:${agentId}`;
  const roundedAgentId = String(Number(agentId));
  const roundedAgentKeyText = `eip155:${CHAIN_ID}:${checksumRegistry}:${roundedAgentId}`;

  assert.equal(flow.challenge.agentId, agentId);
  assert.equal(flow.challenge.siwaFields.agentId, agentId);
  assert.equal(flow.verified.agentId, agentId);
  assert.equal(flow.verified.agentKeyText, expectedAgentKeyText);
  assert.notEqual(expectedAgentKeyText, roundedAgentKeyText);

  const permit = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--input",
      flow.verifiedFile,
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--json",
    ])
  );

  assert.equal(
    permit.permit.agentKey,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(expectedAgentKeyText))
  );
  assert.notEqual(
    permit.permit.agentKey,
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roundedAgentKeyText))
  );
});

async function runVerifiedSiwaFlow({
  rpcUrl,
  authRegistry,
  identityRegistry,
  gameplay,
  gameplaySetup,
  agentId,
  tempDir,
  manifestUri,
  domain = "prisoners.local",
  uri = "https://prisoners.local/siwa",
  includeRegistry = true,
}) {
  const nonceStore = join(tempDir, `siwa-${agentId}-nonces.json`);
  const challengeFile = join(tempDir, `siwa-${agentId}-challenge.json`);
  const signedFile = join(tempDir, `siwa-${agentId}-signed.json`);
  const verifiedFile = join(tempDir, `siwa-${agentId}-verified.json`);
  const agentRegistry = `eip155:${CHAIN_ID}:${identityRegistry.address}`;

  const challenge = JSON.parse(
    runCli([
      "siwa-nonce",
      "--rpc-url",
      rpcUrl,
      "--wallet",
      gameplay.address,
      "--agent-id",
      agentId,
      "--agent-registry",
      agentRegistry,
      "--domain",
      domain,
      "--uri",
      uri,
      "--chain-id",
      String(CHAIN_ID),
      "--nonce-store",
      nonceStore,
      ...(includeRegistry ? ["--registry", authRegistry.address] : []),
      "--out",
      challengeFile,
      "--json",
    ])
  );

  const signed = JSON.parse(
    runCli([
      "siwa-sign",
      "--input",
      challengeFile,
      "--wallet-keystore",
      gameplaySetup.keystorePath,
      "--wallet-keystore-password-file",
      gameplaySetup.passwordFile,
      "--out",
      signedFile,
      "--json",
    ])
  );

  const verified = JSON.parse(
    runCli([
      "siwa-verify",
      "--rpc-url",
      rpcUrl,
      "--input",
      signedFile,
      "--manifest-uri",
      manifestUri,
      "--out",
      verifiedFile,
      "--json",
    ])
  );

  return {
    agentRegistry,
    challenge,
    challengeFile,
    signed,
    signedFile,
    verified,
    verifiedFile,
    nonceStore,
    domain,
    uri,
    manifestUri,
  };
}

async function deployAuthRegistry(owner, verifierAddress) {
  const authRegistryFactory = new ethers.ContractFactory(
    authRegistryArtifact.abi,
    authRegistryArtifact.bytecode.object,
    owner
  );
  const authRegistry = await authRegistryFactory.deploy(
    owner.address,
    verifierAddress
  );
  await authRegistry.deployed();
  return authRegistry;
}

async function deployIdentityRegistry(owner) {
  const identityRegistryFactory = new ethers.ContractFactory(
    identityRegistryArtifact.abi,
    identityRegistryArtifact.bytecode.object,
    owner
  );
  const identityRegistry = await identityRegistryFactory.deploy();
  await identityRegistry.deployed();
  return identityRegistry;
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

async function waitForAnvil(rpcUrl) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for anvil to start at ${rpcUrl}.`);
}

async function stopAnvil(child) {
  if (!child) {
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}

function runCli(args) {
  return execFileSync("node", ["scripts-js/authCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runCliFailure(args) {
  try {
    runCli(args);
    throw new Error("Expected CLI command to fail.");
  } catch (error) {
    if (error.message === "Expected CLI command to fail.") {
      throw error;
    }

    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}
