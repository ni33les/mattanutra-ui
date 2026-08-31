export const ONLY_APPROVED_PLATFORM_PRODUCTS_MAY_BE_SELECTED =
  "Only approved platform products can be selected for retail";

export function productIsApprovedForRetail(status: string | null | undefined) {
  return status === "approved";
}

export function listingIsSelected(status: string | null | undefined) {
  return status === "active";
}

export function listingIsAvailable(input: Readonly<{
  listingStatus: string | null | undefined;
  productStatus: string | null | undefined;
}>) {
  return (
    productIsApprovedForRetail(input.productStatus) &&
    listingIsSelected(input.listingStatus)
  );
}

export function productIsUnselectedForRetail(input: Readonly<{
  listingStatus: string | null | undefined;
  productStatus: string | null | undefined;
}>) {
  return (
    productIsApprovedForRetail(input.productStatus) &&
    !listingIsSelected(input.listingStatus)
  );
}
