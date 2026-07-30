import { en } from "@/components/assessment-flow-copy-en";
import type { Copy } from "@/components/assessment-flow-copy-types";

export const th: Copy = {
  ...en,
  about: {
    ...en.about,
    title: "เริ่มจากข้อมูลพื้นฐานเกี่ยวกับคุณ",
    subtitle: "ตอบคำถามสั้น ๆ ไม่กี่ข้อเพื่อเริ่มต้น ข้อมูลนี้เป็นพื้นฐานในการออกแบบสูตรส่วนที่เหลือ",
    firstName: "ชื่อ",
    firstNameHint: "เพื่อให้เราปรับสูตรปริมาณที่พอดีให้เหมาะกับคุณ",
    firstNameOptional: "ไม่บังคับ",
    honestyBody:
      "ที่นี่ไม่มีคำตอบถูกหรือผิด มีเพียงคำตอบที่ตรงกับความเป็นจริงของคุณ ยิ่งตอบตามจริง สูตรของคุณก็ยิ่งเหมาะกับคุณและปลอดภัยยิ่งขึ้นเมื่อใช้ร่วมกับสิ่งที่รับประทานอยู่",
    sex: "เพศ",
    sexOptions: [
      { label: "ชาย", value: "male" },
      { label: "หญิง", value: "female" }
    ],
    age: "อายุ",
    ageOptions: [
      { label: "18–25", value: "18-25" },
      { label: "26–35", value: "26-35" },
      { label: "36–45", value: "36-45" },
      { label: "46–55", value: "46-55" },
      { label: "56–65", value: "56-65" },
      { label: "66+", value: "66+" }
    ],
    height: "ส่วนสูง",
    weight: "น้ำหนัก",
    skin: "สีผิว",
    skinOptions: [
      { label: "สีผิว 1", value: "I" },
      { label: "สีผิว 2", value: "II" },
      { label: "สีผิว 3", value: "III" },
      { label: "สีผิว 4", value: "IV" },
      { label: "สีผิว 5", value: "V" },
      { label: "สีผิว 6", value: "VI" }
    ],
    country: "ประเทศ",
    countryOptions: [
      { label: "ประเทศไทย", value: "TH" },
      { label: "สิงคโปร์", value: "SG" },
      { label: "มาเลเซีย", value: "MY" },
      { label: "อินโดนีเซีย", value: "ID" },
      { label: "ฟิลิปปินส์", value: "PH" },
      { label: "เวียดนาม", value: "VN" },
      { label: "เมียนมา", value: "MM" },
      { label: "สหรัฐอเมริกา", value: "US" },
      { label: "ออสเตรเลีย", value: "AU" },
      { label: "สหราชอาณาจักร", value: "GB" },
      { label: "แคนาดา", value: "CA" },
      { label: "เยอรมนี", value: "DE" },
      { label: "ฝรั่งเศส", value: "FR" },
      { label: "ญี่ปุ่น", value: "JP" },
      { label: "เกาหลีใต้", value: "KR" },
      { label: "อินเดีย", value: "IN" },
      { label: "จีน", value: "CN" },
      { label: "อื่น ๆ", value: "OTHER" }
    ],
    sun: "เวลาที่ได้รับแสงแดดต่อวัน",
    sunOptions: [
      { label: "น้อยกว่า 15 นาที", value: "u15" },
      { label: "15–30 นาที", value: "15-30" },
      { label: "30–60 นาที", value: "30-60" },
      { label: "60 นาทีขึ้นไป", value: "60+" }
    ],
    sunscreen: "การใช้ครีมกันแดด",
    sunscreenOptions: [
      { label: "แทบไม่ใช้", value: "rarely" },
      { label: "บางครั้ง", value: "sometimes" },
      { label: "ทุกวัน", value: "daily" }
    ],
    femaleTitle: "บริบทสุขภาพผู้หญิง",
    reproStatus: "ขณะนี้คุณอยู่ในภาวะใด",
    reproStatusOptions: [
      { label: "ไม่มีข้อใด", value: "none" },
      { label: "กำลังวางแผนตั้งครรภ์", value: "ttc" },
      { label: "กำลังตั้งครรภ์", value: "pregnant" },
      { label: "กำลังให้นมบุตร", value: "breastfeeding" }
    ],
    menopause: "สถานะวัยหมดประจำเดือน",
    menopauseOptions: [
      { label: "ยังไม่เข้าสู่วัยหมดประจำเดือน", value: "pre" },
      { label: "อยู่ในช่วงใกล้วัยหมดประจำเดือน", value: "peri" },
      { label: "เข้าสู่วัยหมดประจำเดือนแล้ว", value: "post" },
      { label: "ไม่แน่ใจ", value: "unsure" }
    ],
    flow: "ปริมาณประจำเดือน",
    flowOptions: [
      { label: "ไม่มีประจำเดือน", value: "none" },
      { label: "น้อย", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "มาก", value: "heavy" }
    ],
    trustItems: [
      {
        body: "ทุกสูตรผ่านการคัดกรองเทียบกับยาที่ใช้ ผลตรวจทางห้องปฏิบัติการ และเลขทะเบียน อย. ไทย",
        title: "ตรวจสอบด้านความปลอดภัย"
      },
      {
        body: "คำตอบของคุณใช้เพื่อแผนของคุณเท่านั้น เราไม่ขายข้อมูลหรือเปิดเผยแก่ผู้โฆษณา",
        title: "ความเป็นส่วนตัวตั้งแต่ต้น"
      },
      {
        body: "คำแนะนำเพื่อสนับสนุนเป้าหมายของคุณ และสามารถนำไปปรึกษาแพทย์ได้เสมอ",
        title: "คำแนะนำเพื่อสุขภาวะ ไม่ใช่การวินิจฉัย"
      }
    ]
  },
  coach: {
    allergies: "ข้อมูลแพ้อาหารช่วยให้คำแนะนำด้านอาหารเสริมเหมาะสมขึ้น โดยไม่ต้องกรอกข้อความเพิ่มเติม",
    foodFrequency: "ความถี่อาหารช่วยประเมินช่องว่างสารอาหาร โดยไม่เปิด food matching ในระบบผลิตภัณฑ์ตอนนี้",
    goals: "เลือกได้สูงสุด 3 ข้อ ระบบจะใช้เป็นลำดับความสำคัญ",
    labs: "หน่วยสำคัญมาก เราเก็บตัวเลขพร้อมหน่วยก่อนส่งให้ AI",
    medications: "ไม่ใช่การวินิจฉัย แต่ช่วยให้ AI และระบบตรวจความปลอดภัยเพิ่มข้อควรระวังได้",
    precision: "ช่องเสริมเหล่านี้เพิ่มความแม่นยำ 20% สุดท้าย",
    sex: "ใช้ปรับความต้องการสารอาหารและแสดงคำถามด้านสุขภาพที่เกี่ยวข้องกับคุณ",
    sun: "ช่วยประเมินการสังเคราะห์วิตามินดีควบคู่กับการได้รับแสงแดด"
  },
  fixedAction: {
    generate: "สร้าง Health Score ของฉัน"
  },
  daily: {
    title: "ชีวิตประจำวันของคุณ",
    subtitle: "การนอน การเคลื่อนไหว ความเครียด และการย่อยอาหาร — จังหวะชีวิตที่มีผลต่อสิ่งที่ร่างกายดูดซึมและต้องการจริง ๆ",
    sleepHrs: "ชั่วโมงการนอนต่อคืน",
    sleepOptions: [
      { label: "น้อยกว่า 5 ชม.", value: "u5" },
      { label: "5–6 ชม.", value: "5-6" },
      { label: "6–7 ชม.", value: "6-7" },
      { label: "7–8 ชม.", value: "7-8" },
      { label: "8–9 ชม.", value: "8-9" },
      { label: "9 ชม.ขึ้นไป", value: "9+" }
    ],
    energy: "ระดับพลังงาน",
    energyOptions: [
      { label: "หมดแรง", value: "drained", tone: "Low" },
      { label: "ค่อนข้างน้อย", value: "low", tone: "Low" },
      { label: "พอใช้", value: "ok", tone: "Mid" },
      { label: "ดี", value: "good", tone: "High" },
      { label: "ดีมาก", value: "excellent", tone: "High" }
    ],
    activity: "ระดับกิจกรรม",
    activityOptions: [
      { label: "นั่งเป็นส่วนใหญ่", value: "sitting" },
      { label: "เล็กน้อย", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "เคลื่อนไหวมาก", value: "active" },
      { label: "นักกีฬา", value: "athlete" }
    ],
    stress: "ระดับความเครียด",
    stressOptions: [
      { label: "ต่ำมาก", value: "verylow", tone: "Low" },
      { label: "ต่ำ", value: "low", tone: "Low" },
      { label: "ปานกลาง", value: "moderate", tone: "Mid" },
      { label: "สูง", value: "high", tone: "High" },
      { label: "สูงมาก", value: "extreme", tone: "High" }
    ],
    digestion: "การย่อยอาหารโดยทั่วไป",
    digestionOptions: [
      { label: "ไม่มีปัญหา", value: "none" },
      { label: "ท้องอืด", value: "bloating" },
      { label: "ท้องผูก", value: "constipation" },
      { label: "ถ่ายเหลว", value: "loose" }
    ],
    digCondition: "โรคทางเดินอาหารที่ได้รับการวินิจฉัย",
    digConditionOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "ลำไส้แปรปรวน (IBS)", value: "ibs" },
      { label: "โรคเซลิแอค", value: "celiac" },
      { label: "โรคลำไส้อักเสบ (โรคโครห์น / ลำไส้ใหญ่อักเสบเป็นแผล)", value: "ibd" },
      { label: "เคยผ่าตัดลดน้ำหนัก", value: "bariatric" }
    ],
    smoking: "การสูบบุหรี่",
    smokingOptions: [
      { label: "ไม่เคย", value: "never" },
      { label: "เลิกแล้ว (เกิน 5 ปี)", value: "ex5+" },
      { label: "เลิกแล้ว (ไม่เกิน 5 ปี)", value: "ex5" },
      { label: "บางครั้ง", value: "occasional" },
      { label: "ทุกวัน", value: "daily" }
    ],
    alcohol: "แอลกอฮอล์ต่อสัปดาห์",
    alcoholOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "1–3", value: "1-3" },
      { label: "4–7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "คาเฟอีนต่อวัน",
    caffeineOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "1", value: "1" },
      { label: "2–3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  food: {
    title: "อาหารและโภชนาการ",
    subtitle: "สิ่งที่คุณกินช่วยให้เราเห็นว่าสารอาหารใดอาจไม่เพียงพอ จึงแนะนำเฉพาะสิ่งที่อาหารของคุณยังขาด",
    diet: "รูปแบบการกิน",
    dietOptions: [
      { label: "ไม่มีรูปแบบเฉพาะ", value: "none" },
      { label: "อาหารแปรรูปเป็นหลัก", value: "processed" },
      { label: "สมดุล", value: "balanced" },
      { label: "อาหารไม่แปรรูปเป็นหลัก", value: "whole" },
      { label: "เมดิเตอร์เรเนียน", value: "mediterranean" },
      { label: "เน้นพืชเป็นหลัก", value: "plant" },
      { label: "วีแกน", value: "vegan" },
      { label: "เนื้อสัตว์เป็นหลัก", value: "carnivore" }
    ],
    frequency: "คุณรับประทานอาหารต่อไปนี้บ่อยเพียงใด",
    frequencyTitles: {
      dairy: "ผลิตภัณฑ์นม",
      eggs: "ไข่",
      fish: "ปลาที่มีไขมันสูง",
      fruitveg: "ผักและผลไม้",
      legumes: "ถั่วเมล็ดแห้ง / ถั่วเปลือกแข็ง",
      redmeat: "เนื้อแดง"
    },
    frequencyOptions: {
      dairy: [
        { label: "ไม่เคย", value: "never" },
        { label: "1–2 ครั้ง/สัปดาห์", value: "1-2" },
        { label: "3 ครั้งขึ้นไป/สัปดาห์", value: "3+" }
      ],
      eggs: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      fish: [
        { label: "ไม่เคย", value: "never" },
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ประมาณสัปดาห์ละครั้ง", value: "once" },
        { label: "บ่อย", value: "often" }
      ],
      fruitveg: [
        { label: "ไม่ทุกวัน", value: "notdaily" },
        { label: "1–2 ครั้ง/วัน", value: "1-2" },
        { label: "3 ครั้งขึ้นไป/วัน", value: "3+" }
      ],
      legumes: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      redmeat: [
        { label: "ไม่เคย", value: "never" },
        { label: "1–2 ส่วน/วัน", value: "1-2" },
        { label: "3 ส่วนขึ้นไป/วัน", value: "3+" }
      ]
    },
    allergies: "การแพ้อาหาร",
    allergyOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "นม", value: "milk" },
      { label: "ไข่", value: "eggs" },
      { label: "ปลา", value: "fish" },
      { label: "สัตว์น้ำมีเปลือก", value: "shellfish" },
      { label: "ถั่วเปลือกแข็ง", value: "treenuts" },
      { label: "ถั่วลิสง", value: "peanuts" },
      { label: "ข้าวสาลี", value: "wheat" },
      { label: "ถั่วเหลือง", value: "soy" },
      { label: "งา", value: "sesame" }
    ],
    disclosureTitle: "ฉันยืนยันว่าได้แจ้งข้อมูลการแพ้ ภาวะสุขภาพ ยาที่ใช้ และข้อจำกัดด้านอาหารที่เกี่ยวข้องครบถ้วนแล้ว",
    disclosureBody: "คำแนะนำของ MattaNutra สนับสนุนสุขภาวะทั่วไปและไม่ใช้แทนคำแนะนำทางการแพทย์"
  },
  goals: {
    title: "เป้าหมายและความรู้สึกของคุณ",
    subtitle: "นี่คือสิ่งที่สูตรของคุณออกแบบมาเพื่อคุณโดยเฉพาะ — ตอบตามจริง เพราะคำตอบนี้จะกำหนดทุกส่วนของสูตร",
    goals: "เป้าหมายสุขภาพหลัก",
    goalHint: "เลือกได้ไม่เกิน 3 ข้อ — เลือกสิ่งที่สำคัญกับคุณมากที่สุดในตอนนี้",
    goalOptions: [
      { label: "เพิ่มพลังงาน", value: "energy" },
      { label: "นอนหลับดีขึ้น", value: "sleep" },
      { label: "สมอง / สมาธิ", value: "focus" },
      { label: "สุขภาพดีและอายุยืน", value: "longevity" },
      { label: "ภูมิคุ้มกัน", value: "immunity" },
      { label: "สมรรถภาพ / VO₂", value: "fitness" },
      { label: "ลดน้ำหนัก", value: "weight" },
      { label: "อารมณ์ / ความสงบ", value: "mood" },
      { label: "สุขภาพหัวใจ", value: "heart" },
      { label: "ข้อต่อ / กระดูก", value: "joints" },
      { label: "ผิว / เส้นผม", value: "skin" },
      { label: "ฮอร์โมน", value: "hormones" }
    ],
    symptoms: "อาการในปัจจุบัน",
    symptomHint: "เลือกได้ทุกข้อที่ตรงกับคุณ รวมถึง “รู้สึกสุขภาพดี”",
    symptomOptions: [
      { label: "อ่อนเพลีย", value: "fatigue" },
      { label: "สมองตื้อ", value: "brainfog" },
      { label: "อารมณ์ซึม", value: "mood" },
      { label: "ปวดข้อ", value: "joint" },
      { label: "ปัญหาการย่อยอาหาร", value: "digestion" },
      { label: "นอนหลับไม่ดี", value: "sleep" },
      { label: "เครียด / วิตกกังวล", value: "stress" },
      { label: "ปัญหาผิว", value: "skin" },
      { label: "ผมร่วง", value: "hair" },
      { label: "ความต้องการทางเพศต่ำ", value: "libido" },
      { label: "เป็นหวัดบ่อย", value: "colds" },
      { label: "รู้สึกสุขภาพดี", value: "great" }
    ]
  },
  precision: {
    title: "ความต้องการของคุณ",
    subtitle: "เพื่อให้สูตรเหมาะกับงบประมาณ กิจวัตร และรูปแบบการรับประทานที่คุณสะดวก",
    budget: "งบประมาณอาหารเสริมต่อเดือน",
    budgetOptions: [
      { label: "ต่ำกว่า 1,000 บาท", value: "u1000" },
      { label: "1,000–2,500 บาท", value: "1000-2500" },
      { label: "2,500–5,000 บาท", value: "2500-5000" },
      { label: "5,000 บาทขึ้นไป", value: "5000+" }
    ],
    maxPills: "จำนวนเม็ดหรือแคปซูลสูงสุดต่อวัน",
    maxPillsOptions: [
      { label: "1–3", value: "1-3" },
      { label: "4–6", value: "4-6" },
      { label: "7–10", value: "7-10" },
      { label: "ไม่จำกัด", value: "nolimit" }
    ],
    form: "รูปแบบผลิตภัณฑ์ที่ต้องการ",
    formOptions: [
      { label: "แคปซูล", value: "capsules" },
      { label: "ผงชง / เชค", value: "powder" },
      { label: "กัมมี่", value: "gummies" },
      { label: "ใช้หลายรูปแบบได้", value: "mixed" }
    ],
    optionalBanner: "ไม่บังคับ — เพิ่มความแม่นยำ",
    optionalBody: "ส่วนนี้ไม่บังคับ คุณสร้าง Health Score ได้ทันทีด้วยระดับความแม่นยำปัจจุบัน หรือเพิ่มรายละเอียดอีกเล็กน้อยเพื่อเข้าใกล้ 100% ทุกคำตอบด้านล่างจะทำให้แถบความแม่นยำขยับขึ้น",
    protein: "โปรตีนต่อวัน",
    proteinOptions: [
      { label: "ต่ำกว่า 1 กรัม/กก.", value: "u1" },
      { label: "1–1.5 กรัม/กก.", value: "1-1.5" },
      { label: "1.5–2 กรัม/กก.", value: "1.5-2" },
      { label: "มากกว่า 2 กรัม/กก.", value: "2+" }
    ],
    family: "ประวัติสุขภาพในครอบครัว",
    familyOptions: [
      { label: "โรคหัวใจ", value: "heart" },
      { label: "โรคอัลไซเมอร์", value: "alzheimers" },
      { label: "เบาหวาน", value: "diabetes" },
      { label: "มะเร็ง", value: "cancer" },
      { label: "โรคกระดูกพรุน", value: "osteoporosis" },
      { label: "ไม่ใช้", value: "none" }
    ],
    tracker: "อุปกรณ์ติดตามสุขภาพ",
    trackerOptions: [
      { label: "ไม่ทราบว่ามี", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "อื่น ๆ", value: "other" }
    ],
    vo2: "VO₂ max",
    vo2Estimate: "ตัวช่วยประเมิน VO2",
    vo2EstimateButton: "ใช้ค่าประเมิน",
    vo2EstimateNeeds: "ตอบเพศ อายุ ส่วนสูง น้ำหนัก และกิจกรรม เพื่อประเมิน VO2",
    vo2EstimateReady: (value) => `ประเมินได้ ${value} ml/kg/min จากคำตอบปัจจุบัน`,
    hrv: "ค่า HRV เฉลี่ย",
    labs: "ผลตรวจทางห้องปฏิบัติการล่าสุด",
    labsHint: "กรอกเฉพาะค่าที่มี หน่วยมีความสำคัญ — เลือกหน่วยให้ถูกต้อง เพื่อให้ระบบอ่านค่าของคุณได้อย่างแม่นยำ",
    labFields: [
      { label: "วิตามิน D", value: "vitd", units: ["ng/mL", "nmol/L"] },
      { label: "วิตามิน B12", value: "b12", units: ["pg/mL", "pmol/L"] },
      { label: "เฟอร์ริติน", value: "ferritin", units: ["ng/mL", "ug/L"] },
      { label: "HbA1c", value: "hba1c", units: ["%", "mmol/mol"] },
      { label: "ดัชนีโอเมก้า-3", value: "o3", units: ["%"] },
      { label: "โฮโมซิสเทอีน", value: "homo", units: ["umol/L", "mg/L"] }
    ]
  },
  safety: {
    title: "ยาและความปลอดภัย",
    subtitle: "เราใช้ข้อมูลส่วนนี้เพื่อคัดกรองความปลอดภัย ตรวจสอบปฏิกิริยาระหว่างยาและอาหารเสริม และปรับสูตรของคุณเท่านั้น โดยไม่เปิดเผยข้อมูลนี้",
    medications: "คุณรับประทานยาอยู่หรือไม่?",
    medicationHint: "ใช้เพื่อตรวจสอบความปลอดภัยเท่านั้น",
    medicationOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "ใช้", value: "yes" }
    ],
    medicationType: "ประเภทยา",
    medicationTypeOptions: [
      { label: "ยากลุ่มสแตติน", value: "statin" },
      { label: "เมตฟอร์มิน", value: "metformin" },
      { label: "ยาลดกรด PPI / โอเมพราโซล", value: "ppi" },
      { label: "ยาขับปัสสาวะ", value: "diuretic" },
      { label: "ยาคุมกำเนิด", value: "contraceptive" },
      { label: "ยาต้านซึมเศร้า", value: "antidepressant" },
      { label: "ยาต้านการแข็งตัวของเลือด / แอสไพริน", value: "bloodthinner" },
      { label: "ยาไทรอยด์", value: "thyroid" },
      { label: "ยาลดความดันโลหิต", value: "bp" },
      { label: "ยาคอร์ติโคสเตียรอยด์", value: "corticosteroid" },
      { label: "อื่น ๆ", value: "other" }
    ],
    otherMedPlaceholder: "โปรดระบุชื่อยาและใช้เพื่ออะไร",
    suppAllergies: "การแพ้หรือไม่ทนต่อส่วนผสมในอาหารเสริม",
    suppAllergyOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "ไอโอดีน", value: "iodine" },
      { label: "ธาตุเหล็ก", value: "iron" },
      { label: "CoQ10", value: "coq10" },
      { label: "วิตามินบี", value: "bvit" },
      { label: "ส่วนผสมจากถั่วเหลือง", value: "soyderived" },
      { label: "ส่วนผสมจากสัตว์น้ำมีเปลือก", value: "shellfishderived" },
      { label: "อื่น ๆ", value: "other" }
    ],
    kidney: "การทำงานของไต",
    kidneyOptions: [
      { label: "ไม่ทราบว่ามีปัญหา", value: "normal" },
      { label: "การทำงานลดลง", value: "reduced" },
      { label: "โรคไต", value: "disease" }
    ],
    liver: "ภาวะเกี่ยวกับตับ",
    liverOptions: [
      { label: "ไม่ทราบว่ามีปัญหา", value: "normal" },
      { label: "มีภาวะเกี่ยวกับตับ", value: "condition" }
    ],
    surgery: "มีแผนผ่าตัดภายใน 30 วันหรือไม่?",
    surgeryOptions: [
      { label: "ไม่มี", value: "no" },
      { label: "มี", value: "yes" }
    ],
    antibiotics: "ใช้ยาปฏิชีวนะในช่วง 3 เดือนที่ผ่านมาหรือไม่?",
    antibioticsOptions: [
      { label: "ไม่ใช้", value: "no" },
      { label: "ใช้", value: "yes" }
    ],
    supplements: "อาหารเสริมที่ใช้อยู่",
    supplementsOptions: [
      { label: "ไม่ได้ใช้อุปกรณ์", value: "none" },
      { label: "วิตามินรวมพื้นฐาน", value: "basic" },
      { label: "วิตามินดี3 / โอเมก้า-3", value: "d3omega" },
      { label: "หลายชนิดแบบเจาะจง", value: "targeted" }
    ]
  },
  sectionNotes: [
    "ที่นี่ไม่มีคำตอบถูกหรือผิด มีเพียงคำตอบที่ตรงกับความเป็นจริงของคุณ ยิ่งตอบตามจริง สูตรของคุณก็ยิ่งเหมาะกับคุณและปลอดภัยยิ่งขึ้นเมื่อใช้ร่วมกับสิ่งที่รับประทานอยู่",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: [
    "เรื่องของคุณ", "พื้นฐาน", "พื้นฐาน", "พื้นฐาน", "ความปลอดภัย", "ปรับเฉพาะคุณ"],
  stages: ["ข้อมูลพื้นฐาน", "เป้าหมาย", "ชีวิตประจำวัน", "อาหาร", "ความปลอดภัย", "ความแม่นยำ"]
};
