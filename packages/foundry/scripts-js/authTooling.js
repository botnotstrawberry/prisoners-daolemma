import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
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
  "This command signs and submits verifier-approved auth inputs. It does not parse or verify SIWA payloads itself; use siwa-nonce and siwa-verify first if you need a real local SIWA verification step.";

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
      throw new Error(
        `Missing private key. Provide the flag directly or set ${envKey}.`
      );
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

export function resolvePermitFieldInput(args = {}, input = {}) {
  return {
    wallet: args.wallet ?? input.wallet,
    agentKey: args.agentKey ?? input.agentKey,
    agentKeyText: args.agentKeyText ?? input.agentKeyText ?? input.agentId,
    manifestHash: args.manifestHash ?? input.manifestHash,
    manifestText:
      args.manifestText ??
      args.manifestUri ??
      input.manifestText ??
      input.manifestUri,
    issuedAt: args.issuedAt ?? input.issuedAt,
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

  const domain = {
    name: AUTH_DOMAIN_NAME,
    version: AUTH_DOMAIN_VERSION,
    chainId: network.chainId,
    verifyingContract: registryAddress,
  };

  const computedDomainSeparator =
    ethers.utils._TypedDataEncoder.hashDomain(domain);
  if (
    computedDomainSeparator.toLowerCase() !==
    onchainDomainSeparator.toLowerCase()
  ) {
    throw new Error(
      "Local EIP-712 domain constants do not match the onchain AgentAuthRegistry. Check the CLI and contract are in sync."
    );
  }

  const verifierPrivateKey = normalizePrivateKey(
    options.verifierPrivateKey,
    VERIFIER_PK_ENV
  );
  const verifierWallet = new ethers.Wallet(verifierPrivateKey);
  if (verifierWallet.address.toLowerCase() !== expectedVerifier.toLowerCase()) {
    throw new Error(
      `Verifier key mismatch. Registry expects ${expectedVerifier}, but the supplied verifier key resolves to ${verifierWallet.address}.`
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
  const registryAddress = normalizeAddress(
    options.registry ?? bundle?.registry,
    "registry"
  );
  const wallet = normalizeAddress(
    options.wallet ?? bundle?.permit?.wallet,
    "wallet"
  );
  const nonce = options.nonce ?? bundle?.permit?.nonce;
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
  };
}

export async function registerSignedPermit(options = {}) {
  const bundle = options.bundle ?? loadPermitBundle(options.permitFile);
  const provider = options.provider ?? createProvider(options);
  const registryAddress = normalizeAddress(
    options.registry ?? bundle.registry,
    "registry"
  );
  const permit = normalizeBundlePermit(bundle.permit);
  const signature = bundle.signature;

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error("Permit bundle signature must be a hex string.");
  }

  if (bundle.domain?.verifyingContract) {
    const bundleRegistry = normalizeAddress(
      bundle.domain.verifyingContract,
      "bundle.domain.verifyingContract"
    );
    if (bundleRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
      throw new Error(
        `Bundle registry mismatch. Bundle targets ${bundleRegistry}, but the command targets ${registryAddress}.`
      );
    }
  }

  const network = await provider.getNetwork();
  if (permit.chainId !== network.chainId) {
    throw new Error(
      `Permit chainId ${permit.chainId} does not match connected chain ${network.chainId}.`
    );
  }

  const walletPrivateKey = normalizePrivateKey(
    options.walletPrivateKey,
    GAMEPLAY_PK_ENV
  );
  const gameplayWallet = new ethers.Wallet(walletPrivateKey, provider);
  if (gameplayWallet.address.toLowerCase() !== permit.wallet.toLowerCase()) {
    throw new Error(
      `Gameplay wallet mismatch. Permit is for ${permit.wallet}, but the supplied wallet key resolves to ${gameplayWallet.address}.`
    );
  }

  const registry = getRegistryContract(registryAddress, gameplayWallet);
  const transaction = await registry.registerAuth(permit, signature);
  const receipt = await transaction.wait();
  const status = await getAuthStatus({
    provider,
    registry: registryAddress,
    wallet: permit.wallet,
    nonce: permit.nonce,
  });

  return {
    registry: registryAddress,
    wallet: permit.wallet,
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
