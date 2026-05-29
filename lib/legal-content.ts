import type { Locale } from "@/lib/i18n";

type LegalSection = Readonly<{
  bullets?: readonly string[];
  paragraphs?: readonly string[];
  title: string;
}>;

export type LegalContent = Readonly<{
  eyebrow: string;
  intro: string;
  lastUpdated: string;
  sections: readonly LegalSection[];
  title: string;
  updatedLabel: string;
}>;

type LegalDoc = "privacy" | "terms";

const enLastUpdated = "5 May 2026";
const thLastUpdated = "5 พฤษภาคม 2026";

const enTerms: LegalContent = {
  eyebrow: "Legal",
  intro:
    "These Terms govern your use of MattaNutra, a Thailand-based wellness service. Please read them carefully before using the assessment, formulation brief, product search, or AI support features.",
  lastUpdated: enLastUpdated,
  title: "Terms of Service",
  updatedLabel: "Last updated",
  sections: [
    {
      title: "1. Acceptance of these Terms",
      paragraphs: [
        "By accessing or using MattaNutra, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the service.",
        "We may update these Terms from time to time. The updated version applies from the date it is posted unless a later effective date is stated.",
        "If you access the service from outside Thailand, you are responsible for ensuring that your use is lawful where you are located."
      ]
    },
    {
      title: "2. Wellness information only",
      paragraphs: [
        "MattaNutra is a Thailand-based wellness company. Our assessment, AI-generated formulation brief, marketplace search guide, chat support, and other content are provided for general wellness and informational purposes only.",
        "We do not provide medical advice, diagnosis, treatment, prevention, or cure. Nothing on the service creates a doctor-patient, pharmacist-patient, dietitian-client, or other healthcare professional relationship.",
        "You should speak with a qualified healthcare professional before starting, stopping, or changing any supplement, medication, diet, exercise, sleep, or health routine, especially if you are pregnant, nursing, have a medical condition, have abnormal lab results, or use prescription or over-the-counter medication."
      ]
    },
    {
      title: "3. Emergencies and medical concerns",
      paragraphs: [
        "Do not use MattaNutra for urgent or emergency medical issues. If you believe you may have a medical emergency, contact local emergency services or a qualified healthcare professional immediately."
      ]
    },
    {
      title: "4. Your information and responsibilities",
      bullets: [
        "You are responsible for providing accurate, current, and complete information.",
        "You are responsible for deciding whether to follow any wellness information or purchase any product.",
        "You must not use the service for unlawful, unsafe, misleading, abusive, or commercial scraping purposes.",
        "You must not submit information about another person unless you have permission to do so."
      ]
    },
    {
      title: "5. AI outputs and formulation briefs",
      paragraphs: [
        "Our service may use automated systems and AI to generate wellness information. AI outputs can be incomplete, inaccurate, or unsuitable for your circumstances. You should independently review all information and consult a qualified professional before relying on it.",
        "A formulation brief is not a prescription, medical protocol, clinical nutrition plan, or guarantee of any health outcome."
      ]
    },
    {
      title: "6. Supplements, products, and third-party marketplaces",
      paragraphs: [
        "Product recommendations and marketplace links are search and convenience tools. We do not manufacture, sell, dispense, or control third-party products, prices, availability, shipping, labeling, quality, safety, or legality.",
        "Always read product labels, allergen warnings, ingredient lists, directions, and contraindications. Product information can change without notice."
      ]
    },
    {
      title: "7. Payments and plans",
      paragraphs: [
        "If paid plans are offered, prices, plan features, renewal terms, and any refund terms will be shown at checkout or in the relevant purchase flow. We may change plan names, features, or prices at any time for future purchases."
      ]
    },
    {
      title: "8. Intellectual property",
      paragraphs: [
        "The service, branding, design, text, software, and generated presentation of the service are owned by MattaNutra or its licensors. You may use the service for personal, non-commercial wellness purposes only unless we agree otherwise in writing."
      ]
    },
    {
      title: "9. No warranties",
      paragraphs: [
        "The service is provided as is and as available. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including warranties of accuracy, fitness for a particular purpose, merchantability, non-infringement, availability, and suitability for your health, body, goals, or circumstances."
      ]
    },
    {
      title: "10. Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by applicable law, including Thai law, MattaNutra and its owners, directors, employees, contractors, affiliates, suppliers, and partners will not be liable for any indirect, incidental, special, consequential, exemplary, punitive, or similar damages, or for loss of profits, revenue, data, goodwill, health outcomes, product purchases, or reliance on the service.",
        "To the maximum extent permitted by applicable law, including Thai law, we are not liable for adverse reactions, interactions, injuries, losses, decisions, purchases, or outcomes arising from supplements, products, third-party services, AI outputs, marketplace links, or your use of or reliance on wellness information.",
        "To the maximum extent permitted by applicable law, including Thai law, our total aggregate liability for all claims relating to the service will not exceed the greater of the amount you paid us for the service in the three months before the claim or THB 1,000."
      ]
    },
    {
      title: "11. Indemnity",
      paragraphs: [
        "You agree to indemnify and hold MattaNutra harmless from claims, losses, liabilities, damages, costs, and expenses arising from your misuse of the service, your breach of these Terms, your submitted information, or your violation of law or third-party rights."
      ]
    },
    {
      title: "12. Suspension or termination",
      paragraphs: [
        "We may suspend, restrict, or terminate access to the service at any time if we reasonably believe you have breached these Terms, created risk, or used the service in a harmful or unlawful way."
      ]
    },
    {
      title: "13. Governing law",
      paragraphs: [
        "Unless mandatory consumer protection rules require otherwise, these Terms are governed by the laws of Thailand, and disputes may be brought before the competent courts of Thailand."
      ]
    },
    {
      title: "14. Contact",
      paragraphs: [
        "Questions about these Terms can be sent to MattaNutra in Thailand at support@mattanutra.com."
      ]
    }
  ]
};

