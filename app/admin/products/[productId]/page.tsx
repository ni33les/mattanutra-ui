import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminProductDetailRedirectPageProps = Readonly<{
  params: Promise<{
    productId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function AdminProductDetailRedirectPage({
  params,
  searchParams
}: AdminProductDetailRedirectPageProps) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const urlParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => urlParams.append(key, item));
      return;
    }

    if (value !== undefined) {
      urlParams.set(key, value);
    }
  });

  redirect(`/en/admin/products/${productId}${urlParams.size > 0 ? `?${urlParams.toString()}` : ""}`);
}
