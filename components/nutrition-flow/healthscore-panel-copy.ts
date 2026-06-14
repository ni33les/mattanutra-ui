import type { Locale } from "@/lib/i18n";

const basePageCopy = {
  en: {
    bodyClass: "leading-7",
    progress: [
      ["Questionnaire", "Assessment complete"],
      ["HealthScore", "Your HealthScore is ready"],
      ["Your Plan", "Unlock your plan"],
    ],
    assessmentComplete: "Your assessment is complete",
    heroEyebrow: "Your free assessment result",
    heroGreeting(firstName: string) {
      return `Ready when you are, ${firstName}.`;
    },
    heroTitle(score: number) {
      return `Your HealthScore is ${score}.`;
    },
    defaultHeroBody:
      "We read your goals, daily routine, safety context, and the way you actually live, then turned them into one number and the pattern underneath it.",
    heroCta: "Unlock my Right Amount Plan",
    heroSecondary: "See what shaped it",
    scoreLabel: "HealthScore",
    scoreOutOf: "/ 100",
    topTier: "Top tier",
    percentile: "Percentile",
    median: "Reference median",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "Typical finisher",
    spectrumYou: "YOU",
    spectrumWhere: "Where you are",
    spectrumGapAhead: "How far ahead you sit",
    spectrumGapBehind: "Gap to typical finisher",
    spectrumHeadroom: "Headroom to 92",
    defaultBandLine:
      "Your score is built from five weighted pillars, safety flags, symptoms, goals, and any verified lab or wearable data you supplied.",
    bandLabels: {
      "Building foundation": "Building foundation",
      "Needs attention": "Needs attention",
      "Good, with a clear gap": "Good, with a clear gap",
      Strong: "Strong",
      "Strong, with headroom": "Strong, with headroom",
      Excellent: "Excellent",
    },
    pillarLabels: {
      activity: "Activity & Fitness",
      biomarkers: "Biomarkers",
      habits: "Health Habits",
      nutrition: "Nutrition & Diet",
      sleep: "Sleep & Recovery",
      stress: "Stress & Balance",
    },
    tagLabels: {
      digestion: "Digestion",
      energy: "Energy",
      fitness: "Fitness",
      focus: "Focus",
      heart: "Heart",
      immune: "Immune",
      mood: "Mood",
      sleep: "Sleep",
    },
    scoreMeaningEyebrow(score: number) {
      return `What ${score} actually means`;
    },
    fallbackScoreMeaning(score: number, percentile: number) {
      return `You are ahead of about ${percentile}% of people who finish this assessment. The last points are the hardest, and the most personal.`;
    },
    fallbackScoreMeaningSub:
      "A higher score is not about chasing everything at once. It is about the few specific refinements that still matter for your pattern.",
    gapEyebrow: "Assessment revealed",
    gapTitle:
      "Three things a generic vitamin quiz would have walked straight past.",
    gapBody:
      "These are the specific signals in your answers that shape your formula, laid out in full, nothing held back.",
    fallbackGaps: [
      {
        body: "Your lowest pillar shows where the first practical change should start.",
        headline: "The clearest gap is not hidden",
        tag: "Signal",
        value: "01",
      },
      {
        body: "Your goals change which nutrients or products earn space in the plan.",
        headline: "Your goals change the order",
        tag: "Signal",
        value: "02",
      },
      {
        body: "Medication, diet pattern, country, and routine context stay visible before anything is suggested.",
        headline: "Safety context stays in the room",
        tag: "Signal",
        value: "03",
      },
    ],
    pillarsEyebrow: "Five-pillar model",
    pillarEyebrow: "Your pattern, pillar by pillar",
    pillarsTitle: "A fixed scoring model across five domains, not a guess.",
    highestLeverageLabel: "Your highest-leverage move",
    goalLinkedLabel: "Goal-linked",
    whatCaught: "What we caught",
    whatCaughtSub: "Laid out in full, nothing held back.",
    fallbackFindingTitle: "Your HealthScore has a clear starting point",
    fallbackFindingBody:
      "The lowest pillar and safety context decide what the plan should prioritise first.",
    subtractionEyebrow: "How your formula was built",
    subtractionTitle:
      "This preview filters broad nutrition possibilities before your final formula is generated.",
    evaluatedFallback: "evaluated",
    setAsideFallback: "set aside",
    chosenFallback: "Shortlisted for your score",
    methodEyebrow: "How MattaNutra thinks",
    methodTitle:
      "A fixed scoring model across five domains, not a guess and not an average of strangers.",
    fallbackMethodCards: [
      {
        body: "The score is computed before AI writes a single line of copy.",
        title: "Score first",
      },
      {
        body: "Only the strongest assessment signals are shown on the page.",
        title: "Signals selected by code",
      },
      {
        body: "AI can phrase the page, but it cannot change your score, flags, counts, or findings.",
        title: "Copy locked to facts",
      },
    ],
    trustLine:
      "Your number is computed by the same rules every time: traceable, point by point. This is wellness guidance, not a diagnosis, and it is built to be shared with your doctor.",
    pillOpportunity: "High opportunity",
    trustCard: [
      {
        body: "Medicine · Science · Technology",
        title: "Founders with 100+ years' combined experience",
      },
      {
        body: "Mahidol · Princeton · Stanford · Harvard",
        title: "Formal education & training",
      },
      {
        body: "Through licensed Thai pharmacy partners",
        title: "Dispensed by local pharmacists",
      },
    ],
    priceHero: {
      alt: "An open MattaNutra box containing matched supplement bottles and a thank-you card",
      body:
        "THB 690 unlocks them — the exact supplements and brands, doses, and timing, with a safety review built around your profile. Your plan, ready to use every day on your quest for better health.",
      boxCaptionPrefix:
        "Above image is an example box only. Unlock your formula to discover what supplements will be in",
      boxCaptionStrong: "YOUR",
      boxCaptionSuffix: "personalised box.",
      clarify:
        "Your THB 690 covers the plan above. The matched supplements are a separate basket on the next page, billed by MattaNutra at the competitive prices our pharmacy partner gives us.",
      ctaEyebrow: "Choose your next step",
      service:
        "From there, MattaNutra takes care of the rest — sourcing each product through our pharmacy partner and sending it to your door.",
      title: "Your personalised Right Amount Formula is ready to unlock.",
      trustChecks: [
        "Built around your goals, diet, and labs",
        "Safety-checked against your medications",
      ],
    },
    promises: [
      ["Clarity", "from Confusion"],
      ["Guidance", "You Can Trust"],
      ["Personalised", "Just for You"],
      ["Confidence", "in Every Choice"],
    ],
    decision: {
      eyebrow: "Two paths · one plan",
      lead:
        "The plan itself is yours either way. What changes is whether MattaNutra walks alongside you for the first 90 days as life happens.",
      optionFormula:
        "Choose Right Amount Formula for a clear, one-time answer you act on yourself. The plan in full, today — and you decide what comes next.",
      optionProtocol:
        "Choose Living Protocol for ongoing, physician-built support — your plan adapts when you travel, sleep poorly, or change your routine, with food-first guidance and safety-checks against your medications and labs.",
      title:
        "We have carefully determined your Right Amount. Now it is your turn to choose the plan that best fits your needs.",
    },
    pricingEyebrow: "Choose your next step",
    pricingTitle: "Unlock the plan that fits how much support you want.",
    pricingBody:
      "Choose the one-time Right Amount Formula for immediate clarity, or the 90-Day Living Protocol for ongoing help turning the plan into daily habits.",
    preparing: "Preparing...",
    selectionError: "We could not start your plan at this time.",
    plans: [
      {
        badge: "Limited time offer",
        cta: "Get the Right Amount Formula",
        description:
          "Your personalised supplement formula with precise dosing, timing, and product guidance.",
        eyebrow: "One-time plan",
        features: [
          "Personalised supplement formula",
          "Body-size adjusted dose ranges",
          "Timing and usage instructions",
          "Medication and lab safety flags",
          "Recommended products and alternatives",
          "60-day reassessment prompt",
        ],
        fine: "One-time payment · Lifetime access",
        guarantee: "Clarity Guarantee",
        guaranteeBody:
          "If your plan does not feel clear and useful, we will make it right or refund you within 7 days.",
        name: "Right Amount Formula",
        price: "690",
        save: "Save 30%",
        term: "one-time",
        was: "THB 990",
      },
      {
        badge: "Most popular",
        cta: "Start Living Protocol",
        description:
          "Keep your right amount right as life changes, with food guidance and ongoing adjustments.",
        eyebrow: "90-day AI support",
        extraBlocks: [
          {
            body: "When something runs low, learn the everyday foods naturally rich in it, or skip the supplement when your meals already cover it.",
            icon: "❘❘",
            title: "Which Foods Give You What You Need",
          },
          {
            body: "Improve sleep quality, boost energy, and build better daily habits.",
            icon: "☾",
            title: "Sleep, Energy and Habits Guidance",
          },
        ],
        features: [
          "Learn which everyday foods give you what you need",
          "Supplement timing and adherence support",
          "Weekly progress summaries",
          "Priority review as your data changes",
        ],
        fine: "One payment · 90 days of support · Renew anytime",
        guarantee: "7-Day Satisfaction Guarantee",
        guaranteeBody:
          "Give Living Protocol a real try. If anything is not right, tell us and we will fix it, or refund you in full within 7 days.",
        includes: "Includes Right Amount Formula Plan.",
        name: "Living Protocol",
        price: "1,590",
        save: "Save 16%",
        term: "for 90 days",
        was: "THB 1,890",
      },
    ],
  },
  th: {
    bodyClass: "leading-8 [word-break:keep-all]",
    progress: [
      ["แบบสอบถาม", "แบบประเมินเสร็จแล้ว"],
      ["HealthScore", "คะแนนสุขภาพพร้อมแล้ว"],
      ["แผนของคุณ", "ปลดล็อกแผนของคุณ"],
    ],
    assessmentComplete: "แบบประเมินของคุณเสร็จแล้ว",
    heroEyebrow: "ผลประเมินฟรีของคุณ",
    heroGreeting(firstName: string) {
      return `พร้อมแล้วสำหรับคุณ ${firstName}`;
    },
    heroTitle(score: number) {
      return `คะแนนสุขภาพของคุณคือ ${score}`;
    },
    defaultHeroBody:
      "เราอ่านเป้าหมาย กิจวัตร บริบทความเหมาะสม และชีวิตจริงของคุณ แล้วแปลงเป็นคะแนนเดียวพร้อมรูปแบบที่อยู่ข้างใต้",
    heroCta: "ปลดล็อกแผนปริมาณที่พอดี",
    heroSecondary: "ดูสิ่งที่ใช้คำนวณ",
    scoreLabel: "คะแนนสุขภาพ",
    scoreOutOf: "/ 100",
    topTier: "ระดับสูง",
    percentile: "เปอร์เซ็นไทล์",
    median: "ค่ากลางอ้างอิง",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "ผู้ทำแบบประเมินทั่วไป",
    spectrumYou: "คุณ",
    spectrumWhere: "ตำแหน่งของคุณ",
    spectrumGapAhead: "ระยะที่คุณอยู่ข้างหน้า",
    spectrumGapBehind: "ช่องว่างถึงค่าทั่วไป",
    spectrumHeadroom: "พื้นที่ปรับถึง 92",
    defaultBandLine:
      "คะแนนนี้คำนวณจากเสาหลักห้าด้าน ธงความเหมาะสม อาการ เป้าหมาย และข้อมูลแล็บหรืออุปกรณ์ที่คุณให้มา",
    bandLabels: {
      "Building foundation": "กำลังสร้างพื้นฐาน",
      "Needs attention": "ต้องให้ความสำคัญ",
      "Good, with a clear gap": "ดี และมีช่องว่างที่ชัดเจน",
      Strong: "แข็งแรง",
      "Strong, with headroom": "แข็งแรง และยังพัฒนาได้",
      Excellent: "ยอดเยี่ยม",
    },
    pillarLabels: {
      activity: "กิจกรรมและความฟิต",
      biomarkers: "ตัวชี้วัดสุขภาพ",
      habits: "พฤติกรรมสุขภาพ",
      nutrition: "โภชนาการและอาหาร",
      sleep: "การนอนและการฟื้นตัว",
      stress: "ความเครียดและสมดุล",
    },
    tagLabels: {
      digestion: "ระบบย่อย",
      energy: "พลังงาน",
      fitness: "ฟิตเนส",
      focus: "โฟกัส",
      heart: "หัวใจ",
      immune: "ภูมิคุ้มกัน",
      mood: "อารมณ์",
      sleep: "การนอน",
    },
    scoreMeaningEyebrow(score: number) {
      return `${score} คะแนนหมายความว่าอะไร`;
    },
    fallbackScoreMeaning(score: number, percentile: number) {
      return `คุณอยู่ข้างหน้าประมาณ ${percentile}% ของคนที่ทำแบบประเมินนี้ คะแนนที่เหลือคือจุดที่เฉพาะตัวที่สุด`;
    },
    fallbackScoreMeaningSub:
      "คะแนนที่สูงขึ้นไม่ได้มาจากการไล่ทำทุกอย่างพร้อมกัน แต่มาจากการปรับไม่กี่จุดที่ยังสำคัญกับรูปแบบของคุณ",
    gapEyebrow: "สิ่งที่แบบประเมินพบ",
    gapTitle: "สามเรื่องที่แบบทดสอบวิตามินทั่วไปมักมองข้าม",
    gapBody: "นี่คือสัญญาณเฉพาะจากคำตอบของคุณที่มีผลต่อสูตร โดยแสดงอย่างชัดเจน",
    fallbackGaps: [
      {
        body: "เสาหลักที่ต่ำที่สุดบอกว่าควรเริ่มปรับจากจุดไหนก่อน",
        headline: "ช่องว่างที่ชัดที่สุดไม่ได้ถูกซ่อนไว้",
        tag: "สัญญาณ",
        value: "01",
      },
      {
        body: "เป้าหมายของคุณเปลี่ยนลำดับของสารอาหารหรือผลิตภัณฑ์ที่ควรอยู่ในแผน",
        headline: "เป้าหมายของคุณเปลี่ยนลำดับ",
        tag: "สัญญาณ",
        value: "02",
      },
      {
        body: "บริบทยา รูปแบบอาหาร ประเทศ และกิจวัตรยังถูกนำมาพิจารณาก่อนแนะนำสิ่งใด",
        headline: "บริบทความเหมาะสมยังอยู่ในภาพ",
        tag: "สัญญาณ",
        value: "03",
      },
    ],
    pillarsEyebrow: "โมเดลห้าเสาหลัก",
    pillarEyebrow: "รูปแบบของคุณ ทีละเสาหลัก",
    pillarsTitle: "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา",
    highestLeverageLabel: "จุดที่ให้แรงส่งสูงที่สุด",
    goalLinkedLabel: "เชื่อมกับเป้าหมาย",
    whatCaught: "สิ่งที่เราจับได้",
    whatCaughtSub: "แสดงอย่างชัดเจน ไม่ปิดบัง",
    fallbackFindingTitle: "คะแนนสุขภาพของคุณมีจุดเริ่มต้นที่ชัดเจน",
    fallbackFindingBody:
      "เสาหลักที่ต่ำที่สุดและบริบทความเหมาะสมเป็นตัวกำหนดว่าแผนควรเริ่มจากอะไร",
    subtractionEyebrow: "สูตรของคุณถูกสร้างอย่างไร",
    subtractionTitle:
      "ตัวอย่างนี้คัดกรองความเป็นไปได้ด้านโภชนาการก่อนสร้างสูตรจริงของคุณ",
    evaluatedFallback: "ประเมิน",
    setAsideFallback: "ตัดออก",
    chosenFallback: "คัดเลือกสำหรับคะแนนของคุณ",
    methodEyebrow: "วิธีคิดของ MattaNutra",
    methodTitle:
      "โมเดลคะแนนคงที่ห้าด้าน ไม่ใช่การเดา และไม่ใช่ค่าเฉลี่ยของคนอื่น",
    fallbackMethodCards: [
      {
        body: "คะแนนถูกคำนวณก่อนที่ AI จะเขียนข้อความบนหน้า",
        title: "คำนวณคะแนนก่อน",
      },
      {
        body: "หน้าจะแสดงเฉพาะสัญญาณจากแบบประเมินที่สำคัญที่สุด",
        title: "เลือกสัญญาณด้วยโค้ด",
      },
      {
        body: "AI เขียนภาษาได้ แต่เปลี่ยนคะแนน ธง จำนวน หรือสิ่งที่พบไม่ได้",
        title: "ข้อความถูกล็อกกับข้อเท็จจริง",
      },
    ],
    trustLine:
      "คะแนนของคุณคำนวณด้วยกฎเดียวกันทุกครั้ง ตรวจสอบย้อนกลับได้ทีละจุด นี่คือข้อมูลสุขภาวะ ไม่ใช่การวินิจฉัย และออกแบบมาให้คุยต่อกับแพทย์ได้",
    pillOpportunity: "โอกาสสูง",
    trustCard: [
      {
        body: "การแพทย์ · วิทยาศาสตร์ · เทคโนโลยี",
        title: "ผู้ก่อตั้งมีประสบการณ์รวมกว่า 100 ปี",
      },
      {
        body: "มหิดล · Princeton · Stanford · Harvard",
        title: "การศึกษาและการฝึกอบรมอย่างเป็นทางการ",
      },
      {
        body: "ผ่านพันธมิตรร้านขายยาไทยที่ได้รับอนุญาต",
        title: "จ่ายโดยเภสัชกรท้องถิ่น",
      },
    ],
    priceHero: {
      alt: "กล่อง MattaNutra เปิดอยู่พร้อมขวดอาหารเสริมและการ์ดขอบคุณ",
      body:
        "THB 690 ปลดล็อกสูตร ผลิตภัณฑ์ ปริมาณ เวลาใช้ และการทบทวนความปลอดภัยตามโปรไฟล์ของคุณ แผนของคุณพร้อมใช้ทุกวัน",
      boxCaptionPrefix:
        "ภาพด้านบนเป็นตัวอย่างกล่องเท่านั้น ปลดล็อกสูตรของคุณเพื่อดูว่าอาหารเสริมใดจะอยู่ในกล่องส่วนตัวของ",
      boxCaptionStrong: "คุณ",
      boxCaptionSuffix: "",
      clarify:
        "THB 690 ครอบคลุมแผนด้านบน ส่วนอาหารเสริมที่จับคู่แล้วจะเป็นตะกร้าแยกในหน้าถัดไป โดยคิดราคาตามราคาที่ MattaNutra ได้จากพันธมิตรร้านขายยา",
      ctaEyebrow: "เลือกขั้นต่อไป",
      service:
        "จากนั้น MattaNutra จะดูแลต่อ ตั้งแต่การจัดหาผลิตภัณฑ์ผ่านพันธมิตรร้านขายยาไปจนถึงการส่งถึงบ้าน",
      title: "สูตร Right Amount ส่วนตัวของคุณพร้อมปลดล็อกแล้ว",
      trustChecks: [
        "สร้างจากเป้าหมาย อาหาร และแล็บของคุณ",
        "ตรวจความเหมาะสมกับยาที่คุณใช้",
      ],
    },
    promises: [
      ["ความชัดเจน", "จากความสับสน"],
      ["คำแนะนำ", "ที่เชื่อถือได้"],
      ["เฉพาะบุคคล", "เพื่อคุณ"],
      ["ความมั่นใจ", "ในทุกการเลือก"],
    ],
    decision: {
      eyebrow: "สองทางเลือก · แผนเดียว",
      lead:
        "ไม่ว่าคุณเลือกทางใด แผนเป็นของคุณ สิ่งที่ต่างคือ MattaNutra จะเดินไปกับคุณใน 90 วันแรกหรือไม่",
      optionFormula:
        "เลือก Right Amount Formula หากต้องการคำตอบชัดเจนแบบครั้งเดียวที่คุณนำไปใช้เอง ได้แผนครบวันนี้ และคุณตัดสินใจขั้นต่อไป",
      optionProtocol:
        "เลือก Living Protocol หากต้องการการสนับสนุนต่อเนื่องจากทีมแพทย์ แผนจะปรับตามการเดินทาง การนอน ความเครียด และกิจวัตร พร้อมคำแนะนำอาหารและการตรวจความปลอดภัย",
      title:
        "เราได้กำหนด Right Amount ของคุณอย่างรอบคอบแล้ว ตอนนี้ถึงเวลาที่คุณเลือกแผนที่เหมาะกับความต้องการของคุณ",
    },
    pricingEyebrow: "เลือกขั้นต่อไป",
    pricingTitle: "ปลดล็อกแผนที่ตรงกับระดับการสนับสนุนที่คุณต้องการ",
    pricingBody:
      "เลือกสูตรปริมาณที่พอดีแบบครั้งเดียวเพื่อความชัดเจนทันที หรือเลือก Living Protocol 90 วันสำหรับการช่วยเปลี่ยนแผนเป็นกิจวัตรจริง",
    preparing: "กำลังเตรียม...",
    selectionError: "ไม่สามารถเริ่มแผนได้ในขณะนี้",
    plans: [
      {
        badge: "ข้อเสนอพิเศษ",
        cta: "รับสูตรปริมาณที่พอดี",
        description:
          "สูตรอาหารเสริมส่วนตัว พร้อมปริมาณ เวลาใช้ และคำแนะนำผลิตภัณฑ์",
        eyebrow: "แผนครั้งเดียว",
        features: [
          "สูตรอาหารเสริมส่วนตัว",
          "ช่วงปริมาณที่ปรับตามร่างกาย",
          "คำแนะนำเวลาและวิธีใช้",
          "ธงความปลอดภัยจากยาและแล็บ",
          "ผลิตภัณฑ์ที่แนะนำและทางเลือก",
          "แจ้งเตือนประเมินซ้ำใน 60 วัน",
        ],
        fine: "ชำระครั้งเดียว · เข้าถึงได้ตลอด",
        guarantee: "รับประกันความชัดเจน",
        guaranteeBody:
          "หากแผนไม่ชัดเจนหรือไม่มีประโยชน์ เราจะปรับให้หรือคืนเงินภายใน 7 วัน",
        name: "สูตรปริมาณที่พอดี",
        price: "690",
        save: "ประหยัด 30%",
        term: "ครั้งเดียว",
        was: "THB 990",
      },
      {
        badge: "นิยมที่สุด",
        cta: "เริ่ม Living Protocol",
        description:
          "รักษาปริมาณที่พอดีให้ยังพอดีเมื่อชีวิตเปลี่ยน พร้อมคำแนะนำอาหารและการปรับต่อเนื่อง",
        eyebrow: "AI ดูแล 90 วัน",
        extraBlocks: [
          {
            body: "เมื่อบางอย่างยังขาด ให้รู้ว่าอาหารประจำวันชนิดใดมีสิ่งนั้นตามธรรมชาติ หรือข้ามอาหารเสริมได้เมื่อมื้ออาหารครอบคลุมแล้ว",
            icon: "❘❘",
            title: "อาหารชนิดใดให้สิ่งที่คุณต้องการ",
          },
          {
            body: "ช่วยปรับคุณภาพการนอน พลังงาน และนิสัยประจำวันให้ดีขึ้น",
            icon: "☾",
            title: "คำแนะนำเรื่องการนอน พลังงาน และนิสัย",
          },
        ],
        features: [
          "เรียนรู้ว่าอาหารประจำวันชนิดใดให้สิ่งที่คุณต้องการ",
          "ช่วยเรื่องเวลาใช้และความสม่ำเสมอของอาหารเสริม",
          "สรุปความคืบหน้ารายสัปดาห์",
          "ทบทวนเมื่อข้อมูลเปลี่ยน",
        ],
        fine: "ชำระครั้งเดียว · ดูแล 90 วัน · ต่ออายุได้",
        guarantee: "รับประกันความพึงพอใจ 7 วัน",
        guaranteeBody:
          "ลองใช้ Living Protocol อย่างจริงจัง หากมีสิ่งใดไม่ตรงใจ บอกเรา เราจะปรับให้หรือคืนเงินเต็มจำนวนภายใน 7 วัน",
        includes: "รวมแผนสูตรปริมาณที่พอดี",
        name: "Living Protocol",
        price: "1,590",
        save: "ประหยัด 16%",
        term: "90 วัน",
        was: "THB 1,890",
      },
    ],
  },
} as const;

