import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";

import {
  deriveWalletAgentKey,
  GAMEPLAY_PK_ENV,
  normalizeAgentRegistry,
  parseCliArgs,
  parseNonNegativeDecimalString,
  parsePositiveDecimalString,
  resolveSignerWallet,
} from "./authTooling.js";

test("parseCliArgs parses subcommands, key/value flags, and positionals", () => {
  const { subcommand, args } = parseCliArgs([
    "register",
    "--rpc-url",
    "localhost",
    "--identity-registry=0x1234567890123456789012345678901234567890",
    "extra",
    "--json",
  ]);

  assert.equal(subcommand, "register");
  assert.equal(args.rpcUrl, "localhost");
  assert.equal(
    args.identityRegistry,
    "0x1234567890123456789012345678901234567890"
  );
  assert.deepEqual(args._, ["extra"]);
  assert.equal(args.json, true);
});

test("deriveWalletAgentKey is deterministic per wallet", () => {
  const wallet = "0x1234567890123456789012345678901234567890";
  assert.equal(deriveWalletAgentKey(wallet), deriveWalletAgentKey(wallet));
  assert.notEqual(
    deriveWalletAgentKey(wallet),
    deriveWalletAgentKey("0x0000000000000000000000000000000000000001")
  );
});

test("normalizeAgentRegistry enforces eip155 formatting", () => {
  assert.deepEqual(normalizeAgentRegistry("eip155:84532:0x1234567890123456789012345678901234567890"), {
    chainId: 84532,
    address: "0x1234567890123456789012345678901234567890",
    value: "eip155:84532:0x1234567890123456789012345678901234567890",
  });

  assert.throws(
    () => normalizeAgentRegistry("0x1234567890123456789012345678901234567890"),
    /eip155/
  );
});

test("decimal string parsers reject zero or negative values where required", () => {
  assert.equal(parsePositiveDecimalString("42", "value"), "42");
  assert.equal(parseNonNegativeDecimalString("0", "value"), "0");
  assert.throws(() => parsePositiveDecimalString("0", "value"), /positive integer/);
  assert.throws(
    () => parseNonNegativeDecimalString("-1", "value"),
    /non-negative integer/
  );
});

test("resolveSignerWallet prefers explicit keystore over missing gameplay env fallback", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "auth-tooling-"));
  const password = "test-password";
  const wallet = ethers.Wallet.createRandom();
  const keystorePath = join(tempDir, "wallet.json");
  const previousGameplayPk = process.env[GAMEPLAY_PK_ENV];

  try {
    delete process.env[GAMEPLAY_PK_ENV];
    await writeFile(keystorePath, await wallet.encrypt(password), "utf8");

    const signer = await resolveSignerWallet({
      provider: undefined,
      privateKeyEnv: GAMEPLAY_PK_ENV,
      keystore: keystorePath,
      keystorePassword: password,
      label: "wallet",
    });

    assert.equal(signer.address.toLowerCase(), wallet.address.toLowerCase());
  } finally {
    if (previousGameplayPk === undefined) {
      delete process.env[GAMEPLAY_PK_ENV];
    } else {
      process.env[GAMEPLAY_PK_ENV] = previousGameplayPk;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveSignerWallet resolves foundry keystore names without .json suffix", async () => {
  const tempHome = await mkdtemp(join(tmpdir(), "foundry-home-"));
  const password = "test-password";
  const wallet = ethers.Wallet.createRandom();
  const previousHome = process.env.HOME;
  const keystoreDir = join(tempHome, ".foundry", "keystores");
  const keystoreName = "demo-keystore";
  const keystorePath = join(keystoreDir, keystoreName);

  try {
    process.env.HOME = tempHome;
    await mkdir(keystoreDir, { recursive: true });
    await writeFile(keystorePath, await wallet.encrypt(password), "utf8");

    const signer = await resolveSignerWallet({
      provider: undefined,
      keystore: keystoreName,
      keystorePassword: password,
      label: "wallet",
    });

    assert.equal(signer.address.toLowerCase(), wallet.address.toLowerCase());
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await rm(tempHome, { recursive: true, force: true });
  }
});
