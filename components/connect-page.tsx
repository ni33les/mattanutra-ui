import { ArrowDown, ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { TitleBar } from "@/components/title-bar";
import { SiteFooter } from "@/components/site-footer";
import { ConnectActions, ConnectProviderCards, ConnectVisit } from "@/components/connect-journey";
import { connectCopy, providerSetup } from "@/lib/connect-copy";
import { connectEvidence } from "@/lib/connect-evidence";
import { providerNames, type ConnectProvider } from "@/lib/connect";
import { getDictionary, type Locale } from "@/lib/i18n";
import { siteBaseUrl } from "@/lib/site-url";
import { ConnectCampaignLink } from "@/components/connect-campaign-link";

export function ConnectPage({ locale, provider }: { locale: Locale; provider?: ConnectProvider }) {
  const copy = connectCopy[locale], guide = provider ? copy.guides[provider] : null;
  const path = `/${locale}/connect${provider ? `/${provider}` : ""}`;
  const evidence = provider ? connectEvidence[provider] : null;
  return <div className="mn-customer-shell mn-connect-shell">
    <TitleBar currentLocale={locale} currentPath={path} title="MattaNutra" variant="landing" assessmentHref={`/${locale}/connect#choose-ai`} actionLabel={copy.choose} />
    <main id="main-content">
      <ConnectVisit locale={locale} provider={provider} />
      <section className={`mn-connect-hero ${provider ? "mn-connect-hero--guide" : ""}`}>
        <div className="mn-v15-container">
          {provider && <ConnectCampaignLink className="mn-connect-back" href={`/${locale}/connect`}><ArrowLeft size={16} aria-hidden />{copy.back}</ConnectCampaignLink>}
          <p className="mn-v15-eyebrow">{copy.eyebrow}</p>
          <h1>{provider ? <>{copy.guideTitle} <span>{providerNames[provider]}</span></> : copy.title}</h1>
          <p className="mn-connect-intro">{guide ? guide.intro : copy.description}</p>
          {!provider && <a className="mn-v15-button" href="#choose-ai">{copy.choose}<ArrowDown size={18} aria-hidden /></a>}
          <div className="mn-connect-hero-line" aria-hidden><span>MattaNutra</span><span>↔</span><span>{provider ? providerNames[provider] : "Claude · Perplexity · ChatGPT · Grok"}</span></div>
        </div>
      </section>
      {provider && guide && evidence ? <div className="mn-v15-container mn-connect-guide">
        <aside className="mn-connect-requirements"><h2>{copy.requirements}</h2><p>{guide.requirements}</p></aside>
        <div className="mn-connect-guide-grid">
          <section className="mn-connect-instructions"><span className="mn-v15-eyebrow">01 — 02</span><h2>{copy.steps}</h2>
            <ol>{guide.steps.map((step, index) => <li key={step}><span aria-hidden>{index + 1}</span><p>{step}</p></li>)}</ol>
            <details><summary>{copy.admin}</summary><p>{guide.admin}</p></details>
            {evidence.screenshots.map(shot => <figure key={shot.src}>{/* Real provider captures only; never generated UI. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={shot.src} alt={shot.alt[locale]} loading="lazy" width="1200" height="800" /><figcaption>{shot.captions[locale]}</figcaption></figure>)}
            <div className="mn-connect-guide-evidence"><p>{copy.reviewed}: <time dateTime={evidence.instructionsReviewedAt}>{evidence.instructionsReviewedAt}</time></p>
              {evidence.connectionVerifiedAt ? <p>{copy.verifiedOn}: <time dateTime={evidence.connectionVerifiedAt}>{evidence.connectionVerifiedAt}</time></p> : <p>{copy.pendingReview}</p>}
              <a href={providerSetup[provider].help} target="_blank" rel="noopener noreferrer">{copy.officialHelp}<ArrowUpRight aria-hidden size={15} /></a>
            </div>
          </section>
          <ConnectActions locale={locale} provider={provider} serverUrl={`${siteBaseUrl().replace(/\/$/, "")}/api/mcp`} />
        </div>
        <section className="mn-connect-faq"><h2>{copy.troubleshooting}</h2>{copy.troubleshootItems.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
      </div> : <>
        <section className="mn-v15-container mn-connect-section" id="choose-ai"><p className="mn-v15-eyebrow">01</p><h2>{copy.choose}</h2><ConnectProviderCards locale={locale} /></section>
        <section className="mn-connect-how"><div className="mn-v15-container mn-connect-three">{copy.overview.map(([title, text], index) => <div key={title}><span className="mn-connect-step-index">0{index + 1}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
        <section className="mn-v15-container mn-connect-section"><h2>{copy.benefitsTitle}</h2><div className="mn-connect-three">{copy.benefits.map(([title, text]) => <div key={title}><Check aria-hidden className="mn-connect-check" size={24} /><h3>{title}</h3><p>{text}</p></div>)}</div></section>
        <section className="mn-v15-container mn-connect-examples"><h2>{copy.examplesTitle}</h2><div>{copy.examples.map(example => <blockquote key={example}>{example}</blockquote>)}</div></section>
      </>}
      <section className="mn-v15-container mn-connect-faq"><h2>{copy.faqTitle}</h2>{copy.faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    </main>
    <SiteFooter content={getDictionary(locale).footer} locale={locale} currentPath={path} />
  </div>;
}
