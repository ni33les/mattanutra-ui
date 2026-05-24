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
        "The assessment is designed to be anonymous. You can use it without giving us your name, home address, phone number, or direct contact details. If you request a free email example or contact support, you may choose to provide an email address or chat handle for that limited purpose.",
        "Where Thailand's Personal Data Protection Act B.E. 2562 (2019), as amended, applies, MattaNutra acts as a personal data controller for the personal data we collect and decide how to use."
      ]
    },
    {
      title: "2. Information we collect",
      bullets: [
        "We do not ask for or intentionally collect your name, home address, phone number, or other direct contact details through the assessment. The formulation brief is linked to a plan ID rather than your identity.",
        "Email address if you choose to request a free example by email. This is optional and is not required to complete the anonymous assessment.",
        "Assessment answers, such as age range, biological sex, height, weight, skin tone, country, goals, symptoms, sleep, activity, diet, sun exposure, alcohol, caffeine, medication categories, supplement use, budget, preferences, and optional notes.",
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
        "Although the MattaNutra assessment is designed to be anonymous, payment providers, chat apps, marketplaces, and technical systems may process their own account identifiers, transaction identifiers, IP addresses, device details, or chat handles under their own terms and privacy policies. We may also disclose information if required by law, to protect rights and safety, or as part of a business transfer."
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
    "ข้อกำหนดนี้ใช้กับการใช้งาน MattaNutra ซึ่งเป็นบริการ wellness ที่ตั้งอยู่ในประเทศไทย โปรดอ่านก่อนใช้แบบประเมิน บรีฟสูตรอาหารเสริม การค้นหาผลิตภัณฑ์ หรือการสนับสนุนด้วย AI",
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
      title: "2. ข้อมูลเพื่อ wellness เท่านั้น",
      paragraphs: [
        "MattaNutra เป็นบริษัทด้าน wellness ที่ตั้งอยู่ในประเทศไทย แบบประเมิน บรีฟสูตรที่สร้างด้วย AI คู่มือค้นหาผลิตภัณฑ์ การสนับสนุนผ่านแชท และเนื้อหาอื่นๆ จัดทำเพื่อข้อมูลทั่วไปด้าน wellness เท่านั้น",
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
        "คุณมีหน้าที่ตัดสินใจเองว่าจะปฏิบัติตามข้อมูลด้าน wellness หรือซื้อผลิตภัณฑ์ใดหรือไม่",
        "คุณต้องไม่ใช้บริการเพื่อวัตถุประสงค์ที่ผิดกฎหมาย ไม่ปลอดภัย ทำให้เข้าใจผิด ละเมิดผู้อื่น หรือดึงข้อมูลเชิงพาณิชย์โดยไม่ได้รับอนุญาต",
        "คุณต้องไม่ส่งข้อมูลของบุคคลอื่น เว้นแต่ได้รับอนุญาต"
      ]
    },
    {
      title: "5. ผลลัพธ์จาก AI และบรีฟสูตร",
      paragraphs: [
        "บริการของเราอาจใช้ระบบอัตโนมัติและ AI เพื่อสร้างข้อมูลด้าน wellness ผลลัพธ์จาก AI อาจไม่ครบถ้วน ไม่ถูกต้อง หรือไม่เหมาะกับสถานการณ์ของคุณ คุณควรตรวจสอบข้อมูลด้วยตนเองและปรึกษาผู้เชี่ยวชาญที่มีคุณสมบัติก่อนนำไปใช้",
        "บรีฟสูตรไม่ใช่ใบสั่งยา ไม่ใช่โปรโตคอลทางการแพทย์ ไม่ใช่แผนโภชนาการทางคลินิก และไม่รับประกันผลลัพธ์ด้านสุขภาพใดๆ"
      ]
    },
    {
      title: "6. อาหารเสริม ผลิตภัณฑ์ และ marketplace ภายนอก",
      paragraphs: [
        "คำแนะนำผลิตภัณฑ์และลิงก์ marketplace เป็นเครื่องมือค้นหาและอำนวยความสะดวก เราไม่ได้ผลิต จำหน่าย จ่ายยา หรือควบคุมผลิตภัณฑ์ ราคา สต็อก การจัดส่ง ฉลาก คุณภาพ ความปลอดภัย หรือความถูกต้องตามกฎหมายของบุคคลภายนอก",
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
        "บริการ แบรนด์ ดีไซน์ ข้อความ ซอฟต์แวร์ และรูปแบบการนำเสนอของบริการเป็นของ MattaNutra หรือผู้อนุญาต คุณใช้บริการได้เพื่อ wellness ส่วนบุคคลและไม่ใช่เชิงพาณิชย์เท่านั้น เว้นแต่เราอนุญาตเป็นลายลักษณ์อักษร"
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
        "ภายใต้ขอบเขตสูงสุดที่กฎหมายที่ใช้บังคับอนุญาต รวมถึงกฎหมายไทย เราไม่รับผิดชอบต่ออาการไม่พึงประสงค์ ปฏิกิริยาระหว่างสาร การบาดเจ็บ ความสูญเสีย การตัดสินใจ การซื้อ หรือผลลัพธ์ที่เกิดจากอาหารเสริม ผลิตภัณฑ์ บริการภายนอก ผลลัพธ์จาก AI ลิงก์ marketplace หรือการใช้หรือพึ่งพาข้อมูลด้าน wellness ของคุณ",
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
    "นโยบายความเป็นส่วนตัวนี้อธิบายว่า MattaNutra ซึ่งเป็นบริการ wellness ที่ตั้งอยู่ในประเทศไทย เก็บรวบรวม ใช้ เปิดเผย จัดเก็บ และปกป้องข้อมูลอย่างไร เมื่อคุณใช้แบบประเมิน wellness บรีฟสูตรอาหารเสริม การค้นหาผลิตภัณฑ์ และฟีเจอร์สนับสนุนด้วย AI",
  lastUpdated: thLastUpdated,
  title: "นโยบายความเป็นส่วนตัว",
  updatedLabel: "ปรับปรุงล่าสุด",
  sections: [
    {
      title: "1. เราคือใคร",
      paragraphs: [
        "MattaNutra ให้ข้อมูลด้าน wellness และสนับสนุนการสร้างสูตรอาหารเสริมจากประเทศไทย เราไม่ใช่ผู้ให้บริการทางการแพทย์ และเราไม่ได้จัดเก็บเวชระเบียน",
        "แบบประเมินถูกออกแบบให้ใช้งานแบบไม่ระบุตัวตน คุณสามารถใช้งานได้โดยไม่ต้องให้ชื่อ ที่อยู่บ้าน หมายเลขโทรศัพท์ หรือข้อมูลติดต่อโดยตรง หากคุณขอตัวอย่างฟรีทางอีเมลหรือติดต่อฝ่ายสนับสนุน คุณอาจเลือกให้อีเมลหรือ chat handle เพื่อวัตถุประสงค์นั้นเท่านั้น",
        "ในกรณีที่พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และที่แก้ไขเพิ่มเติม (PDPA) ของประเทศไทยมีผลใช้บังคับ MattaNutra มีสถานะเป็นผู้ควบคุมข้อมูลส่วนบุคคลสำหรับข้อมูลส่วนบุคคลที่เราเก็บรวบรวมและกำหนดวัตถุประสงค์การใช้"
      ]
    },
    {
      title: "2. ข้อมูลที่เราเก็บรวบรวม",
      bullets: [
        "เราไม่ขอและไม่ได้ตั้งใจเก็บชื่อ ที่อยู่บ้าน หมายเลขโทรศัพท์ หรือข้อมูลติดต่อโดยตรงอื่นๆ ผ่านแบบประเมิน บรีฟสูตรจะเชื่อมกับ plan ID แทนตัวตนของคุณ",
        "อีเมล หากคุณเลือกขอตัวอย่างฟรีทางอีเมล ข้อมูลนี้เป็นทางเลือกและไม่จำเป็นสำหรับการทำแบบประเมินแบบไม่ระบุตัวตน",
        "คำตอบในแบบประเมิน เช่น ช่วงอายุ เพศทางชีววิทยา ส่วนสูง น้ำหนัก สีผิว ประเทศ เป้าหมาย อาการ การนอน กิจกรรม อาหาร แสงแดด แอลกอฮอล์ คาเฟอีน ประเภทยา การใช้อาหารเสริม งบประมาณ ความต้องการ และบันทึกเพิ่มเติมที่คุณเลือกกรอก",
        "ข้อมูลเพิ่มความแม่นยำที่ไม่บังคับ เช่น ประวัติครอบครัว ความเครียด สุขภาพลำไส้ ข้อมูล wearable ค่า VO2 max ค่า HRV และค่าแล็บที่คุณเลือกกรอก",
        "ข้อมูลแผนและธุรกรรม เช่น แผนที่เลือก plan ID สถานะ และสถานะการชำระเงิน ข้อมูลบัตรหรือบัญชีธนาคารจะจัดการโดยผู้ให้บริการชำระเงิน และเราไม่ได้ตั้งใจจัดเก็บข้อมูลเหล่านั้น",
        "ข้อมูลสนับสนุนและแชท เช่น ข้อความ ตัวระบุบัญชีแอปแชท และ plan ID หากคุณเชื่อมต่อกับ AI support ผ่าน LINE, WhatsApp, Telegram หรือบริการคล้ายกัน",
        "ข้อมูลทางเทคนิค เช่น IP address, browser, ประเภทอุปกรณ์ หน้าเว็บที่ดู ตำแหน่งโดยประมาณจากข้อมูลเครือข่าย log, cookies และข้อมูลวินิจฉัยที่คล้ายกัน"
      ]
    },
    {
      title: "3. ข้อมูล wellness ที่อาจละเอียดอ่อน",
      paragraphs: [
        "ข้อมูลบางอย่างที่คุณให้เราอาจสะท้อนรายละเอียดด้านสุขภาพหรือ wellness และอาจถือเป็นข้อมูลส่วนบุคคลที่มีความละเอียดอ่อนตาม PDPA ของประเทศไทยหรือกฎหมายความเป็นส่วนตัวอื่นที่ใช้บังคับ เมื่อคุณส่งข้อมูลดังกล่าว คุณขอให้เราประมวลผลเพื่อให้บริการแบบประเมิน บรีฟสูตร การจับคู่ผลิตภัณฑ์ และฟีเจอร์สนับสนุน",
        "ในกรณีที่ต้องได้รับความยินยอมโดยชัดแจ้งสำหรับข้อมูลส่วนบุคคลที่มีความละเอียดอ่อน เราอาศัยการส่งข้อมูลโดยสมัครใจและความยินยอมของคุณ หากคุณไม่ต้องการให้เราประมวลผลข้อมูลใด โปรดอย่าส่งข้อมูลนั้น"
      ]
    },
    {
      title: "4. เราใช้ข้อมูลอย่างไร",
      bullets: [
        "เพื่อให้บริการแบบประเมิน สร้างบรีฟสูตร แสดงสถานะแผน แสดงคำแนะนำค้นหาผลิตภัณฑ์ และสร้างหรือส่งตัวอย่างฟรีที่คุณร้องขอ",
        "เพื่อให้การสนับสนุน ความต่อเนื่องของ AI chat การดึงข้อมูลแผน และความช่วยเหลือเกี่ยวกับบัญชีหรือการซื้อ",
        "เพื่อประมวลผลการชำระเงิน จัดการแผน ป้องกันการทุจริต รักษาความปลอดภัย แก้ไขข้อผิดพลาด และดูแล log",
        "เพื่อปรับปรุงบริการ โมเดล เนื้อหา ประสบการณ์ผู้ใช้ และ logic การจับคู่ผลิตภัณฑ์",
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
        "แม้แบบประเมินของ MattaNutra จะถูกออกแบบให้ใช้งานแบบไม่ระบุตัวตน ผู้ให้บริการชำระเงิน แอปแชท marketplace และระบบทางเทคนิคอาจประมวลผลตัวระบุบัญชี ตัวระบุธุรกรรม IP address รายละเอียดอุปกรณ์ หรือ chat handle ของตนเองตามเงื่อนไขและนโยบายความเป็นส่วนตัวของบริการนั้นๆ เราอาจเปิดเผยข้อมูลหากกฎหมายกำหนด เพื่อปกป้องสิทธิและความปลอดภัย หรือเป็นส่วนหนึ่งของการโอนธุรกิจ"
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
      title: "11. Cookies และ analytics",
      paragraphs: [
        "เราอาจใช้ cookies, local storage, logs และเทคโนโลยีที่คล้ายกันเพื่อให้เว็บไซต์ทำงาน จดจำการตั้งค่า เข้าใจการใช้งาน และปรับปรุงประสิทธิภาพ คุณสามารถควบคุม cookies บางส่วนผ่านการตั้งค่า browser"
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

export function getLegalContent(locale: Locale, doc: LegalDoc): LegalContent {
  const documents = {
    en: {
      privacy: enPrivacy,
      terms: enTerms
    },
    th: {
      privacy: thPrivacy,
      terms: thTerms
    }
  } satisfies Record<Locale, Record<LegalDoc, LegalContent>>;

  return documents[locale][doc];
}
