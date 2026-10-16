import type { Locale } from "@/lib/i18n";

// Presentation copy from the supplied v8.4 reference. Assessment facts stay dynamic.
const englishCopy = {
  "sampleEye": "Illustrative example · 18 seconds",
  "sampleTitle": "See what your personalised plan could look like.",
  "sampleSub": "A sample profile, shown for illustration. Your ingredients, amounts and matched products will be personalised to you.",
  "sampleVideoLabel": "Illustrative sample plan: 160+ ingredients, a selected formula with amounts, and matched supplement products.",
  "sampleNote": "Illustrative products. The ฿690 fee buys your plan; supplements are purchased separately.",
  "samplePlay": "Play example",
  "samplePause": "Pause",
  "sampleReplay": "Replay",
  "sampleFallback": "Your browser cannot play this video. The example shows a selection from 160+ ingredients, with amounts and matched supplement products.",
  "samplePosterAlt": "Illustrative example of a personalised supplement plan and matched products.",
  "matched": "matched to your profile",
  "title": "Your HealthScore · MattaNutra",
  "boxAlt": "An example MattaNutra supplement box with matched products, a thank-you card and the MattaNutra logo.",
  "boxCaption": "An example MattaNutra delivery, prepared through our approved pharmacy network. Your products will reflect your personalised order.",
  "steps": [
    "Questionnaire",
    "HealthScore",
    "Your plan"
  ],
  "complete": "Your assessment is complete",
  "heading": "{name}, a plan shaped by your answers.",
  "headingNoName": "A plan shaped by your answers.",
  "goals": "Your goals: ",
  "scoreLabel": "Your HealthScore",
  "scoreBasis": "Based on your questionnaire. A wellness indicator, not a diagnosis.",
  "bandLow": "Building foundation",
  "bandHigh": "Strong, with headroom",
  "scoreLow": "Your answers highlight areas to focus on, alongside habits worth keeping.",
  "scoreHigh": "Your answers show a strong foundation, with a few areas to look at more closely.",
  "insightLabel": "One answer that shaped your plan",
  "product": "Your Right Amount Formula",
  "offerTitle": "Know what to take.\nAnd how much.",
  "offerSub": "Your personalised supplement list, amounts and timing — ready to put into practice.",
  "offerItems": [
    "Selected supplements and matched products",
    "Amounts, timing and reasons for each choice"
  ],
  "once": "One-time payment",
  "noSub": "No subscription",
  "cta": "Unlock my plan · ฿690",
  "ctaShort": "Unlock my plan",
  "separate": "Supplements purchased separately",
  "stripe": "Secure payment via Stripe",
  "guaranteeLink": "7-day Clarity Guarantee",
  "physician": "Physician-founded",
  "readMore": "Explore what your answers revealed ↓",
  "proofEyebrow": "Personal to you",
  "proofTitle": "The connections\nin your answers.",
  "proofSub": "Your goals, daily routine and health history are considered together to shape your supplement review.",
  "selectionTitle": "Shortlisted for you.",
  "selectionBody": "Your assessment narrows the options to a personalised nutrient shortlist. Unlock your plan to see the recommended amounts and matched products.",
  "formulaPreparingTitle": "Your formula is taking shape.",
  "formulaPreparingBody": "We’re preparing your personalised formula while you explore your HealthScore. You can unlock your plan now; your nutrient shortlist will appear here when it is ready.",
  "evaluated": "ingredients in our library",
  "setAside": "set aside",
  "chosen": "shortlisted for you",
  "midTitle": "Your insights are here. Take the next step.",
  "midSub": "Unlock your personalised supplement plan, with amounts and timing.",
  "insideEye": "What ฿690 gives you",
  "insideTitle": "Turn your assessment\ninto a practical plan.",
  "insideBody": "Your HealthScore helps you understand the pattern in your answers. Your Right Amount Formula gives you the specific supplement recommendations to act on.",
  "insideNote": "One clear place to see what to take, how much, when and why it was selected for you.",
  "docLabel": "Inside your plan",
  "docTitle": "Right Amount Formula",
  "contents": [
    [
      "What to take",
      "Selected ingredients and matched supplement products."
    ],
    [
      "How much",
      "Recommended daily amounts based on your profile."
    ],
    [
      "When and how",
      "Timing and usage instructions in one place."
    ],
    [
      "Why it fits you",
      "Reasons for the recommendations, with relevant precautions."
    ]
  ],
  "reportTitle": "Your HealthScore, in detail",
  "reportSub": "See the pattern across your five pillars, and how it connects with your goals.",
  "goalLinked": "Connected to your goals",
  "reportMethodTitle": "How to read this score",
  "reportMethod": "This is a questionnaire-based wellness indicator across five domains. It reflects the answers you provided. It does not diagnose a condition or measure a nutrient deficiency. Buying or taking supplements does not guarantee a higher score.",
  "strengthPrefix": "A strength to keep",
  "trust": [
    [
      "Physician-founded",
      "Built by a team spanning medicine, science and technology."
    ],
    [
      "Founders’ education & training",
      "Mahidol · Princeton · Stanford · Harvard"
    ],
    [
      "Approved pharmacy partners",
      "Quality supplements prepared through MattaNutra’s pharmacy network."
    ]
  ],
  "journeyEye": "From clarity to your doorstep",
  "journeyTitle": "A clear next step.\nThen home delivery.",
  "journey": [
    [
      "Unlock your plan",
      "Pay ฿690 once to see your personalised supplement recommendations, amounts and timing."
    ],
    [
      "Review your supplements",
      "See your matched products and their prices, then choose whether to place an order."
    ],
    [
      "Receive them at home",
      "MattaNutra’s approved pharmacy partners prepare your supplements for home delivery."
    ]
  ],
  "faqEye": "Before you decide",
  "faqTitle": "A few things\nyou may be wondering.",
  "faqs": [
    [
      "Does ฿690 include supplements?",
      "No. ฿690 pays for your personalised Right Amount Formula. Supplement products are purchased separately. You will see their prices before confirming your supplement order."
    ],
    [
      "Is this a subscription?",
      "No. This is a one-time ฿690 payment for your plan, with no recurring plan charge."
    ],
    [
      "What if my plan is not clear or useful?",
      "Our seven-day Clarity Guarantee covers your plan: if it does not feel clear and useful, tell us within seven days of purchase. We will help make it right or refund your plan payment."
    ],
    [
      "Who supplies my supplements?",
      "Your order is prepared through approved MattaNutra pharmacy partners and delivered to your home."
    ]
  ],
  "guaranteeTitle": "Your clarity comes first.",
  "guaranteeBody": "If your plan does not feel clear and useful, tell us within seven days. We will make it right or refund your ฿690 plan payment.",
  "closeEye": "Your next step",
  "closeTitle": "Less guessing.\nA plan made for you.",
  "closeBody": "Your selected supplements. Your amounts. Your timing.",
  "back": "Return to my HealthScore",
  "opening": "Opening secure checkout…",
  "checkoutError": "We could not open checkout. Please try again.",
  "unavailableTitle": "Your results are not available yet.",
  "unavailableBody": "Please return to your assessment or try again shortly.",
  "missingTranslation": "This assessment is not yet available in the selected language.",
  "bands": {
    "Needs attention": "Needs attention",
    "Building foundation": "Building foundation",
    "Good, with a clear gap": "Good, with a clear gap",
    "Strong, with headroom": "Strong, with headroom",
    "Excellent": "Excellent"
  },
  "pillars": {
    "Health Habits": "Health Habits",
    "Sleep & Recovery": "Sleep & Recovery",
    "Nutrition & Diet": "Nutrition & Diet",
    "Activity & Fitness": "Activity & Fitness",
    "Stress & Balance": "Stress & Balance"
  },
  "heroTrust": "Physician-founded",
  "heroEducation": "Founders’ education & training",
  "paymentPromptPay": "PromptPay",
  "paymentCards": "Credit cards",
  "paymentLabel": "Accepted payment methods",
  "planPayment": "One-time plan payment"
};