const enPrivacy: LegalContent = {
  eyebrow: "Legal",
  intro:
    "This Privacy Policy explains how MattaNutra, a Thailand-based wellness service, collects, uses, shares, stores, and protects information when you use our wellness assessment, formulation brief, product search, and AI support features.",
  lastUpdated: enLastUpdated,
  title: "Privacy Policy",
  updatedLabel: "Last updated",
  sections: [
    {
      title: "1. Who we are",
      paragraphs: [
        "MattaNutra provides wellness information and supplement formulation support from Thailand. We are not a medical provider and we do not maintain medical records.",
        "The assessment can be used without giving us your home address, phone number, or direct contact details. You may choose to provide a first name so the experience can address you more naturally. If you request a free email example or contact support, you may also choose to provide an email address or chat handle for that limited purpose.",
        "Where Thailand's Personal Data Protection Act B.E. 2562 (2019), as amended, applies, MattaNutra acts as a personal data controller for the personal data we collect and decide how to use."
      ]
    },
    {
      title: "2. Information we collect",
      bullets: [
        "Optional first name if you choose to provide it. It is used for in-product personalization and stored with your assessment plan ID.",
        "Email address if you choose to request a free example by email. This is optional and is not required to complete the assessment.",
        "Assessment answers, such as age range, sex, height, weight, skin tone, country, goals, symptoms, sleep, activity, diet, sun exposure, alcohol, caffeine, medication categories, supplement use, budget, preferences, and optional notes.",
        "Optional precision information, such as family history, stress, gut health, wearable data, VO2 max estimates, HRV, and lab values you choose to enter.",
        "Plan and transaction information, such as selected plan, plan ID, status, and payment status. Payment card or banking details are handled by payment providers and are not intended to be stored by us.",
        "Support and chat information, such as messages, chat app identifiers, and your plan ID if you connect with our AI support through LINE, WhatsApp, Telegram, or similar services.",
        "Technical information, such as IP address, browser, device type, pages viewed, approximate location derived from network data, logs, cookies, and similar diagnostics."
      ]
    },
    {
      title: "3. Sensitive wellness information",
      paragraphs: [
        "Some information you provide may reveal health or wellness-related details and may be treated as sensitive personal data under Thailand's PDPA or other applicable privacy laws. By submitting it, you ask us to process it so we can provide the assessment, formulation brief, product matching, and support features.",
        "Where explicit consent is required for sensitive personal data, we rely on your voluntary submission and consent. Do not submit information you do not want us to process."
      ]
    },
    {
      title: "4. How we use information",
      bullets: [
        "To provide the assessment, generate your formulation brief, show plan status, display product search guidance, and render or send any free example you request.",
        "To provide support, AI chat continuity, plan retrieval, and account or purchase assistance.",
        "To process payments, manage plans, prevent fraud, secure the service, debug errors, and maintain logs.",
        "To improve our service, models, content, user experience, and product matching logic.",
        "To comply with legal obligations, enforce our Terms, and protect users, MattaNutra, and third parties."
      ]
    },
    {
      title: "5. Legal bases",
      paragraphs: [
        "Where applicable, including under Thailand's PDPA, we process personal data based on consent, explicit consent for sensitive personal data where required, performance of a contract or requested service, legitimate interests such as service improvement and security, and compliance with legal obligations."
      ]
    },
    {
      title: "6. How we share information",
      paragraphs: [
        "We do not sell your personal information. We may share information with service providers that help us host the site, process assessments, provide AI functionality, process payments, manage chat support, analyze usage, send communications, and secure the service.",
        "Although the MattaNutra assessment is linked primarily to a plan ID, payment providers, chat apps, marketplaces, and technical systems may process their own account identifiers, transaction identifiers, IP addresses, device details, or chat handles under their own terms and privacy policies. We may also disclose information if required by law, to protect rights and safety, or as part of a business transfer."
      ]
    },
    {
      title: "7. International transfers",
      paragraphs: [
        "Our service providers may process information in countries other than Thailand or the country where you live. When we transfer information internationally, we use reasonable measures designed to protect it as required by applicable law, including Thailand's PDPA where applicable."
      ]
    },
    {
      title: "8. Retention",
      paragraphs: [
        "We keep information for as long as needed to provide the service, support your plan, meet legal and accounting needs, resolve disputes, improve safety, and maintain backups. We may anonymize or aggregate information so it no longer identifies you."
      ]
    },
    {
      title: "9. Security",
      paragraphs: [
        "We use reasonable technical and organizational safeguards, but no internet service can be guaranteed to be fully secure. You are responsible for keeping any account, device, and chat access secure."
      ]
    },
    {
      title: "10. Your choices and rights",
      paragraphs: [
        "Depending on your location and the law that applies, including Thailand's PDPA, you may have rights to access, correct, delete, restrict, object to, or receive a copy of your personal data, withdraw consent, and complain to a data protection authority such as Thailand's Office of the Personal Data Protection Committee. To request help, contact us at support@mattanutra.com."
      ]
    },
    {
      title: "11. Cookies and analytics",
      paragraphs: [
        "We may use cookies, local storage, logs, and similar technologies to operate the site, remember preferences, understand usage, and improve performance. You can control some cookies through your browser settings."
      ]
    },
    {
      title: "12. Children",
      paragraphs: [
        "The service is intended for adults. If you are under 20 in Thailand, or under the age of majority where you live, use the service only with involvement from a parent or legal guardian and only where lawful."
      ]
    },
    {
      title: "13. Changes",
      paragraphs: [
        "We may update this Privacy Policy from time to time. The updated version applies from the date it is posted unless a later effective date is stated."
      ]
    },
    {
      title: "14. Contact",
      paragraphs: [
        "Privacy questions and data rights requests can be sent to MattaNutra in Thailand at support@mattanutra.com."
      ]
    }
  ]
};

