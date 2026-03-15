import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { createPublicClient, http } from "viem";
import {
  createSIWANonce,
  parseSIWAMessage,
  verifySIWA,
} from "@buildersgarden/siwa/siwa";
import {
  loadJsonFile,
  normalizeAddress,
  normalizeBytes32,
  parsePositiveInteger,
  resolveFromPackageRoot,
  resolveRpcTarget,
} from "./authTooling.js";

export const DEFAULT_SIWA_NONCE_STORE = ".siwa-nonces.json";
export const SIWA_NONCE_STORE_VERSION = 1;
export const SIWA_CHALLENGE_BOUNDARY_NOTE =
  "This command issues a local SIWA challenge after checking ERC-8004 ownerOf(agentId) for the requested wallet. It does not register auth onchain or sign an AgentAuthRegistry permit.";
export const SIWA_VERIFY_BOUNDARY_NOTE =
  "This command verifies the SIWA message/signature, challenge nonce, domain/URI/chain challenge match, and ERC-8004 ownerOf(agentId). Any manifest binding in this output is operator-supplied context for the later auth permit, not something SIWA authenticates by itself.";

export async function issueSiwaChallenge(options = {}) {
  const input = options.input
    ? loadJsonFile(options.input, "SIWA challenge input file")
    : {};
  const wallet = normalizeAddress(
    options.wallet ?? input.wallet ?? input.address,
    "wallet"
  );
  const agentId = parsePositiveInteger(
    options.agentId ?? input.agentId,
    "agentId"
  );
  const agentRegistry = normalizeAgentRegistry(
    options.agentRegistry ?? input.agentRegistry
  );
  const domain = requireNonEmptyString(
    options.domain ?? input.domain,
    "domain"
  );
  const uri =
    optionalNonEmptyString(options.uri ?? input.uri) ?? `https://${domain}/siwa`;
  const chainId = parsePositiveInteger(
    options.chainId ?? input.chainId ?? agentRegistry.chainId,
    "chainId"
  );
  const statement = optionalNonEmptyString(
    options.statement ?? input.statement
  );
  const requestId = optionalNonEmptyString(
    options.requestId ?? input.requestId
  );
  const ttlSecondsRaw = options.ttlSeconds ?? input.ttlSeconds;
  const expirationTTL =
    ttlSecondsRaw !== undefined
      ? parsePositiveInteger(ttlSecondsRaw, "ttlSeconds") * 1000
      : undefined;
  const authRegistry =
    options.registry ?? input.registry
      ? normalizeAddress(options.registry ?? input.registry, "registry")
      : undefined;
  const nonceStorePath = resolveNonceStorePath(options, input);
  const client = createSiwaPublicClient(options);
  const result = await createSIWANonce(
    {
      address: wallet,
      agentId,
      agentRegistry: agentRegistry.value,
    },
    client,
    expirationTTL ? { expirationTTL } : undefined
  );

  if (result.status === "captcha_required") {
    throw new Error(
      "SIWA nonce issuance requested a CAPTCHA challenge, which this local CLI flow does not handle."
    );
  }

  if (result.status !== "nonce_issued") {
    throw new Error(formatSiwaFailure("SIWA nonce issuance", result));
  }

  const record = {
    nonce: result.nonce,
    wallet,
    agentId,
    agentRegistry: agentRegistry.value,
    domain,
    uri,
    chainId,
    statement: statement ?? null,
    requestId: requestId ?? null,
    issuedAt: result.issuedAt,
    expirationTime: result.expirationTime,
    registry: authRegistry ?? null,
  };
  persistChallengeRecord(nonceStorePath, record);

  const siwaFields = {
    domain,
    address: wallet,
    uri,
    version: "1",
    agentId,
    agentRegistry: agentRegistry.value,
    chainId,
    nonce: result.nonce,
    issuedAt: result.issuedAt,
    expirationTime: result.expirationTime,
    ...(statement ? { statement } : {}),
    ...(requestId ? { requestId } : {}),
  };

  return {
    boundaryNote: SIWA_CHALLENGE_BOUNDARY_NOTE,
    nonceStore: nonceStorePath,
    wallet,
    agentId,
    agentRegistry: agentRegistry.value,
    ...(authRegistry ? { registry: authRegistry } : {}),
    challenge: {
      nonce: result.nonce,
      issuedAt: result.issuedAt,
      expirationTime: result.expirationTime,
      domain,
      uri,
      chainId,
      statement: statement ?? null,
      requestId: requestId ?? null,
    },
    siwaFields,
  };
}

