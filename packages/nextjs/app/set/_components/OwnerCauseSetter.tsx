"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Address, Hex, isAddress, isAddressEqual } from "viem";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const truncateHex = (value?: string) => {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
};

const isBytes32 = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value.trim());

type CauseCardProps = {
  causeId: number;
  active?: boolean;
  recipient?: string;
  metadataHash?: string;
  onLoad: (causeId: number, recipient?: string, metadataHash?: string) => void;
};

const CauseCard = ({ causeId, active, recipient, metadataHash, onLoad }: CauseCardProps) => {
  return (
    <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Cause Slot</p>
          <p className="mt-2 text-2xl font-semibold">#{causeId}</p>
        </div>
        <span className={`badge ${active ? "badge-success" : "badge-ghost"}`}>{active ? "Active" : "Unset"}</span>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="font-medium opacity-70">Recipient</p>
          <p className="mt-1 break-all rounded-2xl bg-base-200 px-3 py-2 font-mono text-xs">{recipient || "—"}</p>
        </div>
        <div>
          <p className="font-medium opacity-70">Metadata Hash</p>
          <p className="mt-1 break-all rounded-2xl bg-base-200 px-3 py-2 font-mono text-xs">
            {metadataHash || ZERO_HASH}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-outline btn-sm mt-4 rounded-full"
        onClick={() => onLoad(causeId, recipient, metadataHash)}
      >
        Load into form
      </button>
    </div>
  );
};

