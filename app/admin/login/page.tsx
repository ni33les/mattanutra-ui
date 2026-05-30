import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminLoginAliasPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function AdminLoginAliasPage({
  searchParams
}: AdminLoginAliasPageProps) {
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

  redirect(`/en/admin/login${params.size > 0 ? `?${params.toString()}` : ""}`);
}
