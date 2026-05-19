import { POST as postProductOffer } from "@/app/api/admin/products/[id]/offers/route";

export const runtime = "nodejs";

export function POST(...args: Parameters<typeof postProductOffer>) {
  return postProductOffer(...args);
}