export const OwnerCauseSetter = () => {
  const { address: connectedAddress, isConnected } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: contractLoading } = useDeployedContractInfo({
    contractName: "PrisonersDAOlemma",
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PrisonersDAOlemma" });

  const [causeIdInput, setCauseIdInput] = useState("1");
  const [recipientInput, setRecipientInput] = useState("");
  const [metadataHashInput, setMetadataHashInput] = useState(ZERO_HASH);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedTxHash, setSubmittedTxHash] = useState<Hex | null>(null);

  const selectedCauseId = useMemo(() => {
    const trimmed = causeIdInput.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) return null;
    return BigInt(parsed);
  }, [causeIdInput]);

  const recipient = recipientInput.trim();
  const metadataHash = metadataHashInput.trim();
  const isRecipientValid = isAddress(recipient);
  const isMetadataHashValid = isBytes32(metadataHash);

  const { data: owner } = useScaffoldReadContract({
    contractName: "PrisonersDAOlemma",
    functionName: "owner",
  });

  const { data: causeCount } = useScaffoldReadContract({
    contractName: "PrisonersDAOlemma",
    functionName: "causeCount",
  });

  const { data: selectedCause } = useScaffoldReadContract({
    contractName: "PrisonersDAOlemma",
    functionName: "getCause",
    args: [selectedCauseId ?? 0n],
    query: {
      enabled: selectedCauseId !== null,
    },
  });

  const { data: causeOne } = useScaffoldReadContract({
    contractName: "PrisonersDAOlemma",
    functionName: "getCause",
    args: [1n],
  });

  const { data: causeTwo } = useScaffoldReadContract({
    contractName: "PrisonersDAOlemma",
    functionName: "getCause",
    args: [2n],
  });

  const connectedIsOwner = Boolean(connectedAddress && owner && isAddressEqual(connectedAddress, owner as Address));
  const blockExplorerUrl = targetNetwork.blockExplorers?.default?.url;
  const contractAddressUrl = blockExplorerUrl && deployedContractData?.address
    ? `${blockExplorerUrl}/address/${deployedContractData.address}`
    : undefined;
  const txUrl = blockExplorerUrl && submittedTxHash ? `${blockExplorerUrl}/tx/${submittedTxHash}` : undefined;

  const loadCause = (causeId: number, nextRecipient?: string, nextMetadataHash?: string) => {
    setCauseIdInput(String(causeId));
    setRecipientInput(nextRecipient && isAddress(nextRecipient) ? nextRecipient : "");
    setMetadataHashInput(nextMetadataHash && isBytes32(nextMetadataHash) ? (nextMetadataHash as Hex) : ZERO_HASH);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmittedTxHash(null);

    if (selectedCauseId === null) {
      setSubmitError("Cause ID must be an integer from 1 to 65535.");
      return;
    }

    if (!isRecipientValid) {
      setSubmitError("Recipient must be a valid 0x address.");
      return;
    }

    if (!isMetadataHashValid) {
      setSubmitError("Metadata hash must be a full bytes32 hex string.");
      return;
    }

    try {
      const txHash = await writeContractAsync({
        functionName: "whitelistCause",
        args: [selectedCauseId, recipient as Address, metadataHash as Hex],
      });

      if (txHash) {
        setSubmittedTxHash(txHash as Hex);
      }
    } catch (error: any) {
      setSubmitError(error?.shortMessage || error?.message || "Transaction failed.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-warning/40 bg-warning/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Hidden owner tool</p>
        <h2 className="mt-3 text-3xl font-bold">/set</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 opacity-80">
          This page is intentionally unlinked. Connect the owner wallet on {targetNetwork.name} and call
          <span className="mx-2 rounded-full bg-base-100 px-3 py-1 font-mono text-sm shadow-sm">
            whitelistCause(causeId, recipient, metadataHash)
          </span>
          to update donation recipients.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Network</p>
          <p className="mt-3 text-lg font-semibold">{targetNetwork.name}</p>
        </div>

        <div className="rounded-3xl bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Contract</p>
          {contractLoading ? (
            <p className="mt-3 text-sm opacity-70">Loading contract…</p>
          ) : contractAddressUrl ? (
            <a
              href={contractAddressUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all font-mono text-sm text-primary hover:opacity-80"
            >
              {deployedContractData?.address}
            </a>
          ) : (
            <p className="mt-3 text-sm text-error">Contract not found on selected chain.</p>
          )}
        </div>

        <div className="rounded-3xl bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Owner</p>
          <p className="mt-3 break-all font-mono text-sm">{owner || "Loading…"}</p>
        </div>

        <div className="rounded-3xl bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Connected wallet</p>
          <p className="mt-3 break-all font-mono text-sm">{connectedAddress || "Not connected"}</p>
          <span className={`badge mt-3 ${connectedIsOwner ? "badge-success" : "badge-ghost"}`}>
            {connectedIsOwner ? "Owner connected" : "Owner not connected"}
          </span>
        </div>
      </div>

      <div className="rounded-[2rem] bg-base-100 p-6 shadow-xl md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] opacity-60">Current slots</p>
            <h3 className="mt-2 text-2xl font-bold">Quick load cause slots</h3>
          </div>
          <p className="text-sm opacity-70">Current cause count: {causeCount !== undefined ? causeCount.toString() : "…"}</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <CauseCard
            causeId={1}
            active={causeOne?.active}
            recipient={causeOne?.recipient}
            metadataHash={causeOne?.metadataHash}
            onLoad={loadCause}
          />
          <CauseCard
            causeId={2}
            active={causeTwo?.active}
            recipient={causeTwo?.recipient}
            metadataHash={causeTwo?.metadataHash}
            onLoad={loadCause}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="rounded-[2rem] bg-base-100 p-6 shadow-xl md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] opacity-60">Owner write</p>
              <h3 className="mt-2 text-2xl font-bold">Set donation recipient</h3>
            </div>
            <button type="button" className="btn btn-ghost btn-sm rounded-full" onClick={() => setMetadataHashInput(ZERO_HASH)}>
              Zero metadata hash
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <label className="form-control w-full">
              <div className="label px-0 pb-2">
                <span className="label-text font-medium">Cause ID</span>
              </div>
              <input
                type="number"
                min={1}
                max={65535}
                inputMode="numeric"
                className="input input-bordered w-full"
                value={causeIdInput}
                onChange={event => setCauseIdInput(event.target.value)}
                placeholder="1"
              />
            </label>

            <label className="form-control w-full">
              <div className="label px-0 pb-2">
                <span className="label-text font-medium">Recipient address</span>
              </div>
              <input
                type="text"
                className={`input input-bordered w-full font-mono text-sm ${recipientInput && !isRecipientValid ? "input-error" : ""}`}
                value={recipientInput}
                onChange={event => setRecipientInput(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>

            <label className="form-control w-full">
              <div className="label px-0 pb-2">
                <span className="label-text font-medium">Metadata hash (bytes32)</span>
              </div>
              <input
                type="text"
                className={`input input-bordered w-full font-mono text-sm ${metadataHashInput && !isMetadataHashValid ? "input-error" : ""}`}
                value={metadataHashInput}
                onChange={event => setMetadataHashInput(event.target.value)}
                placeholder={ZERO_HASH}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
          </div>

          {submitError ? (
            <div className="alert alert-error mt-5 text-sm">
              <span>{submitError}</span>
            </div>
          ) : null}

          {submittedTxHash && txUrl ? (
            <div className="alert alert-success mt-5 text-sm">
              <span>
                Submitted. <a href={txUrl} target="_blank" rel="noreferrer" className="font-medium underline">View tx</a>
              </span>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="btn btn-primary rounded-full px-6"
              disabled={!isConnected || !connectedIsOwner || !isRecipientValid || !isMetadataHashValid || selectedCauseId === null || isMining}
            >
              {isMining ? "Submitting…" : "Write whitelistCause"}
            </button>
            <span className="text-sm opacity-70">
              {connectedIsOwner ? "Owner wallet ready." : "Connect the owner wallet to enable writes."}
            </span>
          </div>
        </form>

        <div className="rounded-[2rem] bg-base-100 p-6 shadow-xl md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] opacity-60">Selected slot</p>
          <h3 className="mt-2 text-2xl font-bold">Current onchain state</h3>

          <div className="mt-6 space-y-4 text-sm">
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-medium opacity-70">Cause ID</p>
              <p className="mt-1 font-mono">{selectedCauseId ? selectedCauseId.toString() : "Invalid"}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-medium opacity-70">Active</p>
              <p className="mt-1">{selectedCause ? (selectedCause.active ? "true" : "false") : "—"}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-medium opacity-70">Recipient</p>
              <p className="mt-1 break-all font-mono text-xs">{selectedCause?.recipient || "—"}</p>
            </div>
            <div className="rounded-2xl bg-base-200 p-4">
              <p className="font-medium opacity-70">Metadata Hash</p>
              <p className="mt-1 break-all font-mono text-xs">{selectedCause?.metadataHash || ZERO_HASH}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-base-300 p-4 text-sm leading-7 opacity-80">
            <p>
              The connected wallet must match <span className="font-mono">owner()</span> or the transaction will revert.
            </p>
            <p className="mt-3">
              Suggested flow: load slot 1 or 2, paste the recipient wallet, keep metadata hash at zero unless you explicitly
              want a non-zero bytes32, then submit.
            </p>
            <p className="mt-3">
              Preview: <span className="font-mono">{truncateHex(recipient || selectedCause?.recipient)}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
