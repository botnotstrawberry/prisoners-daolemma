import { DebugContracts } from "./_components/DebugContracts";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Developer Debug",
  description: "Developer-facing contract interaction surface for Prisoners DAOlemma.",
});

const Debug: NextPage = () => {
  return (
    <>
      <DebugContracts />
      <div className="mt-8 bg-secondary p-10 text-center">
        <h1 className="my-0 text-4xl">Developer Debug</h1>
        <p className="text-neutral">
          Use this surface to inspect the current deployment, exercise admin flows, and verify the game state machine.
        </p>
      </div>
    </>
  );
};

export default Debug;
