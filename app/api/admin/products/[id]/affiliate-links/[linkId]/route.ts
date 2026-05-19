import { DELETE as deleteProductOffer } from "@/app/api/admin/products/[id]/offers/[offerId]/route";

export const runtime = "nodejs";

type ProductOfferCompatibilityRouteProps = Readonly<{
  params: Promise<{
    id: string;
    linkId: string;
  }>;
}>;

export async function DELETE(
  request: Request,
  { params }: ProductOfferCompatibilityRouteProps
) {
  const { id, linkId } = await params;

  return deleteProductOffer(request, {
    params: Promise.resolve({
      id,
      offerId: linkId
    })
  });
}
