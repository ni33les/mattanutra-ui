import { randomUUID } from "node:crypto";
import { redirect, notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { isUuid } from "@/lib/assessment-store";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { pharmacySource } from "@/lib/pharmacy-acquisition";
export default async function PharmacyEntry({ params, searchParams }: {
  params: Promise<{ locale: string; pharmacy: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, pharmacy } = await params, query = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(pharmacyPath(locale, pharmacy, "landing", { ...query,
    session: isUuid(query.session ?? "") ? query.session : randomUUID(), source: pharmacySource(query.source) }));
}