export type HealthScoreV8Copy = typeof englishCopy;

const thaiCopy: HealthScoreV8Copy = {
  "sampleEye": "ตัวอย่างประกอบ · 18 วินาที",
  "sampleTitle": "ดูตัวอย่างแผนอาหารเสริมเฉพาะบุคคล",
  "sampleSub": "ตัวอย่างนี้ใช้ข้อมูลบุคคลสมมติ สารอาหาร ปริมาณ และผลิตภัณฑ์ที่แนะนำสำหรับคุณจะปรับตามข้อมูลของคุณ",
  "sampleVideoLabel": "ตัวอย่างแผนเฉพาะบุคคล จากสารอาหาร 160+ ชนิด สู่สูตรที่คัดเลือกพร้อมปริมาณ และผลิตภัณฑ์ที่เหมาะสม",
  "sampleNote": "ผลิตภัณฑ์ที่เห็นเป็นตัวอย่าง ฿690 เป็นค่าแผน ค่าอาหารเสริมชำระแยกต่างหาก",
  "samplePlay": "เล่นตัวอย่าง",
  "samplePause": "หยุดชั่วคราว",
  "sampleReplay": "ดูอีกครั้ง",
  "sampleFallback": "เบราว์เซอร์ของคุณไม่รองรับวิดีโอนี้ ตัวอย่างแสดงการคัดเลือกจากสารอาหาร 160+ ชนิด พร้อมปริมาณและผลิตภัณฑ์ที่เหมาะสม",
  "samplePosterAlt": "ตัวอย่างแผนอาหารเสริมเฉพาะบุคคลและผลิตภัณฑ์ที่คัดเลือก",
  "matched": "คัดตามข้อมูลของคุณ",
  "title": "HealthScore ของคุณ · MattaNutra",
  "boxAlt": "ตัวอย่างกล่องอาหารเสริม MattaNutra พร้อมผลิตภัณฑ์ การ์ดขอบคุณ และโลโก้ MattaNutra",
  "boxCaption": "ตัวอย่างกล่องจัดส่ง MattaNutra ที่จัดเตรียมผ่านร้านยาในเครือข่าย ผลิตภัณฑ์ของคุณจะเป็นไปตามรายการที่คุณสั่ง",
  "steps": [
    "แบบประเมิน",
    "HealthScore",
    "แผนของคุณ"
  ],
  "complete": "ประเมินเสร็จแล้ว",
  "heading": "คุณ{name} แผนที่เริ่มจากคำตอบของคุณ",
  "headingNoName": "แผนที่เริ่มจากคำตอบของคุณ",
  "goals": "เป้าหมายของคุณ: ",
  "scoreLabel": "HealthScore ของคุณ",
  "scoreBasis": "อ้างอิงจากคำตอบของคุณ เป็นข้อมูลเพื่อดูแลสุขภาพ ไม่ใช่การวินิจฉัยโรค",
  "bandLow": "กำลังสร้างพื้นฐาน",
  "bandHigh": "พื้นฐานดี ยังพัฒนาได้",
  "scoreLow": "คำตอบของคุณช่วยให้เห็นทั้งจุดที่ควรใส่ใจ และพฤติกรรมที่ควรรักษาไว้",
  "scoreHigh": "คุณมีพื้นฐานที่ดี และยังมีบางด้านที่ควรพิจารณาให้ละเอียดขึ้น",
  "insightLabel": "คำตอบที่มีผลต่อแผนของคุณ",
  "product": "สูตรปริมาณที่พอดีเฉพาะคุณ",
  "offerTitle": "รู้ว่าควรเสริมอะไร\nและเท่าไรจึงพอดี",
  "offerSub": "รายการอาหารเสริม ปริมาณ และช่วงเวลาที่เหมาะกับคุณ พร้อมนำไปใช้ได้จริง",
  "offerItems": [
    "รายการอาหารเสริมและผลิตภัณฑ์ที่คัดเลือกให้",
    "ปริมาณ วิธีใช้ และเหตุผลที่เลือกแต่ละรายการ"
  ],
  "once": "ชำระครั้งเดียว",
  "noSub": "ไม่มีค่าสมาชิกรายเดือน",
  "cta": "รับแผนเฉพาะคุณ · ฿690",
  "ctaShort": "รับแผนเฉพาะคุณ",
  "separate": "ค่าอาหารเสริมชำระแยกต่างหาก",
  "stripe": "ชำระเงินอย่างปลอดภัยผ่าน Stripe",
  "guaranteeLink": "รับประกันความชัดเจนของแผน 7 วัน",
  "physician": "ก่อตั้งโดยแพทย์",
  "readMore": "ดูสิ่งที่เราเข้าใจจากคำตอบของคุณ ↓",
  "proofEyebrow": "เฉพาะตัวคุณ",
  "proofTitle": "เมื่อเชื่อมโยง\nคำตอบของคุณเข้าด้วยกัน",
  "proofSub": "เราใช้เป้าหมาย กิจวัตร และประวัติสุขภาพร่วมกัน เพื่อพิจารณาอาหารเสริมที่เหมาะกับคุณ",
  "selectionTitle": "คัดเลือกเบื้องต้นสำหรับคุณ",
  "selectionBody": "ผลประเมินช่วยคัดสารอาหารที่เหมาะกับคุณ ปลดล็อกแผนเพื่อดูปริมาณที่แนะนำและผลิตภัณฑ์ที่คัดสรรให้คุณ",
  "formulaPreparingTitle": "สูตรเฉพาะคุณกำลังอยู่ระหว่างการจัดทำ",
  "formulaPreparingBody": "เรากำลังจัดทำสูตรเฉพาะคุณระหว่างที่คุณอ่าน HealthScore คุณสามารถปลดล็อกแผนได้เลย และรายการสารอาหารที่คัดเลือกจะปรากฏที่นี่เมื่อพร้อม",
  "evaluated": "สารอาหารในฐานข้อมูล",
  "setAside": "รายการที่ไม่ได้เลือก",
  "chosen": "รายการที่คัดเบื้องต้นให้คุณ",
  "midTitle": "เข้าใจตัวเองแล้ว พร้อมก้าวต่อไป",
  "midSub": "ปลดล็อกแผนอาหารเสริมเฉพาะคุณ พร้อมปริมาณและช่วงเวลาที่แนะนำ",
  "insideEye": "สิ่งที่คุณได้รับในราคา ฿690",
  "insideTitle": "เปลี่ยนผลประเมิน\nเป็นแผนที่นำไปใช้ได้",
  "insideBody": "HealthScore ช่วยให้เห็นภาพรวมจากคำตอบของคุณ ส่วนสูตรปริมาณที่พอดีให้คำแนะนำอาหารเสริมอย่างชัดเจน เพื่อให้คุณรู้ว่าจะเริ่มอย่างไร",
  "insideNote": "รวมไว้ในที่เดียว ทั้งสิ่งที่ควรเสริม ปริมาณ ช่วงเวลา และเหตุผลที่เลือกให้คุณ",
  "docLabel": "สิ่งที่อยู่ในแผนของคุณ",
  "docTitle": "สูตรปริมาณที่พอดี",
  "contents": [
    [
      "ควรเสริมอะไร",
      "สารอาหารและผลิตภัณฑ์อาหารเสริมที่คัดเลือกให้คุณ"
    ],
    [
      "ควรรับประทานเท่าไร",
      "ปริมาณต่อวันที่แนะนำ โดยพิจารณาข้อมูลเฉพาะคุณ"
    ],
    [
      "รับประทานเมื่อไรและอย่างไร",
      "ช่วงเวลาและวิธีใช้ที่รวบรวมไว้ในที่เดียว"
    ],
    [
      "ทำไมจึงเหมาะกับคุณ",
      "เหตุผลของคำแนะนำ พร้อมข้อควรระวังที่เกี่ยวข้อง"
    ]
  ],
  "reportTitle": "ดู HealthScore แบบละเอียด",
  "reportSub": "ดูภาพรวมทั้งห้าด้าน และความเชื่อมโยงกับเป้าหมายของคุณ",
  "goalLinked": "เกี่ยวข้องกับเป้าหมายของคุณ",
  "reportMethodTitle": "เข้าใจความหมายของคะแนน",
  "reportMethod": "คะแนนนี้เป็นข้อมูลเพื่อการดูแลสุขภาพจากแบบประเมินห้าด้าน โดยอ้างอิงคำตอบที่คุณให้ ไม่ใช่การวินิจฉัยโรคหรือการตรวจภาวะขาดสารอาหาร การซื้อหรือรับประทานอาหารเสริมไม่ได้รับประกันว่าคะแนนจะสูงขึ้น",
  "strengthPrefix": "จุดแข็งที่ควรรักษาไว้",
  "trust": [
    [
      "ก่อตั้งโดยแพทย์",
      "พัฒนาโดยทีมด้านการแพทย์ วิทยาศาสตร์ และเทคโนโลยี"
    ],
    [
      "การศึกษาและการฝึกอบรมของผู้ก่อตั้ง",
      "มหิดล · Princeton · Stanford · Harvard"
    ],
    [
      "เครือข่ายร้านยาที่ผ่านการคัดเลือก",
      "อาหารเสริมคุณภาพ จัดเตรียมผ่านร้านยาในเครือข่าย MattaNutra"
    ]
  ],
  "journeyEye": "จากความเข้าใจ สู่การดูแลถึงบ้าน",
  "journeyTitle": "เริ่มต้นอย่างชัดเจน\nพร้อมจัดส่งถึงบ้าน",
  "journey": [
    [
      "รับแผนเฉพาะคุณ",
      "ชำระ ฿690 ครั้งเดียว เพื่อดูรายการอาหารเสริม ปริมาณ และช่วงเวลาที่แนะนำสำหรับคุณ"
    ],
    [
      "ตรวจสอบรายการอาหารเสริม",
      "ดูผลิตภัณฑ์ที่คัดเลือกให้พร้อมราคา แล้วจึงตัดสินใจว่าจะสั่งซื้อหรือไม่"
    ],
    [
      "รับอาหารเสริมที่บ้าน",
      "ร้านยาที่ผ่านการคัดเลือกของ MattaNutra จัดเตรียมอาหารเสริมเพื่อจัดส่งถึงบ้านคุณ"
    ]
  ],
  "faqEye": "ก่อนตัดสินใจ",
  "faqTitle": "คำถามที่คุณ\nอาจกำลังสงสัย",
  "faqs": [
    [
      "฿690 รวมค่าอาหารเสริมหรือไม่?",
      "ไม่รวม ฿690 เป็นค่าจัดทำสูตรปริมาณที่พอดีเฉพาะคุณ ผลิตภัณฑ์อาหารเสริมซื้อแยกต่างหาก และคุณจะเห็นราคาก่อนยืนยันคำสั่งซื้ออาหารเสริม"
    ],
    [
      "มีค่าสมาชิกหรือเรียกเก็บซ้ำหรือไม่?",
      "ไม่มี เป็นการชำระ ฿690 ครั้งเดียวสำหรับแผนของคุณ ไม่มีค่าบริการแผนแบบต่ออายุอัตโนมัติ"
    ],
    [
      "ถ้าแผนไม่ชัดเจนหรือไม่เป็นประโยชน์ล่ะ?",
      "เรารับประกันความชัดเจนของแผน 7 วัน หากคุณรู้สึกว่าแผนไม่ชัดเจนหรือไม่เป็นประโยชน์ แจ้งเราภายใน 7 วันหลังชำระเงิน เราจะช่วยแก้ไขให้เหมาะสม หรือคืนเงินค่าแผนให้คุณ"
    ],
    [
      "ใครเป็นผู้จัดส่งอาหารเสริม?",
      "ร้านยาที่ผ่านการคัดเลือกของ MattaNutra เป็นผู้จัดเตรียมอาหารเสริม และจัดส่งถึงบ้านคุณ"
    ]
  ],
  "guaranteeTitle": "แผนของคุณต้องเข้าใจง่ายและใช้ได้จริง",
  "guaranteeBody": "หากแผนไม่ชัดเจนหรือไม่เป็นประโยชน์ แจ้งเราภายใน 7 วัน เราจะช่วยแก้ไขให้เหมาะสม หรือคืนเงินค่าแผน ฿690 ให้คุณ",
  "closeEye": "ก้าวต่อไปของคุณ",
  "closeTitle": "เลิกเดา เริ่มรู้จริง\nด้วยแผนเฉพาะคุณ",
  "closeBody": "อาหารเสริมที่เลือกให้คุณ ปริมาณและช่วงเวลาที่เหมาะกับคุณ",
  "back": "กลับไปดู HealthScore",
  "opening": "กำลังเปิดหน้าชำระเงิน…",
  "checkoutError": "ไม่สามารถเปิดหน้าชำระเงินได้ กรุณาลองอีกครั้ง",
  "unavailableTitle": "ผลประเมินของคุณยังไม่พร้อม",
  "unavailableBody": "กรุณากลับไปที่แบบประเมิน หรือลองใหม่อีกครั้งในภายหลัง",
  "missingTranslation": "ผลประเมินนี้ยังไม่มีในภาษาที่เลือก",
  "bands": {
    "Needs attention": "ควรใส่ใจเพิ่มเติม",
    "Building foundation": "กำลังสร้างพื้นฐาน",
    "Good, with a clear gap": "พื้นฐานดี มีจุดที่ควรใส่ใจ",
    "Strong, with headroom": "พื้นฐานดี ยังพัฒนาได้",
    "Excellent": "ดีมาก"
  },
  "pillars": {
    "Health Habits": "พฤติกรรมสุขภาพ",
    "Sleep & Recovery": "การนอนและการฟื้นตัว",
    "Nutrition & Diet": "โภชนาการและอาหาร",
    "Activity & Fitness": "กิจกรรมและความแข็งแรง",
    "Stress & Balance": "ความเครียดและสมดุลชีวิต"
  },
  "heroTrust": "ก่อตั้งโดยแพทย์",
  "heroEducation": "การศึกษาและการฝึกอบรมของผู้ก่อตั้ง",
  "paymentPromptPay": "พร้อมเพย์",
  "paymentCards": "บัตรเครดิต",
  "paymentLabel": "ช่องทางชำระเงินที่รองรับ",
  "planPayment": "ค่าแผน ชำระครั้งเดียว"
};

