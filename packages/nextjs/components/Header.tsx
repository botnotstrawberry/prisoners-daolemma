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
    label: "Games",
    href: "/games",
    icon: <QueueListIcon className="h-4 w-4" />,
  },
  {
    label: "Judge Overview",
    href: "/judge",
    icon: <DocumentTextIcon className="h-4 w-4" />,
  },
  {
    label: "Contracts",
    href: "/debug",
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
              className={`grid grid-flow-col items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
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

export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky top-0 z-20 border-b border-base-300/70 bg-base-100/95 px-3 shadow-sm backdrop-blur sm:px-4 lg:px-6">
      <div className="navbar min-h-[4.5rem] justify-between px-0">
        <div className="navbar-start w-auto gap-2 lg:w-1/2">
          <details className="dropdown" ref={burgerMenuRef}>
            <summary className="btn btn-ghost px-2 hover:bg-transparent lg:hidden">
              <Bars3Icon className="h-6 w-6" />
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-3 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
            </ul>
          </details>

          <Link href="/" passHref className="flex shrink-0 items-center gap-3 py-1 pr-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-content shadow-sm">
              <span className="text-lg font-black tracking-tight">PD</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold sm:text-lg">Prisoners DAOlemma</span>
              <span className="hidden text-xs opacity-65 sm:block">Research environment for trust and cooperation</span>
            </div>
          </Link>

          <ul className="menu menu-horizontal hidden gap-2 px-1 lg:flex lg:flex-nowrap">
            <HeaderMenuLinks />
          </ul>
        </div>

        <div className="navbar-end mr-0 grow gap-2">
          {isLocalNetwork ? <FaucetButton /> : null}
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    </div>
  );
};
