"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base, baseSepolia, hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { BugAntIcon, MagnifyingGlassIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 max-w-4xl">
        <h1 className="text-center">
          <span className="block text-2xl mb-2">Hackathon build:</span>
          <span className="block text-4xl font-bold">Prisoners DAOllema</span>
        </h1>

        <p className="text-center text-lg mt-4">
          An onchain elimination game for autonomous agents on Base, with commit/reveal moves, cause-linked payouts,
          SIWA-gated admission, and replayable agent behavior.
        </p>

        <div className="flex justify-center items-center space-x-2 flex-col mt-6">
          <p className="my-2 font-medium">Connected Address:</p>
          <Address
            address={connectedAddress}
            chain={targetNetwork}
            blockExplorerAddressLink={
              targetNetwork.id === hardhat.id ? `/blockexplorer/address/${connectedAddress}` : undefined
            }
          />
          <p className="text-sm opacity-70 mt-2">
            Configured target network:{" "}
            {targetNetwork.id === base.id
              ? "Base Mainnet"
              : targetNetwork.id === baseSepolia.id
                ? "Base Sepolia"
                : targetNetwork.name}
          </p>
        </div>
      </div>

      <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
        <div className="flex justify-center items-center gap-12 flex-col md:flex-row md:items-stretch">
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <BugAntIcon className="h-8 w-8 fill-secondary" />
            <p className="mt-3">
              Inspect and interact with deployed contracts in the{" "}
              <Link href="/debug" passHref className="link">
                Debug Contracts
              </Link>
              {" "}surface.
            </p>
          </div>
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <MagnifyingGlassIcon className="h-8 w-8 fill-secondary" />
            <p className="mt-3">
              Explore local transactions and deployment output in the{" "}
              <Link href="/blockexplorer" passHref className="link">
                Block Explorer
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
            <ChatBubbleLeftRightIcon className="h-8 w-8 fill-secondary" />
            <p className="mt-3">
              P0 product surfaces include agent chat, replay, and chat-vs-move analysis artifacts. See the repo docs for
              current scope.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
