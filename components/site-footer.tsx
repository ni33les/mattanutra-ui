import Link from "next/link";
import type { SVGProps } from "react";
import { HealthspanLogo } from "@/components/healthspan-logo";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";

const socialLinks = [
  {
    href: "https://line.me/R/ti/p/@344enooi?oat_content=url&ts=05091931",
    name: "LINE",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M12 3.5c-5.05 0-9.16 3.28-9.16 7.31 0 3.61 3.23 6.64 7.6 7.22.3.06.7.2.8.47.09.24.06.62.03.86l-.13.82c-.04.24-.19.94.79.51.98-.42 5.29-3.11 7.22-5.33A6.48 6.48 0 0 0 21.16 10.81C21.16 6.78 17.05 3.5 12 3.5Zm-3.95 9.18H6.29a.48.48 0 0 1-.48-.48V8.37a.48.48 0 0 1 .96 0v3.35h1.28a.48.48 0 1 1 0 .96Zm1.85-.48a.48.48 0 0 1-.96 0V8.37a.48.48 0 1 1 .96 0v3.83Zm4.15 0a.48.48 0 0 1-.85.3l-1.76-2.4v2.1a.48.48 0 1 1-.96 0V8.37a.48.48 0 0 1 .85-.29l1.76 2.4V8.37a.48.48 0 1 1 .96 0v3.83Zm2.95-2.4a.48.48 0 1 1 0 .96h-1.28v.96H17a.48.48 0 1 1 0 .96h-1.76a.48.48 0 0 1-.48-.48V8.37c0-.26.21-.48.48-.48H17a.48.48 0 1 1 0 .96h-1.28v.95H17Z" />
      </svg>
    )
  },
  {
    href: "https://www.facebook.com/people/MattaNutra/61589624542529/",
    name: "Facebook",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12Z" />
      </svg>
    )
  },
  {
    href: "https://www.instagram.com/mattanutra/",
    name: "Instagram",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2Zm0 2A3.75 3.75 0 0 0 4 7.75v8.5A3.75 3.75 0 0 0 7.75 20h8.5A3.75 3.75 0 0 0 20 16.25v-8.5A3.75 3.75 0 0 0 16.25 4h-8.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-2.25a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    )
  },
  {
    href: "https://www.tiktok.com/@mattanutra",
    name: "TikTok",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M16.6 5.82a5.45 5.45 0 0 1-3.12-3.31h-2.86v12.07a2.55 2.55 0 1 1-1.83-2.44V9.23a5.41 5.41 0 1 0 4.86 5.38V8.44a8.34 8.34 0 0 0 4.86 1.55V7.05a5.46 5.46 0 0 1-1.91-1.23Z" />
      </svg>
    )
  },
  {
    href: "https://www.youtube.com/@MattaNutra",
    name: "YouTube",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768C18.254 19 12 19 12 19s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 12 5 12 5s6.254 0 7.812.418ZM10 15V9l5.194 3L10 15Z" />
      </svg>
    )
  },
  {
    href: "https://x.com/MattaNutra",
    name: "X",
    icon: (props: SVGProps<SVGSVGElement>) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M13.682 10.622 20.239 3h-1.554l-5.693 6.618L8.445 3H3.2l6.877 10.007L3.2 21h1.554l6.012-6.989L15.569 21h5.244l-7.131-10.378Zm-2.128 2.474-.697-.997-5.543-7.929H7.7l4.474 6.399.697.996 5.815 8.318h-2.386l-4.745-6.787Z" />
      </svg>
    )
  }
] as const;