export async function verifySiwaAuthInput(options = {}) {
  const input = options.input
    ? loadJsonFile(options.input, "SIWA signed input file")
    : {};
  const message = resolveSiwaMessage(options, input);
  const signature = resolveSiwaSignature(options, input);
  const nonceStorePath = resolveNonceStorePath(options, input);
  const fields = parseSIWAMessage(message);
  const challengeRecord = consumeChallengeRecord(nonceStorePath, fields.nonce);

  if (!challengeRecord) {
    throw new Error(
      `No active SIWA challenge found for nonce '${fields.nonce}' in ${nonceStorePath}.`
    );
  }

  const mismatches = compareChallengeToMessage(challengeRecord, fields);

  if (mismatches.length > 0) {
    throw new Error(
      `SIWA message does not match the issued challenge: ${mismatches.join(
        "; "
      )}`
    );
  }

  const client = createSiwaPublicClient(options);
  const result = await verifySIWA(
    message,
    signature,
    challengeRecord.domain,
    async () => true,
    client
  );

  if (!result.valid) {
    throw new Error(formatSiwaFailure("SIWA verification", result));
  }

  const manifestBinding = resolveManifestBinding(options, input);
  const authRegistry =
    options.registry ?? input.registry ?? challengeRecord.registry ?? undefined;
  const output = {
    boundaryNote: SIWA_VERIFY_BOUNDARY_NOTE,
    wallet: normalizeAddress(result.address, "wallet"),
    agentId: result.agentId,
    agentRegistry: normalizeAgentRegistry(result.agentRegistry).value,
    agentKeyText: buildAgentKeyText(result.agentRegistry, result.agentId),
    issuedAt: isoStringToUnixSeconds(fields.issuedAt, "SIWA issuedAt"),
    ...(fields.expirationTime
      ? {
          expiresAt: isoStringToUnixSeconds(
            fields.expirationTime,
            "SIWA expirationTime"
          ),
        }
      : {}),
    ...(authRegistry
      ? { registry: normalizeAddress(authRegistry, "registry") }
      : {}),
    ...manifestBinding,
    siwa: {
      valid: true,
      verified: result.verified,
      signerType: result.signerType ?? null,
      domain: fields.domain,
      uri: fields.uri,
      chainId: fields.chainId,
      nonce: fields.nonce,
      issuedAt: fields.issuedAt,
      expirationTime: fields.expirationTime ?? null,
      statement: fields.statement ?? null,
      requestId: fields.requestId ?? null,
    },
    verificationScope: {
      wallet:
        "Verified from the SIWA signature against the message address.",
      agentIdentity:
        "Verified against ERC-8004 ownerOf(agentId) for the declared agent registry.",
      nonce: `Consumed from local nonce store ${nonceStorePath}.`,
      manifest: describeManifestBoundary(manifestBinding),
    },
  };

  return output;
}

export function printSiwaChallengeSummary(result, outputPath) {
  console.log("\n✅ SIWA challenge issued.");
  console.log(`Wallet:         ${result.wallet}`);
  console.log(`Agent ID:       ${result.agentId}`);
  console.log(`Agent registry: ${result.agentRegistry}`);
  console.log(`Domain:         ${result.challenge.domain}`);
  console.log(`URI:            ${result.challenge.uri}`);
  console.log(`Chain ID:       ${result.challenge.chainId}`);
  console.log(`Nonce:          ${result.challenge.nonce}`);
  console.log(`Issued at:      ${result.challenge.issuedAt}`);
  console.log(`Expires at:     ${result.challenge.expirationTime}`);
  console.log(`Nonce store:    ${result.nonceStore}`);
  if (result.registry) {
    console.log(`Auth registry:  ${result.registry}`);
  }
  if (outputPath) {
    console.log(`Challenge file: ${outputPath}`);
  }
  console.log(`\nBoundary note: ${result.boundaryNote}`);
}

