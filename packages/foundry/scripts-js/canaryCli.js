#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import {
  createProvider,
  normalizeAddress,
  parseCliArgs,
  printJson,
  resolveFromPackageRoot,
  writeJson,
} from "./authTooling.js";

const GAME_ABI = [
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function authRegistry() view returns (address)",
];
const ADAPTER_ABI = [
  "function identityRegistry() view returns (address)",
];
const CHAT_ABI = [
  "function game() view returns (address)",
];

const HELP = `
Prisoners DAOlemma deployment canary

Usage:
  node scripts-js/canaryCli.js <command> [options]

Commands:
  preflight   Validate expected addresses and deployment inputs.
  deployment  Validate deployed wiring onchain against expectations.
  help        Show this message.

Shared options:
  --rpc-url <url|network>
  --out <file>
  --json

preflight:
  Reads expected addresses from env when present:
    PRISONERS_OWNER
    PRISONERS_TREASURY
    ERC8004_IDENTITY_REGISTRY

  Missing env values are warnings, not hard failures.

deployment:
  --deployment-file <path>   Optional deployment map. Defaults to deployments/<chainId>.json.

  Expected deployment names:
    ERC8004AuthAdapter
    PrisonersDAOlemma
    GameChat
`;

function ok(label, message, extra = {}) {
  return { label, ok: true, severity: "info", message, ...extra };
}

function warn(label, message, extra = {}) {
  return { label, ok: true, severity: "warn", message, ...extra };
}

function fail(label, message, extra = {}) {
  return { label, ok: false, severity: "error", message, ...extra };
}

function statusFromChecks(checks) {
  if (checks.some((check) => !check.ok)) {
    return "failed";
  }
  if (checks.some((check) => check.severity === "warn")) {
    return "warn";
  }
  return "ok";
}

function parseOptionalEnvAddress(env, key, label) {
  const value = env[key];
  if (!value) {
    return { value: null, check: warn(label, `${key} is not set.`) };
  }

  try {
    const normalized = normalizeAddress(value, key);
    return {
      value: normalized,
      check: ok(label, `${key} is set.`, { value: normalized }),
    };
  } catch (error) {
    return { value: null, check: fail(label, error.message) };
  }
}

function loadDeploymentMap(filePath) {
  const resolved = resolveFromPackageRoot(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`Deployment file not found: ${resolved}`);
  }
  return {
    path: resolved,
    value: JSON.parse(readFileSync(resolved, "utf8")),
  };
}

function findNamedDeployment(map, name) {
  for (const [address, deployedName] of Object.entries(map)) {
    if (address === "networkName") {
      continue;
    }
    if (deployedName === name) {
      return normalizeAddress(address, `${name} deployment`);
    }
  }
  return null;
}

async function runPreflight(args) {
  const checks = [];
  let chainId = null;

  if (args.rpcUrl || args.network || args.rpc) {
    const provider = createProvider(args);
    chainId = Number((await provider.getNetwork()).chainId);
    checks.push(ok("rpc", `Connected to chain ${chainId}.`, { chainId }));
  } else {
    checks.push(warn("rpc", "No RPC target provided; skipping live chain connectivity check."));
  }

  const owner = parseOptionalEnvAddress(process.env, "PRISONERS_OWNER", "owner");
  const treasury = parseOptionalEnvAddress(process.env, "PRISONERS_TREASURY", "treasury");
  const identityRegistry = parseOptionalEnvAddress(
    process.env,
    "ERC8004_IDENTITY_REGISTRY",
    "identityRegistry"
  );

  checks.push(owner.check, treasury.check, identityRegistry.check);

  return {
    status: statusFromChecks(checks),
    chainId,
    expected: {
      owner: owner.value,
      treasury: treasury.value,
      identityRegistry: identityRegistry.value,
    },
    checks,
  };
}

