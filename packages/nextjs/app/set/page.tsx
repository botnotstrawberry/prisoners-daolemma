import type { Metadata, NextPage } from "next";
import { OwnerCauseSetter } from "./_components/OwnerCauseSetter";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata: Metadata = {
  ...getMetadata({
    title: "Set Donation Addresses",
    description: "Hidden owner-only maintenance page for setting Prisoners DAOlemma cause recipients.",
  }),
  robots: {
    index: false,
    follow: false,
  },
};

const SetPage: NextPage = async () => {
  return (
    <div className="flex grow flex-col bg-base-200">
      <section className="px-6 py-12 md:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <OwnerCauseSetter />
        </div>
      </section>
    </div>
  );
};

export default SetPage;
