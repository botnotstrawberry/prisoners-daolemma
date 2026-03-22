import type { NextPage } from "next";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { pickFeaturedGameEntry, readGamesIndex, readPublishedGameBundle } from "~~/utils/games/publishedGames";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Contracts",
  description: "Inspect the deployed Prisoners DAOlemma contracts on Base networks.",
});

const contractLabels = {
  game: "PrisonersDAOlemma",
  registry: "AgentAuthRegistry",
  chat: "GameChat",
} as const;

const mainnetContracts = [
  {
    key: "game",
    name: contractLabels.game,
  },
  {
    key: "registry",
    name: contractLabels.registry,
  },
  {
    key: "chat",
    name: contractLabels.chat,
  },
] as const;

const DebugPage: NextPage = async () => {
  const index = await readGamesIndex();
  const featuredEntry = pickFeaturedGameEntry(index);
  const featuredBundle = featuredEntry ? await readPublishedGameBundle(featuredEntry.slug) : null;
  const addresses = featuredBundle?.summary?.addresses ?? null;

  const sepoliaContracts = addresses
    ? [
        {
          key: "game",
          name: contractLabels.game,
          address: addresses.game,
          href: `https://sepolia.basescan.org/address/${addresses.game}`,
        },
        {
          key: "registry",
          name: contractLabels.registry,
          address: addresses.registry,
          href: `https://sepolia.basescan.org/address/${addresses.registry}`,
        },
        {
          key: "chat",
          name: contractLabels.chat,
          address: addresses.chat,
          href: `https://sepolia.basescan.org/address/${addresses.chat}`,
        },
      ]
    : [];

  return (
    <div className="flex grow flex-col bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] opacity-60">Contracts</p>
                <h1 className="mt-3 text-4xl font-bold md:text-5xl">Base Mainnet</h1>
              </div>
              <p className="max-w-2xl text-sm leading-7 opacity-70 md:text-right">
                Reserved for launch contracts. We&apos;ll add Base mainnet addresses here when they exist.
              </p>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {mainnetContracts.map(contract => (
                <div key={contract.key} className="rounded-3xl bg-base-200 p-6">
                  <p className="text-lg font-semibold">{contract.name}</p>
                  <p className="mt-4 rounded-2xl border border-dashed border-base-content/15 bg-base-100 px-4 py-3 text-sm opacity-60">
                    Address coming soon
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-base-100 p-8 shadow-xl md:p-10">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] opacity-60">Contracts</p>
                <h2 className="mt-3 text-4xl font-bold md:text-5xl">Base Sepolia</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 opacity-70 md:text-right">Current public proof deployment.</p>
            </div>

            {sepoliaContracts.length ? (
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {sepoliaContracts.map(contract => (
                  <div key={contract.key} className="rounded-3xl bg-base-200 p-6">
                    <p className="text-lg font-semibold">{contract.name}</p>
                    <p className="mt-4 break-all rounded-2xl bg-base-100 px-4 py-3 font-mono text-sm">
                      {contract.address}
                    </p>
                    <a
                      href={contract.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
                    >
                      Open on BaseScan
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-8 opacity-75">
                Publish a game bundle to surface the current Base Sepolia contract addresses here.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DebugPage;
