"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { firstPartyImageHosts } from "@/lib/first-party-image-rules";

type SafeImageProps = Omit<ImageProps, "alt" | "src"> & Readonly<{
  alt: string;
  fallback?: ReactNode;
  retryDelaysMs?: readonly number[];
  src?: string | null;
}>;

const nextOptimizedImageHosts = new Set<string>(firstPartyImageHosts);
const defaultRetryDelaysMs = [750, 2000, 5000] as const;

function normalizeImageSrc(src: string | null | undefined) {
  const value = src?.trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  if (value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("http://")) {
    return `https://${value.slice("http://".length)}`;
  }

  return null;
}

function canUseNextImageOptimizer(src: string) {
  if (src.startsWith("/uploads/")) {
    return false;
  }

  if (src.startsWith("/")) {
    return true;
  }

  try {
    return nextOptimizedImageHosts.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

export function SafeImage({
  alt,
  fallback = null,
  onError,
  onLoad,
  retryDelaysMs = defaultRetryDelaysMs,
  src,
  unoptimized,
  ...imageProps
}: SafeImageProps) {
  const normalizedSrc = normalizeImageSrc(src);
  const [failure, setFailure] = useState<{
    attempts: number;
    final: boolean;
    retryToken: number;
    src: string;
    waiting: boolean;
  } | null>(null);

  useEffect(() => {
    if (
      !normalizedSrc ||
      !failure ||
      failure.src !== normalizedSrc ||
      failure.final ||
      !failure.waiting
    ) {
      return;
    }

    const delayMs = retryDelaysMs[failure.attempts - 1];

    if (delayMs === undefined) {
      return;
    }

    const timeout = setTimeout(() => {
      setFailure((current) =>
        current?.src === normalizedSrc &&
        current.attempts === failure.attempts
          ? {
              ...current,
              retryToken: current.retryToken + 1,
              waiting: false,
            }
          : current,
      );
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [failure, normalizedSrc, retryDelaysMs]);

  const activeFailure = failure?.src === normalizedSrc ? failure : null;

  if (!normalizedSrc || activeFailure?.final) {
    return fallback;
  }

  return (
    <Image
      alt={alt}
      key={`${normalizedSrc}:${activeFailure?.retryToken ?? 0}`}
      onError={(event) => {
        onError?.(event);
        setFailure((current) => {
          const attempts =
            current?.src === normalizedSrc ? current.attempts + 1 : 1;
          const final = attempts > retryDelaysMs.length;

          return {
            attempts,
            final,
            retryToken: current?.src === normalizedSrc ? current.retryToken : 0,
            src: normalizedSrc,
            waiting: !final,
          };
        });
      }}
      onLoad={(event) => {
        setFailure(null);
        onLoad?.(event);
      }}
      src={normalizedSrc}
      unoptimized={unoptimized ?? !canUseNextImageOptimizer(normalizedSrc)}
      {...imageProps}
    />
  );
}
