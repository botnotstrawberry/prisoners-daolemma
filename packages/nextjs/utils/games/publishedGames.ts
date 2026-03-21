import { promises as fs } from "node:fs";
import path from "node:path";

export type JsonRecord = Record<string, any>;

export type PublishedGameIndexEntry = {
  slug: string;
  title: string;
  sourceKind: string;
  sourceRun: string;
  sourceLabel: string;
  sourcePath: string;
  gameId: number;
  chainId: number;
  networkKey: string;
  networkLabel: string;
  createdAt: number;
  exportedAt: number;
  phase: string | null;
  outcome: string | null;
  terminalPath: string | null;
  round: number | null;
  shareStreak: number | null;
  counts: {
    joined: number;
    alive: number;
    claimed: number;
    refunded: number;
    usedCauses: number;
    committed: number;
    revealed: number;
    messages: number;
    rounds: number;
  };
  economics: {
    entryFeeWei: string | null;
    totalPotWei: string | null;
    creatorFeeWei: string | null;
    winnerCount: number | null;
    winnerShareWei: string | null;
    noWinnerCausePoolWei: string | null;
  };
  takeaway: string;
  analysis?: {
    messageSignals: Array<{
      wallet: string;
      causeId: number | null;
      scope: string;
      round: number;
      content: string;
      signaledChoice: string | null;
      actualChoice: string | null;
    }>;
    divergenceCount: number;
    divergences: Array<{
      wallet: string;
      causeId: number | null;
      scope: string;
      round: number;
      content: string;
      signaledChoice: string | null;
      actualChoice: string | null;
    }>;
    coalitionCount: number;
    featuredStory: string | null;
  };
  urls: Record<string, string>;
};

export type PublishedGamesIndex = {
  schemaVersion: string;
  generatedAt: string;
  launchTarget: {
    name: string;
    chainId: number;
    note: string;
  };
  currentLiveProof: {
    name: string;
    chainId: number;
    note: string;
  };
  entries: PublishedGameIndexEntry[];
};

export type PublishedGameManifest = PublishedGameIndexEntry & {
  schemaVersion: string;
};

const publicGamesRoot = path.join(process.cwd(), "public", "games");

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function maybeReadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export async function readGamesIndex(): Promise<PublishedGamesIndex> {
  return readJsonFile<PublishedGamesIndex>(path.join(publicGamesRoot, "index.json"));
}

export async function listPublishedGameSlugs(): Promise<string[]> {
  const index = await readGamesIndex();
  return index.entries.map(entry => entry.slug);
}

export function pickFeaturedGameEntry(index: PublishedGamesIndex) {
  return index.entries.find(entry => (entry.analysis?.divergenceCount ?? 0) > 0) ?? index.entries[0] ?? null;
}

export async function readPublishedGameManifest(slug: string): Promise<PublishedGameManifest | null> {
  return maybeReadJsonFile<PublishedGameManifest>(path.join(publicGamesRoot, slug, "manifest.json"));
}

export async function readPublishedGameBundle(slug: string) {
  const manifest = await readPublishedGameManifest(slug);
  if (!manifest) return null;

  const gameDir = path.join(publicGamesRoot, slug);
  const [summary, roster, causes, rounds, payouts, auth, messages] = await Promise.all([
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "game-summary.json")),
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "roster.json")),
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "causes.json")),
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "rounds.json")),
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "payouts.json")),
    maybeReadJsonFile<JsonRecord>(path.join(gameDir, "auth.json")),
    maybeReadJsonFile<JsonRecord[]>(path.join(gameDir, "messages.json")),
  ]);

  return {
    manifest,
    summary,
    roster,
    causes,
    rounds,
    payouts,
    auth,
    messages: messages ?? [],
  };
}

export function shortenAddress(address?: string | null, chars = 4) {
  if (!address) return "—";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function formatUnixTimestamp(timestamp?: number | null) {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function formatWeiToEth(wei?: string | null) {
  if (!wei) return "—";
  const numeric = Number(wei) / 1e18;
  if (!Number.isFinite(numeric)) return wei;
  if (numeric === 0) return "0 ETH";
  if (numeric < 0.001) return `${numeric.toPrecision(2)} ETH`;

  const formatted = (numeric < 0.1 ? numeric.toFixed(4) : numeric.toFixed(3))
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return `${formatted} ETH`;
}
