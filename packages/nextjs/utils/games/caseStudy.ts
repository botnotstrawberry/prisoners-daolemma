import type { JsonRecord, PublishedGameManifest } from "~~/utils/games/publishedGames";

const SHARE_COLOR = "#22c55e";
const CATCH_COLOR = "#f59e0b";
const STEAL_COLOR = "#ef4444";

export const moveColors = {
  Share: SHARE_COLOR,
  Catch: CATCH_COLOR,
  Steal: STEAL_COLOR,
} as const;

export type RoundDistributionPoint = {
  round: number;
  total: number;
  share: number;
  catch: number;
  steal: number;
  aliveAfter: number;
};

export type SayDoGapMetrics = {
  signaledCount: number;
  consistentCount: number;
  consistencyPct: number | null;
  promisedSharePlayedShare: number;
  promisedSharePlayedSteal: number;
  promisedSharePlayedCatch: number;
  noMessageAgents: number;
};

export type CoalitionCohesionRow = {
  causeId: number;
  joinedCount: number;
  cooperationRate: number | null;
  trustBreaks: number;
  survivors: number;
};

export type MoneyFlowMetrics = {
  totalPotWei: string;
  winnerNetWei: string;
  causeWei: string;
  treasuryWei: string;
  refundWei: string;
  winnerCount: number;
  topWinner: {
    wallet: string;
    causeId: number | null;
    netPrizeWei: string;
    returnMultiple: number | null;
  } | null;
};

export type CaseStudyMetrics = {
  roundDistribution: RoundDistributionPoint[];
  eliminationCurve: Array<{ round: number; alive: number }>;
  sayDoGap: SayDoGapMetrics;
  coalitions: CoalitionCohesionRow[];
  moneyFlow: MoneyFlowMetrics;
  headline: string;
  researchFrame: string;
};

