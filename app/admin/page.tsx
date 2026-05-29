import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminAliasPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function AdminAliasPage({
  searchParams
}: AdminAliasPageProps) {
  const query = await searchParams;
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  });

  redirect(`/en/admin/dashboard${params.size > 0 ? `?${params.toString()}` : ""}`);
}