const thTerms: LegalContent = {
  eyebrow: "ข้อมูลทางกฎหมาย",
  intro:
    "ข้อกำหนดนี้ใช้กับการใช้งาน MattaNutra ซึ่งเป็นบริการด้านสุขภาวะที่ตั้งอยู่ในประเทศไทย โปรดอ่านก่อนใช้แบบประเมิน บรีฟสูตรอาหารเสริม การค้นหาผลิตภัณฑ์ หรือการสนับสนุนด้วย AI",
  lastUpdated: thLastUpdated,
  title: "เงื่อนไขการให้บริการ",
  updatedLabel: "ปรับปรุงล่าสุด",
  sections: [
    {
      title: "1. การยอมรับเงื่อนไข",
      paragraphs: [
        "เมื่อเข้าถึงหรือใช้งาน MattaNutra คุณตกลงตามเงื่อนไขนี้และนโยบายความเป็นส่วนตัวของเรา หากคุณไม่ตกลง โปรดหยุดใช้งานบริการ",
        "เราอาจปรับปรุงเงื่อนไขนี้เป็นครั้งคราว โดยฉบับที่ปรับปรุงจะมีผลตั้งแต่วันที่เผยแพร่ เว้นแต่จะระบุวันมีผลภายหลัง",
        "หากคุณเข้าถึงบริการจากนอกประเทศไทย คุณมีหน้าที่ตรวจสอบว่าการใช้งานของคุณถูกต้องตามกฎหมายในพื้นที่ที่คุณอยู่"
      ]
    },
    {
      title: "2. ข้อมูลเพื่อสุขภาวะเท่านั้น",
      paragraphs: [
        "MattaNutra เป็นบริษัทด้านสุขภาวะที่ตั้งอยู่ในประเทศไทย แบบประเมิน บรีฟสูตรที่สร้างด้วย AI คู่มือค้นหาผลิตภัณฑ์ การสนับสนุนผ่านแชท และเนื้อหาอื่นๆ จัดทำเพื่อข้อมูลทั่วไปด้านสุขภาวะเท่านั้น",
        "เราไม่ได้ให้คำแนะนำทางการแพทย์ การวินิจฉัย การรักษา การป้องกัน หรือการรักษาโรคใดๆ การใช้งานบริการไม่ทำให้เกิดความสัมพันธ์แบบแพทย์กับผู้ป่วย เภสัชกรกับผู้ป่วย นักกำหนดอาหารกับลูกค้า หรือความสัมพันธ์ด้านวิชาชีพสุขภาพอื่นใด",
        "คุณควรปรึกษาผู้เชี่ยวชาญด้านสุขภาพที่มีคุณสมบัติเหมาะสมก่อนเริ่ม หยุด หรือเปลี่ยนอาหารเสริม ยา อาหาร การออกกำลังกาย การนอน หรือกิจวัตรด้านสุขภาพ โดยเฉพาะหากตั้งครรภ์ ให้นมบุตร มีโรคประจำตัว มีผลแล็บผิดปกติ หรือใช้ยาตามใบสั่งแพทย์หรือยาที่ซื้อเอง"
      ]
    },
    {
      title: "3. เหตุฉุกเฉินและข้อกังวลทางการแพทย์",
      paragraphs: [
        "ห้ามใช้ MattaNutra สำหรับปัญหาทางการแพทย์เร่งด่วนหรือฉุกเฉิน หากคุณคิดว่าอาจมีเหตุฉุกเฉินทางการแพทย์ โปรดติดต่อบริการฉุกเฉินในพื้นที่หรือผู้เชี่ยวชาญด้านสุขภาพทันที"
      ]
    },
    {
      title: "4. ข้อมูลและความรับผิดชอบของคุณ",
      bullets: [
        "คุณมีหน้าที่ให้ข้อมูลที่ถูกต้อง เป็นปัจจุบัน และครบถ้วน",
        "คุณมีหน้าที่ตัดสินใจเองว่าจะปฏิบัติตามข้อมูลด้านสุขภาวะหรือซื้อผลิตภัณฑ์ใดหรือไม่",
        "คุณต้องไม่ใช้บริการเพื่อวัตถุประสงค์ที่ผิดกฎหมาย ไม่ปลอดภัย ทำให้เข้าใจผิด ละเมิดผู้อื่น หรือดึงข้อมูลเชิงพาณิชย์โดยไม่ได้รับอนุญาต",
        "คุณต้องไม่ส่งข้อมูลของบุคคลอื่น เว้นแต่ได้รับอนุญาต"
      ]
    },
    {
      title: "5. ผลลัพธ์จาก AI และบรีฟสูตร",
      paragraphs: [
        "บริการของเราอาจใช้ระบบอัตโนมัติและ AI เพื่อสร้างข้อมูลด้านสุขภาวะ ผลลัพธ์จาก AI อาจไม่ครบถ้วน ไม่ถูกต้อง หรือไม่เหมาะกับสถานการณ์ของคุณ คุณควรตรวจสอบข้อมูลด้วยตนเองและปรึกษาผู้เชี่ยวชาญที่มีคุณสมบัติก่อนนำไปใช้",
        "บรีฟสูตรไม่ใช่ใบสั่งยา ไม่ใช่โปรโตคอลทางการแพทย์ ไม่ใช่แผนโภชนาการทางคลินิก และไม่รับประกันผลลัพธ์ด้านสุขภาพใดๆ"
      ]
    },
    {
      title: "6. อาหารเสริม ผลิตภัณฑ์ และตลาดออนไลน์ภายนอก",
      paragraphs: [
        "คำแนะนำผลิตภัณฑ์และลิงก์ตลาดออนไลน์เป็นเครื่องมือค้นหาและอำนวยความสะดวก เราไม่ได้ผลิต จำหน่าย จ่ายยา หรือควบคุมผลิตภัณฑ์ ราคา สต็อก การจัดส่ง ฉลาก คุณภาพ ความปลอดภัย หรือความถูกต้องตามกฎหมายของบุคคลภายนอก",
        "โปรดอ่านฉลากผลิตภัณฑ์ คำเตือนสารก่อภูมิแพ้ รายการส่วนผสม วิธีใช้ และข้อห้ามใช้ทุกครั้ง ข้อมูลผลิตภัณฑ์อาจเปลี่ยนแปลงได้โดยไม่แจ้งล่วงหน้า"
      ]
    },
    {
      title: "7. การชำระเงินและแผนบริการ",
      paragraphs: [
        "หากมีแผนชำระเงิน ราคา คุณสมบัติของแผน เงื่อนไขการต่ออายุ และเงื่อนไขการคืนเงินจะแสดงในขั้นตอนชำระเงินหรือขั้นตอนซื้อที่เกี่ยวข้อง เราอาจเปลี่ยนชื่อแผน คุณสมบัติ หรือราคาสำหรับการซื้อในอนาคตได้"
      ]
    },
    {
      title: "8. ทรัพย์สินทางปัญญา",
      paragraphs: [
        "บริการ แบรนด์ ดีไซน์ ข้อความ ซอฟต์แวร์ และรูปแบบการนำเสนอของบริการเป็นของ MattaNutra หรือผู้อนุญาต คุณใช้บริการได้เพื่อสุขภาวะส่วนบุคคลและไม่ใช่เชิงพาณิชย์เท่านั้น เว้นแต่เราอนุญาตเป็นลายลักษณ์อักษร"
      ]
    },
    {
      title: "9. ไม่มีการรับประกัน",
      paragraphs: [
        "บริการจัดให้ตามสภาพที่เป็นและตามที่มีให้บริการ ภายใต้ขอบเขตสูงสุดที่กฎหมายอนุญาต เราปฏิเสธการรับประกันทั้งหมด ไม่ว่าโดยชัดแจ้งหรือโดยนัย รวมถึงความถูกต้อง ความเหมาะสมต่อวัตถุประสงค์เฉพาะ ความสามารถในการขาย การไม่ละเมิดสิทธิ ความพร้อมใช้งาน และความเหมาะสมต่อสุขภาพ ร่างกาย เป้าหมาย หรือสถานการณ์ของคุณ"
      ]
    },
    {
      title: "10. การจำกัดความรับผิด",
      paragraphs: [
        "ภายใต้ขอบเขตสูงสุดที่กฎหมายที่ใช้บังคับอนุญาต รวมถึงกฎหมายไทย MattaNutra รวมถึงเจ้าของ กรรมการ พนักงาน ผู้รับจ้าง บริษัทในเครือ ผู้จัดหา และพันธมิตร จะไม่รับผิดชอบต่อความเสียหายทางอ้อม อุบัติเหตุ พิเศษ ต่อเนื่อง เป็นเยี่ยงอย่าง เชิงลงโทษ หรือความเสียหายในลักษณะคล้ายกัน รวมถึงการสูญเสียกำไร รายได้ ข้อมูล ชื่อเสียง ผลลัพธ์ด้านสุขภาพ การซื้อผลิตภัณฑ์ หรือการพึ่งพาบริการ",
        "ภายใต้ขอบเขตสูงสุดที่กฎหมายที่ใช้บังคับอนุญาต รวมถึงกฎหมายไทย เราไม่รับผิดชอบต่ออาการไม่พึงประสงค์ ปฏิกิริยาระหว่างสาร การบาดเจ็บ ความสูญเสีย การตัดสินใจ การซื้อ หรือผลลัพธ์ที่เกิดจากอาหารเสริม ผลิตภัณฑ์ บริการภายนอก ผลลัพธ์จาก AI ลิงก์ตลาดออนไลน์ หรือการใช้หรือพึ่งพาข้อมูลด้านสุขภาวะของคุณ",
        "ภายใต้ขอบเขตสูงสุดที่กฎหมายที่ใช้บังคับอนุญาต รวมถึงกฎหมายไทย ความรับผิดรวมทั้งหมดของเราสำหรับข้อเรียกร้องใดๆ ที่เกี่ยวข้องกับบริการจะไม่เกินจำนวนที่มากกว่าระหว่างเงินที่คุณชำระให้เราในช่วงสามเดือนก่อนเกิดข้อเรียกร้อง หรือ 1,000 บาท"
      ]
    },
    {
      title: "11. การชดใช้ความเสียหาย",
      paragraphs: [
        "คุณตกลงที่จะชดใช้และปกป้อง MattaNutra จากข้อเรียกร้อง ความสูญเสีย ความรับผิด ความเสียหาย ค่าใช้จ่าย และต้นทุนที่เกิดจากการใช้บริการในทางที่ผิด การละเมิดเงื่อนไขนี้ ข้อมูลที่คุณส่ง หรือการละเมิดกฎหมายหรือสิทธิของบุคคลภายนอก"
      ]
    },
    {
      title: "12. การระงับหรือยุติการใช้งาน",
      paragraphs: [
        "เราอาจระงับ จำกัด หรือยุติการเข้าถึงบริการได้ทุกเมื่อ หากเราเชื่อโดยสมเหตุสมผลว่าคุณละเมิดเงื่อนไขนี้ ก่อให้เกิดความเสี่ยง หรือใช้บริการในลักษณะที่เป็นอันตรายหรือผิดกฎหมาย"
      ]
    },
    {
      title: "13. กฎหมายที่ใช้บังคับ",
      paragraphs: [
        "เว้นแต่กฎหมายคุ้มครองผู้บริโภคที่บังคับใช้จะกำหนดเป็นอย่างอื่น เงื่อนไขนี้อยู่ภายใต้กฎหมายของประเทศไทย และข้อพิพาทอาจนำขึ้นสู่ศาลไทยที่มีเขตอำนาจ"
      ]
    },
    {
      title: "14. ติดต่อ",
      paragraphs: [
        "สอบถามเกี่ยวกับเงื่อนไขนี้ได้ที่ MattaNutra ในประเทศไทย ผ่าน support@mattanutra.com"
      ]
    }
  ]
};

