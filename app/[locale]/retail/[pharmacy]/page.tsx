import { redirect, notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { pharmacyPath } from "@/lib/pharmacy-journey";
export default async function PharmacyEntry({ params }: { params: Promise<{ locale: string; pharmacy: string }> }) {
  const { locale, pharmacy } = await params;
  if (!isLocale(locale)) notFound();
  redirect(pharmacyPath(locale, pharmacy, "landing"));
}
