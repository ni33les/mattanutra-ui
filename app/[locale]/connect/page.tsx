import { notFound } from "next/navigation";
import { ConnectPage } from "@/components/connect-page";
import { connectCopy } from "@/lib/connect-copy";
import { isLocale, locales } from "@/lib/i18n";
import { localizedMetadata } from "@/lib/seo";
import "./connect.css";
type Props = { params: Promise<{ locale: string }> };
export const revalidate = 3600;
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: Props) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return localizedMetadata({ locale, path: "/connect", title: connectCopy[locale].title, description: connectCopy[locale].description,
    image: `/connect/share-${locale}.png`, imageAlt: connectCopy[locale].title });
}
export default async function Page({ params }: Props) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return <ConnectPage locale={locale} />;
}
