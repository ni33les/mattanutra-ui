import { notFound } from "next/navigation";
import { ConnectPage } from "@/components/connect-page";
import { connectCopy } from "@/lib/connect-copy";
import { connectProviders, isConnectProvider, providerNames } from "@/lib/connect";
import { isLocale, locales } from "@/lib/i18n";
import { localizedMetadata } from "@/lib/seo";
import "../connect.css";
type Props = { params: Promise<{ locale: string; provider: string }> };
export const revalidate = 3600;
export function generateStaticParams() { return locales.flatMap(locale => connectProviders.map(provider => ({ locale, provider }))); }
export async function generateMetadata({ params }: Props) {
  const { locale, provider } = await params; if (!isLocale(locale) || !isConnectProvider(provider)) notFound();
  return localizedMetadata({ locale, path: `/connect/${provider}`, title: `${connectCopy[locale].guideTitle} ${providerNames[provider]}`,
    description: connectCopy[locale].guides[provider].intro, image: `/connect/share-${locale}.png`, imageAlt: connectCopy[locale].title });
}
export default async function Page({ params }: Props) {
  const { locale, provider } = await params; if (!isLocale(locale) || !isConnectProvider(provider)) notFound();
  return <ConnectPage locale={locale} provider={provider} />;
}
