import { SafeImage } from "@/components/safe-image";

/** The same Nong guide accompanies preparation in the pharmacy and on the web. */
export function PharmacyGuide() {
  return <div className="mn-guide" aria-hidden="true">
    {(["thinking", "comparing", "celebrate"] as const).map(pose => <SafeImage key={pose}
      className={`mn-guide-${pose}`} src={`/assets/library/nong/nong-${pose === "celebrate" ? "energetic" : pose}.webp`}
      alt="" width={74} height={78} />)}
  </div>;
}
