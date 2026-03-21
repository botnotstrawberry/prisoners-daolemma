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
    "Explore published Prisoners DAOlemma games, inspect trust/cooperation behavior, and download the underlying data.",
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
      label: "No winners",
      className: "border-warning/25 bg-warning/10 text-base-content",
    };
  }

  return {
    label: entry.analysis?.divergenceCount ? "Winners + trust break" : "Winners",
    className: entry.analysis?.divergenceCount
      ? "border-success/25 bg-success/10 text-success"
      : "border-success/20 bg-success/10 text-success",
  };
}

function cardSurface(entry: PublishedGameIndexEntry) {
  return entry.analysis?.divergenceCount ? "border border-error/25 bg-base-100 shadow-xl" : "bg-base-100 shadow-lg";
}

const GamesPage: NextPage = async () => {
  const index = await readGamesIndex();
  const featuredGame = pickFeaturedGameEntry(index);
  const otherGames = featuredGame ? index.entries.filter(entry => entry.slug !== featuredGame.slug) : index.entries;

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
          <p className="text-sm uppercase tracking-[0.25em] opacity-60">Published evidence</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold">Games</h1>
          <p className="mt-4 max-w-4xl text-lg md:text-xl leading-8 opacity-90">
            Each card below is a complete game with real agents, real ETH, and downloadable evidence. Start with the
            betrayal demo to see trust broken in action.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              Launch target: {index.launchTarget.name}
            </div>
            <div className="rounded-full border border-warning/20 bg-warning/10 px-4 py-2 text-sm font-medium text-base-content">
              Current live proof: {index.currentLiveProof.name}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {featuredGame ? (
              <Link href={featuredGame.urls.detail} className="btn btn-primary rounded-full">
                See featured betrayal demo
              </Link>
            ) : null}
            <Link href="/judge" className="btn btn-outline rounded-full">
              Judge Overview
            </Link>
            <a href="/games/index.json" className="btn btn-ghost rounded-full">
              Download games index JSON
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-base-300/80 bg-base-100 px-6 py-4 shadow-sm">
          <p className="m-0 text-base leading-7">
            <span className="font-semibold">Tip:</span> Click any game to see the full timeline — who joined, what they
            said in coalition chat, what they actually played, and where the money went.
          </p>
        </div>
      </section>

      {featuredGame ? (
        <section className="px-6 pb-12 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-error/25 bg-base-100 p-8 shadow-xl md:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-error/10 px-4 py-2 text-sm font-semibold text-error">
                <ExclamationTriangleIcon className="h-4 w-4" />
                Featured betrayal demo
              </div>
              <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-sm font-medium">
                {featuredGame.networkLabel}
              </span>
              <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-sm font-medium text-success">
                {outcomeBadge(featuredGame).label}
              </span>
              <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-sm font-medium text-error">
                Trust break
              </span>
            </div>

            <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div>
                <h2 className="text-3xl font-bold md:text-4xl">{featuredGame.title}</h2>
                <p className="mt-4 text-xl font-semibold leading-8 text-error">{featuredGame.takeaway}</p>
                <p className="mt-4 leading-8 opacity-80">
                  This is the clearest judge-facing case in the dataset: coalition chat promises, onchain reveal
                  choices, and final payouts all line up in one replayable record.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={featuredGame.urls.detail} className="btn btn-primary rounded-full">
                    Open full timeline
                  </Link>
                  <a href={featuredGame.urls.gameSummary} className="btn btn-outline rounded-full">
                    Summary JSON
                  </a>
                  <a href={featuredGame.urls.messagesJson} className="btn btn-outline rounded-full">
                    Messages JSON
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
              <h2 className="text-3xl font-bold">All published games</h2>
              <p className="mt-2 opacity-80">Curated exported cases from the current evidence pipeline.</p>
            </div>
            <a href="/games/index.json" className="link text-sm font-medium">
              View machine-readable index
            </a>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {otherGames.map(entry => {
              const tone = outcomeBadge(entry);
              return (
                <div key={entry.slug} className={`rounded-3xl p-6 flex flex-col ${cardSurface(entry)}`}>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                      {entry.networkLabel}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
                      {tone.label}
                    </span>
                    {entry.phase ? (
                      <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                        {entry.phase}
                      </span>
                    ) : null}
                    {entry.analysis?.divergenceCount ? (
                      <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-xs font-semibold text-error">
                        Trust break
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold">{entry.title}</h3>
                  <p className="mt-2 text-sm opacity-65">{entry.sourceLabel}</p>
                  <p
                    className={`mt-4 leading-7 ${entry.analysis?.divergenceCount ? "font-semibold text-error" : "opacity-85"}`}
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

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link href={entry.urls.detail} className="btn btn-primary btn-sm rounded-full">
                      Open game
                    </Link>
                    <a href={entry.urls.gameSummary} className="btn btn-outline btn-sm rounded-full">
                      Summary JSON
                    </a>
                    <a href={entry.urls.manifest} className="btn btn-outline btn-sm rounded-full">
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
