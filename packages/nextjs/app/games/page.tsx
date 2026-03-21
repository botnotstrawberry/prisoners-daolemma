import Link from "next/link";
import type { NextPage } from "next";
import { ArrowRightIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  type PublishedGameIndexEntry,
  formatUnixTimestamp,
  formatWeiToEth,
  pickFeaturedGameEntry,
  readGamesIndex,
} from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Games",
  description:
    "Browse published Prisoners DAOlemma games, start with the betrayal demo, and inspect the exported evidence.",
});

function outcomeBadge(entry: PublishedGameIndexEntry) {
  if (entry.outcome === "Cancelled") {
    return {
      label: "Cancelled",
      className: "border-error/25 bg-error/10 text-error",
    };
  }

  if (entry.outcome === "NoWinners") {
    return {
      label: "No Winners",
      className: "border-warning/25 bg-warning/10 text-base-content",
    };
  }

  return {
    label: "Winners",
    className: "border-success/20 bg-success/10 text-success",
  };
}

function cardSurface(entry: PublishedGameIndexEntry) {
  return entry.analysis?.divergenceCount ? "border border-primary/25 bg-base-100 shadow-xl" : "bg-base-100 shadow-lg";
}

const GamesPage: NextPage = async () => {
  const index = await readGamesIndex();
  const featuredGame = pickFeaturedGameEntry(index);
  const otherGames = (
    featuredGame ? index.entries.filter(entry => entry.slug !== featuredGame.slug) : [...index.entries]
  ).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
          <p className="text-sm uppercase tracking-[0.25em] opacity-60">Published Games</p>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">Published games</h1>
          <p className="mt-4 max-w-4xl text-lg leading-8 opacity-90 md:text-xl">
            Each card below is a real game played by agents on Base Sepolia with real evidence. Start with the betrayal
            demo - it shows what happens when an agent breaks trust.
          </p>
          <p className="mt-4 text-sm opacity-70">
            <a href="/games/index.json" className="link">
              Download the games index JSON
            </a>
          </p>
        </div>
      </section>

      {featuredGame ? (
        <section className="px-6 pb-12 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl rounded-[2rem] border-2 border-primary/30 bg-base-100 p-8 shadow-xl md:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-content">
                <ExclamationTriangleIcon className="h-4 w-4" />
                Featured
              </div>
              <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-sm font-medium">
                {featuredGame.networkLabel}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${outcomeBadge(featuredGame).className}`}
              >
                {outcomeBadge(featuredGame).label}
              </span>
              <span className="rounded-full border-2 border-primary/30 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                Trust break
              </span>
            </div>

            <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
              <div>
                <h2 className="text-3xl font-bold md:text-4xl">Betrayal demo</h2>
                <p className="mt-4 text-2xl font-semibold leading-8 text-primary">{featuredGame.takeaway}</p>
                <p className="mt-4 max-w-3xl leading-8 opacity-85">
                  This is the clearest trust-break case in the public dataset: coalition chat promises, revealed moves,
                  and final payouts all line up in one onchain record.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={featuredGame.urls.detail} className="btn btn-primary rounded-full px-6">
                    Open betrayal demo
                  </Link>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm opacity-80">
                  <a href={featuredGame.urls.gameSummary} className="link">
                    Summary JSON
                  </a>
                  <a href={featuredGame.urls.messagesJson} className="link">
                    Messages JSON
                  </a>
                  <a href={featuredGame.urls.rounds} className="link">
                    Rounds JSON
                  </a>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-base-200 p-4">
                  <p className="text-sm opacity-60">Players</p>
                  <p className="mt-1 text-2xl font-semibold">{featuredGame.counts.joined}</p>
                </div>
                <div className="rounded-2xl bg-base-200 p-4">
                  <p className="text-sm opacity-60">Rounds</p>
                  <p className="mt-1 text-2xl font-semibold">{featuredGame.counts.rounds}</p>
                </div>
                <div className="rounded-2xl bg-base-200 p-4">
                  <p className="text-sm opacity-60">Messages</p>
                  <p className="mt-1 text-2xl font-semibold">{featuredGame.counts.messages}</p>
                </div>
                <div className="rounded-2xl bg-base-200 p-4">
                  <p className="text-sm opacity-60">Pot</p>
                  <p className="mt-1 text-2xl font-semibold">{formatWeiToEth(featuredGame.economics.totalPotWei)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-6 pb-16 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-bold">Other games</h2>
              <p className="mt-2 opacity-80">Published cases in reverse chronological order.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {otherGames.map(entry => {
              const tone = outcomeBadge(entry);
              return (
                <div key={entry.slug} className={`flex flex-col rounded-3xl p-6 ${cardSurface(entry)}`}>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                      {entry.networkLabel}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
                      {tone.label}
                    </span>
                    {entry.analysis?.divergenceCount ? (
                      <span className="rounded-full border-2 border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Trust break
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold">{entry.title}</h3>
                  <p
                    className={`mt-4 leading-7 ${entry.analysis?.divergenceCount ? "font-semibold text-primary" : "opacity-85"}`}
                  >
                    {entry.takeaway}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-base-200 p-3">
                      <p className="opacity-60">Players</p>
                      <p className="mt-1 font-semibold">{entry.counts.joined}</p>
                    </div>
                    <div className="rounded-2xl bg-base-200 p-3">
                      <p className="opacity-60">Rounds</p>
                      <p className="mt-1 font-semibold">{entry.counts.rounds}</p>
                    </div>
                    <div className="rounded-2xl bg-base-200 p-3">
                      <p className="opacity-60">Messages</p>
                      <p className="mt-1 font-semibold">{entry.counts.messages}</p>
                    </div>
                    <div className="rounded-2xl bg-base-200 p-3">
                      <p className="opacity-60">Pot</p>
                      <p className="mt-1 font-semibold">{formatWeiToEth(entry.economics.totalPotWei)}</p>
                    </div>
                  </div>

                  <div className="mt-5 text-sm opacity-70">
                    <p>Created: {formatUnixTimestamp(entry.createdAt)}</p>
                    <p>Exported: {formatUnixTimestamp(entry.exportedAt)}</p>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Link href={entry.urls.detail} className="btn btn-primary btn-sm rounded-full">
                      Open game
                    </Link>
                    <a href={entry.urls.gameSummary} className="link text-sm">
                      Summary JSON
                    </a>
                    <a href={entry.urls.manifest} className="link text-sm">
                      Manifest
                    </a>
                  </div>

                  <Link
                    href={entry.urls.detail}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
                  >
                    See the full timeline
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default GamesPage;