async function runDeployment(args) {
  const provider = createProvider(args);
  const chainId = Number((await provider.getNetwork()).chainId);
  const deploymentFile = args.deploymentFile ?? join("deployments", `${chainId}.json`);
  const deploymentMap = loadDeploymentMap(deploymentFile);

  const authRegistryAddress = findNamedDeployment(
    deploymentMap.value,
    "ERC8004AuthAdapter"
  );
  const gameAddress = findNamedDeployment(deploymentMap.value, "PrisonersDAOlemma");
  const chatAddress = findNamedDeployment(deploymentMap.value, "GameChat");

  const checks = [];
  if (!authRegistryAddress || !gameAddress || !chatAddress) {
    checks.push(
      fail(
        "deployment-file",
        `Deployment file ${deploymentMap.path} must include ERC8004AuthAdapter, PrisonersDAOlemma, and GameChat.`
      )
    );
    return {
      status: statusFromChecks(checks),
      chainId,
      deploymentFile: deploymentMap.path,
      checks,
    };
  }

  const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
  const adapter = new ethers.Contract(authRegistryAddress, ADAPTER_ABI, provider);
  const chat = new ethers.Contract(chatAddress, CHAT_ABI, provider);

  const [owner, treasury, gameAuthRegistry, identityRegistry, chatGame] = await Promise.all([
    game.owner(),
    game.treasury(),
    game.authRegistry(),
    adapter.identityRegistry(),
    chat.game(),
  ]);

  const expectedOwner = process.env.PRISONERS_OWNER
    ? normalizeAddress(process.env.PRISONERS_OWNER, "PRISONERS_OWNER")
    : null;
  const expectedTreasury = process.env.PRISONERS_TREASURY
    ? normalizeAddress(process.env.PRISONERS_TREASURY, "PRISONERS_TREASURY")
    : null;
  const expectedIdentityRegistry = process.env.ERC8004_IDENTITY_REGISTRY
    ? normalizeAddress(
        process.env.ERC8004_IDENTITY_REGISTRY,
        "ERC8004_IDENTITY_REGISTRY"
      )
    : null;

  checks.push(
    normalizeAddress(gameAuthRegistry, "game.authRegistry") === authRegistryAddress
      ? ok("game.authRegistry", "Game points at the deployed ERC8004AuthAdapter.")
      : fail("game.authRegistry", `Game auth registry ${gameAuthRegistry} does not match deployed adapter ${authRegistryAddress}.`),
    normalizeAddress(chatGame, "chat.game") === gameAddress
      ? ok("chat.game", "GameChat points at the deployed game.")
      : fail("chat.game", `GameChat.game ${chatGame} does not match deployed game ${gameAddress}.`)
  );

  if (expectedOwner) {
    checks.push(
      normalizeAddress(owner, "game.owner") === expectedOwner
        ? ok("owner", "Onchain owner matches PRISONERS_OWNER.", { value: owner })
        : fail("owner", `Onchain owner ${owner} does not match expected owner ${expectedOwner}.`)
    );
  } else {
    checks.push(warn("owner", "PRISONERS_OWNER is not set; owner comparison skipped.", { value: owner }));
  }

  if (expectedTreasury) {
    checks.push(
      normalizeAddress(treasury, "game.treasury") === expectedTreasury
        ? ok("treasury", "Onchain treasury matches PRISONERS_TREASURY.", { value: treasury })
        : fail(
            "treasury",
            `Onchain treasury ${treasury} does not match expected treasury ${expectedTreasury}.`
          )
    );
  } else {
    checks.push(
      warn("treasury", "PRISONERS_TREASURY is not set; treasury comparison skipped.", {
        value: treasury,
      })
    );
  }

  if (expectedIdentityRegistry) {
    checks.push(
      normalizeAddress(identityRegistry, "adapter.identityRegistry") === expectedIdentityRegistry
        ? ok(
            "identityRegistry",
            "Adapter identity registry matches ERC8004_IDENTITY_REGISTRY.",
            { value: identityRegistry }
          )
        : fail(
            "identityRegistry",
            `Adapter identity registry ${identityRegistry} does not match expected ${expectedIdentityRegistry}.`
          )
    );
  } else {
    checks.push(
      warn(
        "identityRegistry",
        "ERC8004_IDENTITY_REGISTRY is not set; identity registry comparison skipped.",
        { value: identityRegistry }
      )
    );
  }

  return {
    status: statusFromChecks(checks),
    chainId,
    deploymentFile: deploymentMap.path,
    addresses: {
      authRegistry: authRegistryAddress,
      game: gameAddress,
      chat: chatAddress,
    },
    onchain: {
      owner,
      treasury,
      authRegistry: gameAuthRegistry,
      identityRegistry,
      chatGame,
    },
    checks,
  };
}

function printSummary(report) {
  console.log(`Status: ${report.status}`);
  if (report.addresses) {
    console.log(`Adapter:          ${report.addresses.authRegistry}`);
    console.log(`Game:             ${report.addresses.game}`);
    console.log(`GameChat:         ${report.addresses.chat}`);
  }
  for (const check of report.checks) {
    const prefix = check.ok ? (check.severity === "warn" ? "⚠️" : "✅") : "❌";
    console.log(`${prefix} ${check.label}: ${check.message}`);
  }
}

async function main() {
  const { subcommand, args } = parseCliArgs();
  const command = subcommand ?? "help";

  if (args.help || command === "help") {
    console.log(HELP);
    return;
  }

  const report =
    command === "preflight"
      ? await runPreflight(args)
      : command === "deployment"
        ? await runDeployment(args)
        : (() => {
            throw new Error(`Unknown canary command '${command}'. Use preflight, deployment, or help.`);
          })();

  if (args.out) {
    writeJson(args.out, report);
  }

  if (args.json) {
    printJson(report);
  } else {
    printSummary(report);
  }

  if (report.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n❌ Canary failed: ${error.message}`);
  process.exitCode = 1;
});
