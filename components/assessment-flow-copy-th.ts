import { en } from "@/components/assessment-flow-copy-en";
import type { Copy } from "@/components/assessment-flow-copy-types";

export const th: Copy = {
  ...en,
  about: {
    ...en.about,
    title: "ข้อมูลพื้นฐานของคุณ",
    subtitle: "เริ่มด้วยการแตะไม่กี่ครั้ง เพื่อวางพื้นฐานให้สูตรส่วนถัดไปแม่นยำขึ้น",
    firstName: "ชื่อเล่นหรือชื่อจริง",
    firstNameHint: "ใช้เพื่อปรับข้อความในแผนของคุณเท่านั้น",
    firstNameOptional: "ไม่บังคับ",
    honestyBody:
      "ไม่มีคำตอบที่ถูกหรือผิด มีแค่คำตอบที่ตรงกับคุณ ยิ่งตอบตามจริง สูตรก็ยิ่งเหมาะกับชีวิตจริงและปลอดภัยขึ้นเมื่อใช้ร่วมกับสิ่งที่คุณทานอยู่",
    sex: "เพศ",
    sexOptions: [
      { label: "ชาย", value: "male" },
      { label: "หญิง", value: "female" }
    ],
    age: "อายุ",
    ageOptions: en.about.ageOptions,
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
    sun: "การได้รับแดด ( นาที / วัน )",
    sunOptions: [
      { label: "น้อยกว่า 15", value: "u15" },
      { label: "15-30", value: "15-30" },
      { label: "30-60", value: "30-60" },
      { label: "60+", value: "60+" }
    ],
    sunscreen: "การใช้กันแดด",
    sunscreenOptions: [
      { label: "แทบไม่ใช้", value: "rarely" },
      { label: "บางครั้ง", value: "sometimes" },
      { label: "ทุกวัน", value: "daily" }
    ],
    femaleTitle: "บริบทสุขภาพผู้หญิง",
    reproStatus: "สถานะตั้งครรภ์ / ให้นม",
    reproStatusOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "กำลังพยายามตั้งครรภ์", value: "ttc" },
      { label: "ตั้งครรภ์", value: "pregnant" },
      { label: "ให้นมบุตร", value: "breastfeeding" }
    ],
    menopause: "ช่วงวัยหมดประจำเดือน",
    menopauseOptions: [
      { label: "ก่อนวัยหมดประจำเดือน", value: "pre" },
      { label: "วัยใกล้หมดประจำเดือน", value: "peri" },
      { label: "หลังหมดประจำเดือน", value: "post" },
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
        body: "สูตรถูกตรวจร่วมกับยา แล็บ และบริบททะเบียน อย. ไทย",
        title: "ตรวจเพื่อความปลอดภัย"
      },
      {
        body: "คำตอบผูกกับแผนของคุณ เราไม่ขายหรือส่งให้ผู้ลงโฆษณา",
        title: "เป็นส่วนตัวตั้งแต่ต้น"
      },
      {
        body: "คำแนะนำเพื่อสนับสนุนเป้าหมายสุขภาวะ และนำไปคุยกับแพทย์ได้",
        title: "สุขภาวะ ไม่ใช่การวินิจฉัย"
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
    sex: "เพศและบริบทการตั้งครรภ์มีผลต่อข้อควรระวัง ธาตุเหล็ก และการกรองสินค้า",
    sun: "สีผิว แดด และกันแดดช่วยประเมินบริบทวิตามินดีอย่างซื่อตรงขึ้น"
  },
  fixedAction: {
    generate: "สร้างคะแนนสุขภาพของฉัน"
  },
  daily: {
    title: "ชีวิตประจำวันของคุณ",
    subtitle: "ข้อมูลส่วนนี้ช่วยให้สูตรไม่ใช่แค่ชุดทั่วไป แต่เข้ากับกิจวัตรของคุณจริง ๆ",
    sleepHrs: "เวลานอนต่อคืน ( ชั่วโมง )",
    sleepOptions: [
      { label: "น้อยกว่า 5", value: "u5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "มากกว่า 9", value: "9+" }
    ],
    energy: "ระดับพลังงาน",
    energyOptions: [
      { label: "หมดแรง", value: "drained", tone: "Low" },
      { label: "ต่ำ", value: "low", tone: "Low" },
      { label: "พอใช้", value: "ok", tone: "Mid" },
      { label: "ดี", value: "good", tone: "High" },
      { label: "ดีเยี่ยม", value: "excellent", tone: "High" }
    ],
    activity: "ระดับกิจกรรม",
    activityOptions: [
      { label: "นั่งเป็นส่วนใหญ่", value: "sitting" },
      { label: "เบา", value: "light" },
      { label: "ปานกลาง", value: "moderate" },
      { label: "กระฉับกระเฉง", value: "active" },
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
    digestion: "การย่อยอาหาร",
    digestionOptions: [
      { label: "ไม่มีปัญหา", value: "none" },
      { label: "ท้องอืด", value: "bloating" },
      { label: "ท้องผูก", value: "constipation" },
      { label: "ถ่ายเหลว", value: "loose" }
    ],
    digCondition: "ภาวะระบบทางเดินอาหาร",
    digConditionOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "ลำไส้แปรปรวน (IBS)", value: "ibs" },
      { label: "โรคเซลิแอค", value: "celiac" },
      { label: "ลำไส้อักเสบ (IBD)", value: "ibd" },
      { label: "เคยผ่าตัดลดน้ำหนัก", value: "bariatric" }
    ],
    smoking: "การสูบบุหรี่",
    smokingOptions: [
      { label: "ไม่เคย", value: "never" },
      { label: "เลิกมาเกิน 5 ปี", value: "ex5+" },
      { label: "เลิกไม่ถึง 5 ปี", value: "ex5" },
      { label: "สูบเป็นบางครั้ง", value: "occasional" },
      { label: "สูบทุกวัน", value: "daily" }
    ],
    alcohol: "แอลกอฮอล์ ( แก้ว / สัปดาห์ )",
    alcoholOptions: [
      { label: "ไม่ดื่ม", value: "none" },
      { label: "1-3", value: "1-3" },
      { label: "4-7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "คาเฟอีน ( แก้ว / วัน )",
    caffeineOptions: [
      { label: "ไม่ดื่ม", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  food: {
    title: "อาหารและโภชนาการ",
    subtitle: "บริบทอาหารช่วยให้คำแนะนำอาหารเสริมแม่นขึ้น แม้การจับคู่ผลิตภัณฑ์จะยังเน้นอาหารเสริมเท่านั้น",
    diet: "รูปแบบการกิน",
    dietOptions: [
      { label: "ไม่มีรูปแบบเฉพาะ", value: "none" },
      { label: "อาหารแปรรูปค่อนข้างมาก", value: "processed" },
      { label: "ค่อนข้างสมดุล", value: "balanced" },
      { label: "อาหารไม่แปรรูปเป็นหลัก", value: "whole" },
      { label: "เมดิเตอร์เรเนียน", value: "mediterranean" },
      { label: "เน้นพืช", value: "plant" },
      { label: "วีแกน", value: "vegan" },
      { label: "คาร์นิวอร์", value: "carnivore" }
    ],
    frequency: "คุณกินบ่อยแค่ไหน...",
    frequencyTitles: {
      dairy: "ผลิตภัณฑ์นม ( หน่วยบริโภค / วัน )",
      eggs: "ไข่",
      fish: "ปลาที่มีไขมัน",
      fruitveg: "ผักและผลไม้ ( หน่วยบริโภค / วัน )",
      legumes: "ถั่ว / ถั่วเปลือกแข็ง",
      redmeat: "เนื้อแดง ( หน่วยบริโภค / สัปดาห์ )"
    },
    frequencyOptions: {
      dairy: [
        { label: "ไม่เคย", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      eggs: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      fish: [
        { label: "ไม่เคย", value: "never" },
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "once" },
        { label: "บ่อย", value: "often" }
      ],
      fruitveg: [
        { label: "ไม่ทุกวัน", value: "notdaily" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      legumes: [
        { label: "นาน ๆ ครั้ง", value: "rare" },
        { label: "ทุกสัปดาห์", value: "weekly" },
        { label: "เกือบทุกวัน", value: "most" }
      ],
      redmeat: [
        { label: "ไม่เคย", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ]
    },
    allergies: "แพ้อาหาร",
    allergyOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "นม", value: "milk" },
      { label: "ไข่", value: "eggs" },
      { label: "ปลา", value: "fish" },
      { label: "หอยและอาหารทะเลเปลือกแข็ง", value: "shellfish" },
      { label: "ถั่วเปลือกแข็ง", value: "treenuts" },
      { label: "ถั่วลิสง", value: "peanuts" },
      { label: "ข้าวสาลี", value: "wheat" },
      { label: "ถั่วเหลือง", value: "soy" },
      { label: "งา", value: "sesame" }
    ],
    disclosureTitle: "ฉันยืนยันว่าได้เปิดเผยข้อมูลแพ้ ภาวะสุขภาพ ยา และข้อจำกัดด้านอาหารที่เกี่ยวข้องแล้ว",
    disclosureBody: "คำแนะนำของ MattaNutra สนับสนุนสุขภาวะทั่วไป และไม่แทนคำแนะนำทางการแพทย์"
  },
  goals: {
    title: "เป้าหมายและอาการของคุณ",
    subtitle: "เป้าหมายหลักและอาการปัจจุบันช่วยกำหนดลำดับความสำคัญของสูตร",
    goals: "เป้าหมายสุขภาพหลัก",
    goalHint: "เลือกได้สูงสุด 3 ข้อ",
    goalOptions: [
      { label: "พลังงาน", value: "energy" },
      { label: "การนอน", value: "sleep" },
      { label: "สมาธิ", value: "focus" },
      { label: "อายุยืนอย่างมีคุณภาพ", value: "longevity" },
      { label: "ภูมิคุ้มกัน", value: "immunity" },
      { label: "ฟิตเนส", value: "fitness" },
      { label: "น้ำหนัก", value: "weight" },
      { label: "อารมณ์", value: "mood" },
      { label: "หัวใจ", value: "heart" },
      { label: "ข้อและกระดูก", value: "joints" },
      { label: "ผิว", value: "skin" },
      { label: "ฮอร์โมน", value: "hormones" }
    ],
    symptoms: "อาการปัจจุบัน",
    symptomHint: "เลือกได้ทุกข้อที่ตรงกับคุณ หากไม่มีอาการเด่น ให้เลือก รู้สึกดี",
    symptomOptions: [
      { label: "อ่อนเพลีย", value: "fatigue" },
      { label: "สมองล้า / คิดไม่ชัด", value: "brainfog" },
      { label: "อารมณ์", value: "mood" },
      { label: "ปวดข้อ", value: "joint" },
      { label: "ระบบย่อย", value: "digestion" },
      { label: "นอนหลับไม่ดี", value: "sleep" },
      { label: "เครียด", value: "stress" },
      { label: "ผิว", value: "skin" },
      { label: "ผมร่วง", value: "hair" },
      { label: "ความต้องการทางเพศต่ำ", value: "libido" },
      { label: "เป็นหวัดบ่อย", value: "colds" },
      { label: "รู้สึกดี", value: "great" }
    ]
  },
  precision: {
    title: "ความชอบของคุณ",
    subtitle: "กำหนดข้อจำกัดที่ใช้งานจริงก่อน แล้วค่อยเพิ่มข้อมูลเสริมถ้าคุณมี",
    budget: "งบอาหารเสริมต่อเดือน ( THB )",
    budgetOptions: [
      { label: "ต่ำกว่า 1,000", value: "u1000" },
      { label: "1,000-2,500", value: "1000-2500" },
      { label: "2,500-5,000", value: "2500-5000" },
      { label: "5,000+", value: "5000+" }
    ],
    maxPills: "จำนวนเม็ด / แคปซูลสูงสุด ( ต่อวัน )",
    maxPillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "ไม่จำกัด", value: "nolimit" }
    ],
    form: "รูปแบบที่ชอบ",
    formOptions: [
      { label: "แคปซูล", value: "capsules" },
      { label: "ผง / เชค", value: "powder" },
      { label: "กัมมี่", value: "gummies" },
      { label: "แบบผสมได้", value: "mixed" }
    ],
    optionalBanner: "ระดับความแม่นยำเพิ่มเติม",
    optionalBody: "เพิ่มรายละเอียดที่คุณรู้ เพื่อเติมความแม่นยำ 20% สุดท้าย",
    protein: "โปรตีน ( กรัม / กก. / วัน )",
    proteinOptions: [
      { label: "ต่ำกว่า 1", value: "u1" },
      { label: "1-1.5", value: "1-1.5" },
      { label: "1.5-2", value: "1.5-2" },
      { label: "มากกว่า 2", value: "2+" }
    ],
    family: "ประวัติครอบครัว",
    familyOptions: [
      { label: "โรคหัวใจ", value: "heart" },
      { label: "อัลไซเมอร์", value: "alzheimers" },
      { label: "เบาหวาน", value: "diabetes" },
      { label: "มะเร็ง", value: "cancer" },
      { label: "กระดูกพรุน", value: "osteoporosis" },
      { label: "ไม่มี", value: "none" }
    ],
    tracker: "อุปกรณ์ติดตามสุขภาพ",
    trackerOptions: [
      { label: "ไม่มีอุปกรณ์", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "อื่น ๆ", value: "other" }
    ],
    vo2: "VO2 max",
    vo2Estimate: "ตัวช่วยประเมิน VO2",
    vo2EstimateButton: "ใช้ค่าประเมิน",
    vo2EstimateNeeds: "ตอบเพศ อายุ ส่วนสูง น้ำหนัก และกิจกรรม เพื่อประเมิน VO2",
    vo2EstimateReady: (value) => `ประเมินได้ ${value} ml/kg/min จากคำตอบปัจจุบัน`,
    hrv: "ค่า HRV เฉลี่ย",
    labs: "ค่าแล็บล่าสุด",
    labsHint: "กรอกเฉพาะเมื่อมี หน่วยมีความสำคัญ",
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
    title: "ยาและข้อควรระวัง",
    subtitle: "ข้อมูลนี้ใช้สร้างข้อควรระวังและช่วยระบบตรวจความเหมาะสมแบบกำหนดตายตัว",
    medications: "คุณใช้ยาอยู่หรือไม่?",
    medicationHint: "ใช้เพื่อสร้างข้อควรระวังเท่านั้น",
    medicationOptions: [
      { label: "ไม่ใช้", value: "none" },
      { label: "ใช่", value: "yes" }
    ],
    medicationType: "ประเภทยา",
    medicationTypeOptions: [
      { label: "ยากลุ่มสแตติน", value: "statin" },
      { label: "เมตฟอร์มิน", value: "metformin" },
      { label: "ยา PPI / โอเมพราโซล", value: "ppi" },
      { label: "ยาขับปัสสาวะ", value: "diuretic" },
      { label: "ยาคุมกำเนิด", value: "contraceptive" },
      { label: "ยาต้านซึมเศร้า", value: "antidepressant" },
      { label: "ยาละลายลิ่มเลือด / แอสไพริน", value: "bloodthinner" },
      { label: "ยาไทรอยด์", value: "thyroid" },
      { label: "ยาความดัน", value: "bp" },
      { label: "คอร์ติโคสเตียรอยด์", value: "corticosteroid" },
      { label: "อื่น ๆ", value: "other" }
    ],
    otherMedPlaceholder: "โปรดระบุยาและใช้เพื่ออะไร",
    suppAllergies: "แพ้หรือไม่ทนต่อส่วนผสมอาหารเสริม",
    suppAllergyOptions: [
      { label: "ไม่ทราบว่ามี", value: "none" },
      { label: "ไอโอดีน", value: "iodine" },
      { label: "ธาตุเหล็ก", value: "iron" },
      { label: "CoQ10", value: "coq10" },
      { label: "วิตามินบี", value: "bvit" },
      { label: "มาจากถั่วเหลือง", value: "soyderived" },
      { label: "มาจากหอย / อาหารทะเลเปลือกแข็ง", value: "shellfishderived" },
      { label: "อื่น ๆ", value: "other" }
    ],
    kidney: "การทำงานของไต",
    kidneyOptions: [
      { label: "ไม่มีปัญหาที่ทราบ", value: "normal" },
      { label: "การทำงานลดลง", value: "reduced" },
      { label: "โรคไต", value: "disease" }
    ],
    liver: "ภาวะตับ",
    liverOptions: [
      { label: "ไม่มีปัญหาที่ทราบ", value: "normal" },
      { label: "มีภาวะเกี่ยวกับตับ", value: "condition" }
    ],
    surgery: "มีผ่าตัดใน 30 วันข้างหน้าหรือไม่?",
    surgeryOptions: [
      { label: "ไม่มี", value: "no" },
      { label: "มี", value: "yes" }
    ],
    antibiotics: "ใช้ยาปฏิชีวนะใน 3 เดือนที่ผ่านมาไหม?",
    antibioticsOptions: [
      { label: "ไม่", value: "no" },
      { label: "ใช่", value: "yes" }
    ],
    supplements: "อาหารเสริมที่ใช้อยู่ตอนนี้",
    supplementsOptions: [
      { label: "ไม่มี", value: "none" },
      { label: "มัลติวิตามินพื้นฐาน", value: "basic" },
      { label: "วิตามิน D3 / โอเมก้า-3", value: "d3omega" },
      { label: "หลายตัวแบบเจาะจง", value: "targeted" }
    ]
  },
  sectionNotes: [
    "ไม่มีคำตอบที่ถูกหรือผิด มีเพียงคำตอบที่ตรงกับความจริง บริบทที่ซื่อตรงช่วยให้สูตรพอดีกับคุณมากขึ้น และปลอดภัยขึ้นเมื่อใช้ร่วมกับสิ่งที่คุณรับประทานอยู่แล้ว",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: ["พื้นฐาน", "พื้นฐาน", "พื้นฐาน", "พื้นฐาน", "ความปลอดภัย", "เฉพาะตัว"],
  stages: ["เกี่ยวกับคุณ", "เป้าหมาย", "ชีวิตประจำวัน", "อาหาร", "ความปลอดภัย", "ความแม่นยำ"]
};