const thPrivacy: LegalContent = {
  eyebrow: "ข้อมูลทางกฎหมาย",
  intro:
    "นโยบายความเป็นส่วนตัวนี้อธิบายว่า MattaNutra ซึ่งเป็นบริการด้านสุขภาวะที่ตั้งอยู่ในประเทศไทย เก็บรวบรวม ใช้ เปิดเผย จัดเก็บ และปกป้องข้อมูลอย่างไร เมื่อคุณใช้แบบประเมินสุขภาวะ บรีฟสูตรอาหารเสริม การค้นหาผลิตภัณฑ์ และฟีเจอร์สนับสนุนด้วย AI",
  lastUpdated: thLastUpdated,
  title: "นโยบายความเป็นส่วนตัว",
  updatedLabel: "ปรับปรุงล่าสุด",
  sections: [
    {
      title: "1. เราคือใคร",
      paragraphs: [
        "MattaNutra ให้ข้อมูลด้านสุขภาวะและสนับสนุนการสร้างสูตรอาหารเสริมจากประเทศไทย เราไม่ใช่ผู้ให้บริการทางการแพทย์ และเราไม่ได้จัดเก็บเวชระเบียน",
        "คุณสามารถใช้งานแบบประเมินได้โดยไม่ต้องให้ที่อยู่บ้าน หมายเลขโทรศัพท์ หรือข้อมูลติดต่อโดยตรง คุณอาจเลือกให้ชื่อเพื่อให้ประสบการณ์ในระบบเป็นส่วนตัวขึ้น หากคุณขอตัวอย่างฟรีทางอีเมลหรือติดต่อฝ่ายสนับสนุน คุณอาจเลือกให้อีเมลหรือชื่อบัญชีแชทเพื่อวัตถุประสงค์นั้นเท่านั้น",
        "ในกรณีที่พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และที่แก้ไขเพิ่มเติม (PDPA) ของประเทศไทยมีผลใช้บังคับ MattaNutra มีสถานะเป็นผู้ควบคุมข้อมูลส่วนบุคคลสำหรับข้อมูลส่วนบุคคลที่เราเก็บรวบรวมและกำหนดวัตถุประสงค์การใช้"
      ]
    },
    {
      title: "2. ข้อมูลที่เราเก็บรวบรวม",
      bullets: [
        "ชื่อที่คุณเลือกให้ ข้อมูลนี้ไม่บังคับ ใช้เพื่อปรับประสบการณ์ในระบบ และจัดเก็บร่วมกับรหัสแผนของแบบประเมิน",
        "อีเมล หากคุณเลือกขอตัวอย่างฟรีทางอีเมล ข้อมูลนี้เป็นทางเลือกและไม่จำเป็นสำหรับการทำแบบประเมิน",
        "คำตอบในแบบประเมิน เช่น ช่วงอายุ เพศ ส่วนสูง น้ำหนัก สีผิว ประเทศ เป้าหมาย อาการ การนอน กิจกรรม อาหาร แสงแดด แอลกอฮอล์ คาเฟอีน ประเภทยา การใช้อาหารเสริม งบประมาณ ความต้องการ และบันทึกเพิ่มเติมที่คุณเลือกกรอก",
        "ข้อมูลเพิ่มความแม่นยำที่ไม่บังคับ เช่น ประวัติครอบครัว ความเครียด สุขภาพลำไส้ ข้อมูลจากอุปกรณ์สวมใส่ ค่า VO2 max ค่า HRV และค่าแล็บที่คุณเลือกกรอก",
        "ข้อมูลแผนและธุรกรรม เช่น แผนที่เลือก รหัสแผน สถานะ และสถานะการชำระเงิน ข้อมูลบัตรหรือบัญชีธนาคารจะจัดการโดยผู้ให้บริการชำระเงิน และเราไม่ได้ตั้งใจจัดเก็บข้อมูลเหล่านั้น",
        "ข้อมูลสนับสนุนและแชท เช่น ข้อความ ตัวระบุบัญชีแอปแชท และรหัสแผน หากคุณเชื่อมต่อกับการสนับสนุนด้วย AI ผ่าน LINE, WhatsApp, Telegram หรือบริการคล้ายกัน",
        "ข้อมูลทางเทคนิค เช่น ที่อยู่ IP เบราว์เซอร์ ประเภทอุปกรณ์ หน้าเว็บที่ดู ตำแหน่งโดยประมาณจากข้อมูลเครือข่าย บันทึกระบบ คุกกี้ และข้อมูลวินิจฉัยที่คล้ายกัน"
      ]
    },
    {
      title: "3. ข้อมูลสุขภาวะที่อาจละเอียดอ่อน",
      paragraphs: [
        "ข้อมูลบางอย่างที่คุณให้เราอาจสะท้อนรายละเอียดด้านสุขภาพหรือสุขภาวะ และอาจถือเป็นข้อมูลส่วนบุคคลที่มีความละเอียดอ่อนตาม PDPA ของประเทศไทยหรือกฎหมายความเป็นส่วนตัวอื่นที่ใช้บังคับ เมื่อคุณส่งข้อมูลดังกล่าว คุณขอให้เราประมวลผลเพื่อให้บริการแบบประเมิน บรีฟสูตร การจับคู่ผลิตภัณฑ์ และฟีเจอร์สนับสนุน",
        "ในกรณีที่ต้องได้รับความยินยอมโดยชัดแจ้งสำหรับข้อมูลส่วนบุคคลที่มีความละเอียดอ่อน เราอาศัยการส่งข้อมูลโดยสมัครใจและความยินยอมของคุณ หากคุณไม่ต้องการให้เราประมวลผลข้อมูลใด โปรดอย่าส่งข้อมูลนั้น"
      ]
    },
    {
      title: "4. เราใช้ข้อมูลอย่างไร",
      bullets: [
        "เพื่อให้บริการแบบประเมิน สร้างบรีฟสูตร แสดงสถานะแผน แสดงคำแนะนำค้นหาผลิตภัณฑ์ และสร้างหรือส่งตัวอย่างฟรีที่คุณร้องขอ",
        "เพื่อให้การสนับสนุน ความต่อเนื่องของแชท AI การดึงข้อมูลแผน และความช่วยเหลือเกี่ยวกับบัญชีหรือการซื้อ",
        "เพื่อประมวลผลการชำระเงิน จัดการแผน ป้องกันการทุจริต รักษาความปลอดภัย แก้ไขข้อผิดพลาด และดูแลบันทึกระบบ",
        "เพื่อปรับปรุงบริการ โมเดล เนื้อหา ประสบการณ์ผู้ใช้ และตรรกะการจับคู่ผลิตภัณฑ์",
        "เพื่อปฏิบัติตามกฎหมาย บังคับใช้เงื่อนไข และปกป้องผู้ใช้ MattaNutra และบุคคลภายนอก"
      ]
    },
    {
      title: "5. ฐานทางกฎหมาย",
      paragraphs: [
        "ในกรณีที่กฎหมายกำหนด รวมถึง PDPA ของประเทศไทย เราประมวลผลข้อมูลส่วนบุคคลตามความยินยอม ความยินยอมโดยชัดแจ้งสำหรับข้อมูลส่วนบุคคลที่มีความละเอียดอ่อนเมื่อจำเป็น การปฏิบัติตามสัญญาหรือบริการที่คุณร้องขอ ประโยชน์โดยชอบด้วยกฎหมาย เช่น การปรับปรุงบริการและความปลอดภัย และการปฏิบัติตามหน้าที่ตามกฎหมาย"
      ]
    },
    {
      title: "6. การเปิดเผยข้อมูล",
      paragraphs: [
        "เราไม่ขายข้อมูลส่วนบุคคลของคุณ เราอาจเปิดเผยข้อมูลให้ผู้ให้บริการที่ช่วยเราโฮสต์เว็บไซต์ ประมวลผลแบบประเมิน ให้ฟังก์ชัน AI ประมวลผลการชำระเงิน จัดการแชทสนับสนุน วิเคราะห์การใช้งาน ส่งการสื่อสาร และรักษาความปลอดภัยของบริการ",
        "แม้แบบประเมินของ MattaNutra จะเชื่อมกับรหัสแผนเป็นหลัก ผู้ให้บริการชำระเงิน แอปแชท ตลาดออนไลน์ และระบบทางเทคนิคอาจประมวลผลตัวระบุบัญชี ตัวระบุธุรกรรม ที่อยู่ IP รายละเอียดอุปกรณ์ หรือชื่อบัญชีแชทของตนเองตามเงื่อนไขและนโยบายความเป็นส่วนตัวของบริการนั้นๆ เราอาจเปิดเผยข้อมูลหากกฎหมายกำหนด เพื่อปกป้องสิทธิและความปลอดภัย หรือเป็นส่วนหนึ่งของการโอนธุรกิจ"
      ]
    },
    {
      title: "7. การโอนข้อมูลระหว่างประเทศ",
      paragraphs: [
        "ผู้ให้บริการของเราอาจประมวลผลข้อมูลในประเทศอื่นนอกเหนือจากประเทศไทยหรือประเทศที่คุณอาศัยอยู่ เมื่อมีการโอนข้อมูลระหว่างประเทศ เราจะใช้มาตรการที่สมเหตุสมผลเพื่อปกป้องข้อมูลตามที่กฎหมายที่ใช้บังคับกำหนด รวมถึง PDPA ของประเทศไทยในกรณีที่เกี่ยวข้อง"
      ]
    },
    {
      title: "8. ระยะเวลาการเก็บรักษา",
      paragraphs: [
        "เราเก็บข้อมูลเท่าที่จำเป็นเพื่อให้บริการ สนับสนุนแผนของคุณ ปฏิบัติตามข้อกำหนดทางกฎหมายและบัญชี แก้ไขข้อพิพาท ปรับปรุงความปลอดภัย และดูแลข้อมูลสำรอง เราอาจทำให้ข้อมูลไม่ระบุตัวตนหรือรวมเป็นข้อมูลสถิติ"
      ]
    },
    {
      title: "9. ความปลอดภัย",
      paragraphs: [
        "เราใช้มาตรการทางเทคนิคและองค์กรที่สมเหตุสมผล แต่ไม่มีบริการอินเทอร์เน็ตใดรับประกันความปลอดภัยได้สมบูรณ์ คุณมีหน้าที่ดูแลบัญชี อุปกรณ์ และการเข้าถึงแชทของคุณให้ปลอดภัย"
      ]
    },
    {
      title: "10. ทางเลือกและสิทธิของคุณ",
      paragraphs: [
        "ขึ้นอยู่กับที่อยู่ของคุณและกฎหมายที่ใช้บังคับ รวมถึง PDPA ของประเทศไทย คุณอาจมีสิทธิเข้าถึง แก้ไข ลบ จำกัด คัดค้าน หรือขอรับสำเนาข้อมูลส่วนบุคคล ถอนความยินยอม และร้องเรียนต่อหน่วยงานคุ้มครองข้อมูล เช่น สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลของประเทศไทย หากต้องการความช่วยเหลือ โปรดติดต่อ support@mattanutra.com"
      ]
    },
    {
      title: "11. คุกกี้และการวิเคราะห์",
      paragraphs: [
        "เราอาจใช้คุกกี้ พื้นที่จัดเก็บในเครื่อง บันทึกระบบ และเทคโนโลยีที่คล้ายกันเพื่อให้เว็บไซต์ทำงาน จดจำการตั้งค่า เข้าใจการใช้งาน และปรับปรุงประสิทธิภาพ คุณสามารถควบคุมคุกกี้บางส่วนผ่านการตั้งค่าเบราว์เซอร์"
      ]
    },
    {
      title: "12. เด็ก",
      paragraphs: [
        "บริการนี้จัดทำสำหรับผู้ใหญ่ หากคุณอายุต่ำกว่า 20 ปีในประเทศไทย หรือยังไม่บรรลุนิติภาวะตามกฎหมายในพื้นที่ที่คุณอยู่ โปรดใช้บริการเฉพาะเมื่อมีบิดามารดาหรือผู้ปกครองตามกฎหมายเกี่ยวข้อง และเฉพาะเมื่อการใช้งานนั้นถูกต้องตามกฎหมาย"
      ]
    },
    {
      title: "13. การเปลี่ยนแปลง",
      paragraphs: [
        "เราอาจปรับปรุงนโยบายความเป็นส่วนตัวนี้เป็นครั้งคราว โดยฉบับที่ปรับปรุงจะมีผลตั้งแต่วันที่เผยแพร่ เว้นแต่จะระบุวันมีผลภายหลัง"
      ]
    },
    {
      title: "14. ติดต่อ",
      paragraphs: [
        "สอบถามหรือใช้สิทธิเกี่ยวกับความเป็นส่วนตัวได้ที่ MattaNutra ในประเทศไทย ผ่าน support@mattanutra.com"
      ]
    }
  ]
};


