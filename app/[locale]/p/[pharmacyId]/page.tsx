import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AssessmentFlow } from "@/components/assessment-flow";
import { ChatQuestionnaire } from "@/components/chat-questionnaire/chat-questionnaire";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import { checkDatabaseConnection } from "@/lib/db";
import { devShortcutsEnabledForHost } from "@/lib/dev-shortcuts";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import { nutritionPharmacyPath } from "@/lib/nutrition-paths";
import {
  pharmacyIdFromParam,
  resolvePharmacyOrganisation
} from "@/lib/pharmacy-in-store";

function chatQuestionnaireEnabled(locale: Locale) {
  const flag =
    process.env.NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V6 ??
    process.env.NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5;
  if (flag === "0" || flag === "false") {
    return false;
  }

  return locale === "en" || locale === "th" || locale === "zh-CN";
}

type PharmacyInStorePageProps = Readonly<{
  params: Promise<{
    locale: string;
    pharmacyId: string;
  }>;
}>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: PharmacyInStorePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return {
    robots: {
      follow: false,
      index: false
    },
    title: t(locale, "customer.pharmacyInStore.invalidTitle")
  };
}

export default async function PharmacyInStorePage({
  params
}: PharmacyInStorePageProps) {
  const { locale: rawLocale, pharmacyId: rawPharmacyId } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const pharmacyId = pharmacyIdFromParam(rawPharmacyId);
  const currentPath = nutritionPharmacyPath(locale, pharmacyId || rawPharmacyId);
  const requestHeaders = await headers();
  const showDevShortcut = devShortcutsEnabledForHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  );
  const databaseReady = await checkDatabaseConnection();

  if (!databaseReady) {
    return (
      <main className="mn-customer-shell mn-customer-shell--quiz flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
          variant="quiz"
        />
        <ServiceIssue href={currentPath} locale={locale} />
      </main>
    );
  }

  const pharmacy = pharmacyId
    ? await resolvePharmacyOrganisation(pharmacyId)
    : null;

  if (!pharmacy) {
    return (
      <main className="mn-customer-shell mn-customer-shell--quiz flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
          variant="quiz"
        />
        <section className="flex flex-1 items-center justify-center px-6 py-20 sm:px-8">
          <div className="mx-auto w-full max-w-2xl rounded-[var(--mn-radius-lg)] bg-[var(--mn-paper)] p-8 text-center shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-12">
            <h1 className="mn-hero-title text-4xl font-semibold tracking-normal text-[var(--brand-navy)] text-balance sm:text-5xl">
              {t(locale, "customer.pharmacyInStore.invalidTitle")}
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--mn-ink-soft)]">
              {t(locale, "customer.pharmacyInStore.invalidBody")}
            </p>
            <a
              className="mt-8 inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white"
              href={`/${locale}`}
            >
              {t(locale, "customer.pharmacyInStore.homeCta")}
            </a>
          </div>
        </section>
      </main>
    );
  }

  const useChat = chatQuestionnaireEnabled(locale);

  return (
    <main className="mn-customer-shell mn-customer-shell--quiz flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={nutritionPharmacyPath(locale, pharmacy.slug)}
        title={dictionary.hero.eyebrow}
        variant="quiz"
      />
      {useChat ? (
        <ChatQuestionnaire
          locale={locale}
          pharmacyId={pharmacy.slug}
          showDevShortcut={showDevShortcut}
          skipHealthScore
        />
      ) : (
        <AssessmentFlow
          initialStage="quiz"
          locale={locale}
          pharmacyId={pharmacy.slug}
          showDevShortcut={showDevShortcut}
          skipHealthScore
        />
      )}
    </main>
  );
}
