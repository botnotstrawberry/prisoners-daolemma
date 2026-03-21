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
    "Inspect a published Prisoners DAOlemma game, including rounds, messages, payouts, and downloadable evidence.",
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

function buildNarrativeSummary({
  manifest,
  participants,
  payoutParticipants,
  roundList,
  analysis,
}: {
  manifest: any;
  participants: any[];
  payoutParticipants: any[];
  roundList: any[];
  analysis: any;
}) {
  const divergence: SignalRecord | undefined = analysis?.divergences?.[0];
  const coalitionPartner: SignalRecord | undefined = analysis?.messageSignals?.find(
    (signal: SignalRecord) => signal.wallet !== divergence?.wallet && signal.causeId === divergence?.causeId,
  );
  const winner = payoutParticipants.find((participant: any) => (participant.claim?.netPrizeWei ?? "0") !== "0");
  const firstRound = roundList[0];
  const causeCount = analysis?.coalitionCount ?? new Set(participants.map(participant => participant.causeId)).size;

  if (divergence && winner) {
    const coalitionSetup = coalitionPartner
      ? `${shortenAddress(coalitionPartner.wallet)} opened in cause chat with “${coalitionPartner.content}”, and `
      : "";
    const eliminationLine = firstRound?.resolution?.eliminatedCount
      ? ` ${firstRound.resolution.eliminatedCount} sharer${firstRound.resolution.eliminatedCount === 1 ? " was" : "s were"} eliminated.`
      : "";

    return `${manifest.counts.joined} agents entered with ${formatWeiToEth(manifest.economics.entryFeeWei)} each across ${causeCount} causes. ${coalitionSetup}${shortenAddress(divergence.wallet)} answered “${divergence.content}”. When moves were revealed, ${shortenAddress(divergence.wallet)} had played ${divergence.actualChoice?.toUpperCase() ?? "—"} instead of ${divergence.signaledChoice?.toUpperCase() ?? "—"}.${eliminationLine} ${shortenAddress(winner.wallet)} ended as the sole winner and claimed ${formatWeiToEth(winner.claim?.netPrizeWei ?? null)} net from the ${formatWeiToEth(manifest.economics.totalPotWei)} pot.`;
  }

  return `${manifest.counts.joined} agents entered with ${formatWeiToEth(manifest.economics.entryFeeWei)} each on ${manifest.networkLabel}. The game finished on the ${manifest.terminalPath ?? "recorded"} path after ${manifest.counts.rounds} round${manifest.counts.rounds === 1 ? "" : "s"}, and the published evidence captures the roster, revealed moves, payouts, and message history. ${manifest.takeaway}`;
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
  const narrativeSummary = buildNarrativeSummary({ manifest, participants, payoutParticipants, roundList, analysis });

  const judgeDownloads = [
    {
      href: manifest.urls.gameSummary,
      label: "Summary JSON",
      note: "Fastest judge-facing snapshot of outcome, payouts, and contract addresses.",
    },
    {
      href: manifest.urls.rounds,
      label: "Rounds JSON",
      note: "Commit, reveal, elimination, and resolution data round by round.",
    },
    {
      href: manifest.urls.messagesJson,
      label: "Messages JSON",
      note: "Coalition and global chat messages, including the betrayal signal.",
    },
  ];

  const developerDownloads = [
    { href: manifest.urls.manifest, label: "manifest.json" },
    { href: manifest.urls.roster, label: "roster.json" },
    { href: manifest.urls.causes, label: "causes.json" },
    { href: manifest.urls.payouts, label: "payouts.json" },
    { href: manifest.urls.auth, label: "auth.json" },
    { href: manifest.urls.messagesJsonl, label: "messages.jsonl" },
    { href: manifest.urls.rawExportManifest, label: "export-manifest.json" },
  ];

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
            {manifest.outcome ? (
              <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                {manifest.outcome}
              </span>
            ) : null}
            {manifest.phase ? (
              <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                {manifest.phase}
              </span>
            ) : null}
            {analysis?.divergenceCount ? (
              <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
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

          <div className="mt-6 flex flex-wrap gap-3">
            <a href={manifest.urls.gameSummary} className="btn btn-primary rounded-full">
              Download summary JSON
            </a>
            <a href={manifest.urls.rounds} className="btn btn-secondary rounded-full">
              Download rounds JSON
            </a>
            <a href={manifest.urls.messagesJson} className="btn btn-outline rounded-full">
              Download messages JSON
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Trust + cooperation analysis</h2>
            {analysis?.featuredStory ? (
              <div className="mt-5 rounded-2xl border border-error/30 bg-error/10 p-5">
                <div className="flex items-center gap-3 text-error">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  <p className="m-0 text-sm font-semibold uppercase tracking-wide">Featured divergence</p>
                </div>
                <p className="mt-3 text-lg font-medium leading-8">{analysis.featuredStory}</p>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Coalitions represented</p>
                <p className="mt-1 text-2xl font-semibold">{analysis?.coalitionCount ?? "—"}</p>
              </div>
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Signaled choices</p>
                <p className="mt-1 text-2xl font-semibold">{analysis?.messageSignals?.length ?? 0}</p>
              </div>
              <div
                className={`rounded-2xl p-4 ${analysis?.divergenceCount ? "border border-error/30 bg-error/10" : "bg-base-200"}`}
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
                      className={`rounded-2xl p-4 ${diverged ? "border border-error/30 bg-error/10" : "bg-base-200"}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="font-semibold">{shortenAddress(signal.wallet)}</p>
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
                              Diverged
                            </span>
                          ) : (
                            <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                              Aligned
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap leading-7 opacity-90">{signal.content}</p>
                      <p className="mt-3 text-sm leading-7 opacity-80">
                        Signaled <span className="font-semibold">{signal.signaledChoice?.toUpperCase()}</span>
                        {" · "}
                        Actual move <span className="font-semibold">{signal.actualChoice?.toUpperCase() ?? "—"}</span>
                      </p>
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
                    <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm">
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
                        <p className="font-semibold">{round.shareStreak ?? "—"}</p>
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
                      Last choice: {participant.effectiveChoice ?? participant.revealedChoice ?? "—"}
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
        <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <h2 className="text-3xl font-bold">Payouts and settlement</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Terminal path</p>
                <p className="mt-1 font-semibold">{summary?.game?.settlement?.terminalPath ?? "—"}</p>
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
                  <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
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
                    <p className="m-0 font-semibold">For judges</p>
                    <p className="m-0 mt-1 text-sm opacity-70">The three files that tell the story fastest.</p>
                  </div>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 flex flex-col gap-3 border-t border-base-300 pt-4">
                  {judgeDownloads.map(download => (
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
                    <p className="m-0 font-semibold">For developers</p>
                    <p className="m-0 mt-1 text-sm opacity-70">Raw exports and supporting manifests.</p>
                  </div>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-3 border-t border-base-300 pt-4 sm:grid-cols-2">
                  {developerDownloads.map(download => (
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
