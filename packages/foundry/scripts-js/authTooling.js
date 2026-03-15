import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { parse as parseToml } from "toml";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });

export const AUTH_DOMAIN_NAME = "PrisonersDaollemaAgentAuthRegistry";
export const AUTH_DOMAIN_VERSION = "1";
export const LOCAL_CHAIN_IDS = new Set([31337, 1337]);
export const VERIFIER_PK_ENV = "AUTH_VERIFIER_PRIVATE_KEY";
export const GAMEPLAY_PK_ENV = "GAMEPLAY_WALLET_PRIVATE_KEY";
export const PERMIT_BOUNDARY_NOTE =
  "This command signs and submits verifier-approved auth inputs. It does not parse or verify SIWA payloads itself; use siwa-nonce, siwa-sign, and siwa-verify first if you need a real local SIWA verification step.";

export const AUTH_PERMIT_TYPES = {
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

export const REGISTRY_ABI = [
  "function verifier() view returns (address)",
  "function gameNamespace() view returns (bytes32)",
  "function isAuthorized(address wallet) view returns (bool)",
  "function authRecordOf(address wallet) view returns ((bytes32 agentKey, bytes32 manifestHash, uint64 issuedAt, uint64 expiresAt, address issuer, bool active))",
  "function hasUsedNonce(bytes32 nonce) view returns (bool)",
  "function domainSeparatorV4() view returns (bytes32)",
  "function registerAuth((address wallet, bytes32 agentKey, bytes32 manifestHash, uint256 chainId, bytes32 gameNamespace, uint64 issuedAt, uint64 expiresAt, bytes32 nonce) permit, bytes signature)",
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
      const key = toCamelCase(token.slice(2, eqIndex));
      args[key] = token.slice(eqIndex + 1);
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

export function getRegistryContract(registryAddress, signerOrProvider) {
  return new ethers.Contract(
    ethers.utils.getAddress(registryAddress),
    REGISTRY_ABI,
    signerOrProvider
  );
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

export function parseTimestamp(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return parsed;
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

export function normalizeAgentRegistry(agentRegistry, label = "agentRegistry") {
  if (typeof agentRegistry !== "string" || agentRegistry.length === 0) {
    throw new Error(
      `${label} is required and must use eip155:<chainId>:<address> format.`
    );
  }

  const match = agentRegistry.match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})$/);
  if (!match) {
    throw new Error(
      `${label} must use eip155:<chainId>:<address> format.`
    );
  }

  const chainId = parsePositiveInteger(match[1], `${label} chainId`);
  const address = normalizeAddress(match[2], `${label} address`);

  return {
    chainId,
    address,
    value: `eip155:${chainId}:${address}`,
  };
}

function buildVerifiedSiwaAgentKeyText(input = {}) {
  if (input.agentRegistry === undefined || input.agentId === undefined) {
    return null;
  }

  return `${normalizeAgentRegistry(input.agentRegistry, "input.agentRegistry").value}:${parsePositiveDecimalString(
    input.agentId,
    "input.agentId"
  )}`;
}

function extractVerifiedSiwaIdentityBoundary(input = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const siwa = input.siwa;
  if (!siwa || typeof siwa !== "object" || siwa.valid !== true) {
    return null;
  }

  const wallet =
    input.wallet !== undefined
      ? normalizeAddress(input.wallet, "input.wallet")
      : null;
  const derivedAgentKeyText = buildVerifiedSiwaAgentKeyText(input);
  const inputAgentKeyText =
    typeof input.agentKeyText === "string" && input.agentKeyText.length > 0
      ? input.agentKeyText
      : null;
  const agentKeyText = derivedAgentKeyText ?? inputAgentKeyText;
  const agentKey =
    input.agentKey !== undefined
      ? normalizeBytes32(input.agentKey, "input.agentKey")
      : null;

  if (!wallet) {
    throw new Error(
      "Verified SIWA input is missing wallet. Re-run siwa-verify or fix the input file before signing a permit."
    );
  }

  if (!agentKey && !agentKeyText) {
    throw new Error(
      "Verified SIWA input is missing agent identity context. Provide input.agentKey, input.agentKeyText, or input.agentRegistry + input.agentId."
    );
  }

  if (
    derivedAgentKeyText &&
    inputAgentKeyText &&
    inputAgentKeyText !== derivedAgentKeyText
  ) {
    throw new Error(
      `Verified SIWA input agent identity mismatch. input.agentRegistry + input.agentId derive ${derivedAgentKeyText}, but input.agentKeyText is ${inputAgentKeyText}.`
    );
  }

  if (agentKey && agentKeyText) {
    const derivedAgentKey = bytes32FromUtf8(agentKeyText);

    if (derivedAgentKey !== agentKey) {
      throw new Error(
        `Verified SIWA input agent identity mismatch. input.agentKey is ${agentKey}, but input.agentKeyText resolves to ${derivedAgentKey}.`
      );
    }
  }

  return {
    wallet,
    agentKey,
    agentKeyText,
    resolvedAgentKey: agentKey ?? bytes32FromUtf8(agentKeyText),
  };
}

export function resolvePermitFieldInput(args = {}, input = {}) {
  const verifiedIdentity = extractVerifiedSiwaIdentityBoundary(input);

  if (verifiedIdentity && args.wallet !== undefined) {
    const overrideWallet = normalizeAddress(args.wallet, "wallet");
    if (overrideWallet.toLowerCase() !== verifiedIdentity.wallet.toLowerCase()) {
      throw new Error(
        `Verified SIWA wallet is immutable at permit time. Input wallet ${verifiedIdentity.wallet} cannot be replaced with --wallet ${overrideWallet}.`
      );
    }
  }

  if (
    verifiedIdentity &&
    (args.agentKey !== undefined || args.agentKeyText !== undefined)
  ) {
    const overrideAgentKey = resolveBytes32Value({
      rawValue: args.agentKey,
      textValue: args.agentKeyText,
      label: "agentKey",
      textLabel: "agentKeyText",
    });

    if (overrideAgentKey !== verifiedIdentity.resolvedAgentKey) {
      throw new Error(
        `Verified SIWA agentKey is immutable at permit time. Input agent identity resolves to ${verifiedIdentity.resolvedAgentKey}, but the CLI override resolves to ${overrideAgentKey}.`
      );
    }
  }

  return {
    wallet: verifiedIdentity?.wallet ?? args.wallet ?? input.wallet,
    agentKey:
      verifiedIdentity?.agentKey ??
      args.agentKey ??
      input.agentKey,
    agentKeyText:
      verifiedIdentity?.agentKey
        ? undefined
        : verifiedIdentity?.agentKeyText ??
          args.agentKeyText ??
          input.agentKeyText ??
          input.agentId,
    manifestHash: args.manifestHash ?? input.manifestHash,
    manifestText:
      args.manifestText ??
      args.manifestUri ??
      input.manifestText ??
      input.manifestUri,
    issuedAt: args.issuedAt,
    expiresAt: args.expiresAt ?? input.expiresAt,
    ttlSeconds: args.ttlSeconds,
    nonce: args.nonce ?? input.nonce,
    nonceText: args.nonceText ?? input.nonceText,
  };
}

export function resolveBytes32Value({ rawValue, textValue, label, textLabel }) {
  if (rawValue && textValue) {
    throw new Error(`Provide either ${label} or ${textLabel}, not both.`);
  }

  if (rawValue) {
    return normalizeBytes32(rawValue, label);
  }

  if (typeof textValue === "string" && textValue.length > 0) {
    return bytes32FromUtf8(textValue);
  }

  throw new Error(`Missing ${label}. Provide ${label} or ${textLabel}.`);
}

export function resolveNonce({ nonce, nonceText }) {
  if (nonce && nonceText) {
    throw new Error("Provide either --nonce or --nonce-text, not both.");
  }

  if (nonce) {
    return normalizeBytes32(nonce, "nonce");
  }

  if (typeof nonceText === "string" && nonceText.length > 0) {
    return bytes32FromUtf8(nonceText);
  }

  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

export function normalizeBundlePermit(permit = {}) {
  return {
    wallet: normalizeAddress(permit.wallet, "permit.wallet"),
    agentKey: normalizeBytes32(permit.agentKey, "permit.agentKey"),
    manifestHash: normalizeBytes32(permit.manifestHash, "permit.manifestHash"),
    chainId: parsePositiveInteger(permit.chainId, "permit.chainId"),
    gameNamespace: normalizeBytes32(
      permit.gameNamespace,
      "permit.gameNamespace"
    ),
    issuedAt: parseTimestamp(permit.issuedAt, "permit.issuedAt"),
    expiresAt: parseTimestamp(permit.expiresAt ?? 0, "permit.expiresAt"),
    nonce: normalizeBytes32(permit.nonce, "permit.nonce"),
  };
}

export function normalizeSignature(signature, label = "signature") {
  if (typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(signature)) {
    throw new Error(`${label} must be a hex string.`);
  }

  return signature;
}

export function buildAuthDomain(chainId, verifyingContract) {
  return {
    name: AUTH_DOMAIN_NAME,
    version: AUTH_DOMAIN_VERSION,
    chainId,
    verifyingContract: normalizeAddress(verifyingContract, "verifyingContract"),
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

function resolveSecretFilePath(filePath, label) {
  const expanded = expandUserPath(filePath);
  const resolved = isAbsolute(expanded)
    ? expanded
    : resolveFromPackageRoot(expanded);

  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }

  return resolved;
}

function resolveKeystorePath(keystore, label) {
  if (typeof keystore !== "string" || keystore.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const trimmed = keystore.trim();
  const explicitPath =
    trimmed.startsWith(".") ||
    trimmed.startsWith("~") ||
    trimmed.includes("/") ||
    trimmed.includes("\\");
  const resolved = explicitPath
    ? resolveSecretFilePath(trimmed, label)
    : join(process.env.HOME ?? homedir(), ".foundry", "keystores", trimmed);

  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }

  return resolved;
}

function loadSecretFromFile(filePath, label) {
  const resolvedPath = resolveSecretFilePath(filePath, label);
  const secret = readFileSync(resolvedPath, "utf8").trim();

  if (!secret) {
    throw new Error(`${label} at ${resolvedPath} is empty.`);
  }

  return secret;
}

async function promptSecret(promptText) {
  const { stdin, stderr } = process;

  if (!stdin.isTTY || !stderr.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error(
      "Interactive secret entry requires a TTY. Supply a password file/env instead."
    );
  }

  return await new Promise((resolvePromise, rejectPromise) => {
    let value = "";

    const cleanup = () => {
      stdin.off("data", handleData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const rejectWith = (error) => {
      cleanup();
      stderr.write("\n");
      rejectPromise(error);
    };

    const resolveWith = () => {
      cleanup();
      stderr.write("\n");
      resolvePromise(value);
    };

    const handleData = (chunk) => {
      const data = chunk.toString("utf8");

      if (data === "\u0003") {
        rejectWith(new Error("Secret entry aborted by user."));
        return;
      }

      if (data === "\r" || data === "\n") {
        resolveWith();
        return;
      }

      if (data === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += data;
    };

    stderr.write(promptText);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on("data", handleData);
  });
}

async function resolveKeystorePassword({
  passwordEnv,
  passwordFile,
  promptLabel,
}) {
  if (passwordEnv && passwordFile) {
    throw new Error(
      `Provide either ${promptLabel} password env or password file, not both.`
    );
  }

  if (passwordEnv) {
    const value = process.env[passwordEnv]?.trim();
    if (!value) {
      throw new Error(`Password env ${passwordEnv} is empty or unset.`);
    }
    return value;
  }

  if (passwordFile) {
    return loadSecretFromFile(passwordFile, `${promptLabel} password file`);
  }

  return await promptSecret(`Enter password for ${promptLabel}: `);
}

async function loadWalletFromKeystore({
  keystore,
  passwordEnv,
  passwordFile,
  label,
}) {
  const keystorePath = resolveKeystorePath(keystore, `${label} keystore`);
  const password = await resolveKeystorePassword({
    passwordEnv,
    passwordFile,
    promptLabel: `${label} keystore ${keystorePath}`,
  });

  try {
    const encryptedJson = readFileSync(keystorePath, "utf8");
    return await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
  } catch (error) {
    throw new Error(`Failed to unlock ${label} keystore ${keystorePath}: ${error.message}`);
  }
}

export async function resolveSignerWallet({
  purpose,
  privateKey,
  privateKeyEnv,
  keystore,
  keystorePasswordEnv,
  keystorePasswordFile,
  allowUnsafePrivateKey,
}) {
  if (keystore && privateKey !== undefined) {
    throw new Error(
      `Provide either --${purpose}-keystore or --${purpose}-private-key, not both.`
    );
  }

  if (keystore) {
    return loadWalletFromKeystore({
      keystore,
      passwordEnv: keystorePasswordEnv,
      passwordFile: keystorePasswordFile,
      label: purpose,
    });
  }

  if (privateKey !== undefined) {
    if (!allowUnsafePrivateKey) {
      throw new Error(
        `Raw ${purpose} private keys on the command line are disabled. Prefer --${purpose}-keystore with a password env/file (or the interactive prompt), or set ${privateKeyEnv} for local automation. If you absolutely need the old behavior for an ephemeral local test, repeat the command with --allow-unsafe-private-key.`
      );
    }

    return new ethers.Wallet(normalizePrivateKey(privateKey));
  }

  if (process.env[privateKeyEnv]) {
    return new ethers.Wallet(normalizePrivateKey(undefined, privateKeyEnv));
  }

  throw new Error(
    `Missing ${purpose} signer. Prefer --${purpose}-keystore <name|path> with a password env/file or interactive prompt. For local automation you can set ${privateKeyEnv}.`
  );
}

function normalizeOptionalAddress(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeAddress(value, label);
}

function extractVerifiedInputContext(input = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const registry = normalizeOptionalAddress(input.registry, "input.registry");
  const agentRegistry =
    input.agentRegistry !== undefined
      ? normalizeAgentRegistry(input.agentRegistry, "input.agentRegistry")
      : null;
  const siwa = input.siwa;
  const siwaChainId =
    siwa && typeof siwa === "object" && siwa.chainId !== undefined
      ? parsePositiveInteger(siwa.chainId, "input.siwa.chainId")
      : null;

  if (!registry && !agentRegistry && siwaChainId === null) {
    return null;
  }

  return {
    registry,
    agentRegistry,
    siwaChainId,
  };
}

function assertVerifiedInputMatchesPermitContext(input, { registryAddress, chainId }) {
  const context = extractVerifiedInputContext(input);
  if (!context) {
    return;
  }

  if (
    context.registry &&
    context.registry.toLowerCase() !== registryAddress.toLowerCase()
  ) {
    throw new Error(
      `Verified auth input registry mismatch. Input targets ${context.registry}, but the permit command targets ${registryAddress}.`
    );
  }

  if (
    context.agentRegistry &&
    context.agentRegistry.chainId !== chainId
  ) {
    throw new Error(
      `Verified SIWA agentRegistry chain ${context.agentRegistry.chainId} does not match connected permit chain ${chainId}.`
    );
  }

  if (context.siwaChainId !== null && context.siwaChainId !== chainId) {
    throw new Error(
      `Verified SIWA chainId ${context.siwaChainId} does not match connected permit chain ${chainId}.`
    );
  }

  if (
    context.agentRegistry &&
    context.siwaChainId !== null &&
    context.agentRegistry.chainId !== context.siwaChainId
  ) {
    throw new Error(
      `Verified SIWA chain context mismatch. agentRegistry declares chain ${context.agentRegistry.chainId}, but siwa.chainId is ${context.siwaChainId}.`
    );
  }
}

export async function inspectPermitBundle(options = {}) {
  const bundle = options.bundle ?? loadPermitBundle(options.permitFile);
  const provider = options.provider ?? createProvider(options);
  const permit = normalizeBundlePermit(bundle.permit);
  const signature = normalizeSignature(bundle.signature, "Permit bundle signature");
  const registryAddress = normalizeAddress(
    options.registry ?? bundle.registry ?? bundle.domain?.verifyingContract,
    "registry"
  );

  const problems = [];
  const bundleRegistry = normalizeOptionalAddress(bundle.registry, "bundle.registry");
  const bundleDomainVerifyingContract = normalizeOptionalAddress(
    bundle.domain?.verifyingContract,
    "bundle.domain.verifyingContract"
  );
  const bundleVerifier = normalizeOptionalAddress(bundle.verifier, "bundle.verifier");

  if (
    bundleRegistry &&
    bundleRegistry.toLowerCase() !== registryAddress.toLowerCase()
  ) {
    problems.push(
      `Bundle registry mismatch. Bundle targets ${bundleRegistry}, but the command targets ${registryAddress}.`
    );
  }

  if (
    bundleDomainVerifyingContract &&
    bundleDomainVerifyingContract.toLowerCase() !== registryAddress.toLowerCase()
  ) {
    problems.push(
      `Bundle registry mismatch. Bundle domain targets ${bundleDomainVerifyingContract}, but the command targets ${registryAddress}.`
    );
  }

  if (bundle.domain?.name && bundle.domain.name !== AUTH_DOMAIN_NAME) {
    problems.push(
      `Bundle domain name mismatch. Expected ${AUTH_DOMAIN_NAME}, got ${bundle.domain.name}.`
    );
  }

  if (bundle.domain?.version && bundle.domain.version !== AUTH_DOMAIN_VERSION) {
    problems.push(
      `Bundle domain version mismatch. Expected ${AUTH_DOMAIN_VERSION}, got ${bundle.domain.version}.`
    );
  }

  if (bundle.domain?.chainId !== undefined) {
    const bundleDomainChainId = parsePositiveInteger(
      bundle.domain.chainId,
      "bundle.domain.chainId"
    );
    if (bundleDomainChainId !== permit.chainId) {
      problems.push(
        `Bundle domain chainId ${bundleDomainChainId} does not match permit.chainId ${permit.chainId}.`
      );
    }
  }

  const registry = getRegistryContract(registryAddress, provider);
  const [
    network,
    latestBlock,
    currentVerifier,
    currentGameNamespace,
    onchainDomainSeparator,
    nonceUsed,
  ] = await Promise.all([
    provider.getNetwork(),
    provider.getBlock("latest"),
    registry.verifier(),
    registry.gameNamespace(),
    registry.domainSeparatorV4(),
    registry.hasUsedNonce(permit.nonce),
  ]);

  if (permit.chainId !== network.chainId) {
    problems.push(
      `Permit chainId ${permit.chainId} does not match connected chain ${network.chainId}.`
    );
  }

  if (
    permit.gameNamespace.toLowerCase() !== currentGameNamespace.toLowerCase()
  ) {
    problems.push(
      `Permit namespace mismatch. Registry exposes ${currentGameNamespace}, but the bundle encodes ${permit.gameNamespace}.`
    );
  }

  if (permit.issuedAt === 0 || permit.issuedAt > latestBlock.timestamp) {
    problems.push(
      `Permit issuedAt ${permit.issuedAt} is outside the current chain time window (latest block timestamp ${latestBlock.timestamp}).`
    );
  }

  if (permit.expiresAt !== 0 && permit.expiresAt <= permit.issuedAt) {
    problems.push(
      `Permit expiresAt ${permit.expiresAt} must be 0 or greater than issuedAt ${permit.issuedAt}.`
    );
  }

  if (permit.expiresAt !== 0 && permit.expiresAt < latestBlock.timestamp) {
    problems.push(
      `Permit already expired at ${permit.expiresAt}; latest block timestamp is ${latestBlock.timestamp}.`
    );
  }

  if (nonceUsed) {
    problems.push(
      `Permit nonce ${permit.nonce} was already used on registry ${registryAddress}.`
    );
  }

  const domain = buildAuthDomain(network.chainId, registryAddress);
  const computedDomainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
  if (
    computedDomainSeparator.toLowerCase() !== onchainDomainSeparator.toLowerCase()
  ) {
    problems.push(
      "Local EIP-712 domain constants do not match the onchain AgentAuthRegistry. Check the CLI and contract are in sync."
    );
  }

  let recoveredSigner = null;
  try {
    recoveredSigner = ethers.utils.verifyTypedData(
      domain,
      AUTH_PERMIT_TYPES,
      permit,
      signature
    );
  } catch (error) {
    problems.push(`Failed to recover permit signer: ${error.message}`);
  }

  if (
    recoveredSigner &&
    recoveredSigner.toLowerCase() !== currentVerifier.toLowerCase()
  ) {
    problems.push(
      `Permit verifier mismatch. Registry expects ${currentVerifier}, but the bundle signature recovers to ${recoveredSigner}. This usually means the wrong verifier signed the bundle or the registry verifier rotated after the bundle was created.`
    );
  }

  if (
    bundleVerifier &&
    recoveredSigner &&
    bundleVerifier.toLowerCase() !== recoveredSigner.toLowerCase()
  ) {
    problems.push(
      `Bundle verifier field ${bundleVerifier} does not match the recovered signer ${recoveredSigner}.`
    );
  }

  return {
    registry: registryAddress,
    permit,
    domain,
    latestBlockNumber: latestBlock.number,
    latestBlockTimestamp: latestBlock.timestamp,
    chainId: network.chainId,
    currentVerifier,
    currentGameNamespace,
    bundleRegistry,
    bundleDomainVerifyingContract,
    bundleVerifier,
    recoveredSigner,
    nonceUsed,
    registerable: problems.length === 0,
    problems,
  };
}

export async function buildAndSignAuthPermit(options = {}) {
  const input = options.input
    ? loadJsonFile(options.input, "permit input file")
    : {};
  const fields = resolvePermitFieldInput(options, input);
  const provider = options.provider ?? createProvider(options);
  const registryAddress = normalizeAddress(
    options.registry ?? input.registry,
    "registry"
  );
  const registry = getRegistryContract(registryAddress, provider);

  const [
    network,
    latestBlock,
    gameNamespace,
    expectedVerifier,
    onchainDomainSeparator,
  ] = await Promise.all([
    provider.getNetwork(),
    provider.getBlock("latest"),
    registry.gameNamespace(),
    registry.verifier(),
    registry.domainSeparatorV4(),
  ]);

  assertVerifiedInputMatchesPermitContext(input, {
    registryAddress,
    chainId: network.chainId,
  });

  const issuedAt =
    fields.issuedAt !== undefined
      ? parseTimestamp(fields.issuedAt, "issuedAt")
      : Number(latestBlock.timestamp);
  const expiresAt = resolveExpiresAt({
    chainId: network.chainId,
    issuedAt,
    expiresAt: fields.expiresAt,
    ttlSeconds: fields.ttlSeconds,
  });

  if (expiresAt !== 0 && expiresAt <= issuedAt) {
    throw new Error("expiresAt must be 0 or greater than issuedAt.");
  }

  const permit = {
    wallet: normalizeAddress(fields.wallet, "wallet"),
    agentKey: resolveBytes32Value({
      rawValue: fields.agentKey,
      textValue: fields.agentKeyText,
      label: "agentKey",
      textLabel: "agentKeyText",
    }),
    manifestHash: resolveBytes32Value({
      rawValue: fields.manifestHash,
      textValue: fields.manifestText,
      label: "manifestHash",
      textLabel: "manifestText",
    }),
    chainId: network.chainId,
    gameNamespace,
    issuedAt,
    expiresAt,
    nonce: resolveNonce(fields),
  };

  const domain = buildAuthDomain(network.chainId, registryAddress);

  const computedDomainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
  if (
    computedDomainSeparator.toLowerCase() !==
    onchainDomainSeparator.toLowerCase()
  ) {
    throw new Error(
      "Local EIP-712 domain constants do not match the onchain AgentAuthRegistry. Check the CLI and contract are in sync."
    );
  }

  const verifierWallet = await resolveSignerWallet({
    purpose: "verifier",
    privateKey: options.verifierPrivateKey,
    privateKeyEnv: VERIFIER_PK_ENV,
    keystore: options.verifierKeystore,
    keystorePasswordEnv: options.verifierKeystorePasswordEnv,
    keystorePasswordFile: options.verifierKeystorePasswordFile,
    allowUnsafePrivateKey: Boolean(options.allowUnsafePrivateKey),
  });
  if (verifierWallet.address.toLowerCase() !== expectedVerifier.toLowerCase()) {
    throw new Error(
      `Verifier key mismatch. Registry expects ${expectedVerifier}, but the supplied verifier signer resolves to ${verifierWallet.address}.`
    );
  }

  const digest = ethers.utils._TypedDataEncoder.hash(
    domain,
    AUTH_PERMIT_TYPES,
    permit
  );
  const signature = await verifierWallet._signTypedData(
    domain,
    AUTH_PERMIT_TYPES,
    permit
  );
  const recoveredSigner = ethers.utils.verifyTypedData(
    domain,
    AUTH_PERMIT_TYPES,
    permit,
    signature
  );

  if (recoveredSigner.toLowerCase() !== expectedVerifier.toLowerCase()) {
    throw new Error(
      "Generated signature does not recover to the registry verifier."
    );
  }

  return {
    boundaryNote: PERMIT_BOUNDARY_NOTE,
    registry: registryAddress,
    chainId: network.chainId,
    verifier: expectedVerifier,
    domain,
    permit,
    digest,
    signature,
  };
}

export async function getAuthStatus(options = {}) {
  const bundle = options.permitFile
    ? loadPermitBundle(options.permitFile)
    : options.bundle;
  const provider = options.provider ?? createProvider(options);
  const bundleInspection = bundle
    ? await inspectPermitBundle({
        bundle,
        provider,
        registry: options.registry,
      })
    : null;
  const registryAddress = normalizeAddress(
    options.registry ?? bundleInspection?.registry ?? bundle?.registry,
    "registry"
  );
  const wallet = normalizeAddress(
    options.wallet ?? bundleInspection?.permit.wallet ?? bundle?.permit?.wallet,
    "wallet"
  );
  const nonce =
    options.nonce ?? bundleInspection?.permit.nonce ?? bundle?.permit?.nonce;
  const registry = getRegistryContract(registryAddress, provider);

  const [
    network,
    latestBlock,
    verifier,
    gameNamespace,
    isAuthorized,
    rawRecord,
    nonceUsed,
  ] = await Promise.all([
    provider.getNetwork(),
    provider.getBlock("latest"),
    registry.verifier(),
    registry.gameNamespace(),
    registry.isAuthorized(wallet),
    registry.authRecordOf(wallet),
    nonce
      ? registry.hasUsedNonce(normalizeBytes32(nonce, "nonce"))
      : Promise.resolve(null),
  ]);

  const record = {
    agentKey: rawRecord.agentKey,
    manifestHash: rawRecord.manifestHash,
    issuedAt: rawRecord.issuedAt.toNumber(),
    expiresAt: rawRecord.expiresAt.toNumber(),
    issuer: rawRecord.issuer,
    active: rawRecord.active,
  };

  const hasRecord = record.agentKey !== ethers.constants.HashZero;
  const expired =
    record.expiresAt !== 0 && record.expiresAt < latestBlock.timestamp;

  return {
    registry: registryAddress,
    wallet,
    chainId: network.chainId,
    latestBlockNumber: latestBlock.number,
    latestBlockTimestamp: latestBlock.timestamp,
    verifier,
    gameNamespace,
    isAuthorized,
    hasRecord,
    expired,
    nonceChecked: nonce ? normalizeBytes32(nonce, "nonce") : null,
    nonceUsed,
    record,
    ...(bundleInspection
      ? {
          bundleInspection: {
            registerable: bundleInspection.registerable,
            recoveredSigner: bundleInspection.recoveredSigner,
            bundleVerifier: bundleInspection.bundleVerifier,
            bundleRegistry: bundleInspection.bundleRegistry,
            bundleDomainVerifyingContract:
              bundleInspection.bundleDomainVerifyingContract,
            problems: bundleInspection.problems,
          },
        }
      : {}),
  };
}

export async function registerSignedPermit(options = {}) {
  const bundle = options.bundle ?? loadPermitBundle(options.permitFile);
  const provider = options.provider ?? createProvider(options);
  const inspection = await inspectPermitBundle({
    bundle,
    provider,
    registry: options.registry,
  });

  if (!inspection.registerable) {
    throw new Error(
      `Permit bundle is not registerable: ${inspection.problems.join(" ")}`
    );
  }

  const gameplayWallet = (
    await resolveSignerWallet({
      purpose: "wallet",
      privateKey: options.walletPrivateKey,
      privateKeyEnv: GAMEPLAY_PK_ENV,
      keystore: options.walletKeystore,
      keystorePasswordEnv: options.walletKeystorePasswordEnv,
      keystorePasswordFile: options.walletKeystorePasswordFile,
      allowUnsafePrivateKey: Boolean(options.allowUnsafePrivateKey),
    })
  ).connect(provider);

  if (
    gameplayWallet.address.toLowerCase() !== inspection.permit.wallet.toLowerCase()
  ) {
    throw new Error(
      `Gameplay wallet mismatch. Permit is for ${inspection.permit.wallet}, but the supplied wallet signer resolves to ${gameplayWallet.address}.`
    );
  }

  const registry = getRegistryContract(inspection.registry, gameplayWallet);
  const transaction = await registry.registerAuth(
    inspection.permit,
    bundle.signature
  );
  const receipt = await transaction.wait();
  const status = await getAuthStatus({
    provider,
    registry: inspection.registry,
    wallet: inspection.permit.wallet,
    nonce: inspection.permit.nonce,
  });

  return {
    registry: inspection.registry,
    wallet: inspection.permit.wallet,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status,
  };
}

export function loadPermitBundle(filePath) {
  const bundle = loadJsonFile(filePath, "permit bundle file");
  if (
    !bundle ||
    typeof bundle !== "object" ||
    !bundle.permit ||
    !bundle.signature
  ) {
    throw new Error(
      "Permit bundle must contain at least { permit, signature }."
    );
  }

  return bundle;
}

export function resolveExpiresAt({ chainId, issuedAt, expiresAt, ttlSeconds }) {
  if (expiresAt !== undefined && ttlSeconds !== undefined) {
    throw new Error("Provide either --expires-at or --ttl-seconds, not both.");
  }

  if (expiresAt !== undefined) {
    return parseTimestamp(expiresAt, "expiresAt");
  }

  if (ttlSeconds !== undefined) {
    return issuedAt + parsePositiveInteger(ttlSeconds, "ttlSeconds");
  }

  if (LOCAL_CHAIN_IDS.has(chainId)) {
    return 0;
  }

  throw new Error(
    "Non-local networks require an explicit expiry. Provide --expires-at <unix-seconds> or --ttl-seconds <seconds>."
  );
}

export function printPermitSummary(bundle, outputPath) {
  console.log("\n✅ Auth permit signed.");
  console.log(`Registry:       ${bundle.registry}`);
  console.log(`Verifier:       ${bundle.verifier}`);
  console.log(`Wallet:         ${bundle.permit.wallet}`);
  console.log(`Agent key:      ${bundle.permit.agentKey}`);
  console.log(`Manifest hash:  ${bundle.permit.manifestHash}`);
  console.log(`Chain ID:       ${bundle.permit.chainId}`);
  console.log(`Issued at:      ${bundle.permit.issuedAt}`);
  console.log(`Expires at:     ${bundle.permit.expiresAt}`);
  console.log(`Nonce:          ${bundle.permit.nonce}`);
  console.log(`Digest:         ${bundle.digest}`);
  console.log(`Signature:      ${bundle.signature}`);
  if (outputPath) {
    console.log(`Bundle written: ${outputPath}`);
  }
  console.log(`\nBoundary note: ${bundle.boundaryNote}`);
}

export function printStatusSummary(status) {
  console.log("\n🔎 Auth status");
  console.log(`Registry:       ${status.registry}`);
  console.log(`Wallet:         ${status.wallet}`);
  console.log(`Chain ID:       ${status.chainId}`);
  console.log(`Verifier:       ${status.verifier}`);
  console.log(`Authorized:     ${status.isAuthorized}`);
  console.log(`Has record:     ${status.hasRecord}`);
  console.log(`Expired:        ${status.expired}`);
  console.log(`Active:         ${status.record.active}`);
  console.log(`Agent key:      ${status.record.agentKey}`);
  console.log(`Manifest hash:  ${status.record.manifestHash}`);
  console.log(`Issued at:      ${status.record.issuedAt}`);
  console.log(`Expires at:     ${status.record.expiresAt}`);
  console.log(`Issuer:         ${status.record.issuer}`);
  if (status.nonceChecked) {
    console.log(`Nonce checked:  ${status.nonceChecked}`);
    console.log(`Nonce used:     ${status.nonceUsed}`);
  }
  if (status.bundleInspection) {
    console.log(`Bundle ready:   ${status.bundleInspection.registerable}`);
    console.log(
      `Bundle signer:  ${status.bundleInspection.recoveredSigner ?? "(unrecoverable)"}`
    );
    if (status.bundleInspection.problems.length > 0) {
      console.log("Bundle issues:");
      for (const problem of status.bundleInspection.problems) {
        console.log(`  - ${problem}`);
      }
    }
  }
}

export function printRegistrationSummary(result) {
  console.log("\n✅ Auth registered onchain.");
  console.log(`Registry:       ${result.registry}`);
  console.log(`Wallet:         ${result.wallet}`);
  console.log(`Tx hash:        ${result.txHash}`);
  console.log(`Block number:   ${result.blockNumber}`);
  console.log(`Gas used:       ${result.gasUsed}`);
  console.log(`Authorized:     ${result.status.isAuthorized}`);
  console.log(`Nonce used:     ${result.status.nonceUsed}`);
}
