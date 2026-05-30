import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";

export const assets = {
  heroFigure: "/v14/hero-figure.png",
  origin: [
    "/v14/origin-stage-1.png",
    "/v14/origin-stage-2.png",
    "/v14/origin-stage-3.png",
    "/v14/origin-stage-4.png",
    "/v14/origin-stage-5.png",
  ],
  problem: "/v14/problem-shopper.jpg",
  testimonials: [
    "/v14/testimonial-daniel.jpg",
    "/v14/testimonial-meilin.jpg",
    "/v14/testimonial-wanida.jpg",
    "/v14/testimonial-malee.jpg",
  ],
} as const;

const baseContent = {
  en: {
    hero: {
      eyebrow: "Ancient wisdom · Modern science",
      title: "Stop guessing.",
      accent: "Start knowing.",
      intro:
        "AI-powered supplement and wellness plans built around your body, your lifestyle, and the goals that actually matter to you — and that adapt as your life does.",
      paliTitle: "Mattaññutā",
      pali: "Pāli for the wisdom of knowing the right amount — that wellbeing comes not from more, but from exactly enough.",
      primary: "Start designing your Right Amount",
      secondary: "How it works",
      microcopy:
        "Start with a free Health Score that shows where you stand. Your personalised Right Amount Formula is ready when you are.",
      checks: [
        "No credit card required",
        "120+ ingredients evaluated",
        "Safety checks included",
      ],
      ingredientPills: [
        "Magnesium",
        "Vitamin D3",
        "Omega-3",
        "Ashwagandha",
        "Zinc",
      ],
    },
    problem: {
      eyebrow: "The problem",
      title: "Too many bottles.",
      accent: "Too little certainty.",
      body: "Walk into any pharmacy and the wall of supplements is overwhelming. Hundreds of options, conflicting advice, and no clear answer to the only question that matters: what does my body actually need?",
      body2:
        "Most people end up guessing — buying too much of what they don't need, missing what they do, and quietly wondering if any of it is working.",
      imageAlt: "Shopper overwhelmed by supplement choices",
    },
    promises: {
      eyebrow: "What you can expect",
      title: "Four promises.",
      accent: "One simple plan.",
      intro: "What every MattaNutra plan is designed to deliver.",
      cards: [
        ["Clarity", "from confusion"],
        ["Guidance", "you can trust"],
        ["Personalised", "just for you"],
        ["Confidence", "in every choice"],
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "The right amount of questions.",
      accent: "Nothing more, nothing missed.",
      intro:
        "From a short, focused questionnaire to recommendations you can trust — in four steps.",
      steps: [
        [
          "Answer",
          "Short but detailed",
          "A few focused questions about your goals, health priorities, lifestyle, medications, budget, and what you genuinely care about. No jargon, no fluff.",
        ],
        [
          "Analyse",
          "120+ ingredients",
          "Your answers are mapped to supplement priorities, dosage ranges and safety considerations.",
        ],
        [
          "Match",
          "SE Asia ready",
          "Receive product guidance so you're not guessing in-store or on Lazada.",
        ],
        [
          "Refine",
          "60-day prompts",
          "Optional check-ins update your plan as goals, symptoms and lifestyle change over time.",
        ],
      ],
    },
    protocol: {
      active: "Living Protocol active",
      channel: "Line / WhatsApp",
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
        "Less second-guessing when life shifts",
      ],
      chat: [
        "Anything different this week — sleep, stress, travel or routine?",
        "I'm travelling to Tokyo tomorrow. Probably going to sleep badly this week.",
        "Got it — six days in Tokyo with some sleep disruption. I've made three small adjustments and kept everything else steady. Here's your plan for the trip.",
      ],
      updateLabel: "Updated protocol",
      tripTitle: "Your Tokyo trip — 3 small changes",
      updates: [
        "Take magnesium a little earlier — 7:30pm local instead of 9:30pm",
        "Add electrolytes on your flight and each morning while you're away",
        "Everything else stays exactly the same",
      ],
      basedOn:
        "Based on: 6-day trip · sleep disruption likely · meetings-heavy · more walking",
      reasoningLabel: "See the reasoning",
      reasoning: [
        "Magnesium earlier — helps move your wind-down forward as you adjust to the timezone.",
        "Electrolytes added — supports hydration through the flight and your higher walking load in the city.",
        "Adaptogen held steady — your stress is rising, but your sleep has been unsettled lately, so we're holding the dose rather than stacking changes.",
      ],
      foodNudge:
        "One more thing — your last check showed your magnesium sitting a little low. I've got it in your plan, but you can top it up naturally too:",
      foodTags: ["pumpkin seeds", "spinach", "black beans"],
      vitaminQuestion:
        "Oh nice, didn't know that. What about my vitamin C — should I add a supplement?",
      vitaminAnswer:
        "Honestly? You probably don't need to. With the fruit and veg already in your week, you're comfortably covered. I'd save that one — food's doing the job.",
    },
    protocolBand: {
      title: "Your Right Amount Formula is the foundation.",
      accent: "Your Living Protocol keeps it aligned with real life.",
      body: "Travel, stress, poor sleep and changing routines all shift what your body needs. Your foundation doesn't change — but the small adjustments around it do.",
    },
    practice: {
      eyebrow: "Living Protocol in practice",
      title: "Three steps.",
      accent: "No apps to learn.",
      intro:
        "Living Protocol fits into the messaging you already use. You tell it what changed; it does the rest.",
      steps: [
        [
          "Tell MattaNutra what changed",
          "A quick message through Line or WhatsApp is all it takes — no forms, no tracking, no apps to learn.",
          [
            "Sleeping badly this week.",
            "Travelling for work tomorrow.",
            "Started training harder lately.",
          ],
        ],
        [
          "Your protocol adapts around you",
          "Working from your current stack, goals and safety flags, MattaNutra turns that update into a few precise adjustments — timing, dosage, or a temporary addition — and points you to everyday foods that support what your body needs.",
          [
            "Move magnesium slightly earlier this week.",
            "Pumpkin seeds are a great natural source of magnesium.",
            "Hold your adaptogen steady until sleep settles.",
          ],
        ],
        [
          "Stay consistent without overthinking it",
          "You don't have to research, second-guess, or restart from scratch every time life gets busy. You just get a few simple things to do — and the confidence they're right for you.",
          [
            "No need to rethink your routine every time life shifts.",
            "Small adjustments keep your plan realistic.",
            "Your right amount stays right.",
          ],
        ],
      ],
    },
    food: {
      eyebrow: "Food & supplements, together",
      title: "The best source is sometimes",
      accent: "on your plate.",
      intro:
        "Supplements fill the gaps — but food fills them first. When Living Protocol spots something your body needs, it doesn't just reach for a capsule. It tells you which everyday foods are naturally rich in it, so you can choose: top up at dinner, or top up from the bottle. Either way, you're finally knowing, not guessing.",
      cards: [
        [
          "Low on magnesium?",
          "Pumpkin seeds, spinach and black beans are some of the richest natural sources.",
          ["pumpkin seeds", "spinach", "black beans"],
        ],
        [
          "Need more chromium?",
          "It turns up in unexpected places — grape juice, broccoli and whole grains.",
          ["grape juice", "broccoli", "whole grains"],
        ],
        [
          "Already covered?",
          "If your meals are doing the job, Living Protocol will tell you to skip the supplement — and save your money.",
          ["food's got it"],
        ],
      ],
      note: "No food diary. No calorie counting. Just a quick answer when you want one, and a nudge toward the right plate when it helps.",
    },
    difference: {
      eyebrow: "Why it's different",
      title: "More than an answer.",
      accent: "A protocol that knows you.",
      paragraphs: [
        "Anyone can look up whether travel affects magnesium. The hard part is knowing how it affects your plan — your stack, your medications, the weeks you've just had — and what to actually do about it. That's the part Living Protocol handles for you.",
        "It already knows everything you take, so there's nothing to re-explain each time something changes. Every adjustment it suggests is checked against your medications and lab flags — the kind of safety net that only works when the guidance is built around you. Over 90 days it comes to recognise your patterns, so its advice reflects not just this week but the trend behind it.",
        "You don't need to become your own pharmacist. You just tell MattaNutra what's changed, and it keeps your protocol right.",
      ],
    },
    bridge: {
      title: "Ready to design your Right Amount?",
      body: "Start with a few focused questions and your free Health Score. Your personalised plan — and the option to add Living Protocol — is one step away.",
      cta: "Start designing your Right Amount",
      note: "See full plans and pricing below.",
    },
    results: {
      eyebrow: "Real people. Real stories.",
      title: "Real people, real starting points.",
      intro:
        "Different lifestyles. Same goal: better health, more clarity, and a routine that feels possible.",
      cta: "Start designing your Right Amount",
      join: "Join thousands of people who are making smarter, more confident choices for their health.",
      fallback: [
        {
          id: "daniel",
          image: assets.testimonials[0],
          name: "Daniel L.",
          place: "40, Bangkok",
          role: "Project Manager",
          quote:
            "I turned 40 and realised I kept saying I wanted to make changes, but I didn't know where to start. I had a drawer full of random vitamins and no real plan. MattaNutra gave me a clear first step, without making the whole process feel overwhelming.",
        },
        {
          id: "meilin",
          image: assets.testimonials[1],
          name: "Mei Lin T.",
          place: "45, Singapore",
          role: "Operations Lead",
          quote:
            "Between work, travel, and caring for my family, my health routine became whatever I could remember to do that day. MattaNutra helped me turn a messy supplement shelf into a simple plan that fits real life in Singapore.",
        },
        {
          id: "wanida",
          image: assets.testimonials[2],
          name: "Wanida P. (วนิดา)",
          place: "43, Khon Kaen",
          role: "Shop Owner",
          quote:
            "My doctor told me my blood pressure was creeping up and I needed to make changes. I spent hours researching supplements online and ended up more confused than when I started. MattaNutra cut through all the noise and built me something that actually fits my life.",
        },
        {
          id: "malee",
          image: assets.testimonials[3],
          name: "Malee S. (มาลี)",
          place: "41, Phuket",
          role: "Nurse Aide",
          quote:
            "I work in a clinic, so everyone assumes I know exactly what supplements to take. The honest truth was the more I read, the less sure I felt. MattaNutra finally gave me a clear, sensible plan I could trust — for myself this time, not just my patients.",
        },
      ],
    },
    origin: {
      eyebrow: "Our origin",
      title: "Designed in Chiang Mai,",
      accent: "where the right amount is a way of life.",
      body: "MattaNutra began in northern Thailand, where traditions of moderation — eating just enough, resting at the right hour, working with the body's own rhythms — have been quietly refined over centuries.",
      body2:
        "We built MattaNutra to translate that quiet wisdom into something modern, measurable, and personal: a plan that learns your body, adjusts when life shifts, and never asks you to become someone you're not.",
      buildAlt:
        "The MattaNutra logo, built in five stages from outline to finished mark",
      founders:
        "Founded by physicians, scientists, and innovative AI thinkers.",
      founderParagraphs: [
        "What goes into your body should be designed by people who understand what's actually in it.",
        "MattaNutra was founded by an international group with an unusually broad foundation across medicine, science, technology, economics and the rewarding work of building things that last.",
        "Between us, more than a hundred years of professional practice — in medicine, in science, in technology, and in building things that last.",
      ],
      signoff: "From Chiang Mai, with care.",
      tagline: "Ancient wisdom · Modern science",
    },
    pricing: {
      eyebrow: "Simple pricing",
      title: "Start free.",
      accent: "Upgrade when ready.",
      intro:
        "Take the free questionnaire to get a starting plan. Upgrade only when you want deeper precision or ongoing AI support.",
      offer: "Limited time offer",
      plans: [
        {
          badge: "One-time plan",
          name: "Right Amount Formula",
          desc: "Your personalised supplement formula with precise dosing, timing, and product guidance.",
          originalPrice: "THB 990",
          saving: "Save 30%",
          currency: "THB",
          price: "690",
          termLabel: "One-time",
          term: "One-time payment · Lifetime access",
          cta: "Get the Right Amount Formula",
          plan: "precision" as const,
          best: "People who want a clear, confident starting point — the right amount, made for them.",
          features: [
            "Personalised supplement formula",
            "Body-size adjusted dose ranges",
            "Timing and usage instructions",
            "Medication and lab safety flags",
            "Recommended products and alternatives",
            "60-day reassessment prompt",
          ],
          guaranteeTitle: "Clarity Guarantee.",
          guarantee:
            "If your plan doesn't feel clear and useful, we'll make it right or refund you within 7 days.",
        },
        {
          badge: "Premium · 90-day support",
          popular: "Most popular",
          name: "Living Protocol",
          desc: "Keep your right amount right as life changes. Everything in the Right Amount Formula, plus ongoing adjustments whenever your sleep, stress, travel, training or diet shifts.",
          originalPrice: "THB 1,890",
          saving: "Save 16%",
          currency: "THB",
          price: "1,590",
          termLabel: "For 90 days",
          term: "One payment · 90 days of support · Renew anytime",
          cta: "Start Living Protocol",
          plan: "pro" as const,
          best: "People who want their plan to keep up with the reality of everyday life.",
          features: [
            "Includes your full Right Amount Formula",
            "Learn which everyday foods give you what you need",
            "Adjusts timing and dosage as life changes",
            "Every change checked against your medications and labs",
            "Remembers your patterns over 90 days",
            "Just message when something changes — no apps, no tracking",
            "Stay consistent through travel, stress and disrupted sleep",
          ],
          guaranteeTitle: "7-Day Satisfaction Guarantee.",
          guarantee:
            "Give Living Protocol a real try. If anything's not right, tell us — we'll fix it, or refund you in full within 7 days. No fuss.",
        },
      ],
      trust: [
        ["Secure & private", "Your data is encrypted and never shared."],
        [
          "Science-backed",
          "Personalised recommendations based on trusted evidence.",
        ],
        ["Adapt & improve", "Plans evolve as your body and goals change."],
        [
          "AI + human oversight",
          "AI-powered guidance with human-reviewed safeguards.",
        ],
      ],
    },
    journal: {
      eyebrow: "From the Journal",
      title: "Learn the",
      accent: "right amount.",
      browse: "Browse all articles",
      tag: "Journal",
      readMore: "Read article",
      fallback: [
        [
          "Foundations",
          'Why "more" is rarely the answer with supplements',
          "The science of sufficiency — and why your body often needs less than the label suggests.",
        ],
        [
          "Nutrition",
          "Eight everyday foods richer in magnesium than you'd think",
          "Before you reach for a capsule, check your plate — these staples do a lot of quiet work.",
        ],
        [
          "Living well",
          "How travel quietly changes what your body needs",
          "Timezones, sleep and hydration all shift the maths — here's how to adjust without overthinking.",
        ],
      ],
    },
    faq: {
      eyebrow: "Questions",
      title: "Good questions,",
      accent: "honest answers.",
      items: [
        [
          "Is my data private?",
          "Yes. Your assessment is yours. We don't sell answers, we don't share with advertisers, and you can request deletion at any time. Living Protocol conversations are stored only to maintain continuity in your plan.",
        ],
        [
          "I'm on medication — is this safe for me?",
          "MattaNutra screens for the most common medication-supplement considerations and flags them in your plan. It is wellness guidance, not medical advice. If you are taking prescription medication, pregnant, nursing, or managing a medical condition, please consult a qualified healthcare professional before beginning any supplement programme.",
        ],
        [
          "Where do the recommended products come from?",
          "We point to products available on platforms Southeast Asian shoppers actually use, selected to match your formulation. The goal is to help you buy with confidence in the marketplaces you already trust.",
        ],
        [
          "Is the free assessment really free?",
          "Yes. The questionnaire and your Health Score are free, and no credit card is required. After you complete it, you'll see where you stand and a starting direction. The full personalised Right Amount Formula and optional Living Protocol support are available if you choose to go further.",
        ],
        [
          "Why the Pāli name?",
          "Mattaññutā means knowing the right amount. It comes from a tradition of practical wisdom about moderation and balance — the idea that flourishing comes not from more, but from exactly enough.",
        ],
      ],
    },
    final: {
      title: "Stop guessing.",
      accent: "Start knowing.",
      body: "Answer a few focused questions, get your free Health Score, and receive your personalised starting plan — built around your body, your goals, and your day.",
      primary: "Start designing your Right Amount",
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
        "แผนอาหารเสริมและสุขภาพที่ใช้ AI ช่วยออกแบบให้เข้ากับร่างกาย ไลฟ์สไตล์ และเป้าหมายที่สำคัญกับคุณจริง ๆ และปรับตามชีวิตที่เปลี่ยนไป",
      paliTitle: "Mattaññutā",
      pali: "ภาษาบาลีที่หมายถึงปัญญาในการรู้ปริมาณที่พอดี สุขภาพที่ดีไม่ได้มาจากการเพิ่มให้มากขึ้น แต่มาจากความพอดีอย่างแม่นยำ",
      primary: "ออกแบบปริมาณที่พอดีของคุณ",
      secondary: "ดูวิธีทำงาน",
      microcopy:
        "เริ่มจาก Health Score ฟรีเพื่อดูว่าคุณอยู่ตรงไหน สูตรปริมาณที่พอดีเฉพาะบุคคลพร้อมเมื่อคุณต้องการ",
      checks: [
        "ไม่ต้องใช้บัตรเครดิต",
        "ประเมินส่วนผสมกว่า 120 รายการ",
        "มีการตรวจความเหมาะสม",
      ],
      ingredientPills: [
        "แมกนีเซียม",
        "วิตามิน D3",
        "โอเมก้า-3",
        "อัชวกันธา",
        "สังกะสี",
      ],
    },
    problem: {
      eyebrow: "ปัญหา",
      title: "ขวดเยอะเกินไป.",
      accent: "ความมั่นใจกลับน้อยเกิน.",
      body: "เดินเข้าร้านขายยาแล้วเจออาหารเสริมเต็มชั้น ตัวเลือกมากมาย คำแนะนำขัดกัน และไม่มีคำตอบชัดเจนต่อคำถามเดียวที่สำคัญ: ร่างกายของฉันต้องการอะไรจริง ๆ",
      body2:
        "หลายคนจึงต้องเดา ซื้อสิ่งที่อาจไม่จำเป็น พลาดสิ่งที่ควรได้ และยังไม่แน่ใจว่าสิ่งที่กินอยู่ช่วยจริงหรือไม่",
      imageAlt: "ผู้ซื้อที่สับสนกับตัวเลือกอาหารเสริมจำนวนมาก",
    },
    promises: {
      eyebrow: "สิ่งที่คุณคาดหวังได้",
      title: "สี่คำมั่น.",
      accent: "หนึ่งแผนที่เรียบง่าย.",
      intro: "สิ่งที่ทุกแผน MattaNutra ถูกออกแบบมาเพื่อส่งมอบ",
      cards: [
        ["ชัดเจน", "จากความสับสน"],
        ["มีหลักยึด", "ที่เชื่อถือได้"],
        ["เฉพาะคุณ", "ไม่ใช่สูตรเดียวกันทุกคน"],
        ["มั่นใจ", "ในการเลือกทุกครั้ง"],
      ],
    },
    how: {
      eyebrow: "วิธีทำงาน",
      title: "คำถามในปริมาณที่พอดี.",
      accent: "ไม่มากเกิน ไม่ตกหล่น.",
      intro: "จากแบบประเมินสั้น ๆ สู่คำแนะนำที่เข้าใจได้ในสี่ขั้นตอน",
      steps: [
        [
          "ตอบ",
          "สั้นแต่ครบ",
          "ตอบคำถามที่จำเป็นเกี่ยวกับเป้าหมาย สุขภาพ ไลฟ์สไตล์ ยาที่ใช้อยู่ งบประมาณ และสิ่งที่คุณให้ความสำคัญ",
        ],
        [
          "วิเคราะห์",
          "120+ ส่วนผสม",
          "คำตอบถูกจับคู่กับลำดับความสำคัญ ช่วงปริมาณ และข้อควรระวัง",
        ],
        [
          "จับคู่",
          "พร้อมใช้ในเอเชีย",
          "รับคำแนะนำผลิตภัณฑ์เพื่อไม่ต้องเดาในร้านหรือบน Lazada",
        ],
        [
          "ปรับ",
          "เตือนทบทวน 60 วัน",
          "เช็กอินเพิ่มเติมเพื่อปรับแผนเมื่อเป้าหมาย อาการ และไลฟ์สไตล์เปลี่ยน",
        ],
      ],
    },
    protocol: {
      active: "โปรโตคอลชีวิตกำลังทำงาน",
      channel: "LINE / WhatsApp",
      eyebrow: "โปรโตคอลชีวิต · สนับสนุน 90 วัน",
      title: "ชีวิตเปลี่ยนตลอด.",
      accent: "โปรโตคอลของคุณก็ตามทันได้.",
      intro:
        "การนอน ความเครียด การเดินทาง และกิจวัตรที่เปลี่ยน ล้วนเปลี่ยนสิ่งที่ร่างกายต้องการ โปรโตคอลชีวิตช่วยให้แผนอาหารเสริมและอาหารประจำวันที่อยู่เบื้องหลังสอดคล้องกับชีวิตจริง",
      primary: "ดูโปรโตคอลชีวิต",
      secondary: "ดูวิธีทำงาน",
      ticks: [
        "ออกแบบโดยทีมแพทย์ และตรวจเทียบกับยาและข้อมูลแล็บ",
        "ปรับตามการเดินทาง ความเครียด และการนอนไม่ดี",
        "ลดการเดาเมื่อชีวิตเปลี่ยน",
      ],
      chat: [
        "สัปดาห์นี้มีอะไรเปลี่ยนไหม เช่น การนอน ความเครียด การเดินทาง หรือกิจวัตร?",
        "พรุ่งนี้เดินทางไปโตเกียว น่าจะนอนไม่ค่อยดีทั้งสัปดาห์",
        "รับทราบ เดินทาง 6 วันและอาจนอนแย่ลง ฉันปรับเล็กน้อย 3 จุด และคงส่วนที่เหลือไว้เหมือนเดิม",
      ],
      updateLabel: "แผนอัปเดต",
      tripTitle: "ทริปโตเกียวของคุณ — 3 จุดเล็ก ๆ",
      updates: [
        "ทานแมกนีเซียมเร็วขึ้นเล็กน้อย เป็น 19:30 น. ตามเวลาท้องถิ่น",
        "เพิ่มอิเล็กโทรไลต์ระหว่างเที่ยวบินและทุกเช้าระหว่างเดินทาง",
        "อย่างอื่นคงไว้เหมือนเดิม",
      ],
      basedOn:
        "อิงจาก: เดินทาง 6 วัน · อาจนอนสะดุด · มีประชุมมาก · เดินมากขึ้น",
      reasoningLabel: "ดูเหตุผล",
      reasoning: [
        "แมกนีเซียมเร็วขึ้น — ช่วยเลื่อนจังหวะผ่อนคลายให้เข้ากับเขตเวลา",
        "เพิ่มอิเล็กโทรไลต์ — ช่วยเรื่องน้ำในร่างกายจากเที่ยวบินและการเดินมากขึ้น",
        "คงกลุ่มสมุนไพรช่วยปรับสมดุลไว้ — เพราะการนอนยังไม่นิ่ง จึงไม่ควรเปลี่ยนหลายอย่างพร้อมกัน",
      ],
      foodNudge:
        "อีกอย่างหนึ่ง ผลเช็กล่าสุดบอกว่าแมกนีเซียมของคุณค่อนข้างต่ำ แผนมีอยู่แล้ว แต่เติมจากอาหารได้ด้วย:",
      foodTags: ["เมล็ดฟักทอง", "ผักโขม", "ถั่วดำ"],
      vitaminQuestion: "ดีเลย ไม่เคยรู้ แล้ววิตามิน C ต้องเพิ่มอาหารเสริมไหม?",
      vitaminAnswer:
        "ตามจริงน่าจะไม่จำเป็น ผลไม้และผักในสัปดาห์ของคุณครอบคลุมดีแล้ว ข้ามตัวนี้ได้ อาหารทำหน้าที่อยู่",
    },
    protocolBand: {
      title: "สูตรปริมาณที่พอดีคือฐานของคุณ.",
      accent: "โปรโตคอลชีวิตช่วยให้ฐานนั้นเข้ากับชีวิตจริง.",
      body: "การเดินทาง ความเครียด การนอนไม่ดี และกิจวัตรที่เปลี่ยน ล้วนเปลี่ยนสิ่งที่ร่างกายต้องการ ฐานหลักไม่ต้องเปลี่ยน แต่รายละเอียดเล็ก ๆ รอบ ๆ ฐานนั้นควรปรับได้",
    },
    practice: {
      eyebrow: "โปรโตคอลชีวิตในชีวิตจริง",
      title: "สามขั้นตอน.",
      accent: "ไม่ต้องเรียนรู้แอปใหม่.",
      intro:
        "โปรโตคอลชีวิตอยู่ในช่องทางข้อความที่คุณใช้อยู่แล้ว คุณบอกว่าอะไรเปลี่ยน แล้วระบบช่วยจัดการต่อ",
      steps: [
        [
          "บอก MattaNutra ว่าอะไรเปลี่ยน",
          "ส่งข้อความสั้น ๆ ผ่าน LINE หรือ WhatsApp ก็พอ ไม่ต้องกรอกฟอร์มหรือเรียนรู้แอปใหม่",
          ["ช่วงนี้นอนไม่ดี", "พรุ่งนี้เดินทางไปทำงาน", "ช่วงนี้ซ้อมหนักขึ้น"],
        ],
        [
          "โปรโตคอลปรับรอบตัวคุณ",
          "จากชุดที่ใช้อยู่ เป้าหมาย และข้อควรระวัง MattaNutra แปลงข้อมูลนั้นเป็นการปรับที่ชัดเจน เช่น เวลา ปริมาณ หรืออาหารที่ช่วยสนับสนุน",
          [
            "เลื่อนแมกนีเซียมให้เร็วขึ้นเล็กน้อย",
            "เมล็ดฟักทองเป็นแหล่งแมกนีเซียมที่ดี",
            "คงกลุ่มสมุนไพรช่วยปรับสมดุลไว้จนกว่าการนอนจะนิ่ง",
          ],
        ],
        [
          "ทำต่อได้โดยไม่ต้องคิดเยอะ",
          "คุณไม่ต้องค้นคว้าหรือเริ่มใหม่ทุกครั้งที่ชีวิตยุ่ง แค่ได้สิ่งที่ควรทำไม่กี่อย่างและความมั่นใจว่ามันเหมาะกับคุณ",
          [
            "ไม่ต้องคิดใหม่ทุกครั้งที่ชีวิตเปลี่ยน",
            "ปรับเล็กน้อยให้แผนยังใช้ได้จริง",
            "ปริมาณที่พอดียังคงพอดี",
          ],
        ],
      ],
    },
    food: {
      eyebrow: "อาหารและอาหารเสริมไปด้วยกัน",
      title: "บางครั้งแหล่งที่ดีที่สุดอยู่",
      accent: "บนจานของคุณ",
      intro:
        "อาหารเสริมเติมช่องว่าง แต่อาหารควรมาก่อน เมื่อโปรโตคอลชีวิตเห็นสิ่งที่ร่างกายต้องการ ระบบไม่ได้มองหาแคปซูลทันที แต่บอกอาหารประจำวันที่มีสารนั้นตามธรรมชาติ เพื่อให้คุณเลือกได้ว่าจะเติมจากมื้ออาหารหรือจากขวด",
      cards: [
        [
          "แมกนีเซียมต่ำ?",
          "เมล็ดฟักทอง ผักโขม และถั่วดำเป็นแหล่งธรรมชาติที่เข้มข้น",
          ["เมล็ดฟักทอง", "ผักโขม", "ถั่วดำ"],
        ],
        [
          "ต้องการโครเมียมเพิ่ม?",
          "พบได้ในอาหารที่หลายคนไม่คาดคิด เช่น น้ำองุ่น บรอกโคลี และธัญพืชเต็มเมล็ด",
          ["น้ำองุ่น", "บรอกโคลี", "ธัญพืชเต็มเมล็ด"],
        ],
        [
          "อาหารครอบคลุมแล้ว?",
          "ถ้ามื้ออาหารทำหน้าที่ได้ดี โปรโตคอลชีวิตจะบอกให้ข้ามอาหารเสริมนั้นและประหยัดเงิน",
          ["อาหารพอแล้ว"],
        ],
      ],
      note: "ไม่ต้องจดอาหาร ไม่ต้องนับแคลอรี แค่ถามเมื่ออยากรู้ และได้คำแนะนำกลับไปสู่จานที่เหมาะกว่า",
    },
    difference: {
      eyebrow: "สิ่งที่ต่าง",
      title: "มากกว่าคำตอบ.",
      accent: "คือโปรโตคอลที่รู้จักคุณ.",
      paragraphs: [
        "ใครก็ค้นได้ว่าการเดินทางส่งผลต่อแมกนีเซียมหรือไม่ แต่ส่วนที่ยากคือมันส่งผลต่อแผนของคุณอย่างไร ทั้งชุดที่คุณใช้อยู่ ยาของคุณ และสัปดาห์ที่ผ่านมา",
        "ระบบรู้สิ่งที่คุณใช้อยู่แล้ว จึงไม่ต้องอธิบายใหม่ทุกครั้ง ทุกการปรับตรวจเทียบกับยาและข้อมูลแล็บของคุณ และตลอด 90 วัน ระบบเริ่มเห็นรูปแบบของคุณ ไม่ใช่แค่สัปดาห์นี้",
        "คุณไม่ต้องเป็นเภสัชกรของตัวเอง แค่บอก MattaNutra ว่าอะไรเปลี่ยน แล้วระบบช่วยรักษาแผนให้พอดี",
      ],
    },
    bridge: {
      title: "พร้อมออกแบบปริมาณที่พอดีของคุณไหม?",
      body: "เริ่มด้วยคำถามที่จำเป็นไม่กี่ข้อและ Health Score ฟรี แผนเฉพาะบุคคลของคุณ รวมถึงตัวเลือกโปรโตคอลชีวิต อยู่ห่างออกไปอีกขั้นเดียว",
      cta: "ออกแบบปริมาณที่พอดีของคุณ",
      note: "ดูแผนและราคาทั้งหมดด้านล่าง",
    },
    results: {
      eyebrow: "คนจริง เรื่องจริง",
      title: "คนต่างชีวิต จุดเริ่มต้นต่างกัน.",
      intro:
        "เป้าหมายเดียวกันคือสุขภาพที่ดีขึ้น ความชัดเจนมากขึ้น และกิจวัตรที่ทำได้จริง",
      cta: "ออกแบบปริมาณที่พอดีของคุณ",
      join: "ร่วมกับผู้คนที่กำลังเลือกดูแลสุขภาพอย่างมั่นใจและฉลาดขึ้น",
      fallback: [
        {
          id: "daniel",
          image: assets.testimonials[0],
          name: "Daniel L.",
          place: "40, Bangkok",
          role: "Project Manager",
          quote:
            "ฉันอายุ 40 แล้วรู้ว่าพูดอยู่นานว่าอยากเปลี่ยนแปลง แต่ไม่รู้จะเริ่มจากตรงไหน MattaNutra ให้ก้าวแรกที่ชัดเจนโดยไม่ทำให้รู้สึกหนักเกินไป",
        },
        {
          id: "meilin",
          image: assets.testimonials[1],
          name: "Mei Lin T.",
          place: "45, Singapore",
          role: "Operations Lead",
          quote:
            "งาน การเดินทาง และครอบครัวทำให้กิจวัตรสุขภาพกลายเป็นสิ่งที่จำได้วันนั้น MattaNutra ช่วยเปลี่ยนชั้นอาหารเสริมที่ยุ่งเหยิงให้เป็นแผนง่าย ๆ ที่เข้ากับชีวิตจริง",
        },
        {
          id: "wanida",
          image: assets.testimonials[2],
          name: "Wanida P. (วนิดา)",
          place: "43, Khon Kaen",
          role: "Shop Owner",
          quote:
            "หมอบอกว่าความดันเริ่มสูงและต้องปรับบางอย่าง ฉันค้นข้อมูลออนไลน์หลายชั่วโมงแล้วยิ่งสับสน MattaNutra ช่วยตัดเสียงรบกวนและสร้างสิ่งที่เข้ากับชีวิตจริง",
        },
        {
          id: "malee",
          image: assets.testimonials[3],
          name: "Malee S. (มาลี)",
          place: "41, Phuket",
          role: "Nurse Aide",
          quote:
            "ทำงานในคลินิกทุกคนเลยคิดว่าฉันรู้ว่าจะกินอะไร แต่จริง ๆ ยิ่งอ่านยิ่งไม่มั่นใจ MattaNutra ให้แผนที่ชัดและสมเหตุสมผลสำหรับตัวฉันเอง",
        },
      ],
    },
    origin: {
      eyebrow: "จุดเริ่มต้น",
      title: "ออกแบบในเชียงใหม่,",
      accent: "ที่ซึ่งความพอดีเป็นวิถีชีวิต",
      body: "MattaNutra เริ่มต้นในภาคเหนือของไทย ที่ประเพณีเรื่องความพอดี การกินแต่พอเหมาะ การพักในเวลาที่ควร และการทำงานกับจังหวะของร่างกาย ถูกสั่งสมอย่างเงียบ ๆ มาหลายศตวรรษ",
      body2:
        "เราสร้าง MattaNutra เพื่อแปลภูมิปัญญานั้นให้ทันสมัย วัดได้ และเป็นส่วนตัว แผนที่เรียนรู้ร่างกายคุณ ปรับเมื่อชีวิตเปลี่ยน และไม่บังคับให้คุณกลายเป็นคนอื่น",
      buildAlt: "โลโก้ MattaNutra ที่สร้างขึ้นเป็นห้าขั้นตอน",
      founders: "ก่อตั้งโดยแพทย์ นักวิทยาศาสตร์ และนักคิดด้าน AI",
      founderParagraphs: [
        "สิ่งที่เข้าสู่ร่างกายควรถูกออกแบบโดยคนที่เข้าใจว่าข้างในนั้นเกิดอะไรขึ้น",
        "ทีมของเรามีพื้นฐานหลากหลายทั้งแพทยศาสตร์ วิทยาศาสตร์ เทคโนโลยี เศรษฐศาสตร์ และการสร้างสิ่งที่อยู่ได้นาน",
        "รวมกันแล้วมีประสบการณ์มากกว่าร้อยปีในงานแพทย์ วิทยาศาสตร์ เทคโนโลยี และการสร้างสิ่งที่ใช้งานได้จริง",
      ],
      signoff: "จากเชียงใหม่ ด้วยความใส่ใจ",
      tagline: "ภูมิปัญญาเดิม · วิทยาศาสตร์สมัยใหม่",
    },
    pricing: {
      eyebrow: "ราคาที่เรียบง่าย",
      title: "เริ่มฟรี.",
      accent: "อัปเกรดเมื่อพร้อม.",
      intro:
        "ทำแบบประเมินฟรีเพื่อรับแผนตั้งต้น แล้วอัปเกรดเมื่อคุณต้องการความแม่นยำหรือการสนับสนุนต่อเนื่องมากขึ้น",
      offer: "ข้อเสนอช่วงเปิดตัว",
      plans: [
        {
          badge: "แผนครั้งเดียว",
          name: "สูตรปริมาณที่พอดี",
          desc: "สูตรอาหารเสริมเฉพาะบุคคล พร้อมปริมาณ เวลาใช้ และคำแนะนำผลิตภัณฑ์ที่ชัดเจน",
          originalPrice: "THB 990",
          saving: "ประหยัด 30%",
          currency: "THB",
          price: "690",
          termLabel: "จ่ายครั้งเดียว",
          term: "จ่ายครั้งเดียว · เข้าถึงได้ตลอด",
          cta: "รับสูตรปริมาณที่พอดี",
          plan: "precision" as const,
          best: "คนที่ต้องการจุดเริ่มต้นที่ชัดเจนและมั่นใจ",
          features: [
            "สูตรอาหารเสริมเฉพาะบุคคล",
            "ช่วงโดสที่ปรับตามขนาดร่างกาย",
            "คำแนะนำเวลาและวิธีใช้",
            "ข้อควรระวังเรื่องยาและข้อมูลแล็บ",
            "ผลิตภัณฑ์แนะนำและทางเลือก",
            "เตือนทบทวนใน 60 วัน",
          ],
          guaranteeTitle: "รับประกันความชัดเจน.",
          guarantee:
            "ถ้าแผนยังไม่ชัดเจนหรือใช้ประโยชน์ไม่ได้ เราจะปรับให้หรือคืนเงินภายใน 7 วัน",
        },
        {
          badge: "พรีเมียม · สนับสนุน 90 วัน",
          popular: "นิยมที่สุด",
          name: "โปรโตคอลชีวิต",
          desc: "รักษาปริมาณที่พอดีให้เหมาะกับชีวิตที่เปลี่ยน รวมทุกอย่างในสูตรปริมาณที่พอดี พร้อมการปรับต่อเนื่อง",
          originalPrice: "THB 1,890",
          saving: "ประหยัด 16%",
          currency: "THB",
          price: "1,590",
          termLabel: "สำหรับ 90 วัน",
          term: "จ่ายครั้งเดียว · สนับสนุน 90 วัน · ต่ออายุได้",
          cta: "เริ่มโปรโตคอลชีวิต",
          plan: "pro" as const,
          best: "คนที่อยากให้แผนตามทันชีวิตประจำวันจริง",
          features: [
            "รวมสูตรปริมาณที่พอดี",
            "เรียนรู้อาหารประจำวันที่ให้สิ่งที่คุณต้องการ",
            "ปรับเวลาและปริมาณเมื่อชีวิตเปลี่ยน",
            "ทุกการเปลี่ยนตรวจกับยาและแล็บ",
            "จำรูปแบบของคุณใน 90 วัน",
            "แค่ส่งข้อความเมื่อมีอะไรเปลี่ยน ไม่ต้องเรียนรู้แอปใหม่",
            "ทำต่อได้แม้เดินทาง เครียด หรือนอนสะดุด",
          ],
          guaranteeTitle: "รับประกันความพึงพอใจ 7 วัน.",
          guarantee:
            "ลองโปรโตคอลชีวิตอย่างจริงจัง หากมีอะไรไม่ตรง เราจะแก้ไขหรือคืนเงินเต็มจำนวนภายใน 7 วัน",
        },
      ],
      trust: [
        ["ปลอดภัยและเป็นส่วนตัว", "ข้อมูลถูกเข้ารหัสและไม่แบ่งปัน"],
        ["อิงหลักฐาน", "คำแนะนำเฉพาะบุคคลจากหลักฐานที่เชื่อถือได้"],
        ["ปรับและดีขึ้น", "แผนเปลี่ยนตามร่างกายและเป้าหมาย"],
        ["AI + คนดูแล", "คำแนะนำด้วย AI พร้อมระบบตรวจทานโดยคน"],
      ],
    },
    journal: {
      eyebrow: "จากบทความ",
      title: "เรียนรู้",
      accent: "ปริมาณที่พอดี",
      browse: "ดูบทความทั้งหมด",
      tag: "บทความ",
      readMore: "อ่านบทความ",
      fallback: [
        [
          "พื้นฐาน",
          "ทำไมอาหารเสริมไม่ใช่ยิ่งมากยิ่งดี",
          "แนวคิดเรื่องความพอเพียง และเหตุผลที่ร่างกายมักต้องการน้อยกว่าที่ฉลากชวนให้เชื่อ",
        ],
        [
          "โภชนาการ",
          "อาหารประจำวันแปดอย่างที่มีแมกนีเซียมมากกว่าที่คิด",
          "ก่อนหยิบแคปซูล ลองดูในจานของคุณ อาหารพื้นฐานบางอย่างช่วยได้มาก",
        ],
        [
          "อยู่ให้ดี",
          "การเดินทางเปลี่ยนสิ่งที่ร่างกายต้องการอย่างไร",
          "เขตเวลา การนอน และน้ำในร่างกายเปลี่ยนสมการได้ โดยไม่ต้องคิดให้ซับซ้อน",
        ],
      ],
    },
    faq: {
      eyebrow: "คำถาม",
      title: "คำถามดี ๆ,",
      accent: "คำตอบตรงไปตรงมา",
      items: [
        [
          "ข้อมูลเป็นส่วนตัวไหม?",
          "ใช่ แบบประเมินเป็นของคุณ เราไม่ขายคำตอบ ไม่แบ่งปันกับผู้ลงโฆษณา และคุณสามารถขอลบข้อมูลได้ การสนทนาในโปรโตคอลชีวิตถูกเก็บเพื่อให้แผนต่อเนื่องเท่านั้น",
        ],
        [
          "ถ้ากินยาอยู่ ปลอดภัยไหม?",
          "MattaNutra คัดกรองข้อควรระวังที่พบบ่อยระหว่างยาและอาหารเสริม และแสดงเป็นธงในแผน แต่เป็นคำแนะนำเพื่อสุขภาพ ไม่ใช่คำแนะนำทางการแพทย์",
        ],
        [
          "ผลิตภัณฑ์แนะนำมาจากไหน?",
          "เราแนะนำผลิตภัณฑ์ที่มีในแพลตฟอร์มที่ผู้ซื้อเอเชียตะวันออกเฉียงใต้ใช้จริง และเลือกให้เข้ากับสูตรของคุณ",
        ],
        [
          "แบบประเมินฟรีจริงไหม?",
          "ฟรีจริง แบบประเมินและ Health Score ไม่ต้องใช้บัตรเครดิต หลังทำเสร็จคุณเลือกได้ว่าจะไปต่อด้วยสูตรเฉพาะบุคคลหรือโปรโตคอลชีวิตหรือไม่",
        ],
        [
          "ทำไมใช้ชื่อภาษาบาลี?",
          "Mattaññutā หมายถึงการรู้ปริมาณที่พอดี ชื่อนี้คือคำมั่นว่าเราจะช่วยหาความพอดีของคุณ ไม่ใช่ขายให้มากขึ้น",
        ],
      ],
    },
    final: {
      title: "เลิกเดา.",
      accent: "เริ่มรู้.",
      body: "ตอบคำถามที่จำเป็นไม่กี่ข้อ รับ Health Score ฟรี และได้แผนตั้งต้นเฉพาะบุคคลที่สร้างจากร่างกาย เป้าหมาย และวันจริงของคุณ",
      primary: "ออกแบบปริมาณที่พอดีของคุณ",
      secondary: "ดูวิธีทำงาน",
      quote: "Mattaññutā — การรู้ปริมาณที่พอดี",
    },
  },
} as const;

