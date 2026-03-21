"use client";

import { useState } from "react";

type DownloadFile = {
  path: string;
  name: string;
};

type DownloadGameBundleButtonProps = {
  slug: string;
  files: DownloadFile[];
};

export const DownloadGameBundleButton = ({ slug, files }: DownloadGameBundleButtonProps) => {
  const [downloading, setDownloading] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-primary rounded-full"
      disabled={downloading}
      onClick={async () => {
        setDownloading(true);
        try {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          await Promise.all(
            files.map(async file => {
              const response = await fetch(file.path);
              if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);
              const text = await response.text();
              zip.file(file.name, text);
            }),
          );

          const blob = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${slug}-dataset.zip`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        } finally {
          setDownloading(false);
        }
      }}
    >
      {downloading ? "Preparing dataset…" : "Download complete game bundle (.zip)"}
    </button>
  );
};