type SignalRecord = {
  wallet: string;
  causeId: number | null;
  scope: string;
  round: number;
  content: string;
  signaledChoice: string | null;
  actualChoice: string | null;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function bigIntFrom(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function bigIntToString(value: bigint) {
  return value.toString();
}

function sumWei(values: Array<string | null | undefined>) {
  return bigIntToString(values.reduce((sum, value) => sum + bigIntFrom(value), 0n));
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

function countChoice(entries: any[], choice: "Share" | "Catch" | "Steal") {
  return entries.filter(entry => entry?.choice === choice).length;
}

function detectFirstStealRound(points: RoundDistributionPoint[]) {
  return points.find(point => point.steal > 0)?.round ?? null;
}

function buildRoundDistribution(roundsPayload: JsonRecord | null, joinedCount: number) {
  const rounds = asArray(roundsPayload?.rounds);
  const points: RoundDistributionPoint[] = rounds.map((round: any) => {
    const choices = asArray(round?.effectiveChoices).length
      ? asArray(round?.effectiveChoices)
      : asArray(round?.reveals);
    const total = choices.length || asArray(round?.activePlayers).length || 0;
    return {
      round: Number(round?.round ?? 0),
      total,
      share: countChoice(choices, "Share"),
      catch: countChoice(choices, "Catch"),
      steal: countChoice(choices, "Steal"),
      aliveAfter: Number(round?.resolution?.aliveCount ?? Math.max(joinedCount - asArray(round?.eliminated).length, 0)),
    };
  });

  const eliminationCurve = [
    { round: 0, alive: joinedCount },
    ...points.map(point => ({ round: point.round, alive: point.aliveAfter })),
  ];

  return { points, eliminationCurve };
}

function buildSayDoGap(manifest: PublishedGameManifest, rosterPayload: JsonRecord | null) {
  const signals = asArray<SignalRecord>(manifest.analysis?.messageSignals as SignalRecord[] | undefined);
  const participants = asArray<any>(rosterPayload?.participants);
  const signaledWallets = new Set(signals.map(signal => signal.wallet.toLowerCase()));

  return {
    signaledCount: signals.length,
    consistentCount: signals.filter(signal => signal.signaledChoice && signal.signaledChoice === signal.actualChoice)
      .length,
    consistencyPct: safePercent(
      signals.filter(signal => signal.signaledChoice && signal.signaledChoice === signal.actualChoice).length,
      signals.length,
    ),
    promisedSharePlayedShare: signals.filter(
      signal => signal.signaledChoice === "Share" && signal.actualChoice === "Share",
    ).length,
    promisedSharePlayedSteal: signals.filter(
      signal => signal.signaledChoice === "Share" && signal.actualChoice === "Steal",
    ).length,
    promisedSharePlayedCatch: signals.filter(
      signal => signal.signaledChoice === "Share" && signal.actualChoice === "Catch",
    ).length,
    noMessageAgents: Math.max(participants.filter(participant => participant?.joined).length - signaledWallets.size, 0),
  } satisfies SayDoGapMetrics;
}

function buildCoalitions(
  rosterPayload: JsonRecord | null,
  roundsPayload: JsonRecord | null,
  manifest: PublishedGameManifest,
  payoutsPayload: JsonRecord | null,
) {
  const participants = asArray<any>(rosterPayload?.participants);
  const rounds = asArray<any>(roundsPayload?.rounds);
  const payoutParticipants = asArray<any>(payoutsPayload?.participants);
  const signals = asArray<SignalRecord>(manifest.analysis?.messageSignals as SignalRecord[] | undefined);

  const byCause = new Map<number, CoalitionCohesionRow>();
  const cooperationByCause = new Map<number, { total: number; shared: number }>();

  for (const participant of participants) {
    const causeId = typeof participant?.causeId === "number" ? participant.causeId : null;
    if (causeId === null) continue;
    const existing = byCause.get(causeId) ?? {
      causeId,
      joinedCount: 0,
      cooperationRate: null,
      trustBreaks: 0,
      survivors: 0,
    };
    existing.joinedCount += participant?.joined ? 1 : 0;
    byCause.set(causeId, existing);
  }

  for (const round of rounds) {
    const choices = asArray<any>(round?.effectiveChoices).length
      ? asArray<any>(round?.effectiveChoices)
      : asArray<any>(round?.reveals);
    for (const choice of choices) {
      const participant = participants.find(player => player?.wallet?.toLowerCase() === choice?.wallet?.toLowerCase());
      const causeId = typeof participant?.causeId === "number" ? participant.causeId : null;
      if (causeId === null) continue;
      const existing = cooperationByCause.get(causeId) ?? { total: 0, shared: 0 };
      existing.total += 1;
      if (choice?.choice === "Share") existing.shared += 1;
      cooperationByCause.set(causeId, existing);
    }
  }

  for (const signal of signals) {
    if (signal.causeId === null) continue;
    const row = byCause.get(signal.causeId);
    if (!row) continue;
    if (signal.signaledChoice && signal.actualChoice && signal.signaledChoice !== signal.actualChoice) {
      row.trustBreaks += 1;
    }
  }

  for (const participant of payoutParticipants) {
    const causeId = typeof participant?.causeId === "number" ? participant.causeId : null;
    if (causeId === null) continue;
    const row = byCause.get(causeId);
    if (!row) continue;
    if (participant?.alive || String(participant?.terminalStatus ?? "").startsWith("winner")) {
      row.survivors += 1;
    }
  }

  return Array.from(byCause.values())
    .map(row => {
      const cooperation = cooperationByCause.get(row.causeId);
      return {
        ...row,
        cooperationRate: cooperation ? safePercent(cooperation.shared, cooperation.total) : null,
      };
    })
    .sort((a, b) => a.causeId - b.causeId);
}

function buildMoneyFlow(manifest: PublishedGameManifest, payoutsPayload: JsonRecord | null): MoneyFlowMetrics {
  const payoutParticipants = asArray<any>(payoutsPayload?.participants);
  const totalPotWei = String(payoutsPayload?.settlement?.totalPotWei ?? manifest.economics.totalPotWei ?? "0");
  const winnerNetWei = sumWei([
    payoutsPayload?.claims?.winners?.totalNetClaimedWei,
    payoutsPayload?.claims?.winners?.totalNetUnclaimedWei,
  ]);
  const causeWei = sumWei(asArray(payoutsPayload?.causes).map((cause: any) => cause?.routedFromGameWei));
  const treasuryWei = String(
    payoutsPayload?.treasury?.accruedWei ?? payoutsPayload?.settlement?.treasuryAccruedWei ?? "0",
  );
  const refundWei = sumWei([
    payoutsPayload?.claims?.refunds?.totalRefundedWei,
    payoutsPayload?.claims?.refunds?.totalRefundPendingWei,
  ]);
  const winnerCount = Number(
    payoutsPayload?.claims?.winners?.eligibleWinnerCount ?? manifest.economics.winnerCount ?? 0,
  );

  const topWinnerSource = payoutParticipants
    .filter((participant: any) => bigIntFrom(participant?.claim?.netPrizeWei) > 0n)
    .sort((a: any, b: any) => Number(bigIntFrom(b?.claim?.netPrizeWei) - bigIntFrom(a?.claim?.netPrizeWei)))[0];

  const entryFee = bigIntFrom(manifest.economics.entryFeeWei);
  const topWinner = topWinnerSource
    ? {
        wallet: String(topWinnerSource.wallet),
        causeId: typeof topWinnerSource.causeId === "number" ? topWinnerSource.causeId : null,
        netPrizeWei: String(topWinnerSource?.claim?.netPrizeWei ?? "0"),
        returnMultiple:
          entryFee > 0n ? Number((bigIntFrom(topWinnerSource?.claim?.netPrizeWei) * 10n) / entryFee) / 10 : null,
      }
    : null;

  return {
    totalPotWei,
    winnerNetWei,
    causeWei,
    treasuryWei,
    refundWei,
    winnerCount,
    topWinner,
  };
}

function buildHeadline(
  manifest: PublishedGameManifest,
  roundDistribution: RoundDistributionPoint[],
  moneyFlow: MoneyFlowMetrics,
) {
  const divergenceCount = manifest.analysis?.divergenceCount ?? 0;
  const firstStealRound = detectFirstStealRound(roundDistribution);
  const roundsPlayed = roundDistribution.length;

  if (divergenceCount > 0) {
    return "An agent promised SHARE in coalition chat, played STEAL onchain, and claimed the pot — the first captured trust break in the dataset.";
  }

  if (manifest.outcome === "Cancelled") {
    return `${manifest.counts.joined} agents joined, but the game did not reach minimum players. Everyone received full refunds, demonstrating the cancellation settlement path.`;
  }

  if (manifest.outcome === "NoWinners") {
    const roundLabel = roundsPlayed ? ` in round ${roundDistribution.at(-1)?.round ?? roundsPlayed}` : "";
    return `All agents were eliminated${roundLabel}. No winner emerged. Value routed to causes and treasury, demonstrating the no-winner settlement path.`;
  }

  const allShare =
    roundDistribution.length > 0 && roundDistribution.every(point => point.catch === 0 && point.steal === 0);
  if (allShare && moneyFlow.winnerCount > 1) {
    return `Cooperation held for ${roundsPlayed} round${roundsPlayed === 1 ? "" : "s"}, and ${moneyFlow.winnerCount} surviving agents split the pot.`;
  }

  if (firstStealRound && firstStealRound > 1) {
    return `Cooperation held through round ${firstStealRound - 1}, then betrayal appeared in round ${firstStealRound}, triggering eliminations and a winner-path finish.`;
  }

  if (moneyFlow.winnerCount === 1) {
    return `A single surviving agent emerged after ${roundsPlayed} round${roundsPlayed === 1 ? "" : "s"} and claimed the winner path.`;
  }

  return `${manifest.title} ended on the ${manifest.terminalPath ?? "recorded"} path after ${roundsPlayed} round${roundsPlayed === 1 ? "" : "s"}, with permanent onchain evidence for every move and payout.`;
}

export function buildCaseStudyMetrics(bundle: {
  manifest: PublishedGameManifest;
  summary: JsonRecord | null;
  roster: JsonRecord | null;
  causes: JsonRecord | null;
  rounds: JsonRecord | null;
  payouts: JsonRecord | null;
  messages: JsonRecord[];
}) {
  const joinedCount = bundle.manifest.counts.joined;
  const { points: roundDistribution, eliminationCurve } = buildRoundDistribution(bundle.rounds, joinedCount);
  const sayDoGap = buildSayDoGap(bundle.manifest, bundle.roster);
  const coalitions = buildCoalitions(bundle.roster, bundle.rounds, bundle.manifest, bundle.payouts);
  const moneyFlow = buildMoneyFlow(bundle.manifest, bundle.payouts);
  const headline = buildHeadline(bundle.manifest, roundDistribution, moneyFlow);

  return {
    roundDistribution,
    eliminationCurve,
    sayDoGap,
    coalitions,
    moneyFlow,
    headline,
    researchFrame:
      "This is the first environment where you can see what AI agents said to their allies, what they actually did onchain, and what they earned — all verifiable, all permanent, all under real economic pressure.",
  } satisfies CaseStudyMetrics;
}
