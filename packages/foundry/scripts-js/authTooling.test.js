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

test("auth CLI signs, registers, and inspects AgentAuthRegistry auth state", async () => {
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

  const registryFactory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    owner
  );
  const registry = await registryFactory.deploy(
    owner.address,
    verifier.address
  );
  await registry.deployed();

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
      "--verifier-private-key",
      verifier.privateKey,
      "--json",
    ])
  );

  assert.equal(bundle.registry.toLowerCase(), registry.address.toLowerCase());
  assert.equal(bundle.verifier.toLowerCase(), verifier.address.toLowerCase());
  assert.equal(
    bundle.permit.wallet.toLowerCase(),
    gameplay.address.toLowerCase()
  );
  assert.equal(bundle.permit.chainId, 31337);
  assert.equal(typeof bundle.signature, "string");
  assert.equal(bundle.signature.startsWith("0x"), true);

  const tempDir = mkdtempSync(join(tmpdir(), "pd-auth-tooling-"));
  const permitFile = join(tempDir, "auth-permit.json");
  writeFileSync(permitFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const registration = JSON.parse(
    runCli([
      "register",
      "--rpc-url",
      RPC_URL,
      "--registry",
      registry.address,
      "--permit-file",
      permitFile,
      "--wallet-private-key",
      gameplay.privateKey,
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
});

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
  });
}
