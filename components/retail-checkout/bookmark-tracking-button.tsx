"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";

type BookmarkTrackingButtonProps = Readonly<{
  copiedLabel: string;
  label: string;
}>;

export function BookmarkTrackingButton({
  copiedLabel,
  label
}: BookmarkTrackingButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mn-teal)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--mn-teal-deep)]"
      onClick={async () => {
        await navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      }}
      type="button"
    >
      <Bookmark aria-hidden className="size-4" />
      {copied ? copiedLabel : label}
    </button>
  );
}
