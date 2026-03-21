import { type PublishedGameIndexEntry, type PublishedGamesIndex, pickFeaturedGameEntry } from "./games/publishedGames";

export type HomepageProofState = "testnet" | "mainnet-early" | "mainnet-live";

export type HomepageProofCopy = {
  key: HomepageProofState;
  heroBadges: string[];
  integrityNote: string;
  currentProofBullets: string[];
};

function isMainnetEntry(entry: PublishedGameIndexEntry) {
  return entry.chainId === 8453 || entry.networkKey === "base-mainnet" || entry.networkLabel === "Base Mainnet";
}

export function resolveHomepageProofState(index: PublishedGamesIndex): HomepageProofCopy {
  const publishedMainnetCases = index.entries.filter(entry => isMainnetEntry(entry) && entry.phase === "Ended");
  const currentProofIsMainnet = index.currentLiveProof.chainId === index.launchTarget.chainId;

  const key: HomepageProofState = currentProofIsMainnet
    ? publishedMainnetCases.length > 0
      ? "mainnet-live"
      : "mainnet-early"
    : "testnet";

  if (key === "mainnet-live") {
    return {
      key,
      heroBadges: ["Base Mainnet", "Replayable evidence", "Live stake"],
      integrityNote:
        "Featured evidence comes from live Base mainnet runs. Findings are now grounded in real onchain participation, while the broader dataset continues to grow.",
      currentProofBullets: [
        "live mainnet cases",
        "auditable payouts",
        "growing behavioral dataset",
        "real featured case",
      ],
    };
  }

  if (key === "mainnet-early") {
    return {
      key,
      heroBadges: ["Base Mainnet", "Live now", "Early dataset"],
      integrityNote:
        "Base mainnet is live. Early evidence is beginning to accumulate. The value is an auditable live environment for observing how commitments hold up under real incentives; conclusions are still early.",
      currentProofBullets: [
        "Base mainnet live",
        "early live evidence or launch-ready flow",
        "controlled cases still inspectable",
        "dataset expanding",
      ],
    };
  }

  return {
    key,
    heroBadges: ["Base Sepolia", "Controlled run", "Initial dataset"],
    integrityNote:
      "Current public evidence comes from controlled Base Sepolia runs using one LLM across multiple profiles. The value today is the auditable coordination surface and data-generation pipeline.",
    currentProofBullets: [
      "Base Sepolia",
      "controlled runs",
      "one model / multiple profiles",
      "featured say/do divergence",
    ],
  };
}

export function pickHomepageFeaturedCase(index: PublishedGamesIndex) {
  const proofState = resolveHomepageProofState(index);

  if (proofState.key !== "testnet") {
    const featuredMainnetCase =
      index.entries.find(
        entry => isMainnetEntry(entry) && entry.phase === "Ended" && (entry.analysis?.divergenceCount ?? 0) > 0,
      ) ??
      index.entries.find(entry => isMainnetEntry(entry) && entry.phase === "Ended") ??
      null;

    if (featuredMainnetCase) return featuredMainnetCase;
  }

  return pickFeaturedGameEntry(index);
}

export function getFeaturedCaseHeader(proofState: HomepageProofState, entry: PublishedGameIndexEntry | null) {
  const caseIsMainnet = entry ? isMainnetEntry(entry) : false;

  if (proofState === "mainnet-live" && caseIsMainnet) return "Featured live case";
  if (proofState === "mainnet-early" && caseIsMainnet) return "Featured early live case";
  return "Featured controlled run";
}
