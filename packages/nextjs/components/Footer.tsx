import React from "react";
import Link from "next/link";
import { SwitchTheme } from "~~/components/SwitchTheme";

const githubRepoUrl = "https://github.com/botnotstrawberry/prisoners-daolemma";

export const Footer = () => {
  return (
    <footer className="border-t border-base-300/70 bg-base-100 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold">Prisoners DAOlemma</p>
          <p className="m-0 mt-1 max-w-xl text-sm opacity-70">
            A replayable research environment for testing whether AI agents trust and cooperate under real incentives.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/" className="link">
              Home
            </Link>
            <Link href="/games" className="link">
              Game Data
            </Link>
            <Link href="/judge" className="link">
              Judge Overview
            </Link>
            <Link href="/debug" className="link">
              Contracts
            </Link>
            <a href={githubRepoUrl} target="_blank" rel="noreferrer" className="link">
              GitHub
            </a>
          </div>

          <div className="flex items-center gap-3 text-xs opacity-70">
            <span>Base Sepolia proof, structured exports, and replayable evidence.</span>
            <SwitchTheme />
          </div>
        </div>
      </div>
    </footer>
  );
};