export function printSiwaVerificationSummary(result, outputPath) {
  console.log("\n✅ SIWA verified.");
  console.log(`Wallet:         ${result.wallet}`);
  console.log(`Agent ID:       ${result.agentId}`);
  console.log(`Agent registry: ${result.agentRegistry}`);
  console.log(`Agent key text: ${result.agentKeyText}`);
  if (result.registry) {
    console.log(`Auth registry:  ${result.registry}`);
  }
  console.log(`Issued at:      ${result.issuedAt}`);
  console.log(`Expires at:     ${result.expiresAt ?? 0}`);
  console.log(`Domain:         ${result.siwa.domain}`);
  console.log(`URI:            ${result.siwa.uri}`);
  console.log(`SIWA chain ID:  ${result.siwa.chainId}`);
  console.log(`Signer type:    ${result.siwa.signerType ?? "unknown"}`);
  console.log(`Manifest:       ${formatManifestBinding(result)}`);
  if (outputPath) {
    console.log(`Verified file:  ${outputPath}`);
  }
  console.log(`\nBoundary note: ${result.boundaryNote}`);
}

function resolveSiwaMessage(options = {}, input = {}) {
  const messageFromFile = options.messageFile
    ? loadTextFile(options.messageFile, "SIWA message file")
    : undefined;
  const message = options.message ?? messageFromFile ?? input.message;

  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "Missing SIWA message. Provide --message, --message-file, or --input <json-file>."
    );
  }

  return message;
}

function resolveSiwaSignature(options = {}, input = {}) {
  const signature = options.signature ?? input.signature;

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error(
      "Missing or invalid SIWA signature. Provide --signature or include it in --input <json-file>."
    );
  }

  return signature;
}

function loadTextFile(filePath, description = "text file") {
  const resolvedPath = resolveFromPackageRoot(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${description} not found: ${resolvedPath}`);
  }

  return readFileSync(resolvedPath, "utf8");
}

function createSiwaPublicClient(options = {}) {
  return createPublicClient({
    transport: http(resolveRpcTarget(options)),
  });
}

function normalizeAgentRegistry(agentRegistry) {
  if (typeof agentRegistry !== "string" || agentRegistry.length === 0) {
    throw new Error(
      "agentRegistry is required and must use eip155:<chainId>:<address> format."
    );
  }

  const match = agentRegistry.match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})$/);
  if (!match) {
    throw new Error(
      "agentRegistry must use eip155:<chainId>:<address> format."
    );
  }

  const chainId = parsePositiveInteger(match[1], "agentRegistry chainId");
  const address = normalizeAddress(match[2], "agentRegistry address");

  return {
    chainId,
    address,
    value: `eip155:${chainId}:${address}`,
  };
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function optionalNonEmptyString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveNonceStorePath(options = {}, input = {}) {
  return resolveFromPackageRoot(
    options.nonceStore ?? input.nonceStore ?? DEFAULT_SIWA_NONCE_STORE
  );
}

function loadNonceStoreState(storePath) {
  if (!existsSync(storePath)) {
    return {
      version: SIWA_NONCE_STORE_VERSION,
      nonces: {},
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(storePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse SIWA nonce store at ${storePath}: ${error.message}`
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.version !== SIWA_NONCE_STORE_VERSION ||
    !parsed.nonces ||
    typeof parsed.nonces !== "object"
  ) {
    throw new Error(
      `SIWA nonce store at ${storePath} does not match the expected v${SIWA_NONCE_STORE_VERSION} format.`
    );
  }

  pruneExpiredNonces(parsed);
  return parsed;
}

function writeNonceStoreState(storePath, state) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function pruneExpiredNonces(state) {
  const now = Date.now();
  for (const [nonce, record] of Object.entries(state.nonces)) {
    const expiresAtMs = Date.parse(record.expirationTime);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      delete state.nonces[nonce];
    }
  }
}

function persistChallengeRecord(storePath, record) {
  const state = loadNonceStoreState(storePath);
  if (state.nonces[record.nonce]) {
    throw new Error(
      `SIWA nonce '${record.nonce}' already exists in ${storePath}.`
    );
  }

  state.nonces[record.nonce] = record;
  writeNonceStoreState(storePath, state);
}

function consumeChallengeRecord(storePath, nonce) {
  const state = loadNonceStoreState(storePath);
  if (!state.nonces[nonce]) {
    return null;
  }

  const record = state.nonces[nonce];
  delete state.nonces[nonce];
  writeNonceStoreState(storePath, state);
  return record;
}

