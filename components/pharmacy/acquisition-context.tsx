import type { ReactNode } from "react";
import type { PharmacyAcquisition } from "@/lib/pharmacy-acquisition";
/** SSR context is available before browser tracking effects, including with storage blocked. */
export function PharmacyAcquisitionContext({ slug, acquisition, children }: {
  slug: string; acquisition: PharmacyAcquisition; children: ReactNode;
}) {
  return <div className="contents" data-pharmacy-source={acquisition.source} data-pharmacy-ray={acquisition.ray} data-pharmacy-slug={slug}>{children}</div>;
}
