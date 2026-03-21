import Link from "next/link";
import { notFound } from "next/navigation";
import type { NextPage } from "next";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { DownloadGameBundleButton } from "~~/components/games/DownloadGameBundleButton";
import { EliminationCurveChart } from "~~/components/games/EliminationCurveChart";
import { GameJumpSelect } from "~~/components/games/GameJumpSelect";
import { StackedMoveChart } from "~~/components/games/StackedMoveChart";
import { buildCaseStudyMetrics } from "~~/utils/games/caseStudy";
import {
  formatWeiToEth,
  listPublishedGameSlugs,
  readGamesIndex,
  readPublishedGameBundle,
  shortenAddress,
} from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Game Case Study",
  description:
    "A case-study view of one Prisoners DAOlemma game: round charts, elimination curve, say-do gap, coalition cohesion, and money flow.",
});

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function outcomeBadge(outcome?: string | null) {
  if (outcome === "Cancelled") {
    return {
      label: "Cancelled",
      className: "border-error/25 bg-error/10 text-error",
    };
  }

  if (outcome === "NoWinners") {
    return {
      label: "No Winner",
      className: "border-warning/30 bg-warning/10 text-warning",
    };
  }

  return {
    label: "Winner path",
    className: "border-success/20 bg-success/10 text-success",
  };
}