function compareChallengeToMessage(record, fields) {
  const mismatches = [];

  if (normalizeAddress(fields.address, "SIWA message address") !== record.wallet) {
    mismatches.push(
      `wallet mismatch (challenge ${record.wallet}, message ${fields.address})`
    );
  }

  if (Number(fields.agentId) !== Number(record.agentId)) {
    mismatches.push(
      `agentId mismatch (challenge ${record.agentId}, message ${fields.agentId})`
    );
  }

  if (normalizeAgentRegistry(fields.agentRegistry).value !== record.agentRegistry) {
    mismatches.push(
      `agentRegistry mismatch (challenge ${record.agentRegistry}, message ${fields.agentRegistry})`
    );
  }

  if (fields.domain !== record.domain) {
    mismatches.push(
      `domain mismatch (challenge ${record.domain}, message ${fields.domain})`
    );
  }

  if (fields.uri !== record.uri) {
    mismatches.push(`uri mismatch (challenge ${record.uri}, message ${fields.uri})`);
  }

  if (Number(fields.chainId) !== Number(record.chainId)) {
    mismatches.push(
      `chainId mismatch (challenge ${record.chainId}, message ${fields.chainId})`
    );
  }

  if (fields.issuedAt !== record.issuedAt) {
    mismatches.push(
      `issuedAt mismatch (challenge ${record.issuedAt}, message ${fields.issuedAt})`
    );
  }

  if ((fields.expirationTime ?? null) !== record.expirationTime) {
    mismatches.push(
      `expirationTime mismatch (challenge ${record.expirationTime}, message ${fields.expirationTime ?? null})`
    );
  }

  if ((fields.statement ?? null) !== record.statement) {
    mismatches.push("statement mismatch");
  }

  if ((fields.requestId ?? null) !== record.requestId) {
    mismatches.push("requestId mismatch");
  }

  return mismatches;
}

function resolveManifestBinding(options = {}, input = {}) {
  const manifestHash = options.manifestHash ?? input.manifestHash;
  const manifestUri = options.manifestUri ?? input.manifestUri;
  const manifestText = options.manifestText ?? input.manifestText;
  const provided = [
    manifestHash !== undefined,
    manifestUri !== undefined,
    manifestText !== undefined,
  ].filter(Boolean).length;

  if (provided === 0) {
    throw new Error(
      "Missing manifest binding. Provide exactly one of --manifest-hash, --manifest-uri, or --manifest-text so the verified JSON can flow into the permit command."
    );
  }

  if (provided > 1) {
    throw new Error(
      "Provide exactly one of --manifest-hash, --manifest-uri, or --manifest-text."
    );
  }

  if (manifestHash !== undefined) {
    return { manifestHash: normalizeBytes32(manifestHash, "manifestHash") };
  }

  if (manifestUri !== undefined) {
    return { manifestUri: requireNonEmptyString(manifestUri, "manifestUri") };
  }

  return { manifestText: requireNonEmptyString(manifestText, "manifestText") };
}

function describeManifestBoundary(manifestBinding) {
  if (manifestBinding.manifestHash) {
    return `Operator supplied manifestHash ${manifestBinding.manifestHash}; SIWA does not authenticate that hash.`;
  }

  if (manifestBinding.manifestUri) {
    return `Operator supplied manifestUri ${manifestBinding.manifestUri}; SIWA does not authenticate that URI.`;
  }

  return `Operator supplied manifestText '${manifestBinding.manifestText}'; SIWA does not authenticate that text.`;
}

function formatManifestBinding(result) {
  return (
    result.manifestHash ?? result.manifestUri ?? result.manifestText ?? "(none)"
  );
}

function buildAgentKeyText(agentRegistry, agentId) {
  return `${normalizeAgentRegistry(agentRegistry).value}:${parsePositiveInteger(
    agentId,
    "agentId"
  )}`;
}

function isoStringToUnixSeconds(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty ISO-8601 string.`);
  }

  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) {
    throw new Error(`${label} must be a valid ISO-8601 string.`);
  }

  return Math.floor(parsedMs / 1000);
}

function formatSiwaFailure(action, result) {
  const pieces = [action];

  if (result?.code) {
    pieces.push(`[${result.code}]`);
  }

  if (result?.error) {
    pieces.push(result.error);
  } else if (result?.status) {
    pieces.push(`failed with status '${result.status}'`);
  } else {
    pieces.push("failed");
  }

  return pieces.join(" ");
}
