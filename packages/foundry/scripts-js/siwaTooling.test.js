import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { signSIWAMessage } from "@buildersgarden/siwa/siwa";

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
const ANVIL_PORT = "8548";
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

test("SIWA CLI verifies a local signed challenge and feeds the permit/register flow", async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const gameplay = ethers.Wallet.createRandom().connect(provider);
  const verifier = ethers.Wallet.createRandom();

  await (
    await owner.sendTransaction({
      to: gameplay.address,
      value: ethers.utils.parseEther("1"),
    })
  ).wait();

  const authRegistryFactory = new ethers.ContractFactory(
    authRegistryArtifact.abi,
    authRegistryArtifact.bytecode.object,
    owner
  );
  const authRegistry = await authRegistryFactory.deploy(
    owner.address,
    verifier.address
  );
  await authRegistry.deployed();

  const identityRegistryFactory = new ethers.ContractFactory(
    identityRegistryArtifact.abi,
    identityRegistryArtifact.bytecode.object,
    owner
  );
  const identityRegistry = await identityRegistryFactory.deploy();
  await identityRegistry.deployed();

  const agentId = 42;
  await (
    await identityRegistry.setOwner(agentId, gameplay.address)
  ).wait();

  const tempDir = mkdtempSync(join(tmpdir(), "pd-siwa-tooling-"));
  const nonceStore = join(tempDir, "siwa-nonces.json");
  const challengeFile = join(tempDir, "siwa-challenge.json");
  const signedFile = join(tempDir, "signed-siwa.json");
  const verifiedFile = join(tempDir, "verified-auth.json");
  const permitFile = join(tempDir, "auth-permit.json");
  const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
  const gameplaySetup = await writeKeystoreFixture(tempDir, "gameplay", gameplay);
  const domain = "prisoners.local";
  const uri = "https://prisoners.local/siwa";
  const manifestUri = "manifest://agent-alpha";
  const agentRegistry = `eip155:31337:${identityRegistry.address}`;

  const challenge = JSON.parse(
    runCli([
      "siwa-nonce",
      "--rpc-url",
      RPC_URL,
      "--wallet",
      gameplay.address,
      "--agent-id",
      String(agentId),
      "--agent-registry",
      agentRegistry,
      "--domain",
      domain,
      "--uri",
      uri,
      "--chain-id",
      "31337",
      "--nonce-store",
      nonceStore,
      "--registry",
      authRegistry.address,
      "--out",
      challengeFile,
      "--json",
    ])
  );

  assert.equal(challenge.wallet.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(challenge.agentId, agentId);
  assert.equal(
    challenge.agentRegistry.toLowerCase(),
    agentRegistry.toLowerCase()
  );
  assert.equal(challenge.challenge.domain, domain);
  assert.equal(challenge.challenge.uri, uri);
  assert.equal(challenge.challenge.chainId, 31337);
  assert.equal(existsSync(challengeFile), true);
  assert.equal(existsSync(nonceStore), true);

  const signer = {
    getAddress: async () => gameplay.address,
    signMessage: async (message) => gameplay.signMessage(message),
  };
  const signed = await signSIWAMessage(challenge.siwaFields, signer);
  writeFileSync(signedFile, `${JSON.stringify(signed, null, 2)}\n`, "utf8");

  const verified = JSON.parse(
    runCli([
      "siwa-verify",
      "--rpc-url",
      RPC_URL,
      "--input",
      signedFile,
      "--nonce-store",
      nonceStore,
      "--manifest-uri",
      manifestUri,
      "--registry",
      authRegistry.address,
      "--out",
      verifiedFile,
      "--json",
    ])
  );

  const expectedAgentKeyText = `eip155:31337:${ethers.utils.getAddress(
    identityRegistry.address
  )}:${agentId}`;
  assert.equal(verified.wallet.toLowerCase(), gameplay.address.toLowerCase());
  assert.equal(verified.agentId, agentId);
  assert.equal(verified.agentRegistry, agentRegistry);
  assert.equal(verified.agentKeyText, expectedAgentKeyText);
  assert.equal(verified.registry.toLowerCase(), authRegistry.address.toLowerCase());
  assert.equal(verified.manifestUri, manifestUri);
  assert.equal(verified.siwa.domain, domain);
  assert.equal(verified.siwa.uri, uri);
  assert.equal(verified.siwa.chainId, 31337);
  assert.equal(verified.siwa.signerType, "eoa");
  assert.equal(existsSync(verifiedFile), true);

  const nonceState = JSON.parse(readFileSync(nonceStore, "utf8"));
  assert.deepEqual(nonceState.nonces, {});

  const replayError = runCliFailure([
    "siwa-verify",
    "--rpc-url",
    RPC_URL,
    "--input",
    signedFile,
    "--nonce-store",
    nonceStore,
    "--manifest-uri",
    manifestUri,
    "--registry",
    authRegistry.address,
    "--json",
  ]);
  assert.match(replayError, /No active SIWA challenge found/);

  const permit = JSON.parse(
    runCli([
      "permit",
      "--rpc-url",
      RPC_URL,
      "--input",
      verifiedFile,
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
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(manifestUri))
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