type WidenLandingContent<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? readonly WidenLandingContent<Item>[]
        : T extends object
          ? { readonly [Key in keyof T]: WidenLandingContent<T[Key]> }
          : T;

type LandingContent = WidenLandingContent<typeof baseContent.en>;
export type LandingPricingPlan = Omit<
  LandingContent["pricing"]["plans"][number],
  "plan"
> & {
  readonly plan: AssessmentPlan;
};

export const content = {
  ...baseContent,
  "zh-CN": {
    hero: {
      eyebrow: "古老智慧 · 现代科学",
      title: "停止猜测。",
      accent: "开始了解。",
      intro:
        "AI 驱动的补充剂与健康计划，围绕您的身体、生活方式以及对您真正重要的目标构建，并随生活变化而适应。",
      paliTitle: "Mattaññutā",
      pali: "Pāli 语，意为“知道适量的智慧”——健康并非来自更多，而是来自恰到好处。",
      primary: "开始设计您的适量方案",
      secondary: "如何运作",
      microcopy:
        "从免费的 Health Score 开始，了解您的状态。您的个性化 Right Amount Formula 会在您准备好时呈现。",
      checks: ["无需信用卡", "评估 120+ 种成分", "包含安全检查"],
      ingredientPills: ["镁", "维生素 D3", "Omega-3", "南非醉茄", "锌"],
    },
    problem: {
      eyebrow: "问题所在",
      title: "太多瓶瓶罐罐。",
      accent: "太少确定性。",
      body: "走进任何药房，补充剂货架都令人眼花缭乱。数百种选择、相互矛盾的建议，却没有明确答案回答唯一重要的问题：我的身体真正需要什么？",
      body2:
        "大多数人最终只能猜测——买了太多不需要的东西，错过了真正需要的，默默怀疑是否有效。",
      imageAlt: "面对补充剂选择感到困惑的购物者",
    },
    promises: {
      eyebrow: "您可以期待",
      title: "四个承诺。",
      accent: "一个简单计划。",
      intro: "每个 MattaNutra 计划都旨在实现这些目标。",
      cards: [
        ["清晰", "告别困惑"],
        ["可信", "值得信赖的指导"],
        ["个性化", "专属为您"],
        ["自信", "每一次选择都安心"],
      ],
    },
    how: {
      eyebrow: "如何运作",
      title: "适量的问题。",
      accent: "不多不少，恰到好处。",
      intro: "从简短聚焦的问卷到值得信赖的推荐，仅需四步。",
      steps: [
        [
          "回答",
          "简短而详细",
          "几个聚焦问题，涵盖您的目标、健康优先事项、生活方式、用药、预算以及您真正关心的事。没有术语，没有冗余。",
        ],
        [
          "分析",
          "120+ 种成分",
          "您的回答将被映射到补充剂优先级、剂量范围和安全考量。",
        ],
        ["匹配", "东南亚适用", "获得产品指导，不再在店内或 Lazada 上猜测。"],
        [
          "优化",
          "60 天提示",
          "可选的定期检查会随目标、症状和生活方式变化更新您的计划。",
        ],
      ],
    },
    protocol: {
      active: "Living Protocol 已激活",
      channel: "Line / WhatsApp",
      eyebrow: "Living Protocol · 90 天支持",
      title: "生活不断变化。",
      accent: "您的方案也能跟上。",
      intro:
        "睡眠、压力、旅行和日常作息变化都会改变身体需求。Living Protocol 让您的补充剂以及背后的日常饮食与真实生活保持一致，让今天的适量在下周依然适量。",
      primary: "探索 Living Protocol",
      secondary: "了解如何运作",
      ticks: [
        "由医师打造——每次调整均对照您的用药和化验结果",
        "随旅行、压力和睡眠不佳保持一致",
        "生活变化时减少反复猜测",
      ],
      chat: [
        "本周有什么不同吗——睡眠、压力、旅行还是作息？",
        "我明天要去 Tokyo，可能会睡不好。",
        "收到——Tokyo 六天，预计有睡眠干扰。我已做了三处小调整，其余保持不变。以下是您旅途期间的方案。",
      ],
      updateLabel: "已更新方案",
      tripTitle: "您的 Tokyo 之旅——3 处小调整",
      updates: [
        "镁稍早服用——当地时间晚上 7:30 而非 9:30",
        "飞行途中及每天早晨补充电解质",
        "其余保持不变",
      ],
      basedOn: "基于：6 天行程 · 预计睡眠干扰 · 会议密集 · 步行增加",
      reasoningLabel: "查看推理",
      reasoning: [
        "镁提前服用——帮助您随时差调整，提前进入放松状态。",
        "增加电解质——支持飞行途中及城市步行增加时的水分平衡。",
        "适应原保持不变——您的压力虽有上升，但近期睡眠已不稳定，因此暂不叠加调整。",
      ],
      foodNudge:
        "还有一件事——您上次检查显示镁水平略低。我已纳入计划，您也可以通过天然方式补充：",
      foodTags: ["南瓜子", "菠菜", "黑豆"],
      vitaminQuestion: "哦，没想到。关于我的维生素 C——需要补充吗？",
      vitaminAnswer:
        "老实说？您可能不需要。本周水果和蔬菜已足够覆盖。我建议省下这一项——食物已能满足需求。",
    },
    protocolBand: {
      title: "您的 Right Amount Formula 是基础。",
      accent: "Living Protocol 让它与真实生活保持一致。",
      body: "旅行、压力、睡眠不佳和作息变化都会改变身体需求。您的基础不变，但围绕它的微小调整会随之变化。",
    },
    practice: {
      eyebrow: "Living Protocol 实践",
      title: "三个步骤。",
      accent: "无需学习新应用。",
      intro:
        "Living Protocol 融入您已使用的即时通讯。您只需告知变化，其余交给它。",
      steps: [
        [
          "告诉 MattaNutra 发生了什么变化",
          "通过 Line 或 WhatsApp 发送简短消息即可——无需表格、无需追踪、无需学习新应用。",
          ["本周睡眠不好。", "明天出差。", "最近训练强度增加了。"],
        ],
        [
          "您的方案随您调整",
          "基于您当前的补充剂、目标和安全标记，MattaNutra 将更新转化为几处精准调整——时间、剂量或临时添加——并推荐支持身体需求的日常食物。",
          [
            "本周将镁稍早服用。",
            "南瓜子是镁的优质天然来源。",
            "在睡眠恢复前保持适应原剂量不变。",
          ],
        ],
        [
          "保持一致，无需过度思考",
          "您无需每次生活忙碌时都重新研究、反复猜测或从头开始。只需做几件简单的事——并确信它们适合您。",
          [
            "无需每次生活变化都重新思考日常。",
            "小调整让计划更现实。",
            "您的适量始终保持正确。",
          ],
        ],
      ],
    },
    food: {
      eyebrow: "食物与补充剂，相辅相成",
      title: "最佳来源有时",
      accent: "就在您的餐盘上。",
      intro:
        "补充剂填补缺口——但食物优先填补。当 Living Protocol 发现身体需要某物时，它不会只推荐胶囊。它会告诉您哪些日常食物天然富含该成分，让您选择：在晚餐中补充，还是从瓶中补充。无论哪种方式，您都在真正了解，而非猜测。",
      cards: [
        [
          "镁不足？",
          "南瓜子、菠菜和黑豆是天然最丰富的来源之一。",
          ["南瓜子", "菠菜", "黑豆"],
        ],
        [
          "需要更多铬？",
          "它出现在意想不到的地方——葡萄汁、西兰花和全谷物。",
          ["葡萄汁", "西兰花", "全谷物"],
        ],
        [
          "已经足够？",
          "如果您的饮食已能满足，Living Protocol 会建议您跳过补充剂——并节省开支。",
          ["食物已经足够"],
        ],
      ],
      note: "无需食物日记。无需计算热量。只需在需要时快速回答，并在有帮助时引导您选择正确的餐盘。",
    },
    difference: {
      eyebrow: "为何不同",
      title: "不止一个答案。",
      accent: "一个了解您的方案。",
      paragraphs: [
        "任何人都能查到旅行如何影响镁。难点在于了解它如何影响您的计划——您的补充剂组合、用药、过去几周的情况——以及实际该怎么做。这正是 Living Protocol 为您处理的。",
        "它已经知道您服用的一切，因此无需每次变化时重复解释。每次建议的调整都会对照您的用药和化验标记——这种安全保障只有当指导完全围绕您构建时才有效。90 天内，它会逐渐识别您的模式，因此建议不仅反映本周，还反映背后的趋势。",
        "您无需成为自己的药剂师。只需告诉 MattaNutra 发生了什么变化，它就会让您的方案保持正确。",
      ],
    },
    bridge: {
      title: "准备好设计您的 Right Amount 了吗？",
      body: "回答几个聚焦问题，获取免费 Health Score。您的个性化计划——以及添加 Living Protocol 的选项——仅一步之遥。",
      cta: "开始设计您的 Right Amount",
      note: "查看完整计划和定价。",
    },
    results: {
      eyebrow: "真实的人。真实的故事。",
      title: "真实的人，真实的起点。",
      intro:
        "不同的生活方式。同一个目标：更好的健康、更清晰的方向，以及可行的日常。",
      cta: "开始设计您的 Right Amount",
      join: "加入数千名正在为健康做出更明智、更自信选择的人。",
      fallback: [
        {
          id: "daniel",
          image: "/v14/testimonial-daniel.jpg",
          name: "Daniel L.",
          place: "40, 曼谷",
          role: "项目经理",
          quote:
            "我到了 40 岁，意识到自己一直说想改变，却不知道从哪里开始。我抽屉里塞满随机维生素，却没有真正计划。MattaNutra 给了我清晰的第一步，而没有让整个过程显得压倒性。",
        },
        {
          id: "meilin",
          image: "/v14/testimonial-meilin.jpg",
          name: "Mei Lin T.",
          place: "45, 新加坡",
          role: "运营负责人",
          quote:
            "在工作、旅行和照顾家庭之间，我的健康日常变成了能记住就做的事。MattaNutra 帮助我把杂乱的补充剂架变成适合新加坡真实生活的简单计划。",
        },
        {
          id: "wanida",
          image: "/v14/testimonial-wanida.jpg",
          name: "Wanida P.",
          place: "43, 孔敬",
          role: "店主",
          quote:
            "医生告诉我血压在上升，需要做出改变。我花了几个小时在网上研究补充剂，结果比开始时更困惑。MattaNutra 穿透所有噪音，为我打造了真正适合我生活的方案。",
        },
        {
          id: "malee",
          image: "/v14/testimonial-malee.jpg",
          name: "Malee S.",
          place: "41, 普吉",
          role: "护理助理",
          quote:
            "我在诊所工作，所以大家都以为我确切知道该吃什么补充剂。诚实的真相是，我读得越多，越不确定。MattaNutra 终于给了我一个清晰、合理的计划——这次是为我自己，而不是我的病人。",
        },
      ],
    },
    origin: {
      eyebrow: "我们的起源",
      title: "设计于清迈，",
      accent: "适量是一种生活方式。",
      body: "MattaNutra 始于泰国北部，那里适度的传统——吃得恰到好处、在正确的时间休息、顺应身体节奏——已悄然精炼了几个世纪。",
      body2:
        "我们打造 MattaNutra，是为了将这种安静的智慧转化为现代、可衡量且个性化的东西：一个了解您身体、随生活变化调整、从不要求您成为别人的计划。",
      buildAlt: "MattaNutra 标志从轮廓到完成标记的五个阶段",
      founders: "由医师、科学家和创新 AI 思想家共同创立。",
      founderParagraphs: [
        "进入您身体的东西，应该由真正了解其成分的人设计。",
        "MattaNutra 由一个国际团队创立，团队背景横跨医学、科学、技术、经济学，以及打造长期可用产品的实践。",
        "我们共同拥有超过一百年的专业实践——在医学、科学、技术以及打造持久事物方面。",
      ],
      signoff: "来自清迈，带着关怀。",
      tagline: "古老智慧 · 现代科学",
    },
    pricing: {
      eyebrow: "简单定价",
      title: "免费开始。",
      accent: "准备好时再升级。",
      intro:
        "完成免费问卷即可获得起始计划。仅在需要更精准或持续 AI 支持时升级。",
      offer: "限时优惠",
      plans: [
        {
          badge: "一次性计划",
          name: "Right Amount Formula",
          desc: "您的个性化补充剂配方，包含精准剂量、时间和产品指导。",
          originalPrice: "THB 990",
          saving: "节省 30%",
          currency: "THB",
          price: "690",
          termLabel: "一次性",
          term: "一次性付款 · 终身访问",
          cta: "获取 Right Amount Formula",
          plan: "precision",
          best: "想要清晰、自信起点的人——专属的适量。",
          features: [
            "个性化补充剂配方",
            "按体型调整的剂量范围",
            "服用时间和使用说明",
            "用药和化验安全标记",
            "推荐产品及替代选择",
            "60 天重新评估提示",
          ],
          guaranteeTitle: "清晰保证。",
          guarantee:
            "如果您的计划感觉不够清晰实用，我们将在 7 天内为您修正或退款。",
        },
        {
          badge: "高级 · 90 天支持",
          popular: "最受欢迎",
          name: "Living Protocol",
          desc: "让您的适量在生活变化时保持正确。包含 Right Amount Formula 的全部内容，以及生活变化时的持续调整。",
          originalPrice: "THB 1,890",
          saving: "节省 16%",
          currency: "THB",
          price: "1,590",
          termLabel: "90 天",
          term: "一次性付款 · 90 天支持 · 随时续订",
          cta: "开始 Living Protocol",
          plan: "pro",
          best: "希望计划跟上日常生活现实的人。",
          features: [
            "包含完整 Right Amount Formula",
            "了解哪些日常食物能提供所需",
            "随生活变化调整时间和剂量",
            "每次变化均对照用药和化验结果",
            "90 天内记住您的模式",
            "只需发送消息告知变化——无需应用、无需追踪",
            "在旅行、压力和睡眠干扰中保持一致",
          ],
          guaranteeTitle: "7 天满意保证。",
          guarantee:
            "真正试用 Living Protocol。如果有任何不妥，请告诉我们——我们将在 7 天内修复或全额退款。无麻烦。",
        },
      ],
      trust: [
        ["安全私密", "您的数据已加密且绝不共享。"],
        ["有科学依据", "个性化推荐基于可信证据。"],
        ["适应与改进", "计划随身体和目标变化而演进。"],
        ["AI + 人工监督", "AI 驱动指导配合人工审核保障。"],
      ],
    },
    journal: {
      eyebrow: "来自文章",
      title: "了解",
      accent: "适量。",
      browse: "浏览所有文章",
      tag: "文章",
      readMore: "阅读文章",
      fallback: [
        [
          "基础",
          "为什么补充剂“更多”很少是答案",
          "充足的科学——以及为什么您的身体通常需要少于标签所示。",
        ],
        [
          "营养",
          "八种比您想象中更富含镁的日常食物",
          "在伸手拿胶囊前，先看看您的餐盘——这些日常食物在默默发挥作用。",
        ],
        [
          "生活方式",
          "旅行如何悄然改变身体需求",
          "时差、睡眠和水分都会改变计算——以下是如何调整而无需过度思考。",
        ],
      ],
    },
    faq: {
      eyebrow: "问题",
      title: "好问题，",
      accent: "诚实回答。",
      items: [
        [
          "我的数据私密吗？",
          "是的。您的评估属于您自己。我们不销售答案，不与广告商共享，您可随时请求删除。Living Protocol 的对话仅存储以维持计划连续性。",
        ],
        [
          "我在服药——这对我安全吗？",
          "MattaNutra 会筛查最常见的药物-补充剂相互作用，并在计划中标记。这是健康指导，而非医疗建议。如果您正在服用处方药、怀孕、哺乳或管理医疗状况，请在开始任何补充剂计划前咨询合格的医疗专业人士。",
        ],
        [
          "推荐产品来自哪里？",
          "我们指向东南亚购物者实际使用的平台上的产品，选择与您的配方匹配。目标是帮助您在已信任的市场中自信购买。",
        ],
        [
          "免费评估真的免费吗？",
          "是的。问卷和 Health Score 免费，无需信用卡。完成后，您将看到自己的状况和起始方向。如果您选择继续，完整的个性化 Right Amount Formula 和可选 Living Protocol 支持将可用。",
        ],
        [
          "为什么用 Pāli 名称？",
          "Mattaññutā 意为知道适量。它来自关于节制与平衡的实用智慧传统——繁荣并非来自更多，而是来自恰到好处。",
        ],
      ],
    },
    final: {
      title: "停止猜测。",
      accent: "开始了解。",
      body: "回答几个聚焦问题，获取免费 Health Score，并收到您的个性化起始计划——围绕您的身体、目标和日常生活构建。",
      primary: "开始设计您的 Right Amount",
      secondary: "如何运作",
      quote: "Mattaññutā — 知道适量。",
    },
  },
} as const satisfies Record<Locale, LandingContent>;