const zhCnTerms: LegalContent = {
    "eyebrow": "法律",
    "intro": "本条款规范您对 MattaNutra（一家总部位于泰国的健康服务）的使用。请在使用评估、配方简报、产品搜索或 AI 支持功能前仔细阅读。",
    "lastUpdated": "2026 年 5 月 5 日",
    "title": "服务条款",
    "updatedLabel": "最后更新",
    "sections": [
      {
        "title": "1. 接受本条款",
        "paragraphs": [
          "访问或使用 MattaNutra 即表示您同意本条款及我们的隐私政策。如您不同意，请勿使用本服务。",
          "我们可能不时更新本条款。更新后的版本自发布之日起适用，除非另有更晚的生效日期。",
          "如您从泰国境外访问本服务，您有责任确保您的使用在您所在地区合法。"
        ]
      },
      {
        "title": "2. 仅限健康信息",
        "paragraphs": [
          "MattaNutra 是一家总部位于泰国的健康公司。我们的评估、AI 生成的配方简报、市场搜索指南、聊天支持及其他内容仅供一般健康及信息参考之用。",
          "我们不提供医疗建议、诊断、治疗、预防或治愈。本服务中的任何内容均不会建立医生-患者、药师-患者、营养师-客户或其他医疗专业关系。",
          "在开始、停止或更改任何补充剂、药物、饮食、运动、睡眠或健康习惯前，尤其是在您怀孕、哺乳、有医疗状况、实验室结果异常或使用处方药或非处方药的情况下，您应咨询合格的医疗专业人士。"
        ]
      },
      {
        "title": "3. 紧急情况及医疗问题",
        "paragraphs": [
          "请勿将 MattaNutra 用于紧急或医疗急救。如您认为可能存在医疗紧急情况，请立即联系当地急救服务或合格的医疗专业人士。"
        ]
      },
      {
        "title": "4. 您的信息及责任",
        "bullets": [
          "您有责任提供准确、最新且完整的信息。",
          "您有责任决定是否遵循任何健康信息或购买任何产品。",
          "您不得将本服务用于非法、不安全、误导、滥用或商业抓取目的。",
          "除非您已获得许可，否则不得提交关于他人的信息。"
        ]
      },
      {
        "title": "5. AI 输出及配方简报",
        "paragraphs": [
          "本服务可能使用自动化系统及 AI 生成健康信息。AI 输出可能不完整、不准确或不适合您的情况。在依赖前，您应独立审查所有信息并咨询合格的专业人士。",
          "配方简报并非处方、医疗方案、临床营养计划，亦不保证任何健康结果。"
        ]
      },
      {
        "title": "6. 补充剂、产品及第三方市场",
        "paragraphs": [
          "产品推荐及市场链接仅为搜索及便利工具。我们不制造、销售、分发或控制第三方产品、价格、可用性、运输、标签、质量、安全或合法性。",
          "请务必阅读产品标签、过敏警告、成分列表、使用说明及禁忌症。产品信息可能随时变更，恕不另行通知。"
        ]
      },
      {
        "title": "7. 付款及计划",
        "paragraphs": [
          "如提供付费计划，价格、计划功能、续订条款及任何退款条款将在结账或相关购买流程中显示。我们可随时更改计划名称、功能或价格，适用于未来购买。"
        ]
      },
      {
        "title": "8. 知识产权",
        "paragraphs": [
          "本服务、品牌、设计、文本、软件及本服务的生成展示均归 MattaNutra 或其许可方所有。除非我们另有书面同意，否则您仅可将本服务用于个人、非商业健康目的。"
        ]
      },
      {
        "title": "9. 无保证",
        "paragraphs": [
          "本服务按“现状”及“可用”提供。在法律允许的最大范围内，我们不作任何明示或暗示的保证，包括准确性、特定用途适用性、可销售性、非侵权性、可用性及适合您的健康、身体、目标或情况的保证。"
        ]
      },
      {
        "title": "10. 责任限制",
        "paragraphs": [
          "在适用法律（包括泰国法律）允许的最大范围内，MattaNutra 及其所有者、董事、员工、承包商、关联方、供应商及合作伙伴不对任何间接、附带、特殊、后果性、惩戒性、惩罚性或类似损害，或利润、收入、数据、商誉、健康结果、产品购买或对本服务的依赖损失承担责任。",
          "在适用法律（包括泰国法律）允许的最大范围内，我们不对因补充剂、产品、第三方服务、AI 输出、市场链接或您使用或依赖健康信息而产生的任何不良反应、相互作用、伤害、损失、决定、购买或结果承担责任。",
          "在适用法律（包括泰国法律）允许的最大范围内，我们对与本服务相关的所有索赔的总累计责任不超过您在索赔前三个月内向我们支付的服务费用或 THB 1,000 中的较高者。"
        ]
      },
      {
        "title": "11. 赔偿",
        "paragraphs": [
          "您同意赔偿 MattaNutra 并使其免受因您滥用本服务、违反本条款、提交的信息或违反法律或第三方权利而产生的索赔、损失、责任、损害、成本及费用。"
        ]
      },
      {
        "title": "12. 暂停或终止",
        "paragraphs": [
          "如我们合理认为您已违反本条款、造成风险或以有害或非法方式使用本服务，我们可随时暂停、限制或终止对本服务的访问。"
        ]
      },
      {
        "title": "13. 管辖法律",
        "paragraphs": [
          "除非强制性消费者保护规则另有要求，否则本条款受泰国法律管辖，争议可提交至泰国主管法院。"
        ]
      },
      {
        "title": "14. 联系方式",
        "paragraphs": [
          "有关本条款的问题可发送至泰国 MattaNutra 的 support@mattanutra.com。"
        ]
      }
    ]
  };

