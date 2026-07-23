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
      ["健康评分", "你的健康评分已就绪"],
      ["你的方案", "解锁你的方案"],
    ],
    assessmentComplete: "你的评估已完成",
    heroGreeting(firstName: string) {
      return `${firstName}，就差一步了。`;
    },
    heroTitle(score: number) {
      return `你的健康评分是 ${score}。`;
    },
    heroEyebrow: "你的免费健康评分",
    defaultHeroBody:
      "每一条回答，都为你运转了一遍。一个分数，看清身体底层到底怎么了。",
    heroCta: "解锁我的知量方案",
    heroSecondary: "看看分数怎么算",
    scoreLabel: "健康评分",
    scoreOutOf: "/ 100",
    topTier: "顶级",
    percentile: "百分位",
    median: "参考中位数",
    spectrumStart: "30",
    spectrumEnd: "92",
    spectrumTypical: "典型完成者",
    spectrumYou: "你",
    spectrumWhere: "你的位置",
    spectrumGapAhead: "领先距离",
    spectrumGapBehind: "与典型完成者的差距",
    spectrumHeadroom: "到 92 分的提升空间",
    defaultBandLine:
      "你的分数由五个加权支柱、安全标志、症状、目标，以及你提供的任何已验证实验室或可穿戴设备数据共同构建。",
    bandLabels: {
      "Building foundation": "正在建立基础",
      "Needs attention": "需要关注",
      "Good, with a clear gap": "良好，但仍有明显差距",
      Strong: "强劲",
      "Strong, with headroom": "较强，仍有提升空间",
      Excellent: "优秀",
    },
    pillarLabels: {
      activity: "运动与体能",
      biomarkers: "生物标志物",
      habits: "健康习惯",
      nutrition: "饮食与营养",
      sleep: "睡眠与恢复",
      stress: "压力与平衡",
    },
    tagLabels: {
      digestion: "消化",
      energy: "能量",
      fitness: "体能",
      focus: "专注",
      heart: "心脏",
      immune: "免疫",
      mood: "情绪不稳定",
      sleep: "睡眠",
    },
    scoreMeaningEyebrow(score: number) {
      return `${score} 分，什么水平？`;
    },
    fallbackScoreMeaning(_score: number, percentile: number) {
      return `你已领先 ${percentile}% 的人，但你还可以更好。`;
    },
    fallbackScoreMeaningSub:
      "差在哪？就几个关键点。下面告诉你是什么，再给你对应的调整方案。",
    gapEyebrow: "你漏掉了什么",
    gapTitle: "普通营养测评不会告诉你的那件事。",
    gapBody: "你的数据里藏着信号，我们把它揪出来了。全说，不兜圈子。",
    fallbackGaps: [
      {
        body: "你把它放一边，但你的健康目标全都在等它拉动。补上这个，收效最快。",
        headline: "最被低估的一张牌：运动。",
        tag: "信号",
        value: "01",
      },
      {
        body: "睡得少或睡不好，其他方面再怎么努力，效果都打了折扣。这是你分数里，最容易拉动的一项。",
        headline: "你的身体，没时间好好恢复",
        tag: "信号",
        value: "02",
      },
      {
        body: "缺什么、补多少，知量方案替你算好了。",
        headline: "不是你吃得差，是身体要的你没给到。",
        tag: "信号",
        value: "03",
      },
    ],
    pillarsEyebrow: "五支柱模型",
    pillarEyebrow: "你的身体底子，逐项看",
    pillarsTitle: "每项都对应你的健康目标。高分不用动，低分就是可提升的空间。",
    highestLeverageLabel: "最值得先动的一项",
    goalLinkedLabel: "关联目标",
    whatCaught: "你漏掉了什么",
    whatCaughtSub: "你的数据里藏着信号，我们把它揪出来了。",
    fallbackFindingTitle: "你的日常，就是知量方案的底稿",
    fallbackFindingBody: "防晒、日晒少、油性鱼吃得不多——几个信号，指向同一个方向。不套公式，照你的生活习惯配。",
    subtractionEyebrow: "不是选进来，是筛出去",
    subtractionTitle: "一份好的方案，不是加法，是减法。不堆成分，只留对的。你的知量方案，就这么配。",
    evaluatedFallback: "已评估",
    setAsideFallback: "被淘汰",
    chosenFallback: "进入你的备选",
    methodEyebrow: "知量配方怎么算",
    methodTitle: "五个维度，一套模型。不算命、不凑数、不套模板。",
    fallbackMethodCards: [
      {
        body: "健康寿命是那把尺，你所有的回答，都放在它下面看。所以跟目标挂钩的支柱，权重更高。",
        title: "你的目标，定方向",
      },
      {
        body: "睡眠、压力、运动、饮食、防晒、吃鱼——这些决定什么该进知量方案，什么该被筛出去。",
        title: "你的日常，填细节",
      },
      {
        body: "用药、孕期、肾脏、肝脏、过敏不耐受——这些划出的线，方案绝不越过。",
        title: "你的安全，划边界",
      },
    ],
    trustLine:
      "你的分数，有据可查。同一套规则，次次一样。不诊断，只调理。欢迎拿给医生看。",
    pillOpportunity: "高机会",
    trustCard: [
      {
        body: "医学 · 科学 · 技术",
        title: "创始团队：医学、科学、技术，合计百余年经验",
      },
      {
        body: "Mahidol · Princeton · Stanford · Harvard",
        title: "出身玛希隆、普林斯顿、斯坦福、哈佛",
      },
      {
        body: "持牌药房，执业药师亲手调配",
        title: "谁在配",
      },
    ],
    priceHero: {
      alt: "打开的 MattaNutra 盒子，内含匹配的营养品瓶和感谢卡",
      body:
        "THB 690 解锁你的专属知量方案。解锁后你会得到：精确到品牌和剂量的营养品清单、每天的服用时间、一份跟你用药做过安全核验的方案。不是建议，是方案。",
      boxCaptionPrefix:
        "这是示例，不是你的。解锁你的配方，看看",
      boxCaptionStrong: "你的",
      boxCaptionSuffix: "那盒会有哪些营养品。",
      clarify:
        "THB 690 买的是方案。营养品在下一页，药房什么价，给你什么价。",
      ctaEyebrow: "就差一步了",
      service:
        "后续采购、配送，MattaNutra 合作药房帮你搞定，直送上门。",
      title: "你的专属知量方案已准备好解锁。",
      trustChecks: [
        "围绕你的目标、饮食和检测数据构建",
        "跟你的用药做过安全核验",
      ],
    },
    promises: [
      ["化繁为简", "告别困惑"],
      ["科学有据", "专业可信"],
      ["量身定制", "精准匹配"],
      ["胸有成竹", "每次选择安心"],
    ],
    decision: {
      eyebrow: "两条路径 · 一份方案",
      lead:
        "接下来 90 天——出差、聚餐、熬夜、生理期，这些都会影响你该吃什么、吃多少。到时候，方案跟不跟着调？你来选。",
      optionFormula:
        "路径一 · 知量方案：完整方案，今天拿走。自己照着用，后面怎么走，你说了算。",
      optionProtocol:
        "路径二 · 动态健康方案：90 天，方案跟着你变。出差、睡不好、节奏乱了，营养管家自动重算。饮食优先指导，用药和数据持续核验，方案始终对应当下的你。",
      title:
        "专属你的知量方案，已经就绪。",
    },
    pricingEyebrow: "选择下一步",
    pricingTitle: "选择最适合你的支持方式。",
    pricingBody:
      "选择一次性知量方案获得清晰答案，或选择 90 天动态健康方案，让方案在真实生活里持续跟上你。",
    preparing: "准备中...",
    selectionError: "目前无法启动你的计划。",
    plans: [
      {
        badge: "限时优惠",
        cta: "获取知量方案",
        description: "你的专属营养方案，精确到剂量、服用时间、产品推荐。",
        eyebrow: "一次性方案",
        features: [
          "专属营养方案",
          "按体重校准的剂量范围",
          "服用时间与方式说明",
          "用药与检测安全标注",
          "推荐产品及备选",
          "60 天后复测提醒",
        ],
        fine: "一次性付款 · 终身访问",
        guarantee: "清晰承诺",
        guaranteeBody: "7 天内，如果你觉得方案不够清晰、不够有用，我们负责调到你满意，或者退款。",
        name: "知量方案",
        price: "690",
        save: "立省 30%",
        term: "一次性",
        was: "THB 990",
      },
      {
        badge: "最受欢迎",
        cta: "开启动态健康方案",
        description:
          "你的 AI 营养管家就在 WhatsApp 或 Line 上。随时聊、随时调——出差、熬夜、吃乱了，它帮你即时调整。",
        eyebrow: "90 天 AI 陪伴",
        extraBlocks: [
          {
            body: "缺什么，告诉你日常哪些食物能补上。吃够了少补，不够再精准补。",
            icon: "❘❘",
            title: "专属你的食物补给指南",
          },
          {
            body: "改善睡眠质量，提升精力，建立更好的日常习惯。",
            icon: "☾",
            title: "动态健康管家提供实时指导",
          },
        ],
        features: [
          "日常食物营养指南",
          "营养品服用提醒",
          "每周进度摘要",
          "数据变化时的优先审查",
        ],
        fine: "一次付款 · 90 天支持 · 随时续",
        guarantee: "7 天满意保障",
        guaranteeBody:
          "认真试试。不满意，调好或全额退。",
        includes: "包含完整知量方案。",
        name: "动态健康方案",
        price: "1,590",
        save: "立省 16%",
        term: "为期90天",
        was: "THB 1,890",
      },
    ],
  },
} as const satisfies Record<Locale, HealthScorePageCopy>;

export type PricePlan = HealthScorePageCopy["plans"][number];
