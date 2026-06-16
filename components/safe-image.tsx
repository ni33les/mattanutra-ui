"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type SafeImageProps = Omit<ImageProps, "alt" | "src"> & Readonly<{
  alt: string;
  fallback?: ReactNode;
  src?: string | null;
}>;

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

  useEffect(() => {
    setFailedSrc(null);
  }, [normalizedSrc]);

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
      unoptimized={unoptimized ?? normalizedSrc.startsWith("/")}
      {...imageProps}
    />
  );
}
