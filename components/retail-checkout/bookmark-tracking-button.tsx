"use client";

import { useEffect, useState } from "react";
import { Bookmark, Copy, X } from "lucide-react";

type BookmarkTrackingButtonProps = Readonly<{
  copyLinkLabel: string;
  copiedLabel: string;
  hintDesktop: string;
  hintMobile: string;
  label: string;
}>;

function isApplePlatform() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function isMobileUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function tryLegacyBookmark(title: string, url: string) {
  const browser = window as Window & {
    external?: { AddFavorite?: (href: string, title: string) => void };
    sidebar?: { addPanel?: (title: string, url: string, unused: string) => void };
  };

  try {
    if (typeof browser.sidebar?.addPanel === "function") {
      browser.sidebar.addPanel(title, url, "");
      return true;
    }
  } catch {
    // Ignore legacy failures and fall through to instructions.
  }

  try {
    if (typeof browser.external?.AddFavorite === "function") {
      browser.external.AddFavorite(url, title);
      return true;
    }
  } catch {
    // Ignore legacy failures and fall through to instructions.
  }

  return false;
}

export function BookmarkTrackingButton({
  copyLinkLabel,
  copiedLabel,
  hintDesktop,
  hintMobile,
  label
}: BookmarkTrackingButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState(hintDesktop);

  useEffect(() => {
    setHint(isMobileUserAgent() ? hintMobile : hintDesktop);
  }, [hintDesktop, hintMobile]);

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function onBookmarkClick() {
    const url = window.location.href;
    const title = document.title || "MattaNutra order tracking";
    const legacy = await tryLegacyBookmark(title, url);

    if (legacy) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }

  return (
    <div className="relative flex flex-col items-stretch gap-2 sm:items-end">
      <button
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mn-teal)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--mn-teal-deep)]"
        onClick={() => {
          void onBookmarkClick();
        }}
        type="button"
      >
        <Bookmark aria-hidden className="size-4" />
        {label}
      </button>

      {open ? (
        <div
          className="z-10 w-full max-w-sm rounded-xl bg-[var(--mn-paper)] p-4 text-left shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:absolute sm:right-0 sm:top-full sm:mt-2"
          role="dialog"
          aria-label={label}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-6 text-[var(--mn-ink)]">
              {hint.replace("{shortcut}", isApplePlatform() ? "⌘D" : "Ctrl+D")}
            </p>
            <button
              aria-label="Close"
              className="rounded-full p-1 text-[var(--mn-ash)] transition hover:bg-[var(--mn-cream)] hover:text-[var(--mn-ink)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-[var(--mn-ink-soft)]">
            {typeof window !== "undefined" ? window.location.href : ""}
          </p>
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--mn-line)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--mn-ink)] transition hover:bg-[var(--mn-cream)]"
            onClick={() => {
              void copyLink();
            }}
            type="button"
          >
            <Copy aria-hidden className="size-4" />
            {copied ? copiedLabel : copyLinkLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
