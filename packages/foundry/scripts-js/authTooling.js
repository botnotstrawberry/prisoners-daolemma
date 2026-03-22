import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { parse as parseToml } from "toml";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });

export const GAMEPLAY_PK_ENV = "GAMEPLAY_WALLET_PRIVATE_KEY";

export const ADAPTER_ABI = [
  "function identityRegistry() view returns (address)",
  "function isAuthorized(address wallet) view returns (bool)",
  "function agentKeyOf(address wallet) view returns (bytes32)",
];

export const GAME_ABI = [
  "function authRegistry() view returns (address)",
];

export const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

export function parseCliArgs(argv = process.argv.slice(2)) {
  const [subcommand, ...rest] = argv;
  const args = { _: [] };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "-h") {
      args.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex !== -1) {
      args[toCamelCase(token.slice(2, eqIndex))] = token.slice(eqIndex + 1);
      continue;
    }

    const key = toCamelCase(token.slice(2));
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return { subcommand, args };
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeJson(filePath, value) {
  const resolvedPath = resolveFromPackageRoot(filePath);
  writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

export function loadJsonFile(filePath, description = "JSON file") {
  const resolvedPath = resolveFromPackageRoot(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${description} not found: ${resolvedPath}`);
  }

  try {
    return JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse ${description} at ${resolvedPath}: ${error.message}`
    );
  }
}

export function resolveFromPackageRoot(filePath) {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return resolve(join(__dirname, "..", filePath));
}

export function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function resolveRpcTarget(args = {}) {
  const target =
    args.rpcUrl ??
    args.network ??
    args.rpc ??
    process.env.AUTH_RPC_URL ??
    process.env.RPC_URL;

  if (!target) {
    throw new Error(
      "Missing RPC target. Provide --rpc-url <url|network> or --network <name>."
    );
  }

  if (/^https?:\/\//i.test(target)) {
    return target;
  }

  const foundryTomlPath = join(__dirname, "..", "foundry.toml");
  const parsedToml = parseToml(readFileSync(foundryTomlPath, "utf8"));
  const endpoints = parsedToml.rpc_endpoints ?? {};
  const resolvedTarget = endpoints[target];

  if (!resolvedTarget) {
    const knownNetworks = Object.keys(endpoints)
      .filter((key) => /^[_a-zA-Z][\w-]*$/.test(key))
      .sort()
      .join(", ");

    throw new Error(
      `Unknown RPC network '${target}'. Add it to foundry.toml or pass a full URL. Known networks: ${knownNetworks}`
    );
  }

  return String(resolvedTarget).replace(
    /\$\{([^}]+)\}/g,
    (_, envKey) => process.env[envKey] ?? ""
  );
}

export function createProvider(args = {}) {
  return new ethers.providers.JsonRpcProvider(resolveRpcTarget(args));
}

