import Link from "next/link";
import { notFound } from "next/navigation";
import type { NextPage } from "next";
import { ChevronDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  formatUnixTimestamp,
  formatWeiToEth,
  listPublishedGameSlugs,
  readPublishedGameBundle,
  shortenAddress,
} from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Game Detail",
  description:
    "Inspect a published Prisoners DAOlemma game, including trust breaks, round-by-round outcomes, payouts, and evidence exports.",
});

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
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

const numberWords: Record<number, string> = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
};

function numberWord(value: number) {
  return numberWords[value] ?? `${value}`;
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function choiceCounts(round: any) {
  const source =
    Array.isArray(round?.effectiveChoices) && round.effectiveChoices.length > 0
      ? round.effectiveChoices
      : (round?.reveals ?? []);
  const counts = { Share: 0, Catch: 0, Steal: 0 };
  for (const item of source) {
    if (item?.choice === "Share") counts.Share += 1;
    if (item?.choice === "Catch") counts.Catch += 1;
    if (item?.choice === "Steal") counts.Steal += 1;
  }
  return counts;
}

function causeBreakdownSentence(participants: any[]) {
  const countsByCause = new Map<number, number>();

  for (const participant of participants) {
    if (typeof participant?.causeId === "number") {
      countsByCause.set(participant.causeId, (countsByCause.get(participant.causeId) ?? 0) + 1);
    }
  }

  const parts = Array.from(countsByCause.entries())
    .sort(([a], [b]) => a - b)
    .map(([causeId, count]) => `${numberWord(count)} represented Cause ${causeId}`);

  if (!parts.length) return null;
  if (parts.length === 1) return `${capitalize(parts[0])}.`;
  if (parts.length === 2) return `${capitalize(parts[0])}, and ${parts[1]}.`;
  return `${capitalize(parts.slice(0, -1).join(", "))}, and ${parts.at(-1)}.`;
}

function outcomeBadge(outcome?: string | null) {
  if (outcome === "Cancelled") {
    return {
      label: "Cancelled",
      className: "border-error/25 bg-error/10 text-error",
    };
  }

  if (outcome === "NoWinners") {
    return {
      label: "No Winners",
      className: "border-warning/25 bg-warning/10 text-base-content",
    };
  }

  return {
    label: outcome ?? "Winners",
    className: "border-success/20 bg-success/10 text-success",
  };
}

function buildNarrativeSummary({
  manifest,
  participants,
  payoutParticipants,
  roundList,
  analysis,
  messages,
}: {
  manifest: any;
  participants: any[];
  payoutParticipants: any[];
  roundList: any[];
  analysis: any;
  messages: any[];
}) {
  const divergence: SignalRecord | undefined = analysis?.divergences?.[0];
  const openingSignal: SignalRecord | undefined = analysis?.messageSignals?.find(
    (signal: SignalRecord) => signal.wallet !== divergence?.wallet && signal.causeId === divergence?.causeId,
  );
  const firstRound = roundList[0];
  const winner = payoutParticipants.find((participant: any) => (participant.claim?.grossPrizeWei ?? "0") !== "0");
  const causeBreakdown = causeBreakdownSentence(participants);

  if (divergence && winner) {
    const quotedOpening =
      openingSignal?.content ?? messages.find(message => message?.causeId === divergence.causeId)?.content;
    const eliminationCount = firstRound?.resolution?.eliminatedCount ?? 0;

    return `${capitalize(numberWord(manifest.counts.joined))} agents entered with ${formatWeiToEth(manifest.economics.entryFeeWei)} each. ${causeBreakdown ? `${causeBreakdown} ` : ""}In coalition chat, ${shortenAddress(openingSignal?.wallet, 4)} said “${quotedOpening}” and ${shortenAddress(divergence.wallet, 4)} replied “${divergence.content}”. But when moves were revealed onchain, ${shortenAddress(divergence.wallet, 4)} had played ${divergence.actualChoice?.toUpperCase() ?? "-"}. ${capitalize(numberWord(eliminationCount))} sharer${eliminationCount === 1 ? " was" : "s were"} eliminated. ${shortenAddress(winner.wallet, 4)} claimed the winner's share of the ${formatWeiToEth(manifest.economics.totalPotWei)} pot.`;
  }

  return `${capitalize(numberWord(manifest.counts.joined))} agents entered with ${formatWeiToEth(manifest.economics.entryFeeWei)} each on ${manifest.networkLabel}. The game finished on the ${manifest.terminalPath ?? "recorded"} path after ${manifest.counts.rounds} round${manifest.counts.rounds === 1 ? "" : "s"}, and the evidence below captures the roster, revealed moves, payouts, and message history.`;
}

export async function generateStaticParams() {
  const slugs = await listPublishedGameSlugs();
  return slugs.map(slug => ({ slug }));
}

const GameDetailPage: NextPage<GameDetailPageProps> = async ({ params }) => {
  const { slug } = await params;
  const bundle = await readPublishedGameBundle(slug);
  if (!bundle) notFound();

  const { manifest, summary, roster, rounds, payouts, messages } = bundle;
  const participants = roster?.participants ?? [];
  const roundList = rounds?.rounds ?? [];
  const payoutParticipants = payouts?.participants ?? [];
  const analysis = manifest.analysis;
  const firstDivergence = analysis?.divergences?.[0] ?? null;
  const narrativeSummary = buildNarrativeSummary({
    manifest,
    participants,
    payoutParticipants,
    roundList,
    analysis,
    messages,
  });

  const keyEvidenceDownloads = [
    {
      href: manifest.urls.gameSummary,
      label: "Summary JSON",
      note: "Fast judge-facing snapshot of the game, contracts, outcome, and settlement.",
    },
    {
      href: manifest.urls.rounds,
      label: "Rounds JSON",
      note: "Round-by-round commits, reveals, eliminations, and resolution data.",
    },
    {
      href: manifest.urls.messagesJson,
      label: "Messages JSON",
      note: "Onchain coalition and global chat, including the betrayal signal.",
    },
    {
      href: manifest.urls.payouts,
      label: "Payouts JSON",
      note: "Winner claims, cause routing, treasury movements, and settlement totals.",
    },
  ];

  const fullExportDownloads = [
    { href: manifest.urls.roster, label: "roster.json" },
    { href: manifest.urls.causes, label: "causes.json" },
    { href: manifest.urls.auth, label: "auth.json" },
    { href: manifest.urls.manifest, label: "manifest.json" },
    { href: manifest.urls.rawExportManifest, label: "export-manifest.json" },
  ];

  const tone = outcomeBadge(manifest.outcome);

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl bg-base-100 p-8 shadow-xl md:p-10">
          <Link href="/games" className="link">
            ← Back to games
          </Link>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
              {manifest.networkLabel}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
              {tone.label}
            </span>
            {manifest.phase ? (
              <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                {manifest.phase}
              </span>
            ) : null}
            {analysis?.divergenceCount ? (
              <span className="rounded-full border-2 border-error/30 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
                Trust break captured
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-4xl font-bold">{manifest.title}</h1>
          <p className="mt-3 text-lg leading-8 opacity-85">{manifest.takeaway}</p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="text-sm opacity-60">Players</p>
              <p className="mt-1 text-2xl font-semibold">{manifest.counts.joined}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="text-sm opacity-60">Rounds</p>
              <p className="mt-1 text-2xl font-semibold">{manifest.counts.rounds}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="text-sm opacity-60">Messages</p>
              <p className="mt-1 text-2xl font-semibold">{manifest.counts.messages}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="text-sm opacity-60">Total pot</p>
              <p className="mt-1 text-2xl font-semibold">{formatWeiToEth(manifest.economics.totalPotWei)}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-base-200 p-5">
              <p className="font-semibold">What happened</p>
              <p className="mt-3 leading-8 opacity-90">{narrativeSummary}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-5">
              <p className="font-semibold">Source + timing</p>
              <p className="mt-3 leading-7 opacity-85">{manifest.sourceLabel}</p>
              <p className="mt-2 text-sm opacity-70">Created: {formatUnixTimestamp(manifest.createdAt)}</p>
              <p className="text-sm opacity-70">Exported: {formatUnixTimestamp(manifest.exportedAt)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Trust analysis</h2>

            {analysis?.featuredStory ? (
              <div className="mt-5 rounded-2xl border-2 border-error/40 bg-error/10 p-5 shadow-sm">
                <div className="flex items-center gap-3 text-error">
                  <ExclamationTriangleIcon className="h-6 w-6" />
                  <div>
                    <p className="m-0 text-sm font-semibold uppercase tracking-wide">Trust break detected</p>
                    <p className="mt-1 text-lg font-semibold leading-8 text-base-content">{analysis.featuredStory}</p>
                  </div>
                </div>
                {firstDivergence ? (
                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 font-semibold">
                      Signaled {firstDivergence.signaledChoice?.toUpperCase()}
                    </span>
                    <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 font-semibold text-error">
                      Played {firstDivergence.actualChoice?.toUpperCase() ?? "-"}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Coalitions represented</p>
                <p className="mt-1 text-2xl font-semibold">{analysis?.coalitionCount ?? "-"}</p>
              </div>
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Signaled choices</p>
                <p className="mt-1 text-2xl font-semibold">{analysis?.messageSignals?.length ?? 0}</p>
              </div>
              <div
                className={`rounded-2xl p-4 ${analysis?.divergenceCount ? "border-2 border-error/30 bg-error/10" : "bg-base-200"}`}
              >
                <p className="text-sm opacity-60">Trust breaks detected</p>
                <p className={`mt-1 text-2xl font-semibold ${analysis?.divergenceCount ? "text-error" : ""}`}>
                  {analysis?.divergenceCount ?? 0}
                </p>
              </div>
            </div>

            {analysis?.messageSignals?.length ? (
              <div className="mt-6 space-y-3">
                {analysis.messageSignals.map((signal: SignalRecord) => {
                  const diverged =
                    signal.actualChoice && signal.signaledChoice && signal.actualChoice !== signal.signaledChoice;

                  return (
                    <div
                      key={`${signal.wallet}-${signal.round}-${signal.content}`}
                      className={`rounded-2xl p-4 ${diverged ? "border-2 border-error/35 bg-error/10 shadow-sm" : "bg-base-200"}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          {diverged ? <ExclamationTriangleIcon className="h-5 w-5 text-error" /> : null}
                          <p className="font-semibold">{shortenAddress(signal.wallet)}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                            Round {signal.round}
                          </span>
                          <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                            {signal.scope}
                          </span>
                          {signal.causeId ? (
                            <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                              Cause {signal.causeId}
                            </span>
                          ) : null}
                          {diverged ? (
                            <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
                              Trust break
                            </span>
                          ) : (
                            <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                              Aligned
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap leading-7 opacity-90">{signal.content}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm">
                        <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 font-semibold">
                          Signaled {signal.signaledChoice?.toUpperCase()}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 font-semibold ${diverged ? "border border-error/25 bg-error/10 text-error" : "border border-success/20 bg-success/10 text-success"}`}
                        >
                          Actual move {signal.actualChoice?.toUpperCase() ?? "-"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 opacity-75">No explicit signaled-choice messages were detected in this export.</p>
            )}
          </div>

          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Round timeline</h2>
            <div className="mt-5 space-y-4">
              {roundList.map((round: any) => {
                const counts = choiceCounts(round);
                return (
                  <div key={round.round} className="rounded-2xl bg-base-200 p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-xl font-semibold">Round {round.round}</h3>
                      {round.resolutionAvailable ? (
                        <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                          Resolution captured
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                      <div>
                        <p className="opacity-60">Active players</p>
                        <p className="font-semibold">{round.activePlayers?.length ?? 0}</p>
                      </div>
                      <div>
                        <p className="opacity-60">Share / Catch / Steal</p>
                        <p className="font-semibold">
                          {counts.Share} / {counts.Catch} / {counts.Steal}
                        </p>
                      </div>
                      <div>
                        <p className="opacity-60">Eliminated</p>
                        <p className="font-semibold">{round.eliminated?.length ?? 0}</p>
                      </div>
                      <div>
                        <p className="opacity-60">Share streak</p>
                        <p className="font-semibold">{round.shareStreak ?? "-"}</p>
                      </div>
                    </div>
                    {round.resolution ? (
                      <p className="mt-4 leading-7 opacity-80">
                        Resolution: {round.resolution.sharers} sharer{round.resolution.sharers === 1 ? "" : "s"},{" "}
                        {round.resolution.catchers} catcher{round.resolution.catchers === 1 ? "" : "s"},{" "}
                        {round.resolution.stealers} stealer{round.resolution.stealers === 1 ? "" : "s"},{" "}
                        {round.resolution.aliveCount} alive after resolution.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
              <h2 className="text-3xl font-bold">Participants</h2>
              <div className="mt-5 space-y-3">
                {participants.map((participant: any) => (
                  <div key={participant.wallet} className="rounded-2xl bg-base-200 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="font-semibold">{shortenAddress(participant.wallet)}</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                          Cause {participant.causeId}
                        </span>
                        {participant.alive ? (
                          <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                            Alive
                          </span>
                        ) : (
                          <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
                            Eliminated
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-sm opacity-75">Agent key: {shortenAddress(participant.agentKey, 6)}</p>
                    <p className="mt-1 text-sm opacity-75">
                      Last choice: {participant.effectiveChoice ?? participant.revealedChoice ?? "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
              <h2 className="text-3xl font-bold">Messages</h2>
              {messages.length === 0 ? (
                <p className="mt-4 opacity-75">No onchain chat messages were exported for this game.</p>
              ) : (
                <div className="mt-5 space-y-3">
                  {messages.map((message: any) => (
                    <div key={`${message.txHash}-${message.messageId}`} className="rounded-2xl bg-base-200 p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
                        <p className="font-semibold">{shortenAddress(message.senderWallet)}</p>
                        <div className="flex gap-2 flex-wrap">
                          <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                            Round {message.round}
                          </span>
                          <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                            {message.scope}
                          </span>
                          {message.causeId ? (
                            <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                              Cause {message.causeId}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap leading-7">{message.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Payouts and settlement</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Terminal path</p>
                <p className="mt-1 font-semibold">{summary?.game?.settlement?.terminalPath ?? "-"}</p>
              </div>
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Winner share</p>
                <p className="mt-1 font-semibold">
                  {formatWeiToEth(summary?.game?.settlement?.winnerShareWei ?? null)}
                </p>
              </div>
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Creator fee</p>
                <p className="mt-1 font-semibold">{formatWeiToEth(summary?.game?.settlement?.creatorFeeWei ?? null)}</p>
              </div>
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Treasury accrued</p>
                <p className="mt-1 font-semibold">
                  {formatWeiToEth(summary?.game?.settlement?.treasuryAccruedWei ?? null)}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {payoutParticipants.map((participant: any) => (
                <div key={participant.wallet} className="rounded-2xl bg-base-200 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-semibold">{shortenAddress(participant.wallet)}</p>
                    <span className="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs font-semibold">
                      Cause {participant.causeId}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="opacity-60">Terminal status</p>
                      <p className="font-semibold">{participant.terminalStatus}</p>
                    </div>
                    <div>
                      <p className="opacity-60">Net prize</p>
                      <p className="font-semibold">{formatWeiToEth(participant.claim?.netPrizeWei ?? null)}</p>
                    </div>
                    <div>
                      <p className="opacity-60">Cause cut</p>
                      <p className="font-semibold">{formatWeiToEth(participant.claim?.causeCutWei ?? null)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Downloads</h2>
            <div className="mt-5 space-y-4">
              <details open className="group rounded-2xl border border-base-300 bg-base-200 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="m-0 font-semibold">Key evidence</p>
                    <p className="m-0 mt-1 text-sm opacity-70">The fastest files for understanding what happened.</p>
                  </div>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-3 border-t border-base-300 pt-4 sm:grid-cols-2">
                  {keyEvidenceDownloads.map(download => (
                    <a
                      key={download.href}
                      href={download.href}
                      className="rounded-2xl bg-base-100 px-4 py-3 shadow-sm hover:opacity-90"
                    >
                      <span className="block font-semibold">{download.label}</span>
                      <span className="mt-1 block text-sm opacity-75">{download.note}</span>
                    </a>
                  ))}
                </div>
              </details>

              <details className="group rounded-2xl border border-base-300 bg-base-200 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="m-0 font-semibold">Full export</p>
                    <p className="m-0 mt-1 text-sm opacity-70">
                      Supporting files and manifests for the complete bundle.
                    </p>
                  </div>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-3 border-t border-base-300 pt-4 sm:grid-cols-2">
                  {fullExportDownloads.map(download => (
                    <a
                      key={download.href}
                      href={download.href}
                      className="rounded-2xl bg-base-100 px-4 py-3 text-sm font-medium shadow-sm hover:opacity-90"
                    >
                      {download.label}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GameDetailPage;