const zhCnPrivacy: LegalContent = {
    "eyebrow": "法律",
    "intro": "本隐私政策说明 MattaNutra（一家位于泰国的健康服务提供商）在您使用我们的健康评估、配方简报、产品搜索和 AI 支持功能时，如何收集、使用、共享、存储和保护信息。",
    "lastUpdated": "2026 年 5 月 5 日",
    "title": "隐私政策",
    "updatedLabel": "最后更新",
    "sections": [
      {
        "title": "1. 我们是谁",
        "paragraphs": [
          "MattaNutra 从泰国提供健康信息和补充剂配方支持。我们不是医疗服务提供商，也不保存医疗记录。",
          "您无需提供家庭地址、电话号码或直接联系方式即可使用评估。您可以选择提供名字，以便体验更自然地称呼您。如果您请求免费电子邮件示例或联系支持，您也可以选择提供电子邮件地址或聊天句柄，仅用于该有限目的。",
          "在适用泰国《个人数据保护法 B.E. 2562 (2019)》及其修订版的情况下，MattaNutra 作为我们收集的个人数据的个人数据控制者，并决定如何使用这些数据。"
        ]
      },
      {
        "title": "2. 我们收集的信息",
        "bullets": [
          "可选名字（如果您选择提供）。用于产品内个性化，并与您的评估计划 ID 一起存储。",
          "电子邮件地址（如果您选择通过电子邮件请求免费示例）。这是可选的，完成评估不需要提供。",
          "评估答案，例如年龄范围、性别、身高、体重、肤色、国家、目标、症状、睡眠、活动、饮食、日晒、酒精、咖啡因、药物类别、补充剂使用、预算、偏好和可选备注。",
          "可选精确信息，例如家族史、压力、肠道健康、可穿戴设备数据、VO2 max 估计值、HRV 以及您选择输入的实验室数值。",
          "计划和交易信息，例如所选计划、计划 ID、状态和付款状态。支付卡或银行详细信息由支付提供商处理，我们不打算存储这些信息。",
          "支持和聊天信息，例如消息、聊天应用标识符以及您通过 LINE、WhatsApp、Telegram 或类似服务与我们的 AI 支持联系时的计划 ID。",
          "技术信息，例如 IP 地址、浏览器、设备类型、查看的页面、从网络数据得出的近似位置、日志、Cookie 和类似诊断信息。"
        ]
      },
      {
        "title": "3. 敏感健康信息",
        "paragraphs": [
          "您提供的一些信息可能揭示健康或健康相关细节，根据泰国的 PDPA 或其他适用的隐私法律，可能被视为敏感个人数据。通过提交这些信息，您要求我们处理这些信息，以便我们提供评估、配方简报、产品匹配和支持功能。",
          "在需要对敏感个人数据获得明确同意的情况下，我们依赖您的自愿提交和同意。请勿提交您不希望我们处理的信息。"
        ]
      },
      {
        "title": "4. 我们如何使用信息",
        "bullets": [
          "提供评估、生成您的配方简报、显示计划状态、展示产品搜索指导，以及渲染或发送您请求的任何免费示例。",
          "提供支持、AI 聊天连续性、计划检索以及账户或购买协助。",
          "处理付款、管理计划、防止欺诈、保护服务安全、调试错误和维护日志。",
          "改进我们的服务、模型、内容、用户体验和产品匹配逻辑。",
          "遵守法律义务、执行我们的条款，并保护用户、MattaNutra 和第三方。"
        ]
      },
      {
        "title": "5. 法律依据",
        "paragraphs": [
          "在适用的情况下，包括根据泰国的 PDPA，我们基于同意、对敏感个人数据在要求时的明确同意、履行合同或请求的服务、合法利益（如服务改进和安全）以及遵守法律义务来处理个人数据。"
        ]
      },
      {
        "title": "6. 我们如何共享信息",
        "paragraphs": [
          "我们不会出售您的个人信息。我们可能会与帮助我们托管网站、处理评估、提供 AI 功能、处理付款、管理聊天支持、分析使用情况、发送通信和保护服务的服务提供商共享信息。",
          "尽管 MattaNutra 评估主要与计划 ID 关联，但支付提供商、聊天应用、市场和技术系统可能会根据其自身的条款和隐私政策处理其自己的账户标识符、交易标识符、IP 地址、设备详细信息或聊天句柄。如果法律要求、为保护权利和安全，或作为业务转让的一部分，我们也可能披露信息。"
        ]
      },
      {
        "title": "7. 国际传输",
        "paragraphs": [
          "我们的服务提供商可能在泰国或您居住国以外的国家/地区处理信息。当我们进行国际信息传输时，我们会采取合理措施，按照适用法律（包括适用的泰国 PDPA）的要求保护信息。"
        ]
      },
      {
        "title": "8. 保留",
        "paragraphs": [
          "我们会在提供服务、支持您的计划、满足法律和会计需求、解决争议、提高安全性和维护备份所需的时间内保留信息。我们可能会对信息进行匿名化或汇总处理，使其不再识别您。"
        ]
      },
      {
        "title": "9. 安全",
        "paragraphs": [
          "我们采用合理的技术和组织保障措施，但无法保证任何互联网服务完全安全。您有责任保持任何账户、设备和聊天访问的安全。"
        ]
      },
      {
        "title": "10. 您的选择和权利",
        "paragraphs": [
          "根据您的位置和适用的法律（包括泰国的 PDPA），您可能拥有访问、更正、删除、限制、反对或接收个人数据副本、撤回同意以及向数据保护机构（如泰国的个人数据保护委员会办公室）投诉的权利。如需请求帮助，请通过 support@mattanutra.com 联系我们。"
        ]
      },
      {
        "title": "11. Cookie 和分析",
        "paragraphs": [
          "我们可能会使用 Cookie、本地存储、日志和类似技术来运营网站、记住偏好、了解使用情况和改进性能。您可以通过浏览器设置控制某些 Cookie。"
        ]
      },
      {
        "title": "12. 儿童",
        "paragraphs": [
          "本服务面向成人。如果您在泰国未满 20 岁，或未达到您居住地的成年年龄，则只能在父母或法定监护人参与且合法的情况下使用本服务。"
        ]
      },
      {
        "title": "13. 变更",
        "paragraphs": [
          "我们可能会不时更新本隐私政策。除非另有说明，否则更新后的版本自发布之日起适用。"
        ]
      },
      {
        "title": "14. 联系方式",
        "paragraphs": [
          "隐私问题和数据权利请求可发送至泰国 MattaNutra 的 support@mattanutra.com。"
        ]
      }
    ]
  };

export function getLegalContent(locale: Locale, doc: LegalDoc): LegalContent {
  const documents = {
    en: {
      privacy: enPrivacy,
      terms: enTerms
    },
    th: {
      privacy: thPrivacy,
      terms: thTerms
    },
    "zh-CN": {
      privacy: zhCnPrivacy,
      terms: zhCnTerms
    }
  } satisfies Record<Locale, Record<LegalDoc, LegalContent>>;

  return documents[locale][doc];
}
