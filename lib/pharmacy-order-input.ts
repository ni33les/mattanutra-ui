import { FunnelError } from "@/lib/funnel-errors";

export type PharmacyOrderProduct = Readonly<{
  productId: string; name: string; quantity: number; unitPrice: number; currency: string; imageUrl: string | null;
}>;

export function preparePharmacyOrder(input: { customerName: unknown; productIds: unknown }, available: readonly PharmacyOrderProduct[]) {
  const customerName = typeof input.customerName === "string" ? input.customerName.trim() : "";
  if (!customerName || customerName.length > 120) throw new FunnelError("Enter a name or nickname (up to 120 characters)", 400, "invalid_customer_name");
  const ids = input.productIds;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) {
    throw new FunnelError("Choose products from this recommendation", 400, "invalid_products");
  }
  const lines = ids.map(id => {
    const product = available.find(p => p.productId === id);
    if (!product) throw new FunnelError("Product is not in this recommendation", 409, "stale_product_selection");
    if (!Number.isSafeInteger(product.quantity) || product.quantity <= 0 || !Number.isFinite(product.unitPrice) || product.unitPrice <= 0) {
      throw new FunnelError("Product price or quantity is unavailable", 409, "commercial_facts_changed");
    }
    return product;
  });
  const currency = lines[0].currency;
  if (lines.some(p => p.currency !== currency)) throw new FunnelError("Product currencies do not agree", 409, "commercial_facts_changed");
  const minor = lines.reduce((sum, p) => sum + Math.round(p.unitPrice * 100) * p.quantity, 0);
  if (!Number.isSafeInteger(minor)) throw new FunnelError("Order total is invalid", 400, "invalid_total");
  return { customerName, currency, lines, total: minor / 100 };
}