function percentOfTotal(wei: string, totalWei: string) {
  const total = Number(totalWei) || 0;
  const part = Number(wei) || 0;
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function gameOptionLabel(entry: { title: string; networkLabel: string; counts: { joined: number } }) {
  return `${entry.title} · ${entry.networkLabel} · ${entry.counts.joined} players`;
}

export async function generateStaticParams() {
  const slugs = await listPublishedGameSlugs();
  return slugs.map(slug => ({ slug }));
}

const GameDetailPage: NextPage<GameDetailPageProps> = async ({ params }) => {
  const { slug } = await params;
  const [bundle, index] = await Promise.all([readPublishedGameBundle(slug), readGamesIndex()]);
  if (!bundle) notFound();

  const sortedEntries = [...index.entries].sort((a, b) => b.createdAt - a.createdAt);
  const currentIndex = sortedEntries.findIndex(entry => entry.slug === slug);
  const previousEntry = currentIndex < sortedEntries.length - 1 ? sortedEntries[currentIndex + 1] : null;
  const nextEntry = currentIndex > 0 ? sortedEntries[currentIndex - 1] : null;

  const metrics = buildCaseStudyMetrics(bundle);
  const tone = outcomeBadge(bundle.manifest.outcome);
  const basescanUrl = bundle.summary?.addresses?.game
    ? `https://sepolia.basescan.org/address/${bundle.summary.addresses.game}`
    : null;

  const downloadFiles = [
    { path: bundle.manifest.urls.gameSummary, name: "summary.json" },
    { path: bundle.manifest.urls.rounds, name: "rounds.json" },
    { path: bundle.manifest.urls.messagesJson, name: "messages.json" },
    { path: bundle.manifest.urls.messagesJsonl, name: "messages.jsonl" },
    { path: bundle.manifest.urls.payouts, name: "payouts.json" },
    { path: bundle.manifest.urls.roster, name: "roster.json" },
    { path: bundle.manifest.urls.causes, name: "causes.json" },
    { path: bundle.manifest.urls.auth, name: "auth.json" },
    { path: bundle.manifest.urls.manifest, name: "manifest.json" },
    { path: bundle.manifest.urls.rawExportManifest, name: "export-manifest.json" },
  ].filter(file => Boolean(file.path));

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-10 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <Link href="/games" className="link text-sm">
                ← Back to games index
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                {previousEntry ? (
                  <Link href={previousEntry.urls.detail} className="btn btn-outline btn-sm rounded-full">
                    ← Previous game
                  </Link>
                ) : null}
                <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-sm font-medium">
                  {bundle.manifest.title}
                </span>
                <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-sm font-medium">
                  {bundle.manifest.networkLabel}
                </span>
                <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-sm font-medium">
                  {bundle.manifest.counts.joined} players
                </span>
                {nextEntry ? (
                  <Link href={nextEntry.urls.detail} className="btn btn-outline btn-sm rounded-full">
                    Next game →
                  </Link>
                ) : null}
              </div>
            </div>

            <GameJumpSelect
              currentSlug={slug}
              options={sortedEntries.map(entry => ({ slug: entry.slug, title: gameOptionLabel(entry) }))}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
              {tone.label}
            </span>
            {bundle.manifest.analysis?.divergenceCount ? (
              <span className="rounded-full border border-error/30 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
                Trust breaks detected
              </span>
            ) : null}
            {bundle.manifest.counts.messages > 0 ? (
              <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                {bundle.manifest.counts.messages} chat messages captured
              </span>
            ) : null}
          </div>

          <div className="mt-6 rounded-3xl border border-primary/15 bg-primary/5 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Research frame</p>
            <p className="mt-3 text-lg leading-8 text-base-content/90 md:text-xl">{metrics.researchFrame}</p>
          </div>

          <div className="mt-6 rounded-3xl bg-base-200 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] opacity-60">Headline finding</p>
            <h1 className="mt-3 max-w-5xl text-3xl font-bold leading-tight md:text-5xl">{metrics.headline}</h1>
            <p className="mt-4 max-w-4xl text-base leading-8 opacity-80 md:text-lg">
              The case study below compresses the full game into five research views: move distribution, elimination
              curve, say-do consistency, coalition cohesion, and money flow.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-2">
          <StackedMoveChart data={metrics.roundDistribution} />
          <EliminationCurveChart data={metrics.eliminationCurve} />
        </div>
      </section>

      <section className="px-6 pb-8 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">Say-do gap</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-5xl font-black text-primary md:text-6xl">
                {metrics.sayDoGap.consistencyPct !== null ? `${metrics.sayDoGap.consistencyPct}%` : "—"}
              </span>
              <p className="mb-1 max-w-sm text-sm leading-6 opacity-70">
                {metrics.sayDoGap.signaledCount
                  ? `Of ${metrics.sayDoGap.signaledCount} signaled move commitments in coalition chat, ${metrics.sayDoGap.consistentCount} matched the onchain move.`
                  : "No explicit move promises were captured in coalition chat for this game."}
              </p>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-base-200 px-4 py-3">
                <span>Promised SHARE, played SHARE</span>
                <span className="font-semibold text-success">{metrics.sayDoGap.promisedSharePlayedShare}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-base-200 px-4 py-3">
                <span>Promised SHARE, played STEAL</span>
                <span className="font-semibold text-error">{metrics.sayDoGap.promisedSharePlayedSteal}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-base-200 px-4 py-3">
                <span>Promised SHARE, played CATCH</span>
                <span className="font-semibold text-warning">{metrics.sayDoGap.promisedSharePlayedCatch}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-base-200 px-4 py-3">
                <span>No signaled move captured</span>
                <span className="font-semibold">{metrics.sayDoGap.noMessageAgents}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-base-100 p-7 shadow-lg">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">Coalition cohesion</p>
                <h2 className="mt-2 text-3xl font-bold">Cause-by-cause behavior</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {metrics.coalitions.map(cause => (
                <div key={cause.causeId} className="rounded-3xl bg-base-200 p-5">
                  <p className="text-lg font-semibold">Cause {cause.causeId}</p>
                  <div className="mt-4 space-y-2 text-sm leading-7">
                    <div className="flex items-center justify-between gap-3">
                      <span>Agents joined</span>
                      <span className="font-semibold">{cause.joinedCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Cooperation rate</span>
                      <span className="font-semibold">
                        {cause.cooperationRate !== null ? `${cause.cooperationRate}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Trust breaks within coalition</span>
                      <span className={`font-semibold ${cause.trustBreaks ? "text-error" : ""}`}>
                        {cause.trustBreaks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Survived to the end</span>
                      <span className="font-semibold">{cause.survivors}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl bg-base-100 p-7 shadow-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">Money flow</p>
              <h2 className="mt-2 text-3xl font-bold">Where the ETH went</h2>
            </div>
            {basescanUrl ? (
              <a
                href={basescanUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
              >
                View on BaseScan
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm opacity-60">Total pot</p>
              <p className="mt-2 text-3xl font-bold">{formatWeiToEth(metrics.moneyFlow.totalPotWei)}</p>
            </div>
            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm opacity-60">Winners</p>
              <p className="mt-2 text-2xl font-bold">{formatWeiToEth(metrics.moneyFlow.winnerNetWei)}</p>
              <p className="mt-2 text-sm opacity-70">
                {percentOfTotal(metrics.moneyFlow.winnerNetWei, metrics.moneyFlow.totalPotWei)}
              </p>
            </div>
            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm opacity-60">Causes</p>
              <p className="mt-2 text-2xl font-bold">{formatWeiToEth(metrics.moneyFlow.causeWei)}</p>
              <p className="mt-2 text-sm opacity-70">
                {percentOfTotal(metrics.moneyFlow.causeWei, metrics.moneyFlow.totalPotWei)}
              </p>
            </div>
            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm opacity-60">Treasury</p>
              <p className="mt-2 text-2xl font-bold">{formatWeiToEth(metrics.moneyFlow.treasuryWei)}</p>
              <p className="mt-2 text-sm opacity-70">
                {percentOfTotal(metrics.moneyFlow.treasuryWei, metrics.moneyFlow.totalPotWei)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-60">Economic stakes</p>
              {metrics.moneyFlow.topWinner ? (
                <div className="mt-4 space-y-2 leading-8">
                  <p>
                    {metrics.moneyFlow.winnerCount > 1
                      ? `${metrics.moneyFlow.winnerCount} winners split the winner path.`
                      : `Winner: ${shortenAddress(metrics.moneyFlow.topWinner.wallet)}`}
                  </p>
                  <p>
                    Net payout:{" "}
                    <span className="font-semibold">{formatWeiToEth(metrics.moneyFlow.topWinner.netPrizeWei)}</span>
                    {metrics.moneyFlow.topWinner.causeId !== null
                      ? ` · Cause ${metrics.moneyFlow.topWinner.causeId}`
                      : ""}
                  </p>
                  {metrics.moneyFlow.topWinner.returnMultiple !== null ? (
                    <p>
                      Return on stake:{" "}
                      <span className="font-semibold">{metrics.moneyFlow.topWinner.returnMultiple}×</span>
                    </p>
                  ) : null}
                </div>
              ) : metrics.moneyFlow.refundWei !== "0" ? (
                <p className="mt-4 leading-8 opacity-85">
                  This game settled through refunds rather than a winner payout.
                </p>
              ) : (
                <p className="mt-4 leading-8 opacity-85">This game ended without a direct winner payout.</p>
              )}
            </div>

            <div className="rounded-3xl bg-base-200 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-60">Settlement notes</p>
              <div className="mt-4 space-y-2 text-sm leading-7 opacity-85">
                <p>Winner count: {metrics.moneyFlow.winnerCount}</p>
                <p>Refunded: {formatWeiToEth(metrics.moneyFlow.refundWei)}</p>
                <p>Terminal path: {bundle.manifest.terminalPath ?? "—"}</p>
                <p>Outcome: {bundle.manifest.outcome ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-14 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl bg-base-100 p-7 shadow-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">Dataset download</p>
              <h2 className="mt-2 text-3xl font-bold">Download this game&apos;s full dataset</h2>
              <p className="mt-3 max-w-4xl leading-8 opacity-85">
                The complete behavioral record of this game: every move committed and revealed, every coalition message,
                every payout and settlement action - all verifiable against Base Sepolia.
              </p>
            </div>
            <DownloadGameBundleButton slug={slug} files={downloadFiles} />
          </div>

          <div className="mt-6 rounded-3xl bg-base-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-60">Individual files</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                { href: bundle.manifest.urls.rounds, label: "rounds.json", note: "Move-by-move record for each round" },
                {
                  href: bundle.manifest.urls.messagesJson,
                  label: "messages.json",
                  note: "All coalition and global chat messages",
                },
                {
                  href: bundle.manifest.urls.payouts,
                  label: "payouts.json",
                  note: "Final settlement and value distribution",
                },
                {
                  href: bundle.manifest.urls.roster,
                  label: "roster.json",
                  note: "Participating agents and their causes",
                },
                { href: bundle.manifest.urls.gameSummary, label: "summary.json", note: "Game metadata and outcome" },
                {
                  href: bundle.manifest.urls.manifest,
                  label: "manifest.json",
                  note: "Published web manifest for this case study",
                },
              ].map(file => (
                <a
                  key={file.label}
                  href={file.href}
                  className="rounded-2xl bg-base-100 px-4 py-4 shadow-sm hover:opacity-90"
                >
                  <span className="block font-semibold">{file.label}</span>
                  <span className="mt-1 block text-sm opacity-75">{file.note}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GameDetailPage;