export function normalizePrivateKey(privateKey, envKey) {
  const resolved = privateKey ?? (envKey ? process.env[envKey] : undefined);
  if (!resolved) {
    if (envKey) {
      throw new Error(`Missing private key. Set ${envKey}.`);
    }
    throw new Error("Missing private key.");
  }

  const normalized = resolved.startsWith("0x") ? resolved : `0x${resolved}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Private key must be a 32-byte hex string.");
  }
  return normalized;
}

export function normalizeAddress(address, label) {
  try {
    return ethers.utils.getAddress(address);
  } catch {
    throw new Error(`${label} must be a valid 20-byte address.`);
  }
}

export function normalizeBytes32(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }
  return value.toLowerCase();
}

export function bytes32FromUtf8(value) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(value));
}

export function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parsePositiveDecimalString(value, label) {
  if (typeof value === "bigint") {
    if (value <= 0n) {
      throw new Error(`${label} must be a positive integer.`);
    }
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        `${label} must be provided as an exact positive integer. Use a decimal string for values above ${Number.MAX_SAFE_INTEGER}.`
      );
    }
    return String(value);
  }

  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value.trim())) {
    const normalized = value.trim().replace(/^0+(?=\d)/, "");
    if (normalized === "0") {
      throw new Error(`${label} must be a positive integer.`);
    }
    return normalized;
  }

  throw new Error(`${label} must be a positive integer.`);
}

export function parseNonNegativeDecimalString(value, label) {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `${label} must be provided as an exact non-negative integer. Use a decimal string for values above ${Number.MAX_SAFE_INTEGER}.`
      );
    }
    return String(value);
  }

  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value.trim())) {
    return value.trim().replace(/^0+(?=\d)/, "");
  }

  throw new Error(`${label} must be a non-negative integer.`);
}

export function normalizeAgentRegistry(agentRegistry, label = "agentRegistry") {
  if (typeof agentRegistry !== "string" || agentRegistry.length === 0) {
    throw new Error(
      `${label} is required and must use eip155:<chainId>:<address> format.`
    );
  }

  const match = agentRegistry.match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})$/);
  if (!match) {
    throw new Error(`${label} must use eip155:<chainId>:<address> format.`);
  }

  const chainId = parsePositiveInteger(match[1], `${label} chainId`);
  const address = normalizeAddress(match[2], `${label} address`);

  return {
    chainId,
    address,
    value: `eip155:${chainId}:${address}`,
  };
}

function expandUserPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error("Path is required.");
  }

  const trimmed = filePath.trim();
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function resolveOptionalFilePath(filePath) {
  if (!filePath) {
    return null;
  }
  const expanded = expandUserPath(filePath);
  if (isAbsolute(expanded)) {
    return expanded;
  }
  const cwdResolved = resolve(expanded);
  if (existsSync(cwdResolved)) {
    return cwdResolved;
  }
  return resolveFromPackageRoot(expanded);
}

function resolveKeystorePath(keystore) {
  if (!keystore || typeof keystore !== "string") {
    return null;
  }

  const expanded = expandUserPath(keystore);
  if (expanded.includes("/") || expanded.endsWith(".json") || isAbsolute(expanded)) {
    const directPath = isAbsolute(expanded) ? expanded : resolve(expanded);
    if (!existsSync(directPath)) {
      throw new Error(`Keystore file not found: ${directPath}`);
    }
    return directPath;
  }

  const foundryKeystoreBase = join(homedir(), ".foundry", "keystores", expanded);
  if (existsSync(foundryKeystoreBase)) {
    return foundryKeystoreBase;
  }

  const foundryKeystoreJson = `${foundryKeystoreBase}.json`;
  if (existsSync(foundryKeystoreJson)) {
    return foundryKeystoreJson;
  }

  throw new Error(
    `Foundry keystore '${expanded}' not found at ${foundryKeystoreBase} or ${foundryKeystoreJson}. Pass --wallet-keystore <name|path>.`
  );
}

function resolveKeystorePassword({ password, passwordEnv, passwordFile, label }) {
  if (password && passwordEnv) {
    throw new Error(`Provide either ${label} password or ${label} password env, not both.`);
  }
  if (password && passwordFile) {
    throw new Error(`Provide either ${label} password or ${label} password file, not both.`);
  }
  if (passwordEnv && passwordFile) {
    throw new Error(`Provide either ${label} password env or ${label} password file, not both.`);
  }

  if (password !== undefined) {
    return String(password);
  }

  if (passwordEnv) {
    const resolved = process.env[String(passwordEnv)];
    if (resolved === undefined) {
      throw new Error(`Missing ${label} password env ${passwordEnv}.`);
    }
    return resolved;
  }

  if (passwordFile) {
    const resolvedPath = resolveOptionalFilePath(passwordFile);
    if (!resolvedPath || !existsSync(resolvedPath)) {
      throw new Error(`Missing ${label} password file: ${passwordFile}`);
    }
    return readFileSync(resolvedPath, "utf8").replace(/\r?\n$/, "");
  }

  throw new Error(`Missing ${label} password. Provide a password env or password file.`);
}

export async function resolveSignerWallet({
  provider,
  privateKey,
  privateKeyEnv,
  keystore,
  keystorePassword,
  keystorePasswordEnv,
  keystorePasswordFile,
  label = "wallet",
}) {
  const hasExplicitPrivateKey =
    privateKey !== undefined && privateKey !== null && String(privateKey).trim() !== "";
  const hasKeystore = Boolean(keystore);
  const hasEnvPrivateKey =
    Boolean(privateKeyEnv) &&
    process.env[String(privateKeyEnv)] !== undefined &&
    String(process.env[String(privateKeyEnv)]).trim() !== "";

  if (hasExplicitPrivateKey && hasKeystore) {
    throw new Error(`Provide either ${label} private key or ${label} keystore, not both.`);
  }

  if (hasExplicitPrivateKey) {
    return new ethers.Wallet(normalizePrivateKey(privateKey), provider);
  }

  if (hasKeystore) {
    const keystorePath = resolveKeystorePath(keystore);
    const password = resolveKeystorePassword({
      password: keystorePassword,
      passwordEnv: keystorePasswordEnv,
      passwordFile: keystorePasswordFile,
      label,
    });

    const encryptedJson = readFileSync(keystorePath, "utf8");
    return (await ethers.Wallet.fromEncryptedJson(encryptedJson, password)).connect(provider);
  }

  if (hasEnvPrivateKey) {
    return new ethers.Wallet(normalizePrivateKey(undefined, privateKeyEnv), provider);
  }

  throw new Error(
    `Missing ${label} signer. Provide ${label} private key or ${label} keystore.`
  );
}

export function deriveWalletAgentKey(wallet) {
  const checksumWallet = normalizeAddress(wallet, "wallet");
  return ethers.utils.solidityKeccak256(
    ["bytes32", "address"],
    [bytes32FromUtf8("erc8004-agent"), checksumWallet]
  );
}

export function getAdapterContract(adapterAddress, signerOrProvider) {
  return new ethers.Contract(
    normalizeAddress(adapterAddress, "auth registry"),
    ADAPTER_ABI,
    signerOrProvider
  );
}

export function getIdentityRegistryContract(registryAddress, signerOrProvider) {
  return new ethers.Contract(
    normalizeAddress(registryAddress, "identity registry"),
    IDENTITY_REGISTRY_ABI,
    signerOrProvider
  );
}

export async function resolveRegistryContext(options = {}) {
  const provider = options.provider ?? createProvider(options);
  const gameAddress = options.game ? normalizeAddress(options.game, "game") : null;
  const authRegistryAddress = options.authRegistry
    ? normalizeAddress(options.authRegistry, "auth registry")
    : options.registry
      ? normalizeAddress(options.registry, "registry")
      : null;
  const identityRegistryAddress = options.identityRegistry
    ? normalizeAddress(options.identityRegistry, "identity registry")
    : null;

  let resolvedAuthRegistry = authRegistryAddress;
  if (!resolvedAuthRegistry && gameAddress) {
    const game = new ethers.Contract(gameAddress, GAME_ABI, provider);
    resolvedAuthRegistry = normalizeAddress(await game.authRegistry(), "game.authRegistry()");
  }

  let resolvedIdentityRegistry = identityRegistryAddress;
  if (!resolvedIdentityRegistry && resolvedAuthRegistry) {
    const adapter = getAdapterContract(resolvedAuthRegistry, provider);
    resolvedIdentityRegistry = normalizeAddress(
      await adapter.identityRegistry(),
      "adapter.identityRegistry()"
    );
  }

  return {
    provider,
    gameAddress,
    authRegistryAddress: resolvedAuthRegistry,
    identityRegistryAddress: resolvedIdentityRegistry,
  };
}

function findMintedAgentIdFromReceipt(identityRegistry, receipt, wallet) {
  const targetWallet = normalizeAddress(wallet, "wallet").toLowerCase();
  const registryAddress = normalizeAddress(identityRegistry.address, "identity registry").toLowerCase();

  for (const log of receipt.logs ?? []) {
    if (!log.address || log.address.toLowerCase() !== registryAddress) {
      continue;
    }

    try {
      const parsed = identityRegistry.interface.parseLog(log);
      if (
        parsed.name === "Transfer" &&
        normalizeAddress(parsed.args.from, "transfer.from") === ethers.constants.AddressZero &&
        normalizeAddress(parsed.args.to, "transfer.to").toLowerCase() === targetWallet
      ) {
        return parsed.args.tokenId;
      }
    } catch {
      // ignore unrelated logs
    }
  }

  return null;
}

export async function registerIdentity(options = {}) {
  const context = await resolveRegistryContext(options);
  if (!context.identityRegistryAddress) {
    throw new Error(
      "Missing identity registry. Provide --identity-registry <address> or --game/--auth-registry so it can be resolved."
    );
  }

  const signerWallet = await resolveSignerWallet({
    provider: context.provider,
    privateKey: options.walletPrivateKey,
    privateKeyEnv: GAMEPLAY_PK_ENV,
    keystore: options.walletKeystore,
    keystorePassword: options.walletKeystorePassword,
    keystorePasswordEnv: options.walletKeystorePasswordEnv,
    keystorePasswordFile: options.walletKeystorePasswordFile,
    label: "wallet",
  });

  const wallet = normalizeAddress(
    options.wallet ?? signerWallet.address,
    "wallet"
  );
  if (wallet.toLowerCase() !== signerWallet.address.toLowerCase()) {
    throw new Error(
      `Wallet mismatch. CLI wallet ${wallet} does not match signer ${signerWallet.address}.`
    );
  }

  const agentUri =
    options.agentUri ??
    options.agentURI ??
    options.uri ??
    options.manifestUri ??
    options.manifestURI ??
    options.manifestText ??
    "";

  const identityRegistry = getIdentityRegistryContract(
    context.identityRegistryAddress,
    signerWallet
  );

  const predictedAgentId = await identityRegistry.callStatic.register(String(agentUri));
  const tx = await identityRegistry.register(String(agentUri));
  const receipt = await tx.wait();
  const actualAgentId = findMintedAgentIdFromReceipt(identityRegistry, receipt, wallet) ?? predictedAgentId;

  const [owner, balance] = await Promise.all([
    identityRegistry.ownerOf(actualAgentId),
    identityRegistry.balanceOf(wallet),
  ]);

  const result = {
    chainId: Number((await context.provider.getNetwork()).chainId),
    wallet,
    game: context.gameAddress,
    authRegistry: context.authRegistryAddress,
    identityRegistry: context.identityRegistryAddress,
    agentId: actualAgentId.toString(),
    predictedAgentId: predictedAgentId.toString(),
    agentUri: String(agentUri),
    derivedAgentKey: deriveWalletAgentKey(wallet),
    owner: normalizeAddress(owner, "ownerOf(agentId)"),
    balance: balance.toString(),
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
    registerable: true,
  };

  return result;
}

function parseRegistrationInput(options = {}) {
  if (!options.registrationFile) {
    return {};
  }

  const registration = loadJsonFile(options.registrationFile, "registration file");
  return {
    game: registration.game,
    authRegistry: registration.authRegistry,
    identityRegistry: registration.identityRegistry,
    wallet: registration.wallet,
    agentId: registration.agentId,
  };
}

export async function getAuthStatus(options = {}) {
  const registrationInput = parseRegistrationInput(options);
  const merged = { ...registrationInput, ...options };
  const context = await resolveRegistryContext(merged);

  if (!context.identityRegistryAddress) {
    throw new Error(
      "Missing identity registry. Provide --identity-registry <address>, --auth-registry <address>, --game <address>, or --registration-file <file>."
    );
  }

  const provider = context.provider;
  const identityRegistry = getIdentityRegistryContract(context.identityRegistryAddress, provider);
  const wallet = merged.wallet ? normalizeAddress(merged.wallet, "wallet") : null;
  const agentId = merged.agentId !== undefined && merged.agentId !== null
    ? parseNonNegativeDecimalString(merged.agentId, "agentId")
    : null;

  let balance = null;
  let isAuthorized = null;
  let agentKey = null;
  if (wallet) {
    const walletBalance = await identityRegistry.balanceOf(wallet);
    balance = walletBalance.toString();
    isAuthorized = walletBalance.gt(0);
    agentKey = isAuthorized ? deriveWalletAgentKey(wallet) : ethers.constants.HashZero;
  }

  let token = null;
  if (agentId !== null) {
    try {
      const owner = await identityRegistry.ownerOf(agentId);
      let tokenUri = null;
      try {
        tokenUri = await identityRegistry.tokenURI(agentId);
      } catch {
        tokenUri = null;
      }
      token = {
        agentId,
        owner: normalizeAddress(owner, "ownerOf(agentId)"),
        tokenUri,
      };
    } catch (error) {
      token = {
        agentId,
        missing: true,
        error: error.message,
      };
    }
  }

  return {
    chainId: Number((await provider.getNetwork()).chainId),
    game: context.gameAddress,
    authRegistry: context.authRegistryAddress,
    identityRegistry: context.identityRegistryAddress,
    wallet,
    balance,
    isAuthorized,
    agentKey,
    token,
  };
}

export function printRegistrationSummary(result) {
  console.log("\n✅ ERC-8004 self-registration submitted.");
  console.log(`Wallet:            ${result.wallet}`);
  console.log(`Identity registry: ${result.identityRegistry}`);
  if (result.authRegistry) {
    console.log(`Auth adapter:      ${result.authRegistry}`);
  }
  if (result.game) {
    console.log(`Game:              ${result.game}`);
  }
  console.log(`Agent ID:          ${result.agentId}`);
  console.log(`Agent URI:         ${result.agentUri}`);
  console.log(`Derived agent key: ${result.derivedAgentKey}`);
  console.log(`Tx hash:           ${result.transactionHash}`);
}

export function printStatusSummary(status) {
  console.log("\n📘 ERC-8004 admission status");
  console.log(`Identity registry: ${status.identityRegistry}`);
  if (status.authRegistry) {
    console.log(`Auth adapter:      ${status.authRegistry}`);
  }
  if (status.game) {
    console.log(`Game:              ${status.game}`);
  }
  if (status.wallet) {
    console.log(`Wallet:            ${status.wallet}`);
    console.log(`Balance:           ${status.balance}`);
    console.log(`Authorized:        ${status.isAuthorized ? "yes" : "no"}`);
    console.log(`Derived agent key: ${status.agentKey}`);
  }
  if (status.token) {
    console.log(`Agent ID:          ${status.token.agentId}`);
    if (status.token.missing) {
      console.log(`Owner:             missing (${status.token.error})`);
    } else {
      console.log(`Owner:             ${status.token.owner}`);
      console.log(`Token URI:         ${status.token.tokenUri ?? ""}`);
    }
  }
}
