import Link from "next/link";
import type { NextPage } from "next";
import { type PublishedGameIndexEntry, pickFeaturedGameEntry, readGamesIndex } from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Games",
  description:
    "A compact index of published Prisoners DAOlemma games. Open any game to view the full research case study.",
});

function outcomeLabel(entry: PublishedGameIndexEntry) {
  if (entry.phase && entry.phase !== "Ended" && entry.phase !== "Terminal") return "In progress";
  if (entry.outcome === "Cancelled") return "Cancelled";
  if (entry.outcome === "NoWinners") return "No winners";
  return "Winner path";
}

function trustBreakTone(entry: PublishedGameIndexEntry) {
  return entry.analysis?.divergenceCount
    ? "border-error/30 bg-error/10 text-error"
    : "border-base-300 bg-base-100 text-base-content";
}

const GamesPage: NextPage = async () => {
  const index = await readGamesIndex();
  const sortedGames = [...index.entries].sort((a, b) => b.createdAt - a.createdAt);
  const featuredGame = sortedGames.find(entry => entry.counts.joined >= 30) ?? pickFeaturedGameEntry(index);

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
          <p className="text-sm uppercase tracking-[0.25em] opacity-60">Games</p>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">Published game index</h1>
          <p className="mt-4 max-w-4xl text-lg leading-8 opacity-90 md:text-xl">
            Browse published evidence bundles and open any game as a full case study. The featured case below is the
            recent 30+ player Sepolia run.
          </p>
        </div>
      </section>

      {featuredGame ? (
        <section className="px-6 pb-8 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl rounded-[2rem] border-2 border-primary/30 bg-base-100 p-6 shadow-xl md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Featured</p>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-3xl font-bold">{featuredGame.title}</h2>
                <p className="mt-3 max-w-4xl leading-8 opacity-85">{featuredGame.takeaway}</p>
                <p className="mt-3 text-sm opacity-70">
                  {featuredGame.networkLabel} · {featuredGame.counts.joined} players · {outcomeLabel(featuredGame)}
                </p>
              </div>
              <Link href={featuredGame.urls.detail} className="btn btn-primary rounded-full px-6">
                Open featured case study
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-6 pb-16 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-base-100 p-4 shadow-lg md:p-6">
          <div className="px-3 pb-4 pt-2 md:px-4">
            <h2 className="text-2xl font-bold">All games</h2>
          </div>

          <div className="divide-y divide-base-300">
            {sortedGames.map(entry => (
              <Link
                key={entry.slug}
                href={entry.urls.detail}
                className="grid gap-4 px-3 py-5 transition-colors hover:bg-base-200/70 md:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold">{entry.title}</span>
                    <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                      {entry.networkLabel}
                    </span>
                    <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                      {entry.counts.joined} players
                    </span>
                    <span className="rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-semibold">
                      {outcomeLabel(entry)}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${trustBreakTone(entry)}`}>
                      {entry.analysis?.divergenceCount ? "Trust breaks detected" : "No trust break captured"}
                    </span>
                  </div>
                  <p className="mt-3 max-w-4xl leading-7 opacity-85">{entry.takeaway}</p>
                </div>

                <div className="shrink-0 text-sm font-medium text-primary">Open case study →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default GamesPage;