const footerCopy = {
  en: {
    body:
      "Advanced AI-powered personalised wellness plans, designed in Chiang Mai for Southeast Asian lives. Ancient wisdom · modern science.",
    columns: [
      {
        title: "Product",
        links: [
          ["Free assessment", "/nutrition/quiz"],
          ["How it works", "/#how-it-works"],
          ["Four promises", "/#promises"],
          ["Pricing", "/#pricing"]
        ]
      },
      {
        title: "Learn",
        links: [
          ["Journal", "/#journal"],
          ["Mattaññutā", "/#origin"],
          ["Ingredient library", "/#journal"],
          ["For advisors", "/#pricing"]
        ]
      },
      {
        title: "Company",
        links: [
          ["About", "/#origin"],
          ["Contact", "mailto:hello@mattanutra.com"],
          ["Terms of Service", "/terms"],
          ["Privacy Policy", "/privacy"]
        ]
      }
    ],
    disclaimer:
      "MattaNutra is a wellness guidance platform and is not a medical diagnosis or treatment plan. Users who are pregnant, nursing, taking medication, or managing a medical condition should consult a qualified healthcare professional before beginning any supplement programme.",
    copyright:
      "© 2026 MattaNutra · AI-powered personalised wellness plans · Chiang Mai, Thailand"
  },
  th: {
    body:
      "แผนสุขภาพเฉพาะบุคคลที่ใช้ AI ช่วยออกแบบจากเชียงใหม่ เพื่อชีวิตในเอเชียตะวันออกเฉียงใต้ ภูมิปัญญาเดิม · วิทยาศาสตร์สมัยใหม่",
    columns: [
      {
        title: "ผลิตภัณฑ์",
        links: [
          ["แบบประเมินฟรี", "/nutrition/quiz"],
          ["วิธีทำงาน", "/#how-it-works"],
          ["สี่คำมั่น", "/#promises"],
          ["ราคา", "/#pricing"]
        ]
      },
      {
        title: "เรียนรู้",
        links: [
          ["บทความ", "/#journal"],
          ["Mattaññutā", "/#origin"],
          ["คลังส่วนผสม", "/#journal"],
          ["สำหรับผู้ให้คำปรึกษา", "/#pricing"]
        ]
      },
      {
        title: "บริษัท",
        links: [
          ["เกี่ยวกับเรา", "/#origin"],
          ["ติดต่อ", "mailto:hello@mattanutra.com"],
          ["เงื่อนไขการใช้บริการ", "/terms"],
          ["นโยบายความเป็นส่วนตัว", "/privacy"]
        ]
      }
    ],
    disclaimer:
      "MattaNutra เป็นแพลตฟอร์มแนะแนวสุขภาพ ไม่ใช่การวินิจฉัยหรือการรักษาทางการแพทย์ หากคุณตั้งครรภ์ ให้นมบุตร ใช้ยา หรือมีโรคประจำตัว ควรปรึกษาผู้เชี่ยวชาญก่อนเริ่มใช้อาหารเสริม",
    copyright:
      "© 2026 MattaNutra · แผนสุขภาพเฉพาะบุคคลด้วย AI · เชียงใหม่ ประเทศไทย"
  }
} as const;

type FooterContent = Readonly<{
  copyright: string;
  privacy: string;
  recommended: string;
  starsLabel: string;
  terms: string;
  trustedLine1: string;
  trustedLine2: string;
}>;

function localizedHref(locale: Locale, href: string) {
  if (href.startsWith("mailto:")) return href;
  if (href.startsWith("/#")) return `/${locale}${href.slice(1)}`;
  return `/${locale}${href}`;
}

export function SiteFooter({
  locale
}: Readonly<{ content: FooterContent; locale: Locale }>) {
  const copy = footerCopy[locale];

  return (
    <footer className="mn-site-footer">
      <div className="mn-site-footer-grid">
        <div className="mn-site-footer-brand">
          <HealthspanLogo locale={locale} variant="v14" />
          <p>{copy.body}</p>
          <div className="mn-site-footer-social">
            {socialLinks.map((item) => (
              <a
                href={item.href}
                key={item.name}
                rel="noreferrer"
                target="_blank"
                aria-label={item.name}
              >
                <item.icon aria-hidden="true" className="size-5" />
              </a>
            ))}
          </div>
        </div>
        {copy.columns.map((column) => (
          <nav aria-label={column.title} className="mn-site-footer-column" key={column.title}>
            <h2>{column.title}</h2>
            {column.links.map(([label, href]) => (
              <Link href={localizedHref(locale, href)} key={label}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="mn-site-footer-fineprint">
        <p>{copy.disclaimer}</p>
        <div>
          <span>{copy.copyright}</span>
          <span className="mn-site-footer-languages">
            {publicLocales.map((language) => (
              <Link
                href={`/api/locale?locale=${language}&next=%2F${language}`}
                key={language}
              >
                {localeLabels[language]}
              </Link>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
