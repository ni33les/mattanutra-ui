import type { ReactNode } from "react";

// Pharmacy entry pages immediately redirect into the chosen locale's layout.
export default function PharmacyEntryLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
