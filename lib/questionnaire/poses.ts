const POSE_FILES: Record<string, string> = {
  ask: "nong-ask.webp",
  bloated: "nong-bloated.webp",
  celebrate: "nong-celebrate.webp",
  coffee: "nong-coffee.webp",
  comparing: "nong-comparing.webp",
  energetic: "nong-energetic.webp",
  explaining: "nong-explaining.webp",
  measuring: "nong-measuring.webp",
  money: "nong-money.webp",
  muscular: "nong-muscular.webp",
  open: "nong-open.webp",
  reassuring: "nong-reassuring.webp",
  thinking: "nong-thinking.webp",
  vegan: "nong-vegan.webp",
  warning: "nong-warning.webp",
  stressed: "nong-stressed.webp"
};

const DEFAULT_POSE = "open";

export function nongPoseSrc(pose: string | undefined | null): string {
  const key = (pose || DEFAULT_POSE).toLowerCase();
  const file = POSE_FILES[key] ?? POSE_FILES[DEFAULT_POSE];

  return `/assets/library/nong/${file}`;
}

export function knownPoses(): readonly string[] {
  return Object.keys(POSE_FILES);
}
