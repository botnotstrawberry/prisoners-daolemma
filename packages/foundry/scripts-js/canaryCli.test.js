import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  RECOMMENDED_CANARY_PROFILE,
  compareProfiles,
  extractNamedDeployments,
  readDeployerAddressFromKeystore,
  resolveCanaryProfile,
} from "./canaryCli.js";

test("resolveCanaryProfile defaults to the recommended Base Sepolia canary profile", () => {
  const profile = resolveCanaryProfile({});

  assert.equal(profile.entryFeeWei, RECOMMENDED_CANARY_PROFILE.entryFeeWei);
  assert.equal(profile.creatorFeeBps, RECOMMENDED_CANARY_PROFILE.creatorFeeBps);
  assert.equal(
    profile.joinDurationSeconds,
    RECOMMENDED_CANARY_PROFILE.joinDurationSeconds
  );
  assert.equal(profile.maxPlayers, RECOMMENDED_CANARY_PROFILE.maxPlayers);
});

test("compareProfiles reports canary mismatches explicitly", () => {
  const profile = resolveCanaryProfile({
    PRISONERS_MAX_PLAYERS: "16",
    PRISONERS_COMMIT_DURATION_BLOCKS: "24",
  });
  const comparison = compareProfiles(profile);

  assert.equal(comparison.matchesRecommendedProfile, false);
  assert.deepEqual(comparison.mismatches, [
    {
      field: "commitDurationBlocks",
      actual: "24",
      expected: String(RECOMMENDED_CANARY_PROFILE.commitDurationBlocks),
    },
    {
      field: "maxPlayers",
      actual: "16",
      expected: String(RECOMMENDED_CANARY_PROFILE.maxPlayers),
    },
  ]);
});

test("extractNamedDeployments normalizes contract addresses from the repo deployment map", () => {
  const named = extractNamedDeployments({
    networkName: "baseSepolia",
    "0x00000000000000000000000000000000000000aa": "AgentAuthRegistry",
    "0x00000000000000000000000000000000000000bb": "PrisonersDaollema",
    "0x00000000000000000000000000000000000000cc": "GameChat",
  });

  assert.equal(
    named.AgentAuthRegistry.toLowerCase(),
    "0x00000000000000000000000000000000000000aa"
  );
  assert.equal(
    named.PrisonersDaollema.toLowerCase(),
    "0x00000000000000000000000000000000000000bb"
  );
  assert.equal(
    named.GameChat.toLowerCase(),
    "0x00000000000000000000000000000000000000cc"
  );
});

test("readDeployerAddressFromKeystore reads the address field without decrypting the keystore", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pd-canary-cli-"));
  const keystorePath = join(tempDir, "deployer.json");
  writeFileSync(
    keystorePath,
    JSON.stringify({ address: "00000000000000000000000000000000000000aa" }),
    "utf8"
  );

  const result = readDeployerAddressFromKeystore(keystorePath);
  assert.equal(result.exists, true);
  assert.equal(
    result.address.toLowerCase(),
    "0x00000000000000000000000000000000000000aa"
  );
  assert.equal(result.resolvedPath, keystorePath);
});
