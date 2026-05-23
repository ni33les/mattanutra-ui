import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleDollarSign,
  HeartPulse,
  Leaf,
  Lock,
  Pill,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Utensils,
  XCircle
} from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";

type LandingPageProps = Readonly<{
  assessmentPath: string;
  blogPosts: BlogPostSummary[];
  locale: Locale;
}>;

const assets = {
  brandMark: "/v11/brand-mark.png",
  origin: [
    "/v11/origin-stage-01.png",
    "/v11/origin-stage-02.png",
    "/v11/origin-stage-03.png",
    "/v11/origin-stage-04.png",
    "/v11/origin-stage-05.png"
  ],
  portraits: [
    "/v11/portrait-daniel.jpg",
    "/v11/portrait-01.jpg",
    "/v11/portrait-02.jpg",
    "/v11/portrait-03.jpg"
  ],
  problem: "/v11/supplement-aisle.jpg"
} as const;

const content = {
  en: {
    hero: {
      eyebrow: "Ancient Wisdom · Modern Science",
      title: "Stop guessing.",
      accent: "Start knowing.",
      intro:
        "AI-powered supplement and wellness plans built around your body, your lifestyle, and the goals that actually matter to you — and that adapt as your life does.",
      paliTitle: "Mattaññutā",
      pali:
        "Pāli for the wisdom of knowing the right amount — that wellbeing comes not from more, but from exactly enough.",
      primary: "Start the 2-minute quiz",
      secondary: "How it works",
      checks: ["No credit card required", "120+ ingredients evaluated", "Safety checks included"],
      ingredientPills: ["Magnesium", "Vitamin D3", "Omega-3", "Ashwagandha", "Zinc", "Creatine"]
    },
    problem: {
      eyebrow: "The problem we solve",
      title: "From supplement confusion to a clear daily plan.",
      intro:
        "Thousands of products, conflicting claims, and almost no personalisation. MattaNutra gives you a place to start — and a reason to trust it.",
      question: "Sound familiar?",
      issueTitle: "Too many choices. Not enough guidance.",
      issues: [
        "Thousands of products with overlapping claims",
        "Money wasted on supplements that may not fit your needs",
        "Generic plans that ignore medications, sleep, diet, and goals"
      ],
      answer: "MattaNutra gives you a starting point.",
      solutions: [
        "A focused questionnaire that takes a few minutes",
        "AI-guided supplement priorities and safety flags",
        "Product guidance designed for Southeast Asian shoppers"
      ]
    },
    promises: {
      eyebrow: "What you can expect",
      title: "Four promises.",
      accent: "One simple plan.",
      intro:
        "The four things every MattaNutra plan is designed to give you — no matter your age, goals, or starting point.",
      cards: [
        ["Clarity", "from confusion", "Replace the supplement aisle overwhelm with a clear, ranked list of what your body actually needs first."],
        ["Guidance", "you can trust", "Recommendations grounded in published research and reviewed for safety against your medications and conditions."],
        ["Personalized", "just for you", "Built around your body size, sun exposure, diet, sleep, training load, budget, and what you actually care about."],
        ["Confidence", "in every choice", "Shop on Lazada — or any local pharmacy — knowing exactly what to look for, and what to skip."]
      ]
    },
    tell: {
      eyebrow: "A 2-minute conversation",
      title: "Tell MattaNutra about your...",
      intro:
        "A short, focused questionnaire — no jargon, no fluff. Just the inputs we genuinely need to build a plan that actually fits.",
      privacy: "Your answers stay private. Your plan stays yours.",
      down: "and we'll do the rest",
      inputs: [
        "Goals & health priorities",
        "Lifestyle & activity",
        "Current medications",
        "Budget & constraints",
        "What you care about"
      ],
      output: "Your personalised plan."
    },
    how: {
      eyebrow: "How it works",
      title: "A few minutes today.",
      accent: "A clearer plan tomorrow.",
      intro: "From questionnaire to recommendations, in four steps you can trust.",
      steps: [
        ["Answer", "~ 2 min", "Complete a focused questionnaire covering goals, habits, diet, sleep, medications and budget."],
        ["Analyze", "120+ ingredients", "Your answers are mapped to supplement priorities, dosage ranges and safety considerations."],
        ["Match", "SE Asia ready", "Receive product guidance so you're not guessing in-store or on Lazada."],
        ["Refine", "60-day prompts", "Optional check-ins update your plan as goals, symptoms and lifestyle change over time."]
      ]
    },
    protocol: {
      eyebrow: "Living Protocol · 90-day support",
      title: "Life changes constantly.",
      accent: "Your protocol can keep up.",
      intro:
        "Sleep, stress, travel and shifting routines all change what your body needs. Living Protocol keeps your supplements — and the everyday foods behind them — aligned with real life, so the right amount today stays the right amount next week.",
      primary: "Explore Living Protocol",
      secondary: "See how it works",
      ticks: [
        "Built by physicians — every adjustment checked against your medications and labs",
        "Stays aligned through travel, stress and poor sleep",
        "Less second-guessing when life shifts"
      ],
      chat: [
        ["MattaNutra", "Anything different this week — sleep, stress, travel or routine?"],
        ["You", "I’m travelling to Tokyo tomorrow. Probably going to sleep badly this week."],
        ["MattaNutra", "Got it — six days in Tokyo with some sleep disruption. I’ve made three small adjustments and kept everything else steady."]
      ],
      updates: [
        "Take magnesium a little earlier — 7:30pm local instead of 9:30pm",
        "Add electrolytes on your flight and each morning while you’re away",
        "Everything else stays exactly the same"
      ],
      reasoning: [
        "Magnesium earlier — helps move your wind-down forward as you adjust to the timezone.",
        "Electrolytes added — supports hydration through the flight and your higher walking load.",
        "Adaptogen held steady — sleep has been unsettled, so the dose stays stable."
      ]
    },
    protocolBand: {
      title: "Your Right Amount Formula is the foundation.",
      accent: "Your Living Protocol keeps it aligned with real life.",
      body:
        "Travel, stress, poor sleep and changing routines all shift what your body needs. Your foundation doesn’t change — but the small adjustments around it do."
    },
    protocolHow: {
      eyebrow: "How it works",
      title: "Three steps.",
      accent: "No apps to learn.",
      intro:
        "Living Protocol fits into the messaging you already use. You tell it what changed; it does the rest.",
      steps: [
        ["Tell MattaNutra what changed", "A quick message through Line or WhatsApp is all it takes — no forms, no tracking, no apps to learn.", ["Sleeping badly this week.", "Travelling for work tomorrow.", "Started training harder lately."]],
        ["Your protocol adapts around you", "Working from your current stack, goals and safety flags, MattaNutra turns that update into a few precise adjustments — timing, dosage, or a temporary addition — and points you to everyday foods that support what your body needs.", ["Move magnesium slightly earlier this week.", "Pumpkin seeds are a great natural source of magnesium.", "Hold your adaptogen steady until sleep settles."]],
        ["Stay consistent without overthinking it", "You don’t have to research, second-guess, or restart from scratch every time life gets busy. You just get a few simple things to do — and the confidence they’re right for you.", ["No need to rethink your routine every time life shifts.", "Small adjustments keep your plan realistic.", "Your right amount stays right."]]
      ]
    },
    food: {
      eyebrow: "Food & supplements, together",
      title: "The best source is sometimes on your plate.",
      intro:
        "Supplements fill the gaps — but food fills them first. When Living Protocol spots something your body needs, it doesn’t just reach for a capsule. It tells you which everyday foods are naturally rich in it, so you can choose: top up at dinner, or top up from the bottle.",
      cards: [
        ["Low on magnesium?", "Pumpkin seeds, spinach and black beans are some of the richest natural sources.", ["pumpkin seeds", "spinach", "black beans"]],
        ["Need more chromium?", "It turns up in unexpected places — grape juice, broccoli and whole grains.", ["grape juice", "broccoli", "whole grains"]],
        ["Already covered?", "If your meals are doing the job, Living Protocol will tell you to skip the supplement — and save your money.", ["food’s got it"]]
      ],
      note:
        "No food diary. No calorie counting. Just a quick answer when you want one, and a nudge toward the right plate when it helps."
    },
    difference: {
      eyebrow: "Why it’s different",
      title: "More than an answer.",
      accent: "A protocol that knows you.",
      body:
        "Anyone can look up whether travel affects magnesium. The hard part is knowing how it affects your plan — your stack, your medications, the weeks you’ve just had — and what to actually do about it. That’s the part Living Protocol handles for you.",
      bullets: [
        "It already knows everything you take, so there’s nothing to re-explain each time something changes.",
        "Every adjustment it suggests is checked against your medications and lab flags.",
        "Over 90 days it comes to recognise your patterns, so its advice reflects the trend behind this week.",
        "You never have to know the right question to ask — you simply say what’s going on."
      ],
      closing:
        "You don’t need to become your own pharmacist. You just tell MattaNutra what’s changed, and it keeps your protocol right."
    },
    planChoice: {
      eyebrow: "Choose your level of guidance",
      title: "Start with the formula.",
      accent: "Add the living layer.",
      intro:
        "Begin with a clear, personalised supplement formula — or choose ongoing support that helps your routine adapt through real-life changes.",
      plans: [
        {
          badge: "One-time formula",
          name: "The Right Amount Formula",
          desc: "Stop guessing in the supplement aisle. A personalised formula with precise dosing, timing and product guidance, built around your body.",
          price: "690",
          term: "One-time payment · Lifetime access",
          cta: "Get the Right Amount Formula",
          best: "People who want a clear, confident starting point — the right amount, made for them.",
          features: [
            "Personalised supplement formula",
            "Body-size adjusted dose ranges",
            "Timing and usage instructions",
            "Medication and lab safety flags",
            "Recommended products and alternatives",
            "60-day reassessment prompt"
          ]
        },
        {
          badge: "Premium · 90-day support",
          popular: "Most popular",
          name: "Living Protocol",
          desc: "Keep your right amount right as life changes. Everything in the Right Amount Formula, plus ongoing adjustments whenever sleep, stress, travel, training or diet shifts.",
          price: "1,590",
          term: "One payment · 90 days of support · Renew anytime",
          cta: "Start Living Protocol",
          best: "People who want their plan to keep up with the reality of everyday life.",
          features: [
            "Includes your full Right Amount Formula",
            "Learn which everyday foods give you what you need",
            "Adjusts timing and dosage as life changes",
            "Every change checked against your medications and labs",
            "Remembers your patterns over 90 days",
            "Just message when something changes — no apps, no tracking",
            "Stay consistent through travel, stress and disrupted sleep"
          ]
        }
      ],
      guarantee:
        "7-Day Satisfaction Guarantee. Give Living Protocol a real try. If anything’s not right, tell us — we’ll fix it, or refund you in full within 7 days."
    },
    results: {
      eyebrow: "REAL PEOPLE. REAL STORIES.",
      title: "Real people, real starting points.",
      intro:
        "Different lifestyles. Same goal: better health, more clarity, and a routine that feels possible.",
      cta: "Start Your Personalized Wellness Quiz",
      stories: [
        ["Daniel L.", "40, Bangkok", "Project Manager", "I turned 40 and realised I kept saying I wanted to make changes, but I didn't know where to start. I had a drawer full of random vitamins and no real plan. MattaNutra gave me a clear first step, without making the whole process feel overwhelming."],
        ["Mei Lin T.", "45, Singapore", "Operations Lead", "Between work, travel, and caring for my family, my health routine became whatever I could remember to do that day. MattaNutra helped me turn a messy supplement shelf into a simple plan that fits real life in Singapore."],
        ["Wanida P. (วนิดา)", "43, Khon Kaen", "Shop Owner", "My doctor told me my blood pressure was creeping up and I needed to make changes. I spent hours researching supplements online and ended up more confused than when I started. MattaNutra cut through all the noise and built me something that actually fits my life."],
        ["Malee S. (มาลี)", "41, Phuket", "Nurse Aide", "I work in a clinic, so everyone assumes I know exactly what supplements to take. The honest truth was the more I read, the less sure I felt. MattaNutra finally gave me a clear, sensible plan I could trust — for myself this time, not just my patients."]
      ]
    },
    origin: {
      eyebrow: "Our origin",
      title: "Designed in Chiang Mai, where the right amount is a way of life.",
      body:
        "MattaNutra began in northern Thailand, where traditions of moderation — eating just enough, resting at the right hour, working with the body’s own rhythms — have been quietly refined over centuries.",
      body2:
        "We built MattaNutra to translate that quiet wisdom into something modern, measurable, and personal: a plan that learns your body, adjusts when life shifts, and never asks you to become someone you’re not.",
      founders:
        "Founded by physicians, scientists, and innovative AI thinkers.",
      founderBody:
        "What goes into your body should be designed by people who understand what’s actually in it. MattaNutra was founded by an international group with an unusually broad foundation across medicine, science, technology, economics and the rewarding work of building things that last.",
      signoff: "From Chiang Mai, with care."
    },
    pricing: {
      eyebrow: "Simple pricing",
      title: "Start free.",
      accent: "Upgrade when ready.",
      intro:
        "Take the free questionnaire to get a starting plan. Upgrade only when you want deeper precision or ongoing AI support.",
      trust: [
        ["Secure & Private", "Your data is encrypted and never shared."],
        ["Science-Backed", "Personalised recommendations based on trusted evidence."],
        ["Adapt & Improve", "Plans evolve as your body and goals change."],
        ["AI + Human Oversight", "AI-powered guidance with human-reviewed safeguards."]
      ]
    },
    journal: {
      eyebrow: "From the journal",
      title: "Understanding the right amount.",
      intro:
        "Short, useful articles on personalised nutrition, smarter supplement choices, and healthier routines.",
      readMore: "Read article",
      fallback: [
        ["After 50", "May 10, 2026", "What changes after 50: energy, sleep and recovery", "The baselines shift after 50 — sleep architecture, recovery windows, and which inputs actually move the needle."],
        ["Budget", "May 9, 2026", "How to choose supplements without wasting money", "A short framework for separating priorities from nice-to-haves — and avoiding the most common overspends."],
        ["Method", "May 8, 2026", "Why a HealthScore beats a generic supplement list", "A useful plan starts by understanding what is actually holding you back — not by adding another bottle to the shelf."]
      ]
    },
    faq: {
      eyebrow: "Frequently asked",
      title: "Honest answers",
      accent: "before you start.",
      intro:
        "The questions we hear most often from people considering MattaNutra. If we miss yours, the LINE channel is the fastest way to ask.",
      items: [
        ["How does the AI actually decide what to recommend?", "Your answers — goals, body size, lifestyle, medications, diet, sleep, sun exposure, budget — are mapped to structured formulation logic covering 120+ ingredients."],
        ["Is my data private?", "Yes. Your assessment is yours. We don’t sell answers, we don’t share with advertisers, and you can request deletion at any time."],
        ["I’m on medication — is this safe for me?", "MattaNutra screens for common medication-supplement considerations and flags them in your plan. It is wellness guidance, not medical advice."],
        ["How is this different from a multivitamin?", "A multivitamin gives everyone the same fixed blend. MattaNutra starts from your inputs and produces a ranked, dosed plan."],
        ["Where do the recommended products come from?", "We point to products available on platforms Southeast Asian shoppers actually use, selected to match your formulation."],
        ["Is the free assessment really free?", "Yes. The questionnaire is free and no credit card is required. You can choose whether to upgrade after you complete it."],
        ["Why the Pāli name?", "Mattaññutā means knowing the right amount. The name is our promise: we’ll help you find your right amount, not sell you more of what you don’t need."]
      ]
    },
    final: {
      title: "Stop guessing.",
      accent: "Start knowing.",
      body:
        "Take the 2-minute Wellness Quiz and receive your personalised starting plan — built around your body, your goals, and your day.",
      primary: "Start the Wellness Quiz",
      secondary: "How it works",
      quote: "Mattaññutā — knowing the right amount."
    }
  },
  th: {
    hero: {
      eyebrow: "ภูมิปัญญาเดิม · วิทยาศาสตร์สมัยใหม่",
      title: "เลิกเดา.",
      accent: "เริ่มรู้.",
      intro:
        "แผนอาหารเสริมและสุขภาพที่ใช้ AI ช่วยออกแบบให้เข้ากับร่างกาย ไลฟ์สไตล์ และเป้าหมายที่สำคัญกับคุณจริง ๆ และปรับตามชีวิตที่เปลี่ยนไป",
      paliTitle: "Mattaññutā",
      pali:
        "ภาษาบาลีที่หมายถึงปัญญาในการรู้ปริมาณที่พอดี สุขภาพที่ดีไม่ได้มาจากการเพิ่มให้มากขึ้น แต่มาจากความพอดีอย่างแม่นยำ",
      primary: "เริ่มแบบประเมิน 2 นาที",
      secondary: "ดูวิธีทำงาน",
      checks: ["ไม่ต้องใช้บัตรเครดิต", "ประเมินส่วนผสมกว่า 120 รายการ", "มีการตรวจความเหมาะสม"],
      ingredientPills: ["แมกนีเซียม", "วิตามิน D3", "โอเมก้า-3", "อัชวกันธา", "สังกะสี", "ครีเอทีน"]
    },
    problem: {
      eyebrow: "ปัญหาที่เราแก้",
      title: "จากความสับสนเรื่องอาหารเสริม สู่แผนประจำวันที่ชัดเจน",
      intro:
        "ผลิตภัณฑ์มากมาย คำกล่าวอ้างที่ขัดกัน และแทบไม่มีความเฉพาะบุคคล MattaNutra ให้จุดเริ่มต้นที่ชัดเจนและมีเหตุผลให้เชื่อมั่น",
      question: "คุ้นไหม?",
      issueTitle: "ตัวเลือกเยอะเกินไป คำแนะนำกลับไม่พอ",
      issues: [
        "ผลิตภัณฑ์จำนวนมากพร้อมคำกล่าวอ้างที่ซ้อนกัน",
        "เสียเงินกับอาหารเสริมที่อาจไม่เหมาะกับคุณ",
        "แผนทั่วไปที่ไม่ดูยา การนอน อาหาร และเป้าหมาย"
      ],
      answer: "MattaNutra ให้จุดเริ่มต้นที่ชัดเจน",
      solutions: [
        "แบบประเมินสั้น ๆ ที่ใช้เวลาไม่กี่นาที",
        "AI ช่วยจัดลำดับอาหารเสริมและข้อควรระวัง",
        "คำแนะนำผลิตภัณฑ์สำหรับผู้ซื้อในเอเชียตะวันออกเฉียงใต้"
      ]
    },
    promises: {
      eyebrow: "สิ่งที่คุณคาดหวังได้",
      title: "สี่คำมั่น.",
      accent: "หนึ่งแผนที่เรียบง่าย.",
      intro:
        "สี่สิ่งที่ทุกแผนของ MattaNutra ถูกออกแบบมาเพื่อให้คุณ ไม่ว่าคุณจะอายุเท่าไร มีเป้าหมายอะไร หรือเริ่มจากจุดไหน",
      cards: [
        ["ชัดเจน", "จากความสับสน", "เปลี่ยนความล้นหลามของชั้นวางอาหารเสริมให้เป็นรายการที่จัดลำดับอย่างชัดเจน"],
        ["มีหลักยึด", "ที่เชื่อถือได้", "คำแนะนำอิงงานวิจัยและตรวจความเหมาะสมกับยาและเงื่อนไขสุขภาพของคุณ"],
        ["เฉพาะคุณ", "ไม่ใช่สูตรเดียวกันทุกคน", "คำนึงถึงร่างกาย แสงแดด อาหาร การนอน การฝึก งบประมาณ และสิ่งที่คุณให้ความสำคัญ"],
        ["มั่นใจ", "ในการเลือกทุกครั้ง", "ซื้อบน Lazada หรือร้านขายยาใกล้บ้านโดยรู้ว่าควรมองหาอะไรและควรข้ามอะไร"]
      ]
    },
    tell: {
      eyebrow: "บทสนทนา 2 นาที",
      title: "บอก MattaNutra เกี่ยวกับคุณ...",
      intro:
        "แบบประเมินสั้น กระชับ ไม่มีศัพท์ยาก มีเฉพาะข้อมูลที่จำเป็นต่อแผนที่เข้ากับชีวิตจริง",
      privacy: "คำตอบเป็นของคุณ แผนก็เป็นของคุณ",
      down: "แล้วเราจะจัดการต่อให้",
      inputs: ["เป้าหมายและลำดับสุขภาพ", "ไลฟ์สไตล์และกิจกรรม", "ยาที่ใช้อยู่", "งบและข้อจำกัด", "สิ่งที่คุณแคร์"],
      output: "แผนส่วนตัวของคุณ"
    },
    how: {
      eyebrow: "วิธีทำงาน",
      title: "ไม่กี่นาทีวันนี้.",
      accent: "แผนที่ชัดขึ้นพรุ่งนี้.",
      intro: "จากแบบประเมินสู่คำแนะนำในสี่ขั้นตอนที่เข้าใจได้",
      steps: [
        ["ตอบ", "~ 2 นาที", "ตอบคำถามเรื่องเป้าหมาย นิสัย อาหาร การนอน ยา และงบ"],
        ["วิเคราะห์", "120+ ส่วนผสม", "คำตอบถูกแปลงเป็นลำดับความสำคัญ ช่วงโดส และข้อควรระวัง"],
        ["จับคู่", "พร้อมใช้ในเอเชีย", "รับคำแนะนำผลิตภัณฑ์เพื่อไม่ต้องเดาในร้านหรือบน Lazada"],
        ["ปรับ", "เตือนทบทวน 60 วัน", "เช็กอินเพิ่มเติมเพื่อปรับแผนเมื่อเป้าหมาย อาการ และไลฟ์สไตล์เปลี่ยน"]
      ]
    },
    protocol: {
      eyebrow: "Living Protocol · การสนับสนุน 90 วัน",
      title: "ชีวิตเปลี่ยนตลอด.",
      accent: "โปรโตคอลของคุณก็ตามทันได้.",
      intro:
        "การนอน ความเครียด การเดินทาง และกิจวัตรที่เปลี่ยน ล้วนเปลี่ยนสิ่งที่ร่างกายต้องการ Living Protocol ช่วยให้แผนอาหารเสริมและอาหารประจำวันสอดคล้องกับชีวิตจริง",
      primary: "ดู Living Protocol",
      secondary: "ดูวิธีทำงาน",
      ticks: [
        "ออกแบบโดยทีมแพทย์และตรวจความเหมาะสมกับยาและข้อมูลแล็บ",
        "ปรับตามการเดินทาง ความเครียด และการนอนไม่ดี",
        "ลดการเดาเมื่อชีวิตเปลี่ยน"
      ],
      chat: [
        ["MattaNutra", "สัปดาห์นี้มีอะไรเปลี่ยนไหม เช่น การนอน ความเครียด การเดินทาง หรือกิจวัตร?"],
        ["คุณ", "พรุ่งนี้เดินทางไปโตเกียว น่าจะนอนไม่ค่อยดีทั้งสัปดาห์"],
        ["MattaNutra", "รับทราบ เดินทาง 6 วันและอาจนอนแย่ลง ฉันปรับเล็กน้อย 3 จุด และคงส่วนที่เหลือไว้เหมือนเดิม"]
      ],
      updates: [
        "ทานแมกนีเซียมเร็วขึ้นเล็กน้อย เป็น 19:30 น. ตามเวลาท้องถิ่น",
        "เพิ่มอิเล็กโทรไลต์ระหว่างเที่ยวบินและทุกเช้าระหว่างเดินทาง",
        "อย่างอื่นคงไว้เหมือนเดิม"
      ],
      reasoning: [
        "แมกนีเซียมเร็วขึ้น ช่วยเลื่อนจังหวะผ่อนคลายให้เข้ากับเขตเวลา",
        "อิเล็กโทรไลต์ช่วยเรื่องน้ำในร่างกายจากเที่ยวบินและการเดินมากขึ้น",
        "คง adaptogen ไว้ เพราะการนอนยังไม่นิ่ง จึงไม่ควรเปลี่ยนหลายอย่างพร้อมกัน"
      ]
    },
    protocolBand: {
      title: "Right Amount Formula คือฐานของคุณ.",
      accent: "Living Protocol ช่วยให้ฐานนั้นเข้ากับชีวิตจริง.",
      body:
        "การเดินทาง ความเครียด การนอนไม่ดี และกิจวัตรที่เปลี่ยน ล้วนเปลี่ยนสิ่งที่ร่างกายต้องการ ฐานหลักไม่ต้องเปลี่ยน แต่รายละเอียดเล็ก ๆ รอบ ๆ ฐานนั้นควรปรับได้"
    },
    protocolHow: {
      eyebrow: "วิธีทำงาน",
      title: "สามขั้นตอน.",
      accent: "ไม่ต้องเรียนรู้แอปใหม่.",
      intro:
        "Living Protocol อยู่ในช่องทางข้อความที่คุณใช้อยู่แล้ว คุณบอกว่าอะไรเปลี่ยน แล้วระบบช่วยจัดการต่อ",
      steps: [
        ["บอก MattaNutra ว่าอะไรเปลี่ยน", "ส่งข้อความสั้น ๆ ผ่าน LINE หรือ WhatsApp ก็พอ ไม่ต้องกรอกฟอร์มหรือเรียนรู้แอปใหม่", ["ช่วงนี้นอนไม่ดี", "พรุ่งนี้เดินทางไปทำงาน", "ช่วงนี้ซ้อมหนักขึ้น"]],
        ["โปรโตคอลปรับรอบตัวคุณ", "จาก stack ปัจจุบัน เป้าหมาย และข้อควรระวัง MattaNutra แปลงข้อมูลนั้นเป็นการปรับที่ชัดเจน เช่น เวลา ปริมาณ หรืออาหารที่ช่วยสนับสนุน", ["เลื่อนแมกนีเซียมให้เร็วขึ้นเล็กน้อย", "เมล็ดฟักทองเป็นแหล่งแมกนีเซียมที่ดี", "คง adaptogen ไว้จนกว่าการนอนจะนิ่ง"]],
        ["ทำต่อได้โดยไม่ต้องคิดเยอะ", "คุณไม่ต้องค้นคว้าหรือเริ่มใหม่ทุกครั้งที่ชีวิตยุ่ง แค่ได้สิ่งที่ควรทำไม่กี่อย่างและความมั่นใจว่ามันเหมาะกับคุณ", ["ไม่ต้องคิดใหม่ทุกครั้งที่ชีวิตเปลี่ยน", "ปรับเล็กน้อยให้แผนยังใช้ได้จริง", "ปริมาณที่พอดียังคงพอดี"]]
      ]
    },
    food: {
      eyebrow: "อาหารและอาหารเสริมไปด้วยกัน",
      title: "บางครั้งแหล่งที่ดีที่สุดอยู่บนจานของคุณ",
      intro:
        "อาหารเสริมเติมช่องว่าง แต่อาหารควรมาก่อน เมื่อ Living Protocol เห็นสิ่งที่ร่างกายต้องการ ระบบไม่ได้มองหาแคปซูลทันที แต่บอกอาหารประจำวันที่มีสารนั้นตามธรรมชาติ",
      cards: [
        ["แมกนีเซียมต่ำ?", "เมล็ดฟักทอง ผักโขม และถั่วดำเป็นแหล่งธรรมชาติที่เข้มข้น", ["เมล็ดฟักทอง", "ผักโขม", "ถั่วดำ"]],
        ["ต้องการโครเมียมเพิ่ม?", "พบได้ในอาหารที่หลายคนไม่คาดคิด เช่น น้ำองุ่น บรอกโคลี และธัญพืชเต็มเมล็ด", ["น้ำองุ่น", "บรอกโคลี", "ธัญพืชเต็มเมล็ด"]],
        ["อาหารครอบคลุมแล้ว?", "ถ้ามื้ออาหารทำหน้าที่ได้ดี Living Protocol จะบอกให้ข้ามอาหารเสริมนั้นและประหยัดเงิน", ["อาหารพอแล้ว"]]
      ],
      note:
        "ไม่ต้องจดอาหาร ไม่ต้องนับแคลอรี แค่ถามเมื่ออยากรู้ และได้คำแนะนำกลับไปสู่จานที่เหมาะกว่า"
    },
    difference: {
      eyebrow: "สิ่งที่ต่าง",
      title: "มากกว่าคำตอบ.",
      accent: "คือโปรโตคอลที่รู้จักคุณ.",
      body:
        "ใครก็ค้นได้ว่าการเดินทางส่งผลต่อแมกนีเซียมหรือไม่ แต่ส่วนที่ยากคือมันส่งผลต่อแผนของคุณอย่างไร ทั้ง stack ของคุณ ยาของคุณ และสัปดาห์ที่ผ่านมา",
      bullets: [
        "ระบบรู้สิ่งที่คุณใช้อยู่แล้ว จึงไม่ต้องอธิบายใหม่ทุกครั้ง",
        "ทุกการปรับตรวจเทียบกับยาและข้อมูลแล็บของคุณ",
        "ตลอด 90 วัน ระบบเริ่มเห็นรูปแบบของคุณ ไม่ใช่แค่สัปดาห์นี้",
        "คุณไม่ต้องรู้คำถามที่ถูกต้อง แค่บอกว่าเกิดอะไรขึ้น"
      ],
      closing:
        "คุณไม่ต้องเป็นเภสัชกรของตัวเอง แค่บอก MattaNutra ว่าอะไรเปลี่ยน แล้วระบบช่วยรักษาแผนให้พอดี"
    },
    planChoice: {
      eyebrow: "เลือกระดับคำแนะนำ",
      title: "เริ่มจากสูตรหลัก.",
      accent: "แล้วเพิ่มชั้นที่ปรับตามชีวิต.",
      intro:
        "เริ่มด้วยสูตรอาหารเสริมเฉพาะบุคคลที่ชัดเจน หรือเลือกการสนับสนุนต่อเนื่องที่ช่วยให้กิจวัตรปรับตามชีวิตจริง",
      plans: [
        {
          badge: "สูตรครั้งเดียว",
          name: "The Right Amount Formula",
          desc: "เลิกเดาหน้าชั้นวางอาหารเสริม แผนเฉพาะบุคคลพร้อมปริมาณ เวลาใช้ และคำแนะนำผลิตภัณฑ์",
          price: "690",
          term: "จ่ายครั้งเดียว · เข้าถึงได้ตลอด",
          cta: "รับ Right Amount Formula",
          best: "คนที่ต้องการจุดเริ่มต้นที่ชัดเจนและมั่นใจ",
          features: ["สูตรเฉพาะบุคคล", "ช่วงโดสตามร่างกาย", "คำแนะนำเวลาใช้", "ข้อควรระวังเรื่องยาและแล็บ", "ผลิตภัณฑ์และทางเลือก", "เตือนทบทวน 60 วัน"]
        },
        {
          badge: "พรีเมียม · สนับสนุน 90 วัน",
          popular: "นิยมที่สุด",
          name: "Living Protocol",
          desc: "คงความพอดีให้เหมาะกับชีวิตที่เปลี่ยน รวมทุกอย่างใน Right Amount Formula พร้อมการปรับต่อเนื่องเมื่อการนอน ความเครียด การเดินทาง การฝึก หรืออาหารเปลี่ยน",
          price: "1,590",
          term: "จ่ายครั้งเดียว · สนับสนุน 90 วัน · ต่ออายุได้",
          cta: "เริ่ม Living Protocol",
          best: "คนที่อยากให้แผนตามทันชีวิตประจำวันจริง",
          features: ["รวม Right Amount Formula", "เรียนรู้อาหารประจำวันที่ให้สิ่งที่คุณต้องการ", "ปรับเวลาและปริมาณเมื่อชีวิตเปลี่ยน", "ทุกการเปลี่ยนตรวจกับยาและแล็บ", "จำรูปแบบของคุณใน 90 วัน", "แค่ส่งข้อความเมื่อมีอะไรเปลี่ยน", "ทำต่อได้แม้เดินทาง เครียด หรือนอนสะดุด"]
        }
      ],
      guarantee:
        "รับประกันความพึงพอใจ 7 วัน ลอง Living Protocol อย่างจริงจัง หากมีอะไรไม่ตรง เราจะแก้ไขหรือคืนเงินเต็มจำนวนภายใน 7 วัน"
    },
    results: {
      eyebrow: "คนจริง เรื่องจริง",
      title: "คนต่างชีวิต จุดเริ่มต้นต่างกัน.",
      intro: "เป้าหมายเดียวกันคือสุขภาพที่ดีขึ้น ความชัดเจนมากขึ้น และกิจวัตรที่ทำได้จริง",
      cta: "เริ่มแบบประเมิน Wellness Quiz",
      stories: [
        ["Daniel L.", "40, Bangkok", "Project Manager", "พออายุ 40 ผมรู้ตัวว่าพูดตลอดว่าอยากเปลี่ยน แต่ไม่รู้จะเริ่มตรงไหน ลิ้นชักเต็มไปด้วยวิตามินแบบสุ่ม ๆ MattaNutra ให้ก้าวแรกที่ชัดเจนโดยไม่ทำให้รู้สึกหนักเกินไป"],
        ["Mei Lin T.", "45, Singapore", "Operations Lead", "ระหว่างงาน การเดินทาง และดูแลครอบครัว กิจวัตรสุขภาพของฉันกลายเป็นอะไรที่นึกออกวันนั้น MattaNutra ช่วยเปลี่ยนชั้นอาหารเสริมที่ยุ่งให้เป็นแผนเรียบง่ายที่เข้ากับชีวิตจริง"],
        ["Wanida P. (วนิดา)", "43, Khon Kaen", "Shop Owner", "คุณหมอบอกว่าความดันเริ่มสูงและต้องปรับบางอย่าง ฉันค้นเรื่องอาหารเสริมอยู่นานจนสับสนกว่าเดิม MattaNutra ช่วยตัดเสียงรบกวนและสร้างแผนที่เข้ากับชีวิตฉัน"],
        ["Malee S. (มาลี)", "41, Phuket", "Nurse Aide", "ฉันทำงานในคลินิก ทุกคนเลยคิดว่าฉันรู้ว่าควรกินอะไร แต่ยิ่งอ่านก็ยิ่งไม่แน่ใจ MattaNutra ให้แผนที่ชัด สมเหตุผล และไว้ใจได้สำหรับตัวฉันเอง"]
      ]
    },
    origin: {
      eyebrow: "จุดเริ่มต้น",
      title: "ออกแบบในเชียงใหม่ ที่ซึ่งความพอดีเป็นวิถีชีวิต",
      body:
        "MattaNutra เริ่มต้นในภาคเหนือของไทย ที่ประเพณีเรื่องความพอดี การกินแต่พอเหมาะ การพักในเวลาที่ควร และการทำงานกับจังหวะของร่างกาย ถูกสั่งสมอย่างเงียบ ๆ มาหลายศตวรรษ",
      body2:
        "เราสร้าง MattaNutra เพื่อแปลภูมิปัญญานั้นให้ทันสมัย วัดได้ และเป็นส่วนตัว แผนที่เรียนรู้ร่างกายคุณ ปรับเมื่อชีวิตเปลี่ยน และไม่บังคับให้คุณกลายเป็นคนอื่น",
      founders: "ก่อตั้งโดยแพทย์ นักวิทยาศาสตร์ และนักคิดด้าน AI",
      founderBody:
        "สิ่งที่เข้าสู่ร่างกายควรถูกออกแบบโดยคนที่เข้าใจว่าข้างในนั้นเกิดอะไรขึ้น ทีมของเรามีพื้นฐานหลากหลายทั้งแพทยศาสตร์ วิทยาศาสตร์ เทคโนโลยี เศรษฐศาสตร์ และการสร้างสิ่งที่อยู่ได้นาน",
      signoff: "จากเชียงใหม่ ด้วยความใส่ใจ"
    },
    pricing: {
      eyebrow: "ราคาที่เรียบง่าย",
      title: "เริ่มฟรี.",
      accent: "อัปเกรดเมื่อพร้อม.",
      intro:
        "ทำแบบประเมินฟรีเพื่อรับแผนตั้งต้น แล้วอัปเกรดเมื่อคุณต้องการความแม่นยำหรือการสนับสนุนต่อเนื่องมากขึ้น",
      trust: [
        ["ปลอดภัยและเป็นส่วนตัว", "ข้อมูลถูกเข้ารหัสและไม่แบ่งปัน"],
        ["อิงหลักฐาน", "คำแนะนำเฉพาะบุคคลจากหลักฐานที่เชื่อถือได้"],
        ["ปรับและดีขึ้น", "แผนเปลี่ยนตามร่างกายและเป้าหมาย"],
        ["AI + คนดูแล", "คำแนะนำด้วย AI พร้อมระบบตรวจทานโดยคน"]
      ]
    },
    journal: {
      eyebrow: "จากบทความ",
      title: "อ่านเรื่องการรู้ปริมาณที่พอดี",
      intro: "บทความสั้น ๆ เรื่องโภชนาการเฉพาะบุคคล การเลือกอาหารเสริมที่ฉลาดขึ้น และกิจวัตรสุขภาพ",
      readMore: "อ่านบทความ",
      fallback: [
        ["หลัง 50", "10 พ.ค. 2026", "อะไรเปลี่ยนหลังวัย 50: พลังงาน การนอน และการฟื้นตัว", "พื้นฐานหลายอย่างเปลี่ยน ทั้งโครงสร้างการนอน หน้าต่างการฟื้นตัว และปัจจัยที่ส่งผลจริง"],
        ["งบประมาณ", "9 พ.ค. 2026", "เลือกอาหารเสริมอย่างไรไม่ให้เสียเงินฟรี", "กรอบสั้น ๆ เพื่อแยกสิ่งสำคัญจากสิ่งที่มีก็ดี และหลีกเลี่ยงการจ่ายเกินที่พบบ่อย"],
        ["วิธีคิด", "8 พ.ค. 2026", "ทำไม HealthScore ดีกว่ารายการอาหารเสริมทั่วไป", "แผนที่มีประโยชน์เริ่มจากการเข้าใจว่าอะไรเป็นตัวถ่วง ไม่ใช่เพิ่มอีกขวดเข้าชั้น"]
      ]
    },
    faq: {
      eyebrow: "คำถามที่พบบ่อย",
      title: "คำตอบตรงไปตรงมา",
      accent: "ก่อนเริ่ม",
      intro: "คำถามที่เราได้ยินบ่อยจากคนที่กำลังพิจารณา MattaNutra หากไม่มีคำถามของคุณ LINE คือช่องทางที่เร็วที่สุด",
      items: [
        ["AI ตัดสินใจอย่างไร?", "คำตอบของคุณ เช่น เป้าหมาย ขนาดร่างกาย ไลฟ์สไตล์ ยา อาหาร การนอน แสงแดด และงบ ถูกจับคู่กับตรรกะการสร้างสูตรที่มีโครงสร้างกว่า 120 ส่วนผสม"],
        ["ข้อมูลเป็นส่วนตัวไหม?", "ใช่ แบบประเมินเป็นของคุณ เราไม่ขายคำตอบ ไม่แบ่งปันกับผู้ลงโฆษณา และคุณสามารถขอลบข้อมูลได้"],
        ["ถ้ากินยาอยู่ ปลอดภัยไหม?", "MattaNutra คัดกรองข้อควรระวังที่พบบ่อยระหว่างยาและอาหารเสริม แต่เป็นคำแนะนำเพื่อสุขภาพ ไม่ใช่คำแนะนำทางการแพทย์"],
        ["ต่างจากมัลติวิตามินอย่างไร?", "มัลติวิตามินให้สูตรเดียวกับทุกคน MattaNutra เริ่มจากข้อมูลของคุณและสร้างแผนที่จัดลำดับและมีช่วงโดส"],
        ["ผลิตภัณฑ์แนะนำมาจากไหน?", "เราแนะนำผลิตภัณฑ์ที่มีในแพลตฟอร์มที่ผู้ซื้อเอเชียตะวันออกเฉียงใต้ใช้จริง และเลือกให้เข้ากับสูตรของคุณ"],
        ["แบบประเมินฟรีจริงไหม?", "ฟรีจริงและไม่ต้องใช้บัตรเครดิต หลังทำเสร็จคุณเลือกได้ว่าจะอัปเกรดหรือไม่"],
        ["ทำไมใช้ชื่อภาษาบาลี?", "Mattaññutā หมายถึงการรู้ปริมาณที่พอดี ชื่อนี้คือคำมั่นว่าเราจะช่วยหาความพอดีของคุณ ไม่ใช่ขายให้มากขึ้น"]
      ]
    },
    final: {
      title: "เลิกเดา.",
      accent: "เริ่มรู้.",
      body:
        "ทำ Wellness Quiz 2 นาทีเพื่อรับแผนตั้งต้นเฉพาะบุคคลที่สร้างจากร่างกาย เป้าหมาย และวันจริงของคุณ",
      primary: "เริ่ม Wellness Quiz",
      secondary: "ดูวิธีทำงาน",
      quote: "Mattaññutā — การรู้ปริมาณที่พอดี"
    }
  }
} as const;

