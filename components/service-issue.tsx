import type { Locale } from "@/lib/i18n";

const content = {
  en: {
    body:
      "We are having trouble reaching the MattaNutra systems right now. The team has been notified and we are working on it.",
    cta: "Try again",
    eyebrow: "Temporary service issue",
    title: "We will be back shortly"
  },
  th: {
    body:
      "ขณะนี้ระบบ MattaNutra เชื่อมต่อไม่ได้ชั่วคราว ทีมงานได้รับทราบแล้วและกำลังดำเนินการแก้ไข",
    cta: "ลองอีกครั้ง",
    eyebrow: "ระบบขัดข้องชั่วคราว",
    title: "เราจะกลับมาให้บริการในไม่ช้า"
  }
} as const;

export function ServiceIssue({
  href,
  locale
}: Readonly<{ href?: string; locale: Locale }>) {
  const copy = content[locale];

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-20 sm:px-8">
      <div className="mx-auto w-full max-w-2xl rounded-lg bg-[var(--brand-soft-blue)] p-8 text-center ring-1 ring-[#44c3c7]/20 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand-blue)]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal text-[var(--brand-navy)] text-balance sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#17216f]/75">
          {copy.body}
        </p>
        <a
          href={href ?? `/${locale}`}
          className="mt-8 inline-flex rounded-md bg-[var(--brand-blue)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[var(--brand-blue-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-turquoise)]"
        >
          {copy.cta}
        </a>
      </div>
    </section>
  );
}
