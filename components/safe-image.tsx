"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { useState } from "react";

type SafeImageProps = Omit<ImageProps, "alt" | "src"> & Readonly<{
  alt: string;
  fallback?: ReactNode;
  src?: string | null;
}>;

const nextOptimizedImageHosts = new Set([
  "dev.mattanutra.com",
  "uat.mattanutra.com",
  "mattanutra.com",
  "www.mattanutra.com",
  "images.contentstack.io",
  "images.unsplash.com",
  "swisse.co.th",
  "www.blackmores.co.th",
  "www.dhc.co.jp",
  "www.megawecare.co.th",
  "cdn.megawecare.com",
  "i0.wp.com",
  "www.vistra.co.th"
]);

function normalizeImageSrc(src: string | null | undefined) {
  const value = src?.trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("https://www.megawecare.co.th/wp-content/uploads/")) {
    const separator = value.includes("?") ? "&" : "?";

    return value.replace(
      "https://www.megawecare.co.th/wp-content/uploads/",
      "https://i0.wp.com/www.megawecare.co.th/wp-content/uploads/"
    ) + `${separator}ssl=1`;
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
  src,
  unoptimized,
  ...imageProps
}: SafeImageProps) {
  const normalizedSrc = normalizeImageSrc(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!normalizedSrc || failedSrc === normalizedSrc) {
    return fallback;
  }

  return (
    <Image
      alt={alt}
      onError={(event) => {
        onError?.(event);
        setFailedSrc(normalizedSrc);
      }}
      src={normalizedSrc}
      unoptimized={unoptimized ?? !canUseNextImageOptimizer(normalizedSrc)}
      {...imageProps}
    />
  );
}
