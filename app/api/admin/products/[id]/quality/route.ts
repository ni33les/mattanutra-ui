import { POST as postProductValidation } from "@/app/api/admin/products/[id]/validation/route";

export const runtime = "nodejs";

export function POST(...args: Parameters<typeof postProductValidation>) {
  return postProductValidation(...args);
}