type WidenPageCopy<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer Item)[]
          ? readonly WidenPageCopy<Item>[]
          : T extends object
            ? { readonly [Key in keyof T]: WidenPageCopy<T[Key]> }
            : T;

export type HealthScorePageCopy = WidenPageCopy<typeof basePageCopy.en>;

export const pageCopy = {
  ...basePageCopy,
  "zh-CN": {
    bodyClass: "leading-relaxed",
    progress: [
      ["问卷", "评估完成"],
      ["HealthScore", "您的 HealthScore 已就绪"],
      ["您的计划", "解锁您的计划"],
    ],
    assessmentComplete: "您的评估已完成",
    heroGreeting(firstName: string) {
      return `随时准备就绪，${firstName}。`;
    },
    heroTitle(score: number) {
      return `您的 HealthScore 是 ${score}。`;
    },
    heroEyebrow: "您的免费评估结果",
    defaultHeroBody:
      "我们阅读了您的目标、日常作息、安全背景以及真实生活方式，将它们转化为一个数字及其背后的模式。",
    heroCta: "解锁我的 Right Amount Plan",
    heroSecondary: "查看影响因素",
    scoreLabel: "HealthScore",
    scoreOutOf: "/ 100",
    topTier: "顶级",
    percentile: "百分位",
    median: "参考中位数",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "典型完成者",
    spectrumYou: "您",
    spectrumWhere: "您的位置",
    spectrumGapAhead: "领先距离",
    spectrumGapBehind: "与典型完成者的差距",
    spectrumHeadroom: "到92分的提升空间",
    defaultBandLine:
      "您的分数由五个加权支柱、安全标志、症状、目标以及您提供的任何已验证实验室或可穿戴设备数据共同构建。",
    bandLabels: {
      "Building foundation": "正在建立基础",
      "Needs attention": "需要关注",
      "Good, with a clear gap": "良好，但仍有明显差距",
      Strong: "强劲",
      "Strong, with headroom": "较强，仍有提升空间",
      Excellent: "优秀",
    },
    pillarLabels: {
      activity: "活动与健身",
      biomarkers: "生物标志物",
      habits: "健康习惯",
      nutrition: "营养与饮食",
      sleep: "睡眠与恢复",
      stress: "压力与平衡",
    },
    tagLabels: {
      digestion: "消化",
      energy: "能量",
      fitness: "健身",
      focus: "专注",
      heart: "心脏",
      immune: "免疫",
      mood: "情绪",
      sleep: "睡眠",
    },
    scoreMeaningEyebrow(score: number) {
      return `${score} 的实际含义`;
    },
    fallbackScoreMeaning(_score: number, percentile: number) {
      return `您领先于约 ${percentile}% 完成此评估的人。最后的分数最难获得，也最个性化。`;
    },
    fallbackScoreMeaningSub:
      "更高的分数并非追求一次性全部达成，而是针对您模式中仍需优化的少数具体调整。",
    gapEyebrow: "评估揭示",
    gapTitle: "三个通用维生素问卷会直接忽略的要点。",
    gapBody: "这些是您答案中的具体信号，完整呈现您的配方依据，毫无保留。",
    fallbackGaps: [
      {
        body: "您得分最低的支柱显示首次实际改变应从何处开始。",
        headline: "最清晰的差距并非隐藏",
        tag: "信号",
        value: "01",
      },
      {
        body: "您的目标决定哪些营养素或产品在计划中获得优先位置。",
        headline: "您的目标改变优先级",
        tag: "信号",
        value: "02",
      },
      {
        body: "用药、饮食模式、国家和作息背景在任何建议前保持可见。",
        headline: "安全背景始终在场",
        tag: "信号",
        value: "03",
      },
    ],
    pillarsEyebrow: "五支柱模型",
    pillarEyebrow: "您的模式，逐支柱呈现",
    pillarsTitle: "跨五个领域的固定评分模型，而非猜测。",
    highestLeverageLabel: "您的最高杠杆行动",
    goalLinkedLabel: "目标相关",
    whatCaught: "我们捕捉到的",
    whatCaughtSub: "完整呈现，毫无保留。",
    fallbackFindingTitle: "您的 HealthScore 有明确的起点",
    fallbackFindingBody: "得分最低的支柱和安全背景决定计划应优先处理的内容。",
    subtractionEyebrow: "您的配方如何生成",
    subtractionTitle: "这个预览会先筛选广泛的营养可能性；最终配方会在生成后确定。",
    evaluatedFallback: "已评估",
    setAsideFallback: "已排除",
    chosenFallback: "按您的分数筛选",
    methodEyebrow: "MattaNutra 的思考方式",
    methodTitle: "跨五个领域的固定评分模型，而非猜测或陌生人的平均值。",
    fallbackMethodCards: [
      {
        body: "在 AI 撰写任何文案前先计算分数。",
        title: "分数优先",
      },
      {
        body: "仅显示最强的评估信号。",
        title: "信号由代码筛选",
      },
      {
        body: "AI 可润色页面，但无法更改您的分数、标志、计数或发现。",
        title: "文案锁定事实",
      },
    ],
    trustLine:
      "您的数字每次都按相同规则计算：可追溯，逐点呈现。这是健康指导而非诊断，适合与医生分享。",
    pillOpportunity: "高机会",
    trustCard: [
      {
        body: "医学 · 科学 · 技术",
        title: "创始团队拥有100年以上综合经验",
      },
      {
        body: "Mahidol · Princeton · Stanford · Harvard",
        title: "正规教育与训练背景",
      },
      {
        body: "通过持牌泰国药房合作伙伴",
        title: "由本地药剂师配发",
      },
    ],
    priceHero: {
      alt: "打开的 MattaNutra 盒子，内含匹配的补充剂瓶和感谢卡",
      body:
        "THB 690 可解锁具体补充剂、品牌、剂量和服用时机，并包含围绕您资料的安全审查。您的计划可每天使用。",
      boxCaptionPrefix:
        "上图仅为示例盒。解锁您的配方，了解",
      boxCaptionStrong: "您",
      boxCaptionSuffix: "的个性化盒中会有哪些补充剂。",
      clarify:
        "THB 690 覆盖上方计划。匹配的补充剂会在下一页作为单独购物篮，由 MattaNutra 按药房合作伙伴提供的有竞争力价格计费。",
      ctaEyebrow: "选择下一步",
      service:
        "之后，MattaNutra 会继续处理：通过药房合作伙伴采购每款产品并送到您家中。",
      title: "您的个性化 Right Amount Formula 已可解锁。",
      trustChecks: [
        "围绕您的目标、饮食和实验室数据构建",
        "根据您的用药情况进行安全核查",
      ],
    },
    promises: [
      ["清晰", "摆脱困惑"],
      ["指导", "值得信赖"],
      ["个性化", "只为您"],
      ["信心", "每个选择"],
    ],
    decision: {
      eyebrow: "两条路径 · 一个计划",
      lead:
        "无论选择哪种方式，计划本身都属于您。区别在于 MattaNutra 是否在前90天陪您一起应对真实生活变化。",
      optionFormula:
        "选择 Right Amount Formula，获得清晰的一次性答案并自行执行。今天拿到完整计划，之后由您决定下一步。",
      optionProtocol:
        "选择 Living Protocol，获得医生团队建立的持续支持；当您旅行、睡眠变差或改变日常时，计划会配合调整，并包含食物优先指导和安全核查。",
      title:
        "我们已经仔细确定您的 Right Amount。现在轮到您选择最符合需求的计划。",
    },
    pricingEyebrow: "选择下一步",
    pricingTitle: "解锁符合您所需支持程度的计划。",
    pricingBody:
      "选择一次性 Right Amount Formula 获得即时清晰度，或选择 90-Day Living Protocol 获得持续帮助，将计划转化为日常习惯。",
    preparing: "准备中...",
    selectionError: "目前无法启动您的计划。",
    plans: [
      {
        badge: "限时优惠",
        cta: "获取 Right Amount Formula",
        description: "您的个性化补充剂配方，包含精确剂量、时机和产品指导。",
        eyebrow: "一次性计划",
        features: [
          "个性化补充剂配方",
          "按体型调整的剂量范围",
          "时机与使用说明",
          "用药与实验室安全标志",
          "推荐产品及替代方案",
          "60天重新评估提示",
        ],
        fine: "一次性付款 · 终身访问",
        guarantee: "清晰度保证",
        guaranteeBody: "如果您的计划不够清晰实用，我们将在7天内解决或退款。",
        name: "Right Amount Formula",
        price: "690",
        save: "节省30%",
        term: "一次性",
        was: "THB 990",
      },
      {
        badge: "最受欢迎",
        cta: "开始 Living Protocol",
        description:
          "随着生活变化保持 right amount 正确，提供饮食指导和持续调整。",
        eyebrow: "90天 AI 支持",
        extraBlocks: [
          {
            body: "当某种成分不足时，了解日常富含该成分的食物，或在餐食已覆盖时跳过补充剂。",
            icon: "❘❘",
            title: "哪些食物能提供您所需",
          },
          {
            body: "改善睡眠质量，提升能量，建立更好的日常习惯。",
            icon: "☾",
            title: "睡眠、能量与习惯指导",
          },
        ],
        features: [
          "了解日常食物如何提供所需成分",
          "补充剂时机与依从性支持",
          "每周进度摘要",
          "数据变化时的优先审查",
        ],
        fine: "一次性付款 · 90天支持 · 随时续订",
        guarantee: "7天满意保证",
        guaranteeBody:
          "请真正尝试 Living Protocol。如有任何问题，请告知我们，我们将在7天内解决或全额退款。",
        includes: "包含 Right Amount Formula 计划。",
        name: "Living Protocol",
        price: "1,590",
        save: "节省16%",
        term: "为期90天",
        was: "THB 1,890",
      },
    ],
  },
} as const satisfies Record<Locale, HealthScorePageCopy>;

export type PricePlan = HealthScorePageCopy["plans"][number];
