export type ProductBasketProduct = Readonly<{
  id: string;
  imageUrl: string | null;
  name: string;
}>;

export type ProductBasketQuoteLine = Readonly<{
  availabilityStatus: string;
  currency: string | null;
  etaDate: string | null;
  payable: boolean;
  productId: string;
  quantityRequested: number;
  reason: string;
  selectedRetailerName: string | null;
  unitPriceAmount: number | null;
}>;

export type ProductBasketQuotePreview = Readonly<{
  canCheckout: boolean;
  cannotDeliver?: boolean;
  cannotDeliverMessage?: string;
  currency: string | null;
  etaDate: string | null;
  lines: ProductBasketQuoteLine[];
  selectedRetailer: {
    organisationId: string;
    organisationName: string;
  } | null;
  shippingAmount: number;
  shippingSource?: string | null;
  subtotalAmount: number;
  totalAmount: number;
  unavailableLines: ProductBasketQuoteLine[];
}>;
