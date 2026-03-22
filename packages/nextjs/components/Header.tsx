"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, CubeTransparentIcon, QueueListIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

const githubRepoUrl = "https://github.com/botnotstrawberry/prisoners-daolemma";

type HeaderMenuLink = {
  label: string;
  href: string;
  external?: boolean;
  icon?: React.ReactNode;
};

const navLinkClass = (isActive: boolean) =>
  `grid grid-flow-col items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-primary text-primary-content shadow-md"
      : "hover:bg-secondary focus:!bg-secondary active:!text-neutral"
  }`;

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "How to Play",
    href: "/#how-it-works",
    icon: <SparklesIcon className="h-4 w-4" />,
  },
  {
    label: "Game Data",
    href: "/games",
    icon: <QueueListIcon className="h-4 w-4" />,
  },
  {
    label: "Contracts",
    href: "/debug",
    icon: <CubeTransparentIcon className="h-4 w-4" />,
  },
  {
    label: "GitHub",
    href: githubRepoUrl,
    external: true,
  },
];

const HomeLink = () => {
  const pathname = usePathname();
  const isActive = pathname === "/";

  return (
    <Link href="/" passHref className={`${navLinkClass(isActive)} shrink-0`}>
      <span className="inline-flex min-w-9 items-center justify-center rounded-full border border-base-content/10 bg-base-100 px-2 py-1 text-[0.65rem] font-black tracking-tight text-base-content shadow-sm">
        PD
      </span>
      <span className="font-medium">Home</span>
    </Link>
  );
};

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon, external }) => {
        const isActive = !external && (pathname === href || (href !== "/" && pathname.startsWith(href)));
        const className = navLinkClass(isActive);

        return (
          <li key={href}>
            {external ? (
              <a href={href} target="_blank" rel="noreferrer" className={className}>
                {icon}
                <span>{label}</span>
              </a>
            ) : (
              <Link href={href} passHref className={className}>
                {icon}
                <span>{label}</span>
              </Link>
            )}
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

          <HomeLink />

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
