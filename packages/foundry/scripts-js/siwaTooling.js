import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { createPublicClient, http } from "viem";
import { createSIWANonce, signSIWAMessage } from "@buildersgarden/siwa/siwa";
import {
  GAMEPLAY_PK_ENV,
  loadJsonFile,
  normalizeAddress,
  normalizeAgentRegistry,
  normalizeBytes32,
  parsePositiveDecimalString,
  parsePositiveInteger,
  resolveFromPackageRoot,
  resolveRpcTarget,
  resolveSignerWallet,
} from "./authTooling.js";

export const DEFAULT_SIWA_NONCE_STORE = ".siwa-nonces.json";
export const SIWA_NONCE_STORE_VERSION = 1;
export const SIWA_CHALLENGE_BOUNDARY_NOTE =
  "This command issues a local SIWA challenge after checking ERC-8004 ownerOf(agentId) for the requested wallet. It does not register auth onchain or sign an AgentAuthRegistry permit.";
export const SIWA_SIGN_BOUNDARY_NOTE =
  "This command signs a previously issued local SIWA challenge with the gameplay wallet. It does not verify the SIWA payload, register auth onchain, or sign an AgentAuthRegistry permit.";
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
  const agentId = parsePositiveDecimalString(
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
  if (chainId !== agentRegistry.chainId) {
    throw new Error(
      `SIWA chainId ${chainId} must match agentRegistry chain ${agentRegistry.chainId}.`
    );
  }
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
  const rpcChainId = await getConnectedChainId(client);
  assertSiwaRpcChainContext(rpcChainId, agentRegistry.chainId);
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

export async function signIssuedSiwaChallenge(options = {}) {
  const input = loadSiwaChallengeInput(options);
  const siwaFields = resolveSiwaSignFields(input);
  const gameplayWallet = await resolveSignerWallet({
    purpose: "wallet",
    privateKey: options.walletPrivateKey,
    privateKeyEnv: GAMEPLAY_PK_ENV,
    keystore: options.walletKeystore,
    keystorePasswordEnv: options.walletKeystorePasswordEnv,
    keystorePasswordFile: options.walletKeystorePasswordFile,
    allowUnsafePrivateKey: Boolean(options.allowUnsafePrivateKey),
  });

  const signed = await signSIWAMessage(siwaFields, {
    async getAddress() {
      return gameplayWallet.address;
    },
    async signMessage(message) {
      return gameplayWallet.signMessage(message);
    },
  });

  return {
    boundaryNote: SIWA_SIGN_BOUNDARY_NOTE,
    ...(typeof input.nonceStore === "string" && input.nonceStore.length > 0
      ? { nonceStore: resolveFromPackageRoot(input.nonceStore) }
      : {}),
    ...(input.registry !== undefined && input.registry !== null
      ? { registry: normalizeAddress(input.registry, "registry") }
      : {}),
    address: normalizeAddress(signed.address, "SIWA signer address"),
    message: signed.message,
    signature: signed.signature,
  };
}

export async function verifySiwaAuthInput(options = {}) {
  const input = options.input
    ? loadJsonFile(options.input, "SIWA signed input file")
    : {};
  const message = resolveSiwaMessage(options, input);
  const signature = resolveSiwaSignature(options, input);
  const nonceStorePath = resolveNonceStorePath(options, input);
  const fields = parseSiwaMessageExact(message);
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
  const rpcChainId = await getConnectedChainId(client);
  const messageAgentRegistry = normalizeAgentRegistry(
    fields.agentRegistry,
    "SIWA message agentRegistry"
  );
  assertSiwaRpcChainContext(rpcChainId, messageAgentRegistry.chainId);
  if (fields.chainId !== messageAgentRegistry.chainId) {
    throw new Error(
      `SIWA chainId ${fields.chainId} must match agentRegistry chain ${messageAgentRegistry.chainId}.`
    );
  }

  const verification = await verifySiwaMessageAgainstChain({
    client,
    message,
    signature,
    fields,
    expectedDomain: challengeRecord.domain,
    expectedWallet: challengeRecord.wallet,
  });

  const manifestBinding = resolveManifestBinding(options, input);
  const authRegistry =
    options.registry ?? input.registry ?? challengeRecord.registry ?? undefined;
  const output = {
    boundaryNote: SIWA_VERIFY_BOUNDARY_NOTE,
    wallet: verification.wallet,
    agentId: fields.agentId,
    agentRegistry: messageAgentRegistry.value,
    agentKeyText: buildAgentKeyText(messageAgentRegistry.value, fields.agentId),
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
      verified: verification.verified,
      signerType: verification.signerType,
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

export function printSiwaSignSummary(result, outputPath) {
  const fields = parseSiwaMessageExact(result.message);
  console.log("\n✅ SIWA challenge signed.");
  console.log(`Wallet:         ${result.address}`);
  console.log(`Agent ID:       ${fields.agentId}`);
  console.log(`Agent registry: ${normalizeAgentRegistry(fields.agentRegistry).value}`);
  console.log(`Domain:         ${fields.domain}`);
  console.log(`URI:            ${fields.uri}`);
  console.log(`Chain ID:       ${fields.chainId}`);
  console.log(`Nonce:          ${fields.nonce}`);
  console.log(`Issued at:      ${fields.issuedAt}`);
  console.log(`Expires at:     ${fields.expirationTime ?? "(none)"}`);
  if (outputPath) {
    console.log(`Signed file:    ${outputPath}`);
  }
  console.log(`\nBoundary note: ${result.boundaryNote}`);
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

function loadSiwaChallengeInput(options = {}) {
  if (!options.input) {
    throw new Error(
      "Missing SIWA challenge input. Provide --input <siwa-challenge.json> from siwa-nonce."
    );
  }

  return loadJsonFile(options.input, "SIWA challenge input file");
}

function resolveSiwaSignFields(input = {}) {
  const rawFields =
    input &&
    typeof input === "object" &&
    input.siwaFields &&
    typeof input.siwaFields === "object"
      ? input.siwaFields
      : input;

  if (!rawFields || typeof rawFields !== "object") {
    throw new Error(
      "SIWA challenge input must be a JSON object or contain a siwaFields object."
    );
  }

  const agentRegistry = normalizeAgentRegistry(
    rawFields.agentRegistry ?? input.agentRegistry,
    "SIWA challenge agentRegistry"
  );
  const chainId = parsePositiveInteger(
    rawFields.chainId ?? input.chainId ?? agentRegistry.chainId,
    "SIWA challenge chainId"
  );
  if (chainId !== agentRegistry.chainId) {
    throw new Error(
      `SIWA chainId ${chainId} must match agentRegistry chain ${agentRegistry.chainId}.`
    );
  }

  const challengeAddress =
    rawFields.address ?? input.wallet ?? input.address ?? undefined;
  const statement = optionalNonEmptyString(rawFields.statement);
  const expirationTime = optionalNonEmptyString(rawFields.expirationTime);
  const notBefore = optionalNonEmptyString(rawFields.notBefore);
  const requestId = optionalNonEmptyString(rawFields.requestId);

  return {
    domain: requireNonEmptyString(rawFields.domain, "SIWA challenge domain"),
    ...(challengeAddress
      ? {
          address: normalizeAddress(
            challengeAddress,
            "SIWA challenge address"
          ),
        }
      : {}),
    uri: requireNonEmptyString(rawFields.uri, "SIWA challenge URI"),
    version: optionalNonEmptyString(rawFields.version) ?? "1",
    agentId: parsePositiveDecimalString(
      rawFields.agentId,
      "SIWA challenge agentId"
    ),
    agentRegistry: agentRegistry.value,
    chainId,
    nonce: requireNonEmptyString(rawFields.nonce, "SIWA challenge nonce"),
    issuedAt: requireNonEmptyString(
      rawFields.issuedAt,
      "SIWA challenge issuedAt"
    ),
    ...(statement ? { statement } : {}),
    ...(expirationTime ? { expirationTime } : {}),
    ...(notBefore ? { notBefore } : {}),
    ...(requestId ? { requestId } : {}),
  };
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

async function getConnectedChainId(client) {
  return parsePositiveInteger(await client.getChainId(), "connected RPC chainId");
}

function assertSiwaRpcChainContext(rpcChainId, expectedChainId) {
  if (rpcChainId !== expectedChainId) {
    throw new Error(
      `Connected RPC chain ${rpcChainId} does not match declared agentRegistry chain ${expectedChainId}.`
    );
  }
}

function parseSiwaMessageExact(message) {
  const lines = message.split("\n");
  const domainMatch = lines[0]?.match(
    /^(.+) wants you to sign in with your Agent account:$/
  );
  if (!domainMatch) {
    throw new Error("Invalid SIWA message: missing domain line");
  }

  const fieldMap = {};
  let statement;
  let inStatement = false;
  const statementLines = [];

  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 2 && line === "") {
      inStatement = true;
      continue;
    }

    if (inStatement) {
      if (line === "" || line.startsWith("URI: ")) {
        inStatement = false;
        statement = statementLines.join("\n").trim() || undefined;
        if (line.startsWith("URI: ")) {
          const [key, ...rest] = line.split(": ");
          fieldMap[key] = rest.join(": ");
        }
        continue;
      }

      statementLines.push(line);
      continue;
    }

    if (line.includes(": ")) {
      const [key, ...rest] = line.split(": ");
      fieldMap[key] = rest.join(": ");
    }
  }

  return {
    domain: domainMatch[1],
    address: normalizeAddress(lines[1], "SIWA message address"),
    statement,
    uri: requireNonEmptyString(fieldMap.URI, "SIWA message URI"),
    version: fieldMap.Version || "1",
    agentId: parsePositiveDecimalString(fieldMap["Agent ID"], "SIWA message agentId"),
    agentRegistry: requireNonEmptyString(
      fieldMap["Agent Registry"],
      "SIWA message agentRegistry"
    ),
    chainId: parsePositiveInteger(fieldMap["Chain ID"], "SIWA message chainId"),
    nonce: requireNonEmptyString(fieldMap.Nonce, "SIWA message nonce"),
    issuedAt: requireNonEmptyString(fieldMap["Issued At"], "SIWA message issuedAt"),
    expirationTime: fieldMap["Expiration Time"],
    notBefore: fieldMap["Not Before"],
    requestId: fieldMap["Request ID"],
  };
}

async function verifySiwaMessageAgainstChain({
  client,
  message,
  signature,
  fields,
  expectedDomain,
  expectedWallet,
}) {
  const wallet = normalizeAddress(fields.address, "SIWA message address");
  if (wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error(
      `SIWA wallet mismatch. Challenge expected ${expectedWallet}, but the message resolves to ${wallet}.`
    );
  }

  if (fields.domain !== expectedDomain) {
    throw new Error(
      `SIWA domain mismatch. Challenge expected ${expectedDomain}, but the message declares ${fields.domain}.`
    );
  }

  const validSignature = await client.verifyMessage({
    address: wallet,
    message,
    signature,
  });
  if (!validSignature) {
    throw new Error("SIWA verification failed [INVALID_SIGNATURE] Invalid signature");
  }

  const now = new Date();

  if (fields.expirationTime) {
    const expirationTime = new Date(fields.expirationTime);
    if (Number.isNaN(expirationTime.getTime())) {
      throw new Error("SIWA verification failed [MESSAGE_EXPIRED] Invalid expirationTime");
    }
    if (now > expirationTime) {
      throw new Error("SIWA verification failed [MESSAGE_EXPIRED] Message expired");
    }
  }

  if (fields.notBefore) {
    const notBefore = new Date(fields.notBefore);
    if (Number.isNaN(notBefore.getTime())) {
      throw new Error("SIWA verification failed [MESSAGE_NOT_YET_VALID] Invalid notBefore");
    }
    if (now < notBefore) {
      throw new Error(
        "SIWA verification failed [MESSAGE_NOT_YET_VALID] Message not yet valid (notBefore)"
      );
    }
  }

  const agentRegistry = normalizeAgentRegistry(
    fields.agentRegistry,
    "SIWA message agentRegistry"
  );

  let owner;
  try {
    owner = await client.readContract({
      address: agentRegistry.address,
      abi: [
        {
          name: "ownerOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "tokenId", type: "uint256" }],
          outputs: [{ name: "", type: "address" }],
        },
      ],
      functionName: "ownerOf",
      args: [BigInt(fields.agentId)],
    });
  } catch {
    throw new Error(
      "SIWA verification failed [NOT_REGISTERED] Agent is not registered on the ERC-8004 Identity Registry"
    );
  }

  if (normalizeAddress(owner, "ERC-8004 ownerOf result").toLowerCase() !== wallet.toLowerCase()) {
    throw new Error(
      "SIWA verification failed [NOT_OWNER] Signer is not the owner of this agent NFT"
    );
  }

  const signerCode = await client.getCode({ address: wallet });
  return {
    wallet,
    verified: "onchain",
    signerType: signerCode && signerCode !== "0x" ? "sca" : "eoa",
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

  const recordAgentId = parsePositiveDecimalString(
    record.agentId,
    "challenge agentId"
  );
  if (fields.agentId !== recordAgentId) {
    mismatches.push(
      `agentId mismatch (challenge ${recordAgentId}, message ${fields.agentId})`
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
  return `${normalizeAgentRegistry(agentRegistry).value}:${parsePositiveDecimalString(
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
