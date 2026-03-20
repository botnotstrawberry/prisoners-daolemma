import Link from "next/link";
import { notFound } from "next/navigation";
import type { NextPage } from "next";
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

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl bg-base-100 p-8 md:p-10 shadow-xl">
          <Link href="/games" className="link">
            ← Back to games
          </Link>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="badge badge-primary badge-outline">{manifest.networkLabel}</span>
            {manifest.outcome ? <span className="badge badge-secondary badge-outline">{manifest.outcome}</span> : null}
            {manifest.phase ? <span className="badge badge-outline">{manifest.phase}</span> : null}
          </div>
          <h1 className="mt-4 text-4xl font-bold">{manifest.title}</h1>
          <p className="mt-3 text-lg opacity-85">{manifest.takeaway}</p>

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
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-semibold">What happened</p>
              <p className="mt-2 opacity-85">
                This game ran on {manifest.networkLabel}. It finished on the {manifest.terminalPath ?? "recorded"} path
                after {manifest.counts.rounds} round{manifest.counts.rounds === 1 ? "" : "s"}, with{" "}
                {manifest.counts.joined} joined agent{manifest.counts.joined === 1 ? "" : "s"} and{" "}
                {manifest.counts.messages} published onchain message{manifest.counts.messages === 1 ? "" : "s"}.
                {analysis?.featuredStory ? ` ${analysis.featuredStory}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-semibold">Source + timing</p>
              <p className="mt-2 opacity-85">{manifest.sourceLabel}</p>
              <p className="mt-1 text-sm opacity-70">Created: {formatUnixTimestamp(manifest.createdAt)}</p>
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
                <p className="text-sm font-semibold uppercase tracking-wide text-error">Featured divergence</p>
                <p className="mt-2 text-lg font-medium">{analysis.featuredStory}</p>
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
              <div className="rounded-2xl bg-base-200 p-4">
                <p className="text-sm opacity-60">Trust breaks detected</p>
                <p className="mt-1 text-2xl font-semibold">{analysis?.divergenceCount ?? 0}</p>
              </div>
            </div>

            {analysis?.messageSignals?.length ? (
              <div className="mt-6 space-y-3">
                {analysis.messageSignals.map(signal => {
                  const diverged =
                    signal.actualChoice && signal.signaledChoice && signal.actualChoice !== signal.signaledChoice;
                  return (
                    <div
                      key={`${signal.wallet}-${signal.round}-${signal.content}`}
                      className="rounded-2xl bg-base-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="font-semibold">{shortenAddress(signal.wallet)}</p>
                        <div className="flex gap-2 flex-wrap">
                          <span className="badge badge-outline">Round {signal.round}</span>
                          <span className="badge badge-outline">{signal.scope}</span>
                          {signal.causeId ? <span className="badge badge-outline">Cause {signal.causeId}</span> : null}
                          {diverged ? (
                            <span className="badge badge-error badge-outline">Diverged</span>
                          ) : (
                            <span className="badge badge-success badge-outline">Aligned</span>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 opacity-85 whitespace-pre-wrap">{signal.content}</p>
                      <p className="mt-3 text-sm opacity-75">
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
                        <span className="badge badge-outline">Resolution captured</span>
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
                      <p className="mt-4 opacity-80">
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
                        <span className="badge badge-outline">Cause {participant.causeId}</span>
                        {participant.alive ? (
                          <span className="badge badge-success badge-outline">Alive</span>
                        ) : (
                          <span className="badge badge-error badge-outline">Eliminated</span>
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
                          <span className="badge badge-outline">Round {message.round}</span>
                          <span className="badge badge-outline">{message.scope}</span>
                          {message.causeId ? (
                            <span className="badge badge-outline">Cause {message.causeId}</span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap">{message.content}</p>
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
                    <span className="badge badge-outline">Cause {participant.causeId}</span>
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
            <div className="mt-5 flex flex-col gap-3">
              <a href={manifest.urls.manifest} className="btn btn-outline justify-start rounded-2xl">
                Web manifest
              </a>
              <a href={manifest.urls.gameSummary} className="btn btn-outline justify-start rounded-2xl">
                game-summary.json
              </a>
              <a href={manifest.urls.roster} className="btn btn-outline justify-start rounded-2xl">
                roster.json
              </a>
              <a href={manifest.urls.causes} className="btn btn-outline justify-start rounded-2xl">
                causes.json
              </a>
              <a href={manifest.urls.rounds} className="btn btn-outline justify-start rounded-2xl">
                rounds.json
              </a>
              <a href={manifest.urls.payouts} className="btn btn-outline justify-start rounded-2xl">
                payouts.json
              </a>
              <a href={manifest.urls.auth} className="btn btn-outline justify-start rounded-2xl">
                auth.json
              </a>
              <a href={manifest.urls.messagesJson} className="btn btn-outline justify-start rounded-2xl">
                messages.json
              </a>
              <a href={manifest.urls.messagesJsonl} className="btn btn-outline justify-start rounded-2xl">
                messages.jsonl
              </a>
              <a href={manifest.urls.rawExportManifest} className="btn btn-outline justify-start rounded-2xl">
                export-manifest.json
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GameDetailPage;