function SectionIntro({
  accent,
  body,
  eyebrow,
  light = false,
  title
}: Readonly<{
  accent?: string;
  body?: string;
  eyebrow: string;
  light?: boolean;
  title: string;
}>) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={light ? "mn-v11-eyebrow mn-v11-eyebrow--light" : "mn-v11-eyebrow"}>
        {eyebrow}
      </p>
      <h2 className={light ? "mn-v11-heading mn-v11-heading--light" : "mn-v11-heading"}>
        {title} {accent ? <span>{accent}</span> : null}
      </h2>
      {body ? (
        <p className={light ? "mn-v11-section-copy mn-v11-section-copy--light" : "mn-v11-section-copy"}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

function CheckItem({ children }: Readonly<{ children: string }>) {
  return (
    <li className="flex gap-3">
      <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--mn-teal)]" />
      <span>{children}</span>
    </li>
  );
}

export function LandingPage({
  assessmentPath,
  blogPosts,
  locale
}: LandingPageProps) {
  const copy = content[locale];
  const journalCards =
    blogPosts.length > 0
      ? blogPosts.map((post) => ({
          body: post.excerpt,
          date: post.date,
          href: post.href,
          tag: locale === "th" ? "บทความ" : "Journal",
          title: post.title
        }))
      : copy.journal.fallback.map(([tag, date, title, body]) => ({
          body,
          date,
          href: "#journal",
          tag,
          title
        }));

  return (
    <div className="flex-1">
      <section className="mn-v11-hero">
        <div className="mn-v11-container grid items-center gap-12 lg:grid-cols-[1fr_0.92fr]">
          <div>
            <p className="mn-v11-eyebrow">{copy.hero.eyebrow}</p>
            <h1 className="mt-6 max-w-4xl font-serif text-5xl font-medium leading-[0.98] text-[var(--mn-ink)] text-balance sm:text-6xl lg:text-7xl">
              {copy.hero.title} <span className="italic text-[var(--mn-teal-deep)]">{copy.hero.accent}</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--mn-ink-soft)] sm:text-xl">
              {copy.hero.intro}
            </p>
            <div className="mt-8 max-w-xl border-l-2 border-[var(--mn-gold)] pl-5">
              <p className="font-serif text-2xl italic text-[var(--mn-gold)]">
                {copy.hero.paliTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ash)]">
                {copy.hero.pali}
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="mn-brand-button" href={assessmentPath}>
                {copy.hero.primary}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link className="mn-secondary-button" href="#how-it-works">
                {copy.hero.secondary}
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--mn-ink-soft)]">
              {copy.hero.checks.map((item) => (
                <li className="flex items-center gap-2" key={item}>
                  <CheckCircle2 aria-hidden className="size-4 text-[var(--mn-teal)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mn-v11-hero-visual">
            <Image
              alt="MattaNutra brand mark"
              className="mx-auto h-auto w-full max-w-[24rem]"
              height={465}
              priority
              src={assets.brandMark}
              width={420}
            />
            <div className="mn-v11-ingredient-cloud">
              {copy.hero.ingredientPills.map((item) => (
                <span key={item}>
                  {item}
                  <strong>?</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mn-v11-section bg-[var(--mn-paper)]">
        <div className="mn-v11-container">
          <div className="max-w-3xl">
            <p className="mn-v11-eyebrow">{copy.problem.eyebrow}</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
              {copy.problem.title}
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--mn-ink-soft)]">
              {copy.problem.intro}
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
            <div className="overflow-hidden rounded-[var(--mn-radius-lg)] border border-[var(--mn-line)] bg-[var(--mn-cream)] lg:min-h-[28rem]">
              <Image
                alt="Woman in a supplement aisle, overwhelmed by choice"
                className="h-full w-full object-cover"
                height={666}
                src={assets.problem}
                width={1000}
              />
            </div>
            <div className="grid gap-5 lg:h-full lg:grid-rows-2">
              <div className="mn-v11-card">
                <p className="mn-v11-eyebrow">{copy.problem.question}</p>
                <h3 className="mt-3 text-2xl font-semibold text-[var(--mn-ink)]">
                  {copy.problem.issueTitle}
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {copy.problem.issues.map((item) => (
                    <li className="flex gap-3" key={item}>
                      <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--mn-error)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mn-v11-card mn-v11-card--mint">
                <h3 className="text-2xl font-semibold text-[var(--mn-ink)]">
                  {copy.problem.answer}
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {copy.problem.solutions.map((item) => (
                    <CheckItem key={item}>{item}</CheckItem>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mn-v11-section" id="promises">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.promises.accent}
            body={copy.promises.intro}
            eyebrow={copy.promises.eyebrow}
            title={copy.promises.title}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[Target, ShieldCheck, Sparkles, ShoppingBag].map((Icon, index) => {
              const [title, subtitle, body] = copy.promises.cards[index];
              return (
                <article className="mn-v11-card" key={title}>
                  <div className="flex items-center justify-between">
                    <span className="mn-v11-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="mn-v11-icon">
                      <Icon aria-hidden className="size-5" />
                    </span>
                  </div>
                  <h3 className="mt-7 text-2xl font-semibold text-[var(--mn-ink)]">{title}</h3>
                  <p className="mt-1 font-serif text-xl italic text-[var(--mn-gold)]">{subtitle}</p>
                  <p className="mt-4 text-sm leading-6 text-[var(--mn-ink-soft)]">{body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mn-v11-section bg-[var(--mn-paper)]">
        <div className="mn-v11-container">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="mn-v11-eyebrow">{copy.tell.eyebrow}</p>
              <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
                {copy.tell.title}
              </h2>
              <p className="mt-5 text-lg leading-8 text-[var(--mn-ink-soft)]">{copy.tell.intro}</p>
              <p className="mt-5 text-sm font-semibold text-[var(--mn-teal-deep)]">{copy.tell.privacy}</p>
              <p className="mt-8 font-serif text-2xl italic text-[var(--mn-gold)]">↓ {copy.tell.down}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[Target, Activity, Pill, CircleDollarSign, HeartPulse].map((Icon, index) => (
                <div className="mn-v11-card" key={copy.tell.inputs[index]}>
                  <span className="mn-v11-number">{String(index + 1).padStart(2, "0")}</span>
                  <Icon aria-hidden className="mt-6 size-8 text-[var(--mn-teal-deep)]" />
                  <h3 className="mt-4 text-lg font-semibold text-[var(--mn-ink)]">{copy.tell.inputs[index]}</h3>
                </div>
              ))}
              <div className="mn-v11-card mn-v11-card--dark sm:col-span-2">
                <p className="font-serif text-3xl font-medium text-white">{copy.tell.output}</p>
                <ArrowRight aria-hidden className="mt-6 size-8 text-[var(--mn-teal-glow)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mn-v11-section" id="how-it-works">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.how.accent}
            body={copy.how.intro}
            eyebrow={copy.how.eyebrow}
            title={copy.how.title}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {copy.how.steps.map(([title, label, body], index) => (
              <article className="mn-v11-step" key={title}>
                <span>{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <strong>{label}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v11-section mn-v11-protocol" id="living-protocol">
        <div className="mn-v11-container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mn-v11-eyebrow mn-v11-eyebrow--light">{copy.protocol.eyebrow}</p>
            <h2 className="mt-4 font-serif text-5xl font-medium leading-tight text-white text-balance sm:text-6xl">
              {copy.protocol.title} <span className="italic text-[var(--mn-teal-glow)]">{copy.protocol.accent}</span>
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--mn-teal-glow)]">{copy.protocol.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="mn-brand-button" href="#plans">
                {copy.protocol.primary}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link className="mn-secondary-button" href="#how">
                {copy.protocol.secondary}
              </Link>
            </div>
            <ul className="mt-8 space-y-3 text-sm leading-6 text-[var(--mn-teal-glow)]">
              {copy.protocol.ticks.map((item) => (
                <li className="flex gap-3" key={item}>
                  <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--mn-gold-soft)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mn-v11-phone">
            <div className="mn-v11-phone-header">
              <span>M</span>
              <div>
                <strong>MattaNutra</strong>
                <small>Living Protocol active</small>
              </div>
            </div>
            <div className="space-y-3">
              {copy.protocol.chat.map(([sender, message], index) => (
                <div className={index === 1 ? "mn-v11-chat mn-v11-chat--user" : "mn-v11-chat"} key={`${sender}-${message}`}>
                  <strong>{sender}</strong>
                  <p>{message}</p>
                </div>
              ))}
            </div>
            <div className="mn-v11-update-card">
              <p className="mn-v11-eyebrow">{locale === "th" ? "แผนอัปเดต" : "Updated protocol"}</p>
              <h3>{locale === "th" ? "ทริปโตเกียวของคุณ — 3 จุดเล็ก ๆ" : "Your Tokyo trip — 3 small changes"}</h3>
              <ul>
                {copy.protocol.updates.map((item) => (
                  <CheckItem key={item}>{item}</CheckItem>
                ))}
              </ul>
            </div>
            <div className="mn-v11-reasoning">
              {copy.protocol.reasoning.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mn-v11-band">
        <div className="mn-v11-container">
          <h2>
            {copy.protocolBand.title} <span>{copy.protocolBand.accent}</span>
          </h2>
          <p>{copy.protocolBand.body}</p>
        </div>
      </section>

      <section className="mn-v11-section" id="how">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.protocolHow.accent}
            body={copy.protocolHow.intro}
            eyebrow={copy.protocolHow.eyebrow}
            title={copy.protocolHow.title}
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {copy.protocolHow.steps.map(([title, body, examples], index) => (
              <article className="mn-v11-card" key={title}>
                <span className="mn-v11-number">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-6 text-2xl font-semibold text-[var(--mn-ink)]">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-[var(--mn-ink-soft)]">{body}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {examples.map((item) => (
                    <span className="mn-v11-mini-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v11-section bg-[var(--mn-paper)]">
        <div className="mn-v11-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mn-v11-eyebrow">{copy.food.eyebrow}</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
              {copy.food.title}
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--mn-ink-soft)]">{copy.food.intro}</p>
            <p className="mt-6 rounded-[var(--mn-radius-md)] border border-[var(--mn-line)] bg-[var(--mn-cream)] p-5 text-sm leading-6 text-[var(--mn-ash)]">
              {copy.food.note}
            </p>
          </div>
          <div className="grid gap-4">
            {[Leaf, Utensils, CircleDollarSign].map((Icon, index) => {
              const [title, body, foods] = copy.food.cards[index];
              return (
                <article className="mn-v11-card" key={title}>
                  <div className="flex items-start gap-4">
                    <span className="mn-v11-icon">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold text-[var(--mn-ink)]">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">{body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {foods.map((food) => (
                          <span className="mn-v11-mini-pill" key={food}>{food}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mn-v11-section">
        <div className="mn-v11-container grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionIntro
            accent={copy.difference.accent}
            body={copy.difference.body}
            eyebrow={copy.difference.eyebrow}
            title={copy.difference.title}
          />
          <div className="mn-v11-card mn-v11-card--mint">
            <ul className="space-y-4 text-sm leading-6 text-[var(--mn-ink-soft)]">
              {copy.difference.bullets.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
            <p className="mt-6 border-t border-[var(--mn-line)] pt-6 font-serif text-2xl italic leading-8 text-[var(--mn-teal-deep)]">
              {copy.difference.closing}
            </p>
          </div>
        </div>
      </section>

      <section className="mn-v11-section bg-[var(--mn-paper)]" id="plans">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.planChoice.accent}
            body={copy.planChoice.intro}
            eyebrow={copy.planChoice.eyebrow}
            title={copy.planChoice.title}
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {copy.planChoice.plans.map((plan, index) => (
              <article className={index === 1 ? "mn-v11-price-card mn-v11-price-card--featured" : "mn-v11-price-card"} key={plan.name}>
                {"popular" in plan ? <span className="mn-v11-popular">{plan.popular}</span> : null}
                <p className="mn-v11-eyebrow">{plan.badge}</p>
                <h3>{plan.name}</h3>
                <p className="mn-v11-price-desc">{plan.desc}</p>
                <div className="mn-v11-price">
                  <span>THB</span>
                  <strong>{plan.price}</strong>
                </div>
                <p className="mn-v11-price-term">{plan.term}</p>
                <Link className="mn-brand-button w-full" href={assessmentPath}>
                  {plan.cta}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <ul className="mt-7 space-y-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {plan.features.map((feature) => (
                    <CheckItem key={feature}>{feature}</CheckItem>
                  ))}
                </ul>
                <p className="mt-7 rounded-[var(--mn-radius-md)] bg-[var(--mn-cream)] p-4 text-sm leading-6 text-[var(--mn-ash)]">
                  <strong className="text-[var(--mn-ink)]">{locale === "th" ? "เหมาะสำหรับ: " : "Best for: "}</strong>
                  {plan.best}
                </p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-3xl rounded-[var(--mn-radius-md)] border border-[var(--mn-gold-soft)] bg-[var(--mn-gold-tint)] p-5 text-center text-sm font-semibold leading-6 text-[var(--mn-ink)]">
            {copy.planChoice.guarantee}
          </p>
        </div>
      </section>

      <section className="mn-v11-section">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.pricing.accent}
            body={copy.pricing.intro}
            eyebrow={copy.pricing.eyebrow}
            title={copy.pricing.title}
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[Lock, BadgeCheck, RefreshCw, ShieldCheck].map((Icon, index) => {
              const [title, body] = copy.pricing.trust[index];
              return (
                <article className="mn-v11-card text-center" key={title}>
                  <span className="mn-v11-icon mx-auto">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--mn-ink)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--mn-ash)]">{body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mn-v11-section mn-v11-results" id="results-v11">
        <div className="mn-v11-container">
          <SectionIntro
            body={copy.results.intro}
            eyebrow={copy.results.eyebrow}
            light
            title={copy.results.title}
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {copy.results.stories.map(([name, meta, role, quote], index) => (
              <article className="mn-v11-story" key={name}>
                <Image
                  alt={name}
                  className="h-56 w-full rounded-[var(--mn-radius-md)] object-cover"
                  height={543}
                  src={assets.portraits[index]}
                  width={724}
                />
                <p className="mt-6 text-lg leading-8 text-white">“{quote}”</p>
                <div className="mt-6 border-t border-white/15 pt-5">
                  <h3>{name}</h3>
                  <p>{meta}</p>
                  <p>{role}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link className="mn-brand-button" href={assessmentPath}>
              {copy.results.cta}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mn-v11-section" id="origin">
        <div className="mn-v11-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="mn-v11-eyebrow">{copy.origin.eyebrow}</p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-5xl">
              {copy.origin.title}
            </h2>
            <p className="mt-6 text-lg leading-8 text-[var(--mn-ink-soft)]">{copy.origin.body}</p>
            <p className="mt-5 text-lg leading-8 text-[var(--mn-ink-soft)]">{copy.origin.body2}</p>
          </div>
          <div className="mn-v11-origin-stack">
            {assets.origin.map((src) => (
              <Image
                alt=""
                aria-hidden="true"
                height={256}
                key={src}
                src={src}
                width={280}
              />
            ))}
          </div>
          <div className="mn-v11-card lg:col-span-2">
            <h3 className="text-2xl font-semibold text-[var(--mn-ink)]">{copy.origin.founders}</h3>
            <p className="mt-4 text-sm leading-7 text-[var(--mn-ink-soft)]">{copy.origin.founderBody}</p>
            <p className="mt-6 font-serif text-2xl italic text-[var(--mn-gold)]">{copy.origin.signoff}</p>
          </div>
        </div>
      </section>

      <section className="mn-v11-section mn-v11-journal-section" id="journal">
        <div className="mn-v11-container">
          <SectionIntro
            body={copy.journal.intro}
            eyebrow={copy.journal.eyebrow}
            title={copy.journal.title}
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {journalCards.map((post) => (
              <Link className="mn-v11-journal-card" href={post.href} key={post.title}>
                <p className="mn-v11-eyebrow">{post.tag}</p>
                <p className="mn-v11-journal-date">{post.date}</p>
                <h3>{post.title}</h3>
                <p>{post.body}</p>
                <span>
                  {copy.journal.readMore}
                  <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v11-section" id="faq">
        <div className="mn-v11-container">
          <SectionIntro
            accent={copy.faq.accent}
            body={copy.faq.intro}
            eyebrow={copy.faq.eyebrow}
            title={copy.faq.title}
          />
          <div className="mx-auto mt-12 max-w-4xl divide-y divide-[var(--mn-line)] rounded-[var(--mn-radius-lg)] border border-[var(--mn-line)] bg-[var(--mn-paper)]">
            {copy.faq.items.map(([question, answer]) => (
              <details className="group p-6" key={question}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-[var(--mn-ink)]">
                  {question}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--mn-mint)] text-[var(--mn-teal-deep)] transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-[var(--mn-ink-soft)]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mn-v11-final-cta" id="assessment">
        <div className="mn-v11-container text-center">
          <h2>
            {copy.final.title} <span>{copy.final.accent}</span>
          </h2>
          <p>{copy.final.body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link className="mn-brand-button" href={assessmentPath}>
              {copy.final.primary}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link className="mn-secondary-button" href="#how-it-works">
              {copy.final.secondary}
            </Link>
          </div>
          <p className="mt-8 font-serif text-2xl italic text-[var(--mn-gold)]">{copy.final.quote}</p>
        </div>
      </section>
    </div>
  );
}
