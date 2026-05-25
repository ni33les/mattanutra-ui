export type CanonicalSupplementOption = Readonly<{
  aliases: string[];
  category: string;
  id: string;
  listStatus: string;
  maxAmount: number | null;
  maxUnit: string | null;
  name: string;
  normalizedName: string;
  safetyFlags: string[];
  safetyNotes: string | null;
}>;
