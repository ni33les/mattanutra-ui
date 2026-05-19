import { POST as postProductClick } from "@/app/api/products/click/route";

export const runtime = "nodejs";

export function POST(...args: Parameters<typeof postProductClick>) {
  return postProductClick(...args);
}
