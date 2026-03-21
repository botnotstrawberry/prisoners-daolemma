"use client";

import { useRouter } from "next/navigation";

type GameJumpSelectProps = {
  currentSlug: string;
  options: Array<{ slug: string; title: string }>;
};

export const GameJumpSelect = ({ currentSlug, options }: GameJumpSelectProps) => {
  const router = useRouter();

  return (
    <label className="form-control w-full max-w-xs">
      <span className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-60">Jump to any game</span>
      <select
        className="select select-bordered rounded-2xl"
        value={currentSlug}
        onChange={event => {
          router.push(`/games/${event.target.value}`);
        }}
      >
        {options.map(option => (
          <option key={option.slug} value={option.slug}>
            {option.title}
          </option>
        ))}
      </select>
    </label>
  );
};
