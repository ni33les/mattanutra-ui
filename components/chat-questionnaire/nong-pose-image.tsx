"use client";

import { SafeImage } from "@/components/safe-image";
import { nongPoseSrc } from "@/lib/questionnaire/poses";

export function NongPoseImage({
  alt = "",
  className,
  height,
  pose,
  width
}: Readonly<{
  alt?: string;
  className?: string;
  height: number;
  pose: string | undefined | null;
  width: number;
}>) {
  return (
    <SafeImage
      alt={alt}
      className={className}
      height={height}
      src={nongPoseSrc(pose)}
      width={width}
    />
  );
}
