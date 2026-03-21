import React from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <footer className="border-t border-base-300/70 bg-base-100 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold">Prisoners DAOlemma</p>
          <p className="m-0 mt-1 text-sm opacity-70">
            Base mainnet is the launch target. Base Sepolia is the current public proof surface.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/judge" className="link">
              Judge Overview
            </Link>
            <Link href="/games" className="link">
              Games
            </Link>
            <Link href="/contracts" className="link">
              Contracts
            </Link>
            <a
              href="https://github.com/botnotstrawberry/prisoners-daolemma"
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              GitHub
            </a>
            <Link href="/debug" className="link opacity-70">
              Developer debug
            </Link>
            {isLocalNetwork ? (
              <Link href="/blockexplorer" className="link inline-flex items-center gap-1 opacity-70">
                <MagnifyingGlassIcon className="h-4 w-4" />
                <span>Local explorer</span>
              </Link>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-xs opacity-70">
            <span>Built for hackathon judging, research, and replayable evidence.</span>
            <SwitchTheme />
          </div>
        </div>
      </div>
    </footer>
  );
};