const chineseCopy: HealthScoreV8Copy = {
  sampleEye: "示例演示 · 18 秒",
  sampleTitle: "了解您的个性化补充剂方案可能是什么样。",
  sampleSub: "此示例使用虚构资料，仅供说明。您的营养成分、用量和匹配产品将根据您的个人情况制定。",
  sampleVideoLabel: "个性化方案示例：从 160 多种营养成分中筛选，展示配方用量和匹配的补充剂产品。",
  sampleNote: "图中产品仅供示例。฿690 是方案费用；补充剂需另行购买。",
  samplePlay: "播放示例",
  samplePause: "暂停",
  sampleReplay: "重新播放",
  sampleFallback: "您的浏览器无法播放此视频。此示例展示从 160 多种营养成分中筛选的方案、用量和匹配产品。",
  samplePosterAlt: "个性化补充剂方案与匹配产品的示例。",
  matched: "按您的资料匹配",
  title: "您的 HealthScore · MattaNutra",
  boxAlt: "MattaNutra 补充剂配送盒示例，内含匹配产品、感谢卡和 MattaNutra 标志。",
  boxCaption: "MattaNutra 配送示例，由我们的合作药房网络准备。您的产品将以个人订单为准。",
  steps: ["问卷", "HealthScore", "您的方案"],
  complete: "您的评估已完成",
  heading: "{name}，从您的回答出发，制定适合您的方案。",
  headingNoName: "从您的回答出发，制定适合您的方案。",
  goals: "您的目标：",
  scoreLabel: "您的 HealthScore",
  scoreBasis: "根据您的问卷回答生成。这是健康参考指标，并非诊断。",
  bandLow: "正在建立基础",
  bandHigh: "基础良好，仍有提升空间",
  scoreLow: "您的回答显示了值得关注的方面，也指出了值得保持的习惯。",
  scoreHigh: "您的回答显示您已有良好基础，同时还有一些值得进一步关注的方面。",
  insightLabel: "影响您方案的一项回答",
  product: "您的精准适量配方",
  offerTitle: "了解该补充什么，\n以及补充多少。",
  offerSub: "为您制定补充剂清单、用量和服用时间，方便实际执行。",
  offerItems: ["筛选的补充剂与匹配产品", "用量、服用时间及每项选择的理由"],
  once: "一次性付款",
  noSub: "无需订阅",
  cta: "解锁我的方案 · ฿690",
  ctaShort: "解锁我的方案",
  separate: "补充剂需另行购买",
  stripe: "通过 Stripe 安全付款",
  guaranteeLink: "7 天方案清晰保障",
  physician: "由医生创立",
  readMore: "看看您的回答揭示了什么 ↓",
  proofEyebrow: "专属于您",
  proofTitle: "将您的回答\n联系起来。",
  proofSub: "我们综合考虑您的目标、日常习惯和健康史，评估适合您的补充剂。",
  selectionTitle: "为您初步筛选。",
  selectionBody: "您的评估帮助筛选适合您的营养成分。解锁方案，即可查看建议用量和匹配产品。",
  formulaPreparingTitle: "您的专属配方正在准备中。",
  formulaPreparingBody: "在您查看 HealthScore 时，我们正在准备您的专属配方。您现在即可解锁方案；筛选出的营养成分将在准备就绪后显示在这里。",
  evaluated: "成分库中的营养成分",
  setAside: "未选入",
  chosen: "为您初步筛选",
  midTitle: "您已了解评估结果。迈出下一步。",
  midSub: "解锁您的个性化补充剂方案，包括用量和服用时间。",
  insideEye: "฿690 为您带来什么",
  insideTitle: "将您的评估\n变为实用方案。",
  insideBody: "HealthScore 帮助您理解回答中的整体规律。精准适量配方则提供具体的补充剂建议，帮助您采取下一步行动。",
  insideNote: "在一个地方看清：补充什么、多少、何时服用，以及为什么适合您。",
  docLabel: "您的方案包含",
  docTitle: "精准适量配方",
  contents: [
    ["补充什么", "筛选出的营养成分与匹配的补充剂产品。"],
    ["补充多少", "根据您的个人资料建议每日用量。"],
    ["何时及如何服用", "集中展示服用时间与使用说明。"],
    ["为什么适合您", "说明推荐理由及相关注意事项。"],
  ],
  reportTitle: "详细了解您的 HealthScore",
  reportSub: "查看五个健康维度的整体规律，以及它们与您的目标的联系。",
  goalLinked: "与您的目标相关",
  reportMethodTitle: "如何理解这个分数",
  reportMethod: "这是基于五个维度问卷的健康参考指标，反映您提供的回答。它不用于诊断疾病或检测营养缺乏。购买或服用补充剂并不保证提高分数。",
  strengthPrefix: "值得保持的优势",
  trust: [
    ["由医生创立", "由医学、科学和技术领域的团队共同打造。"],
    ["创始人的教育与培训经历", "玛希隆大学 · 普林斯顿大学 · 斯坦福大学 · 哈佛大学"],
    ["经过审核的合作药房", "通过 MattaNutra 药房网络准备优质补充剂。"],
  ],
  journeyEye: "从了解需求到送货上门",
  journeyTitle: "清楚迈出下一步，\n随后配送到家。",
  journey: [
    ["解锁您的方案", "一次性支付 ฿690，查看为您制定的补充剂建议、用量和服用时间。"],
    ["查看您的补充剂", "查看匹配产品及价格，再决定是否下单。"],
    ["在家收货", "MattaNutra 经过审核的合作药房准备您的补充剂并配送到家。"],
  ],
  faqEye: "决定之前",
  faqTitle: "您可能\n还想了解这些。",
  faqs: [
    ["฿690 包含补充剂吗？", "不包含。฿690 是个性化精准适量配方的费用。补充剂产品需另行购买，您将在确认补充剂订单前看到价格。"],
    ["这是订阅服务吗？", "不是。这是方案的一次性 ฿690 付款，不会自动续费。"],
    ["如果方案不够清楚或实用怎么办？", "您的方案享有 7 天清晰保障：如果您觉得方案不够清楚或实用，请在购买后 7 天内告诉我们。我们会帮助解决问题，或退还方案费用。"],
    ["谁提供我的补充剂？", "您的订单由 MattaNutra 经过审核的合作药房准备，并配送到家。"],
  ],
  guaranteeTitle: "让您清楚了解，始终是第一位。",
  guaranteeBody: "如果您觉得方案不够清楚或实用，请在 7 天内告诉我们。我们会帮助解决问题，或退还您的 ฿690 方案费用。",
  closeEye: "您的下一步",
  closeTitle: "少一点猜测，\n多一份专属方案。",
  closeBody: "为您筛选的补充剂、适合您的用量与服用时间。",
  back: "返回我的 HealthScore",
  opening: "正在打开安全付款页面…",
  checkoutError: "暂时无法打开付款页面，请重试。",
  unavailableTitle: "您的结果尚未准备好。",
  unavailableBody: "请返回评估，或稍后重试。",
  missingTranslation: "此评估暂时没有所选语言的版本。",
  bands: {
    "Needs attention": "需要关注",
    "Building foundation": "正在建立基础",
    "Good, with a clear gap": "基础良好，有明确的改进空间",
    "Strong, with headroom": "基础良好，仍有提升空间",
    Excellent: "优秀",
  },
  pillars: {
    "Health Habits": "健康习惯",
    "Sleep & Recovery": "睡眠与恢复",
    "Nutrition & Diet": "营养与饮食",
    "Activity & Fitness": "活动与体能",
    "Stress & Balance": "压力与平衡",
  },
  heroTrust: "由医生创立",
  heroEducation: "创始人的教育与培训经历",
  paymentPromptPay: "PromptPay",
  paymentCards: "信用卡",
  paymentLabel: "支持的付款方式",
  planPayment: "一次性方案付款",
};

export const healthScoreV8Copy: Record<Locale, HealthScoreV8Copy> = {
  en: englishCopy,
  th: thaiCopy,
  "zh-CN": chineseCopy,
};
