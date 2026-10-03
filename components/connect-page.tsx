import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TitleBar } from "@/components/title-bar";
import { ConnectActions, ConnectProviderCards, ConnectVisit } from "@/components/connect-journey";
import { connectCopy, providerSetup } from "@/lib/connect-copy";
import { providerNames, type ConnectProvider } from "@/lib/connect";
import type { Locale } from "@/lib/i18n";
import { siteBaseUrl } from "@/lib/site-url";
import { ConnectCampaignLink } from "@/components/connect-campaign-link";

export function ConnectPage({ locale, provider }: { locale: Locale; provider?: ConnectProvider }) {
  const copy = connectCopy[locale], guide = provider ? copy.guides[provider] : null;
  const path = `/${locale}/connect${provider ? `/${provider}` : ""}`;
  return <div className="mn-customer-shell mn-connect-shell">
    <TitleBar currentLocale={locale} currentPath={path} title="MattaNutra" variant="landing" assessmentHref={`/${locale}/connect#choose-ai`} actionLabel={copy.choose} />
    <main id="main-content" className="mn-v15-container">
      <ConnectVisit locale={locale} provider={provider} />
      <header className="mn-connect-hero">
        {provider && <ConnectCampaignLink className="mn-connect-back" href={`/${locale}/connect`}><ArrowLeft size={16} aria-hidden />{copy.back}</ConnectCampaignLink>}
        <p className="mn-v15-eyebrow">{copy.eyebrow}</p>
        <h1>{provider ? <>{copy.guideTitle} <span>{providerNames[provider]}</span></> : copy.title}</h1>
        <p className="mn-connect-intro">{copy.ask.replace("{provider}", provider ? providerNames[provider] : copy.yourAI)}</p>
      </header>
      <div className={guide ? "mn-connect-guide-grid" : "mn-connect-landing-url"}>
        <ConnectActions locale={locale} provider={provider} serverUrl={`${siteBaseUrl().replace(/\/$/, "")}/api/mcp`} />
        {provider && guide && <section className="mn-connect-instructions">
          <h2>{copy.steps}</h2>
          <ol>{guide.steps.map((step, index) => <li key={step}><span aria-hidden>{index + 1}</span><p>{step}</p></li>)}</ol>
          <p className="mn-connect-note">{guide.note}</p>
          <a className="mn-connect-help" href={providerSetup[provider].help} target="_blank" rel="noopener noreferrer">{copy.officialHelp}<ArrowUpRight size={15} aria-hidden /></a>
        </section>}
      </div>
      {!provider && <section className="mn-connect-providers-section" id="choose-ai"><h2>{copy.choose}</h2><ConnectProviderCards locale={locale} /></section>}
      <p className="mn-connect-cost">{copy.cost}</p>
    </main>
    <footer className="mn-connect-footer"><span>MattaNutra</span><nav aria-label={copy.privacyLink}>
      <a href={`/${locale}/privacy`}>{copy.privacyLink}</a><a href={`/${locale}/terms`}>{copy.termsLink}</a>
    </nav></footer>
  </div>;
}
