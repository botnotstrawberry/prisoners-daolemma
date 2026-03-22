import { execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { dirname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import {
  GAMEPLAY_PK_ENV,
  VERIFIER_PK_ENV,
  normalizeAddress,
  normalizePrivateKey,
  parseCliArgs,
  printJson,
  resolveFromPackageRoot,
  writeJson,
} from "./authTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const authCliPath = join(__dirname, "authCli.js");

const AUTH_FLOW_BOUNDARY_NOTE =
  "This is a local orchestration wrapper only. It still runs the existing siwa-nonce -> siwa-sign -> siwa-verify -> permit -> register -> status CLI commands in order, writes each intermediate JSON artifact, and surfaces the exact subcommands it used so the auth boundaries stay explicit and auditable.";

function printHelp() {
  console.log(`
Prisoners DAOlemma local auth flow wrapper

${AUTH_FLOW_BOUNDARY_NOTE}

Usage:
  node scripts-js/authFlowCli.js --rpc-url <url|network> --registry <auth-registry-address> \
    --agent-registry <eip155:chainId:address> --agent-id <uint256> \
    (--manifest-hash <bytes32> | --manifest-uri <text> | --manifest-text <text>) \
    [--wallet <address>] \
    [--wallet-keystore <name|path>] \
    [--wallet-keystore-password-env <ENV> | --wallet-keystore-password-file <file>] \
    [--verifier-keystore <name|path>] \
    [--verifier-keystore-password-env <ENV> | --verifier-keystore-password-file <file>] \
    [--domain <text>] [--uri <https-url>] [--statement <text>] [--request-id <text>] \
    [--siwa-ttl-seconds <seconds>] \
    [--permit-issued-at <unix-seconds>] [--permit-expires-at <unix-seconds> | --permit-ttl-seconds <seconds>] \
    [--work-dir <dir>] [--json]

Notes:
  - The wrapper is local-only and intentionally thin: it does not add a new auth primitive.
  - It writes explicit stage files into a temp/work directory:
      01-siwa-challenge.json
      02-siwa-signed.json
      03-siwa-verified.json
      04-auth-permit.json
      05-auth-register.json
      06-auth-status.json
  - If --domain is omitted, the wrapper defaults to prisoners.local for the local flow.
  - If --wallet is omitted, the wrapper tries to derive it from --wallet-keystore or ${GAMEPLAY_PK_ENV}.
  - Raw --wallet-private-key / --verifier-private-key stay gated behind --allow-unsafe-private-key, just like the underlying commands.
  - Use --json for a machine-readable summary that includes the exact subcommands and stage outputs.

Example:
  node scripts-js/authFlowCli.js --rpc-url localhost --registry 0xAuthRegistry \
    --agent-registry eip155:31337:0xMockIdentityRegistry --agent-id 42 \
    --manifest-uri manifest://agent-alpha --domain prisoners.local \
    --wallet-keystore gameplay-demo --wallet-keystore-password-env GAMEPLAY_KEYSTORE_PASSWORD \
    --verifier-keystore verifier-demo --verifier-keystore-password-env VERIFIER_KEYSTORE_PASSWORD
`);
}

function resolveArgs() {
  const { args } = parseCliArgs(["flow", ...process.argv.slice(2)]);
  return args;
}

function ensureUnsafeKeyAllowed(args, keyName, flagName, envName) {
  if (args.allowUnsafePrivateKey) {
    return;
  }

  if (args[keyName] !== undefined) {
    throw new Error(
      `Raw ${flagName} on the command line is disabled for this wrapper. Re-run with --allow-unsafe-private-key if you truly need the old local-only behavior.`
    );
  }

  if (process.env[envName]) {
    return;
  }
}

function resolveWorkDir(args) {
  const requested = args.workDir ?? args.outDir;
  if (!requested) {
    return createTempWorkDir();
  }

  const resolved = resolveFromPackageRoot(requested);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

function createTempWorkDir() {
  return mkdtempSync(join(tmpdir(), "pd-auth-flow-"));
}

function resolveWalletAddress(args) {
  const explicitWallet =
    args.wallet !== undefined
      ? normalizeAddress(args.wallet, "wallet")
      : undefined;

  const derivedWallet =
    deriveWalletAddressFromKeystore(args.walletKeystore) ??
    deriveWalletAddressFromPrivateKey(args.walletPrivateKey) ??
    deriveWalletAddressFromEnv(GAMEPLAY_PK_ENV);

  if (explicitWallet && derivedWallet) {
    if (explicitWallet.toLowerCase() !== derivedWallet.toLowerCase()) {
      throw new Error(
        `Wrapper wallet mismatch. --wallet resolved to ${explicitWallet}, but the supplied gameplay signer resolves to ${derivedWallet}.`
      );
    }
  }

  if (explicitWallet) {
    return explicitWallet;
  }

  if (derivedWallet) {
    return derivedWallet;
  }

  throw new Error(
    `Missing wallet. Provide --wallet, --wallet-keystore, --wallet-private-key with --allow-unsafe-private-key, or set ${GAMEPLAY_PK_ENV}.`
  );
}

function deriveWalletAddressFromKeystore(keystore) {
  if (typeof keystore !== "string" || keystore.trim().length === 0) {
    return null;
  }

  const resolvedPath = resolveKeystoreLookupPath(keystore.trim());
  if (!existsSync(resolvedPath)) {
    throw new Error(`wallet keystore not found: ${resolvedPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse wallet keystore JSON at ${resolvedPath}: ${error.message}`
    );
  }

  const rawAddress = parsed?.address;
  if (typeof rawAddress !== "string" || rawAddress.length === 0) {
    throw new Error(
      `wallet keystore at ${resolvedPath} does not expose an address field.`
    );
  }

  const prefixed = rawAddress.startsWith("0x") ? rawAddress : `0x${rawAddress}`;
  return normalizeAddress(prefixed, "wallet keystore address");
}

function resolveKeystoreLookupPath(keystore) {
  const explicitPath =
    keystore.startsWith(".") ||
    keystore.startsWith("~") ||
    keystore.includes("/") ||
    keystore.includes("\\");

  if (!explicitPath) {
    return join(process.env.HOME ?? homedir(), ".foundry", "keystores", keystore);
  }

  if (keystore === "~") {
    return homedir();
  }

  if (keystore.startsWith("~/")) {
    return join(homedir(), keystore.slice(2));
  }

  if (isAbsolute(keystore)) {
    return keystore;
  }

  return resolveFromPackageRoot(keystore);
}

function deriveWalletAddressFromPrivateKey(privateKey) {
  if (privateKey === undefined) {
    return null;
  }

  return new ethers.Wallet(normalizePrivateKey(privateKey)).address;
}

function deriveWalletAddressFromEnv(envName) {
  if (!process.env[envName]) {
    return null;
  }

  return new ethers.Wallet(normalizePrivateKey(undefined, envName)).address;
}

function resolveManifestArgs(args) {
  const provided = [
    args.manifestHash !== undefined,
    args.manifestUri !== undefined,
    args.manifestText !== undefined,
  ].filter(Boolean).length;

  if (provided === 0) {
    throw new Error(
      "Missing manifest binding. Provide exactly one of --manifest-hash, --manifest-uri, or --manifest-text."
    );
  }

  if (provided > 1) {
    throw new Error(
      "Provide exactly one of --manifest-hash, --manifest-uri, or --manifest-text."
    );
  }

  if (args.manifestHash !== undefined) {
    return {
      manifest: { manifestHash: args.manifestHash },
      cliArgs: ["--manifest-hash", String(args.manifestHash)],
    };
  }

  if (args.manifestUri !== undefined) {
    return {
      manifest: { manifestUri: String(args.manifestUri) },
      cliArgs: ["--manifest-uri", String(args.manifestUri)],
    };
  }

  return {
    manifest: { manifestText: String(args.manifestText) },
    cliArgs: ["--manifest-text", String(args.manifestText)],
  };
}

function pushOption(target, flag, value) {
  if (value === undefined || value === null || value === false) {
    return;
  }

  target.push(flag, String(value));
}

function pushBoolean(target, flag, enabled) {
  if (enabled) {
    target.push(flag);
  }
}

function buildWalletSignerArgs(args) {
  const signerArgs = [];
  pushOption(signerArgs, "--wallet-keystore", args.walletKeystore);
  pushOption(
    signerArgs,
    "--wallet-keystore-password-env",
    args.walletKeystorePasswordEnv
  );
  pushOption(
    signerArgs,
    "--wallet-keystore-password-file",
    args.walletKeystorePasswordFile
  );
  pushOption(signerArgs, "--wallet-private-key", args.walletPrivateKey);
  pushBoolean(signerArgs, "--allow-unsafe-private-key", args.allowUnsafePrivateKey);
  return signerArgs;
}

function buildVerifierSignerArgs(args) {
  const signerArgs = [];
  pushOption(signerArgs, "--verifier-keystore", args.verifierKeystore);
  pushOption(
    signerArgs,
    "--verifier-keystore-password-env",
    args.verifierKeystorePasswordEnv
  );
  pushOption(
    signerArgs,
    "--verifier-keystore-password-file",
    args.verifierKeystorePasswordFile
  );
  pushOption(signerArgs, "--verifier-private-key", args.verifierPrivateKey);
  pushBoolean(signerArgs, "--allow-unsafe-private-key", args.allowUnsafePrivateKey);
  return signerArgs;
}

function formatCommand(args) {
  return ["node", "scripts-js/authCli.js", ...args]
    .map(shellEscape)
    .join(" ");
}

function shellEscape(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function runJsonStage({ name, args, outputFile }) {
  const displayCommand = formatCommand(args);

  let stdout;
  try {
    stdout = execFileSync(process.execPath, [authCliPath, ...args], {
      cwd: packageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch (error) {
    const stdoutText = `${error.stdout ?? ""}`.trim();
    const stderrText = `${error.stderr ?? ""}`.trim();
    const details = [
      `Stage '${name}' failed.`,
      `Command: ${displayCommand}`,
      stdoutText ? `stdout:\n${stdoutText}` : null,
      stderrText ? `stderr:\n${stderrText}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    throw new Error(details);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Stage '${name}' did not return valid JSON. Command: ${displayCommand}\n\nRaw output:\n${stdout}\n\nParse error: ${error.message}`
    );
  }

  if (outputFile && !existsSync(outputFile)) {
    throw new Error(
      `Stage '${name}' reported success but did not create its expected artifact: ${outputFile}`
    );
  }

  return {
    name,
    command: displayCommand,
    outputFile: outputFile ?? null,
    result: parsed,
  };
}

function buildFiles(workDir) {
  return {
    nonceStore: join(workDir, "00-siwa-nonces.json"),
    challenge: join(workDir, "01-siwa-challenge.json"),
    signed: join(workDir, "02-siwa-signed.json"),
    verified: join(workDir, "03-siwa-verified.json"),
    permit: join(workDir, "04-auth-permit.json"),
    registration: join(workDir, "05-auth-register.json"),
    status: join(workDir, "06-auth-status.json"),
  };
}

function printSummary(summary) {
  console.log("\n✅ Local auth flow completed.");
  console.log(`Work dir:       ${summary.workDir}`);
  console.log(`Wallet:         ${summary.wallet}`);
  console.log(`Agent ID:       ${summary.agentId}`);
  console.log(`Agent registry: ${summary.agentRegistry}`);
  console.log(`Auth registry:  ${summary.registry}`);
  console.log(`Manifest:       ${formatManifest(summary.manifest)}`);
  console.log(`Authorized:     ${summary.results.status.isAuthorized}`);
  console.log(`Tx hash:        ${summary.results.registration.txHash}`);
  console.log("\nArtifacts:");
  for (const [label, filePath] of Object.entries(summary.files)) {
    console.log(`  ${label.padEnd(12)} ${filePath}`);
  }
  console.log("\nExecuted commands:");
  for (const step of summary.steps) {
    console.log(`  [${step.index}/6] ${step.name}`);
    console.log(`    ${step.command}`);
  }
  console.log(`\nBoundary note: ${summary.boundaryNote}`);
}

function formatManifest(manifest) {
  return manifest.manifestHash ?? manifest.manifestUri ?? manifest.manifestText;
}

async function main() {
  const args = resolveArgs();

  if (args.help) {
    printHelp();
    return;
  }

  ensureUnsafeKeyAllowed(args, "walletPrivateKey", "--wallet-private-key", GAMEPLAY_PK_ENV);
  ensureUnsafeKeyAllowed(args, "verifierPrivateKey", "--verifier-private-key", VERIFIER_PK_ENV);

  const wallet = resolveWalletAddress(args);
  const workDir = resolveWorkDir(args);
  const files = buildFiles(workDir);
  const manifest = resolveManifestArgs(args);
  const domain = typeof args.domain === "string" && args.domain.length > 0 ? args.domain : "prisoners.local";

  const required = [
    ["rpcUrl", "rpc-url"],
    ["registry", "registry"],
    ["agentRegistry", "agent-registry"],
    ["agentId", "agent-id"],
  ];

  for (const [key, flag] of required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw new Error(`Missing --${flag}. Run with --help for usage.`);
    }
  }

  const steps = [];

  const siwaNonceArgs = [
    "siwa-nonce",
    "--rpc-url",
    String(args.rpcUrl),
    "--wallet",
    wallet,
    "--agent-id",
    String(args.agentId),
    "--agent-registry",
    String(args.agentRegistry),
    "--registry",
    String(args.registry),
    "--nonce-store",
    files.nonceStore,
    "--out",
    files.challenge,
    "--json",
  ];
  pushOption(siwaNonceArgs, "--domain", domain);
  pushOption(siwaNonceArgs, "--uri", args.uri);
  pushOption(siwaNonceArgs, "--chain-id", args.siwaChainId);
  pushOption(siwaNonceArgs, "--statement", args.statement);
  pushOption(siwaNonceArgs, "--request-id", args.requestId);
  pushOption(siwaNonceArgs, "--ttl-seconds", args.siwaTtlSeconds);
  steps.push(
    runJsonStage({
      name: "siwa-nonce",
      args: siwaNonceArgs,
      outputFile: files.challenge,
    })
  );

  const siwaSignArgs = [
    "siwa-sign",
    "--input",
    files.challenge,
    "--out",
    files.signed,
    "--json",
    ...buildWalletSignerArgs(args),
  ];
  steps.push(
    runJsonStage({
      name: "siwa-sign",
      args: siwaSignArgs,
      outputFile: files.signed,
    })
  );

  const siwaVerifyArgs = [
    "siwa-verify",
    "--rpc-url",
    String(args.rpcUrl),
    "--input",
    files.signed,
    "--registry",
    String(args.registry),
    ...manifest.cliArgs,
    "--out",
    files.verified,
    "--json",
  ];
  steps.push(
    runJsonStage({
      name: "siwa-verify",
      args: siwaVerifyArgs,
      outputFile: files.verified,
    })
  );

  const permitArgs = [
    "permit",
    "--rpc-url",
    String(args.rpcUrl),
    "--registry",
    String(args.registry),
    "--input",
    files.verified,
    "--out",
    files.permit,
    "--json",
    ...buildVerifierSignerArgs(args),
  ];
  pushOption(permitArgs, "--issued-at", args.permitIssuedAt);
  pushOption(permitArgs, "--expires-at", args.permitExpiresAt);
  pushOption(permitArgs, "--ttl-seconds", args.permitTtlSeconds);
  steps.push(
    runJsonStage({
      name: "auth:permit",
      args: permitArgs,
      outputFile: files.permit,
    })
  );

  const registerArgs = [
    "register",
    "--rpc-url",
    String(args.rpcUrl),
    "--registry",
    String(args.registry),
    "--permit-file",
    files.permit,
    "--json",
    ...buildWalletSignerArgs(args),
  ];
  const registerStage = runJsonStage({
    name: "auth:register",
    args: registerArgs,
  });
  writeJson(files.registration, registerStage.result);
  registerStage.outputFile = files.registration;
  steps.push(registerStage);

  const statusArgs = [
    "status",
    "--rpc-url",
    String(args.rpcUrl),
    "--permit-file",
    files.permit,
    "--json",
  ];
  const statusStage = runJsonStage({
    name: "auth:status",
    args: statusArgs,
  });
  writeJson(files.status, statusStage.result);
  statusStage.outputFile = files.status;
  steps.push(statusStage);

  const summary = {
    boundaryNote: AUTH_FLOW_BOUNDARY_NOTE,
    localOnly: true,
    workDir,
    wallet,
    registry: normalizeAddress(args.registry, "registry"),
    agentRegistry: String(args.agentRegistry),
    agentId: String(args.agentId),
    domain,
    uri: args.uri ?? null,
    manifest: manifest.manifest,
    files,
    steps: steps.map((step, index) => ({
      index: index + 1,
      name: step.name,
      command: step.command,
      outputFile: step.outputFile,
    })),
    results: {
      challenge: steps[0].result,
      signed: steps[1].result,
      verified: steps[2].result,
      permit: steps[3].result,
      registration: steps[4].result,
      status: steps[5].result,
    },
  };

  if (args.json) {
    printJson(summary);
    return;
  }

  printSummary(summary);
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
