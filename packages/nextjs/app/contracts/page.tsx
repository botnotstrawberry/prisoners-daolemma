import Link from "next/link";
import type { NextPage } from "next";
import { ArrowTopRightOnSquareIcon, CommandLineIcon } from "@heroicons/react/24/outline";
import { pickFeaturedGameEntry, readGamesIndex, readPublishedGameBundle } from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Contracts",
  description:
    "Inspect the current Prisoners DAOlemma proof contracts and jump to the judge-friendly evidence surfaces.",
});

const contractLabels = {
  game: "PrisonersDAOlemma",
  registry: "AgentAuthRegistry",
  chat: "GameChat",
} as const;

const ContractsPage: NextPage = async () => {
  const index = await readGamesIndex();
  const featuredEntry = pickFeaturedGameEntry(index);
  const featuredBundle = featuredEntry ? await readPublishedGameBundle(featuredEntry.slug) : null;
  const addresses = featuredBundle?.summary?.addresses ?? null;

  const contracts = addresses
    ? [
        {
          key: "game",
          name: contractLabels.game,
          address: addresses.game,
        },
        {
          key: "registry",
          name: contractLabels.registry,
          address: addresses.registry,
        },
        {
          key: "chat",
          name: contractLabels.chat,
          address: addresses.chat,
        },
      ]
    : [];

  return (
    <div className="flex flex-col grow bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl rounded-3xl bg-base-100 p-8 md:p-10 shadow-xl">
          <p className="text-sm uppercase tracking-[0.25em] opacity-60">Contracts</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold">Current public proof contracts</h1>
          <p className="mt-4 max-w-4xl text-lg md:text-xl opacity-90">
            Base mainnet remains the launch target. The links below point to the current Base Sepolia proof contracts
            used by the featured public evidence bundle.
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
            {featuredEntry ? (
              <Link href={featuredEntry.urls.detail} className="btn btn-primary rounded-full">
                See featured betrayal demo
              </Link>
            ) : null}
            <Link href="/judge" className="btn btn-outline rounded-full">
              Judge Overview
            </Link>
            <Link href="/debug" className="btn btn-ghost rounded-full">
              Developer debug view
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl grid gap-5 md:grid-cols-3">
          {contracts.length > 0 ? (
            contracts.map(contract => (
              <div key={contract.key} className="rounded-3xl bg-base-100 p-6 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-content">
                    <CommandLineIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{contract.name}</h2>
                    <p className="m-0 text-sm opacity-65">Base Sepolia</p>
                  </div>
                </div>

                <p className="mt-5 break-all rounded-2xl bg-base-200 px-4 py-3 font-mono text-sm">{contract.address}</p>

                <a
                  href={`https://sepolia.basescan.org/address/${contract.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  Open on BaseScan
                </a>
              </div>
            ))
          ) : (
            <div className="md:col-span-3 rounded-3xl bg-base-100 p-8 shadow-lg">
              <h2 className="text-2xl font-semibold">Contracts unavailable</h2>
              <p className="mt-3 opacity-80">
                No published game bundle was available to derive the current proof contract addresses. Check the
                <Link href="/games" className="link ml-1">
                  Games
                </Link>
                surface once evidence is published.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ContractsPage;
