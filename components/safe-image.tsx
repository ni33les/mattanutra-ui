import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";

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

  if (
    value.startsWith("/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  ) {
    return value;
  }

  return null;
}

export function SafeImage({
  alt,
  fallback = null,
  src,
  unoptimized,
  ...imageProps
}: SafeImageProps) {
  const normalizedSrc = normalizeImageSrc(src);

  if (!normalizedSrc) {
    return fallback;
  }

  return (
    <Image
      alt={alt}
      src={normalizedSrc}
      unoptimized={unoptimized ?? normalizedSrc.startsWith("/")}
      {...imageProps}
    />
  );
}
