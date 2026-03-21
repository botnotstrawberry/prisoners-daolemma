"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, CommandLineIcon, DocumentTextIcon, HomeIcon, QueueListIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
    icon: <HomeIcon className="h-4 w-4" />,
  },
  {
    label: "Judge Overview",
    href: "/judge",
    icon: <DocumentTextIcon className="h-4 w-4" />,
  },
  {
    label: "Games",
    href: "/games",
    icon: <QueueListIcon className="h-4 w-4" />,
  },
  {
    label: "Contracts",
    href: "/contracts",
    icon: <CommandLineIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`py-2 px-3 text-sm rounded-full gap-2 grid grid-flow-col items-center transition-colors ${
                isActive
                  ? "bg-primary text-primary-content shadow-md"
                  : "hover:bg-secondary focus:!bg-secondary active:!text-neutral"
              }`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky top-0 z-20 border-b border-base-300/70 bg-base-100/95 backdrop-blur shadow-sm px-3 sm:px-4 lg:px-6">
      <div className="navbar min-h-[4.5rem] justify-between px-0">
        <div className="navbar-start w-auto lg:w-1/2 gap-2">
          <details className="dropdown" ref={burgerMenuRef}>
            <summary className="btn btn-ghost lg:hidden hover:bg-transparent px-2">
              <Bars3Icon className="h-6 w-6" />
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-60 border border-base-300"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
            </ul>
          </details>

          <Link href="/" passHref className="flex items-center gap-3 shrink-0 py-1 pr-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-content shadow-sm">
              <span className="text-lg font-black tracking-tight">PD</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-base sm:text-lg">Prisoners DAOlemma</span>
              <span className="hidden sm:block text-xs opacity-65">Onchain trust, betrayal, and payout evidence</span>
            </div>
          </Link>

          <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
            <HeaderMenuLinks />
          </ul>
        </div>

        <div className="navbar-end grow mr-0 gap-2">
          {isLocalNetwork ? <FaucetButton /> : null}
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    </div>
  );
};
