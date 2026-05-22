import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  Activity,
  HeartPulse,
  MessageCircle,
  Pill,
  Target,
  WalletCards,
} from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";

type LandingPageProps = Readonly<{
  assessmentPath: string;
  blogPosts: BlogPostSummary[];
  locale: Locale;
}>;

type LandingIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

const promiseIcons: LandingIcon[] = [
  Target,
  ShieldCheckIcon,
  HeartPulse,
  ShoppingBagIcon,
];

const inputIcons: LandingIcon[] = [
  Target,
  Activity,
  Pill,
  WalletCards,
  HeartPulse,
];

const landingContent = {
  en: {
    hero: {
      eyebrow: "Ancient wisdom · modern science",
      title: "Stop guessing.",
      accent: "Start knowing.",
      intro:
        "AI-powered supplement and wellness plans built around your body, your lifestyle, and the goals that actually matter to you.",
      pali: "Mattaññutā",
      paliMeaning:
        "Pāli for the wisdom of knowing the right amount: wellbeing comes not from more, but from exactly enough.",
      primary: "Start the 2-minute quiz",
      secondary: "How it works",
      imageAlt: "Two people smiling after reviewing a MattaNutra plan",
      stats: ["No credit card required", "120+ ingredients evaluated", "Cautions included"],
      meters: [
        { label: "Formula precision", value: "86%" },
        { label: "Priorities", value: "Ranked" },
      ],
    },
    problem: {
      eyebrow: "The problem we solve",
      title: "From supplement confusion to a clear daily plan.",
      imageAlt: "People training and recovering with wellness guidance",
      question: "Too many choices. Not enough guidance.",
      issues: [
        "Thousands of products with overlapping claims",
        "Money wasted on supplements that may not fit your needs",
        "Generic plans that ignore medications, sleep, diet, and goals",
      ],
      answer: "MattaNutra gives you a starting point.",
      solutions: [
        "A focused questionnaire that takes a few minutes",
        "AI-guided supplement priorities and cautions",
        "Product guidance designed for Thai and Southeast Asian shoppers",
      ],
    },
    promises: {
      eyebrow: "What you can expect",
      title: "Four promises.",
      accent: "One simple plan.",
      intro:
        "Every MattaNutra plan is designed to give you four useful things, no matter your age, goals, or starting point.",
      cards: [
        ["Clarity", "from confusion", "Replace supplement aisle overwhelm with a ranked list of what likely matters first."],
        ["Guidance", "you can trust", "Recommendations are structured, explainable, and checked against relevant cautions."],
        ["Personalized", "just for you", "Built around body size, sun exposure, diet, sleep, activity, budget, and goals."],
        ["Confidence", "in every choice", "Know what to look for, what to skip, and when not to add more."],
      ],
    },
    tell: {
      eyebrow: "A 2-minute conversation",
      title: "Tell MattaNutra about your...",
      intro:
        "A short, focused questionnaire: no jargon, no fluff. Just the inputs we need to build a plan that fits.",
      privacy: "Your answers stay private. Your plan stays yours.",
      inputs: [
        "Goals & health priorities",
        "Lifestyle & activity",
        "Current medications",
        "Budget & constraints",
        "What you care about",
      ],
      output: "Your personalized plan",
    },
    how: {
      eyebrow: "How it works",
      title: "A few minutes today.",
      accent: "A clearer plan tomorrow.",
      steps: [
        ["Answer", "~ 2 min", "Complete a focused questionnaire covering goals, habits, diet, sleep, medications, and budget."],
        ["Analyze", "120+ ingredients", "Your answers are mapped to supplement priorities, dose ranges, and cautions."],
        ["Match", "SE Asia ready", "Receive product guidance so you are not guessing in-store, on Lazada, or on Shopee."],
        ["Refine", "60-day prompts", "Optional check-ins update your plan as goals, symptoms, and lifestyle change."],
      ],
    },
    concierge: {
      eyebrow: "Beyond the first plan",
      title: "Your life changes daily. Your plan should too.",
      intro:
        "Use the concierge layer when you want your plan to respond to meals, sleep, training, travel, and how you actually feel.",
      chips: ["Food choices", "Sleep rhythm", "Energy shifts", "Travel days"],
      scenarios: [
        "Morning supplement timing",
        "Recovery after hard training",
        "Gentle adjustments after poor sleep",
      ],
    },
    results: {
      eyebrow: "Real people, real results",
      title: "Less guesswork.",
      accent: "More right-sized decisions.",
      cards: [
        ["Nadia", "Busy founder, Bangkok", "I finally knew which supplements mattered first instead of buying whatever had the loudest label."],
        ["Michael", "Frequent traveller", "The plan was practical. It fit my budget and explained what to avoid with my medication."],
        ["Ari", "Strength training, Chiang Mai", "The biggest change was confidence. I stopped stacking random products on top of each other."],
      ],
    },
    origin: {
      eyebrow: "Our origin",
      title: "Designed in Chiang Mai, for lives that do not stand still.",
      body:
        "MattaNutra blends Southeast Asian shopping reality with a simple idea from Pāli: knowing the right amount. Enough over excess. Context over trends. Clarity over clutter.",
    },
    pricing: {
      eyebrow: "Simple pricing",
      title: "Start free.",
      accent: "Upgrade when ready.",
      intro:
        "Take the free questionnaire to get a starting plan. Upgrade only when you want deeper precision or ongoing AI support.",
      plans: [
        {
          badge: "Limited time offer",
          eyebrow: "One-time plan",
          name: "Right Amount Formula",
          desc: "Your personalized supplement formula with precise dosing, timing, and product guidance.",
          was: "THB 990",
          save: "Save 30%",
          price: "690",
          term: "One-time",
          cta: "Get the Right Amount Formula",
          features: [
            "Personalized supplement formula",
            "Body-size adjusted dose ranges",
            "Timing and usage instructions",
            "Medication and lab cautions",
            "Recommended products and alternatives",
            "60-day reassessment prompt",
          ],
        },
        {
          badge: "Most popular",
          eyebrow: "90-day AI support",
          name: "90-Day Wellness Concierge",
          desc: "Ongoing AI support that adapts your plan to your daily life.",
          was: "THB 1,890",
          save: "Save 16%",
          price: "1,590",
          term: "For 90 days",
          cta: "Start 90-Day Wellness Concierge",
          features: [
            "Includes the Right Amount Formula plan",
            "Daily food and routine guidance",
            "Sleep, energy, and habit support",
            "Supplement timing and adherence support",
            "Weekly progress summaries",
            "Priority review as your data changes",
          ],
        },
      ],
      trust: [
        ["Secure & private", "Your data is encrypted and never shared."],
        ["Science-backed", "Recommendations are based on trusted evidence."],
        ["Adapt & improve", "Plans evolve as your body and goals change."],
        ["AI + human oversight", "AI guidance with human-reviewed safeguards."],
      ],
    },
    journal: {
      eyebrow: "From the journal",
      title: "Practical reading on knowing the right amount.",
      intro:
        "Short, useful articles on personalized nutrition, smarter supplement choices, and healthier routines.",
      readMore: "Read article",
      fallback: [
        ["After 50", "May 10, 2026", "What changes after 50: energy, sleep and recovery", "The baselines shift after 50: sleep architecture, recovery windows, and what actually moves the needle."],
        ["Budget", "May 9, 2026", "How to choose supplements without wasting money", "A short framework for separating priorities from nice-to-haves, and avoiding common overspends."],
        ["Method", "May 8, 2026", "Why a HealthScore beats a generic supplement list", "A useful plan starts by understanding what is actually holding you back."],
      ],
    },
    faq: {
      eyebrow: "Frequently asked",
      title: "Honest answers",
      accent: "before you start.",
      intro: "The questions we hear most often from people considering MattaNutra.",
      items: [
        ["How does the AI decide what to recommend?", "Your answers are mapped to structured formulation logic covering goals, body size, lifestyle, medications, diet, sleep, sun exposure, and budget."],
        ["Is my data private?", "Yes. Your assessment is yours. We do not sell answers or share them with advertisers."],
        ["I am on medication. Is this safe for me?", "MattaNutra screens for common medication and supplement considerations and flags cautions. It is wellness guidance, not medical advice."],
        ["How is this different from a multivitamin?", "A multivitamin gives everyone the same blend. MattaNutra starts from your inputs and produces a ranked, dosed plan."],
        ["Where do recommended products come from?", "We point to products available in markets Southeast Asian shoppers actually use, selected to match your formulation."],
        ["Is the free assessment really free?", "Yes. The questionnaire is free and no credit card is required."],
      ],
    },
    final: {
      title: "Stop guessing.",
      accent: "Start knowing.",
      body:
        "Take the 2-minute Wellness Quiz and receive your personalized starting plan, built around your body, your goals, and your day.",
      primary: "Start the Wellness Quiz",
      secondary: "How it works",
      quote: "Mattaññutā — knowing the right amount.",
    },
  },
  th: {
    hero: {
      eyebrow: "ภูมิปัญญาเดิม · วิทยาศาสตร์สมัยใหม่",
      title: "เลิกเดา.",
      accent: "เริ่มรู้.",
      intro:
        "แผนอาหารเสริมและสุขภาพที่ใช้ AI ช่วยจัดลำดับให้เข้ากับร่างกาย ไลฟ์สไตล์ และเป้าหมายของคุณ",
      pali: "Mattaññutā",
      paliMeaning:
        "ภาษาบาลีที่หมายถึงปัญญาในการรู้ปริมาณที่พอดี: สุขภาพที่ดีไม่ได้มาจากมากกว่า แต่มาจากพอดีกว่า",
      primary: "เริ่มแบบประเมิน 2 นาที",
      secondary: "ดูวิธีทำงาน",
      imageAlt: "คนสองคนยิ้มหลังดูแผน MattaNutra",
      stats: ["ไม่ต้องใช้บัตรเครดิต", "ประเมิน 120+ ส่วนผสม", "มีข้อควรระวัง"],
      meters: [
        { label: "ความแม่นยำของสูตร", value: "86%" },
        { label: "ลำดับความสำคัญ", value: "ชัดเจน" },
      ],
    },
    problem: {
      eyebrow: "ปัญหาที่เราแก้",
      title: "จากความสับสนเรื่องอาหารเสริม สู่แผนประจำวันที่ชัดเจน",
      imageAlt: "ผู้คนออกกำลังกายและฟื้นตัวด้วยคำแนะนำสุขภาพ",
      question: "ตัวเลือกเยอะเกินไป คำแนะนำกลับไม่พอ",
      issues: [
        "ผลิตภัณฑ์จำนวนมากพร้อมคำกล่าวอ้างที่ทับซ้อน",
        "เสียเงินกับอาหารเสริมที่อาจไม่เหมาะกับคุณ",
        "แผนทั่วไปที่ไม่ดูยา การนอน อาหาร และเป้าหมาย",
      ],
      answer: "MattaNutra ให้จุดเริ่มต้นที่ชัดเจน",
      solutions: [
        "แบบประเมินสั้น ๆ ที่ใช้เวลาไม่กี่นาที",
        "AI ช่วยจัดลำดับอาหารเสริมและข้อควรระวัง",
        "คำแนะนำผลิตภัณฑ์สำหรับผู้ซื้อในไทยและเอเชียตะวันออกเฉียงใต้",
      ],
    },
    promises: {
      eyebrow: "สิ่งที่คุณคาดหวังได้",
      title: "สี่คำมั่น.",
      accent: "หนึ่งแผนที่เรียบง่าย.",
      intro: "ทุกแผนของ MattaNutra ถูกออกแบบให้ชัดเจน มั่นใจ และเหมาะกับคุณ",
      cards: [
        ["ชัดเจน", "จากความสับสน", "เปลี่ยนตัวเลือกมากมายให้เป็นรายการที่จัดลำดับสิ่งสำคัญก่อน"],
        ["น่าเชื่อถือ", "มีเหตุผลรองรับ", "คำแนะนำมีโครงสร้าง อธิบายได้ และตรวจข้อควรระวัง"],
        ["เฉพาะคุณ", "ไม่ใช่สูตรสำเร็จ", "คำนึงถึงร่างกาย แสงแดด อาหาร การนอน กิจกรรม งบ และเป้าหมาย"],
        ["มั่นใจ", "ในการเลือก", "รู้ว่าควรมองหาอะไร ควรข้ามอะไร และเมื่อไรไม่ควรเพิ่ม"],
      ],
    },
    tell: {
      eyebrow: "บทสนทนา 2 นาที",
      title: "บอก MattaNutra เกี่ยวกับคุณ...",
      intro: "แบบประเมินสั้น กระชับ ไม่มีศัพท์ยาก มีเฉพาะข้อมูลที่จำเป็นต่อแผนที่เข้ากับชีวิตจริง",
      privacy: "คำตอบเป็นของคุณ แผนก็เป็นของคุณ",
      inputs: ["เป้าหมาย", "ไลฟ์สไตล์", "ยาที่ใช้อยู่", "งบและข้อจำกัด", "สิ่งที่คุณแคร์"],
      output: "แผนส่วนตัวของคุณ",
    },
    how: {
      eyebrow: "วิธีทำงาน",
      title: "ใช้เวลาไม่กี่นาทีวันนี้.",
      accent: "ได้แผนที่ชัดขึ้นพรุ่งนี้.",
      steps: [
        ["ตอบ", "~ 2 นาที", "ตอบคำถามเรื่องเป้าหมาย นิสัย อาหาร การนอน ยา และงบ"],
        ["วิเคราะห์", "120+ ส่วนผสม", "คำตอบถูกแปลงเป็นลำดับความสำคัญ ช่วงโดส และข้อควรระวัง"],
        ["จับคู่", "พร้อมใช้ในเอเชีย", "แนะนำผลิตภัณฑ์เพื่อให้คุณไม่ต้องเดาในร้าน Lazada หรือ Shopee"],
        ["ปรับ", "เตือนทบทวน 60 วัน", "เช็กอินเพิ่มเติมเพื่อปรับแผนเมื่อเป้าหมายและชีวิตเปลี่ยน"],
      ],
    },
    concierge: {
      eyebrow: "มากกว่าแผนแรก",
      title: "ชีวิตคุณเปลี่ยนทุกวัน แผนก็ควรเปลี่ยนตาม",
      intro: "ใช้ concierge เมื่อคุณอยากให้แผนตอบสนองต่ออาหาร การนอน การเดินทาง การฝึก และชีวิตจริง",
      chips: ["อาหาร", "การนอน", "พลังงาน", "วันเดินทาง"],
      scenarios: ["เวลาทานตอนเช้า", "การฟื้นตัวหลังซ้อมหนัก", "ปรับเบา ๆ หลังนอนไม่ดี"],
    },
    results: {
      eyebrow: "ผลลัพธ์จากคนจริง",
      title: "เดาน้อยลง.",
      accent: "ตัดสินใจได้พอดีขึ้น.",
      cards: [
        ["Nadia", "ผู้ก่อตั้งธุรกิจ, กรุงเทพฯ", "ในที่สุดก็รู้ว่าอะไรสำคัญก่อน ไม่ต้องซื้อจากฉลากที่ดูน่าเชื่อที่สุด"],
        ["Michael", "เดินทางบ่อย", "แผนใช้งานได้จริง เข้ากับงบ และบอกชัดว่าอะไรควรระวังกับยาที่กินอยู่"],
        ["Ari", "เวทเทรนนิ่ง, เชียงใหม่", "สิ่งที่เปลี่ยนมากที่สุดคือความมั่นใจ ไม่ต้องซ้อนผลิตภัณฑ์มั่ว ๆ อีกแล้ว"],
      ],
    },
    origin: {
      eyebrow: "จุดเริ่มต้น",
      title: "ออกแบบในเชียงใหม่ เพื่อชีวิตที่ไม่หยุดนิ่ง",
      body:
        "MattaNutra ผสานความจริงของการซื้ออาหารเสริมในเอเชียเข้ากับแนวคิดภาษาบาลีเรื่องการรู้ปริมาณที่พอดี",
    },
    pricing: {
      eyebrow: "ราคาที่เรียบง่าย",
      title: "เริ่มฟรี.",
      accent: "อัปเกรดเมื่อพร้อม.",
      intro: "ทำแบบประเมินฟรีเพื่อเริ่มต้น แล้วอัปเกรดเมื่อคุณต้องการความแม่นยำหรือการสนับสนุนต่อเนื่อง",
      plans: [
        {
          badge: "ข้อเสนอช่วงเปิดตัว",
          eyebrow: "แผนครั้งเดียว",
          name: "Right Amount Formula",
          desc: "สูตรอาหารเสริมส่วนตัวพร้อมโดส เวลาใช้ และคำแนะนำผลิตภัณฑ์",
          was: "THB 990",
          save: "ประหยัด 30%",
          price: "690",
          term: "จ่ายครั้งเดียว",
          cta: "รับ Right Amount Formula",
          features: ["สูตรเฉพาะคุณ", "ช่วงโดสตามร่างกาย", "คำแนะนำเวลาใช้", "ข้อควรระวัง", "ผลิตภัณฑ์แนะนำ", "เตือนทบทวน 60 วัน"],
        },
        {
          badge: "นิยมที่สุด",
          eyebrow: "AI support 90 วัน",
          name: "90-Day Wellness Concierge",
          desc: "การสนับสนุนต่อเนื่องที่ปรับแผนตามชีวิตประจำวัน",
          was: "THB 1,890",
          save: "ประหยัด 16%",
          price: "1,590",
          term: "90 วัน",
          cta: "เริ่ม Wellness Concierge",
          features: ["รวม Right Amount Formula", "คำแนะนำอาหารและกิจวัตร", "ช่วยเรื่องการนอนและพลังงาน", "ช่วยเรื่องเวลาทาน", "สรุปรายสัปดาห์", "ทบทวนเมื่อข้อมูลเปลี่ยน"],
        },
      ],
      trust: [
        ["ปลอดภัยและเป็นส่วนตัว", "ข้อมูลถูกเข้ารหัสและไม่ขายต่อ"],
        ["อิงหลักฐาน", "คำแนะนำอ้างอิงข้อมูลที่เชื่อถือได้"],
        ["ปรับและดีขึ้น", "แผนเปลี่ยนตามร่างกายและเป้าหมาย"],
        ["AI + คนดูแล", "AI พร้อมระบบตรวจทานเพื่อความรอบคอบ"],
      ],
    },
    journal: {
      eyebrow: "จากบทความ",
      title: "อ่านเรื่องการรู้ปริมาณที่พอดี",
      intro: "บทความสั้น ๆ เรื่องโภชนาการเฉพาะบุคคล การเลือกอาหารเสริม และกิจวัตรสุขภาพ",
      readMore: "อ่านบทความ",
      fallback: [
        ["หลัง 50", "10 พ.ค. 2026", "อะไรเปลี่ยนหลังวัย 50", "พื้นฐานหลายอย่างเปลี่ยนไป ทั้งการนอน การฟื้นตัว และสิ่งที่ส่งผลจริง"],
        ["งบ", "9 พ.ค. 2026", "เลือกอาหารเสริมอย่างไรไม่ให้เสียเงินฟรี", "วิธีแยกสิ่งสำคัญออกจากสิ่งที่มีก็ดี"],
        ["วิธีคิด", "8 พ.ค. 2026", "ทำไม HealthScore ดีกว่ารายการทั่วไป", "แผนที่ดีต้องเริ่มจากการเข้าใจว่าอะไรเป็นตัวถ่วง"],
      ],
    },
    faq: {
      eyebrow: "คำถามที่พบบ่อย",
      title: "คำตอบตรงไปตรงมา",
      accent: "ก่อนเริ่ม",
      intro: "คำถามที่เราเจอบ่อยจากคนที่กำลังพิจารณาใช้ MattaNutra",
      items: [
        ["AI ตัดสินใจอย่างไร?", "คำตอบของคุณถูกจับคู่กับตรรกะการสร้างสูตรที่มีโครงสร้าง"],
        ["ข้อมูลเป็นส่วนตัวไหม?", "ใช่ แบบประเมินเป็นของคุณ เราไม่ขายคำตอบ"],
        ["ถ้ากินยาอยู่ ปลอดภัยไหม?", "MattaNutra ช่วยคัดกรองข้อควรระวังที่พบบ่อย แต่ไม่ใช่คำแนะนำทางการแพทย์"],
        ["ต่างจากมัลติวิตามินอย่างไร?", "มัลติวิตามินให้สูตรเดียวกับทุกคน MattaNutra เริ่มจากข้อมูลของคุณ"],
        ["ผลิตภัณฑ์มาจากไหน?", "เราแนะนำผลิตภัณฑ์ที่หาได้ในตลาดที่ผู้ใช้เอเชียตะวันออกเฉียงใต้ใช้งานจริง"],
        ["แบบประเมินฟรีจริงไหม?", "ฟรีจริง ไม่ต้องใช้บัตรเครดิต"],
      ],
    },
    final: {
      title: "เลิกเดา.",
      accent: "เริ่มรู้.",
      body: "ทำแบบประเมิน 2 นาทีเพื่อรับแผนเริ่มต้นที่สร้างจากร่างกาย เป้าหมาย และวันจริงของคุณ",
      primary: "เริ่ม Wellness Quiz",
      secondary: "ดูวิธีทำงาน",
      quote: "Mattaññutā — การรู้ปริมาณที่พอดี",
    },
  },
} as const;

