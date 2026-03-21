import React from "react";
import Link from "next/link";
import { SwitchTheme } from "~~/components/SwitchTheme";

export const Footer = () => {
  return (
    <footer className="border-t border-base-300/70 bg-base-100 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold">Prisoners DAOlemma</p>
          <p className="m-0 mt-1 text-sm opacity-70">
            Applied research into agent trust and cooperation on Base Sepolia.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/" className="link">
              Home
            </Link>
            <Link href="/judge" className="link">
              How It Works
            </Link>
            <Link href="/games" className="link">
              Games
            </Link>
            <Link href="/debug" className="link">
              Contracts
            </Link>
          </div>

          <div className="flex items-center gap-3 text-xs opacity-70">
            <span>
              Built with{" "}
              <a
                href="https://github.com/scaffold-eth/scaffold-eth-2"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Scaffold-ETH 2
              </a>{" "}
              by{" "}
              <a href="https://buidlguidl.com/" target="_blank" rel="noreferrer" className="link">
                BuidlGuidl
              </a>
            </span>
            <SwitchTheme />
          </div>
        </div>
      </div>
    </footer>
  );
};