function SectionIntro({
  accent,
  body,
  dark = false,
  eyebrow,
  title,
}: Readonly<{
  accent?: string;
  body?: string;
  dark?: boolean;
  eyebrow: string;
  title: string;
}>) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p
        className={
          dark
            ? "font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-glow)]"
            : "font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]"
        }
      >
        {eyebrow}
      </p>
      <h2
        className={
          dark
            ? "mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-white text-balance sm:text-5xl"
            : "mt-3 font-serif text-4xl font-medium leading-tight tracking-normal text-[var(--mn-ink)] text-balance sm:text-5xl"
        }
      >
        {title}{" "}
        {accent ? (
          <span className={dark ? "italic text-[var(--mn-teal-glow)]" : "italic text-[var(--mn-teal-deep)]"}>
            {accent}
          </span>
        ) : null}
      </h2>
      {body ? (
        <p
          className={
            dark
              ? "mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--mn-teal-glow)]"
              : "mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)]"
          }
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function LandingPage({
  assessmentPath,
  blogPosts,
  locale,
}: LandingPageProps) {
  const copy = landingContent[locale];
  const container = "mx-auto w-full max-w-7xl px-6 sm:px-8";
  const section = "py-16 sm:py-20 lg:py-24";
  const card =
    "rounded-[var(--mn-radius-md)] bg-[var(--mn-paper)] p-6 ring-1 ring-[var(--mn-line)]";
  const softCard =
    "rounded-[var(--mn-radius-md)] bg-[var(--mn-cream)] p-5 ring-1 ring-[var(--mn-line)]";
  const iconCircle =
    "inline-flex size-11 items-center justify-center rounded-full bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]";
  const journalCards =
    blogPosts.length > 0
      ? blogPosts.map((post) => ({
          body: post.excerpt,
          date: post.date,
          href: post.href,
          tag: locale === "th" ? "บทความ" : "Journal",
          title: post.title,
        }))
      : copy.journal.fallback.map(([tag, date, title, body]) => ({
          body,
          date,
          href: "#journal",
          tag,
          title,
        }));

  return (
    <div className="flex-1">
      <section className="overflow-hidden border-b border-[var(--mn-line)] bg-[var(--mn-cream)]">
        <div className={`${container} ${section} grid items-center gap-10 lg:grid-cols-2`}>
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
              {copy.hero.eyebrow}
            </p>
            <h1 className="mt-6 max-w-3xl font-serif text-5xl font-medium leading-tight tracking-normal text-[var(--mn-ink)] text-balance sm:text-6xl lg:text-7xl">
              {copy.hero.title}{" "}
              <span className="italic text-[var(--mn-teal-deep)]">
                {copy.hero.accent}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)] sm:text-xl">
              {copy.hero.intro}
            </p>
            <div className="mt-8 max-w-xl border-l-2 border-[var(--mn-gold)] pl-5">
              <p className="font-serif text-2xl italic text-[var(--mn-gold)]">
                {copy.hero.pali}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ash)]">
                {copy.hero.paliMeaning}
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="mn-brand-button" href={assessmentPath}>
                {copy.hero.primary}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
              <Link className="mn-secondary-button" href="#how-it-works">
                {copy.hero.secondary}
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--mn-ash)]">
              {copy.hero.stats.map((item) => (
                <li className="flex items-center gap-2" key={item}>
                  <span className="text-[var(--mn-teal)]" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-[var(--mn-radius-md)] bg-[var(--mn-paper)] ring-1 ring-[var(--mn-line)]">
              <Image
                alt={copy.hero.imageAlt}
                className="aspect-[4/3] w-full object-cover"
                height={780}
                priority
                src="/nextone.png"
                width={1040}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {copy.hero.meters.map((item) => (
                <div className={softCard} key={item.label}>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                    {item.label}
                  </p>
                  <p className="mt-2 font-serif text-3xl font-medium text-[var(--mn-ink)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-paper)]`}>
        <div className={container}>
          <SectionIntro eyebrow={copy.problem.eyebrow} title={copy.problem.title} />
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[var(--mn-radius-md)] ring-1 ring-[var(--mn-line)]">
              <Image
                alt={copy.problem.imageAlt}
                className="aspect-[4/3] w-full object-cover"
                height={720}
                src="/cta-athletes.jpg"
                width={960}
              />
            </div>
            <div className={`${card} flex flex-col justify-center`}>
              <h3 className="font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)]">
                {copy.problem.question}
              </h3>
              <ul className="mt-6 space-y-3">
                {copy.problem.issues.map((item) => (
                  <li className="flex gap-3 text-[var(--mn-ink-soft)]" key={item}>
                    <span className="font-bold text-[var(--mn-error)]">×</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-8 font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)]">
                {copy.problem.answer}
              </h3>
              <ul className="mt-6 space-y-3">
                {copy.problem.solutions.map((item) => (
                  <li className="flex gap-3 text-[var(--mn-ink-soft)]" key={item}>
                    <span className="font-bold text-[var(--mn-teal)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-cream)]`} id="promises">
        <div className={container}>
          <SectionIntro
            accent={copy.promises.accent}
            body={copy.promises.intro}
            eyebrow={copy.promises.eyebrow}
            title={copy.promises.title}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.promises.cards.map(([title, sub, body], index) => {
              const Icon = promiseIcons[index] ?? Target;
              return (
                <article className={card} key={title}>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <span className={`${iconCircle} mt-5`}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-5 font-serif text-2xl font-medium text-[var(--mn-ink)]">
                    {title}
                  </h3>
                  <p className="mt-1 font-semibold italic text-[var(--mn-teal-deep)]">
                    {sub}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[var(--mn-ash)]">
                    {body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-mint)]`}>
        <div className={`${container} grid gap-8 lg:grid-cols-2 lg:items-center`}>
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
              {copy.tell.eyebrow}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
              {copy.tell.title}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.tell.intro}
            </p>
            <p className="mt-6 inline-flex rounded-full bg-[var(--mn-gold-tint)] px-4 py-2 text-sm font-semibold text-[var(--mn-ink)]">
              {copy.tell.privacy}
            </p>
          </div>
          <div className={card}>
            <div className="space-y-3">
              {copy.tell.inputs.map((item, index) => {
                const Icon = inputIcons[index] ?? SparklesIcon;
                return (
                  <div
                    className="flex items-center gap-3 rounded-[var(--mn-radius-sm)] bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]"
                    key={item}
                  >
                    <span className={iconCircle}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="font-semibold text-[var(--mn-ink)]">
                      {item}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-[var(--mn-radius-md)] bg-[var(--mn-teal)] p-5 text-center text-base font-bold text-white">
              {copy.tell.output}
            </div>
          </div>
        </div>
      </section>

      <section className={section} id="how-it-works">
        <div className={container}>
          <SectionIntro
            accent={copy.how.accent}
            eyebrow={copy.how.eyebrow}
            title={copy.how.title}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.how.steps.map(([title, micro, body], index) => (
              <article className={card} key={title}>
                <p className="font-serif text-5xl italic text-[var(--mn-gold)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-5 font-serif text-2xl font-medium text-[var(--mn-ink)]">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--mn-ash)]">
                  {body}
                </p>
                <p className="mt-5 inline-flex rounded-full bg-[var(--mn-mint)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-[var(--mn-teal-deep)]">
                  {micro}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className={`${section} bg-[var(--mn-ink)] text-[var(--mn-paper)]`}
        id="concierge"
      >
        <div className={`${container} grid gap-8 lg:grid-cols-2 lg:items-center`}>
          <div>
            <SectionIntro
              body={copy.concierge.intro}
              dark
              eyebrow={copy.concierge.eyebrow}
              title={copy.concierge.title}
            />
            <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              {copy.concierge.chips.map((chip) => (
                <span
                  className="rounded-full border border-white/15 px-3 py-1 text-sm font-semibold text-white/90"
                  key={chip}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {copy.concierge.scenarios.map((item) => (
              <div
                className="flex items-center gap-3 rounded-[var(--mn-radius-md)] bg-white/8 p-5 ring-1 ring-white/15"
                key={item}
              >
                <MessageCircle aria-hidden className="size-5 text-[var(--mn-teal-glow)]" />
                <span className="font-semibold text-white">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-cream)]`}>
        <div className={container}>
          <SectionIntro
            accent={copy.results.accent}
            eyebrow={copy.results.eyebrow}
            title={copy.results.title}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {copy.results.cards.map(([name, detail, quote]) => (
              <article className={card} key={name}>
                <p className="font-serif text-xl leading-8 text-[var(--mn-ink-soft)]">
                  “{quote}”
                </p>
                <footer className="mt-6">
                  <strong className="text-[var(--mn-ink)]">{name}</strong>
                  <p className="mt-1 text-sm text-[var(--mn-ash)]">
                    {detail}
                  </p>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-sand-soft)]`} id="origin">
        <div className={`${container} grid gap-6 lg:grid-cols-[0.9fr_1.1fr]`}>
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
              {copy.origin.eyebrow}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
              {copy.origin.title}
            </h2>
          </div>
          <p className="text-lg leading-8 text-[var(--mn-ink-soft)]">
            {copy.origin.body}
          </p>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-paper)]`} id="pricing">
        <div className={container}>
          <SectionIntro
            accent={copy.pricing.accent}
            body={copy.pricing.intro}
            eyebrow={copy.pricing.eyebrow}
            title={copy.pricing.title}
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {copy.pricing.plans.map((plan) => (
              <article
                className={`${card} flex flex-col ${plan.badge === copy.pricing.plans[1].badge ? "ring-[var(--mn-teal)]" : ""}`}
                key={plan.name}
              >
                <span className="w-max rounded-full bg-[var(--mn-gold-tint)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-gold)]">
                  {plan.badge}
                </span>
                <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-teal-deep)]">
                  {plan.eyebrow}
                </p>
                <h3 className="mt-3 font-serif text-3xl font-medium text-[var(--mn-ink)]">
                  {plan.name}
                </h3>
                <p className="mt-3 text-[var(--mn-ash)]">{plan.desc}</p>
                <div className="my-6 border-y border-[var(--mn-line)] py-5">
                  <p className="text-sm text-[var(--mn-ash)]">
                    <s>{plan.was}</s>{" "}
                    <span className="font-bold uppercase text-[var(--mn-gold)]">
                      {plan.save}
                    </span>
                  </p>
                  <p className="mt-2 flex flex-wrap items-end gap-2 text-[var(--mn-ink)]">
                    <span className="pb-2 text-sm font-bold">THB</span>
                    <strong className="font-serif text-6xl font-medium leading-none">
                      {plan.price}
                    </strong>
                    <span className="pb-2 text-sm">{plan.term}</span>
                  </p>
                </div>
                <Link className="mn-brand-button w-full" href={assessmentPath}>
                  {plan.cta}
                </Link>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li className="flex gap-3 text-sm text-[var(--mn-ink-soft)]" key={feature}>
                      <span className="text-[var(--mn-teal)]" aria-hidden>
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {copy.pricing.trust.map(([title, body]) => (
              <div className={softCard} key={title}>
                <strong className="block text-sm text-[var(--mn-ink)]">
                  {title}
                </strong>
                <p className="mt-1 text-sm leading-6 text-[var(--mn-ash)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-cream)]`} id="journal">
        <div className={container}>
          <SectionIntro
            body={copy.journal.intro}
            eyebrow={copy.journal.eyebrow}
            title={copy.journal.title}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {journalCards.map((post, index) => (
              <Link className={`${card} block no-underline`} href={post.href} key={post.title}>
                <div
                  className={`mb-5 flex aspect-[16/10] items-center justify-center rounded-[var(--mn-radius-sm)] ${
                    index === 1 ? "bg-[var(--mn-gold-tint)]" : "bg-[var(--mn-mint)]"
                  }`}
                >
                  <span className="font-serif text-2xl font-medium italic text-[var(--mn-teal-deep)]">
                    {post.tag}
                  </span>
                </div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                  <span className="text-[var(--mn-teal-deep)]">{post.tag}</span>{" "}
                  · {post.date}
                </p>
                <h3 className="mt-3 font-serif text-2xl font-medium leading-tight text-[var(--mn-ink)]">
                  {post.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--mn-ash)]">
                  {post.body}
                </p>
                <span className="mt-5 inline-flex font-semibold text-[var(--mn-teal-deep)]">
                  {copy.journal.readMore}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-paper)]`}>
        <div className={`${container} max-w-4xl`}>
          <SectionIntro
            accent={copy.faq.accent}
            body={copy.faq.intro}
            eyebrow={copy.faq.eyebrow}
            title={copy.faq.title}
          />
          <div className="mt-10 divide-y divide-[var(--mn-line)]">
            {copy.faq.items.map(([question, answer]) => (
              <details className="py-5" key={question}>
                <summary className="cursor-pointer list-none font-serif text-xl font-medium text-[var(--mn-ink)]">
                  {question}
                </summary>
                <p className="mt-3 leading-7 text-[var(--mn-ink-soft)]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={`${section} bg-[var(--mn-cream)]`} id="assessment">
        <div className={`${container} text-center`}>
          <div className="mx-auto max-w-4xl rounded-[var(--mn-radius-lg)] bg-[var(--mn-paper)] p-8 ring-1 ring-[var(--mn-line)] sm:p-12">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)]">
              {copy.final.quote}
            </p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-6xl">
              {copy.final.title}{" "}
              <span className="italic text-[var(--mn-teal-deep)]">
                {copy.final.accent}
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.final.body}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link className="mn-brand-button" href={assessmentPath}>
                {copy.final.primary}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
              <Link className="mn-secondary-button" href="#how-it-works">
                {copy.final.secondary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
