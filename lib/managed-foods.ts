import type { Locale } from "@/lib/i18n";

export type ManagedFoodSeed = Readonly<{
  category: Readonly<Record<Locale, string>>;
  imageAlt: Readonly<Record<Locale, string>>;
  imagePath: string;
  imageSource: string;
  name: Readonly<Record<Locale, string>>;
  normalizedName: string;
  primaryUseCase: Readonly<Record<Locale, string>>;
}>;

export const foodGapSupportVersion = "food-gap:v1" as const;
export const managedFoodImageDirectory = "/foods" as const;

export const managedFoodSeeds = [
  {
    category: { en: "Fermented foods", th: "อาหารหมัก", "zh-CN": "发酵食品" },
    imageAlt: { en: "Kimchi in a small bowl", th: "กิมจิในถ้วยเล็ก", "zh-CN": "小碗里的泡菜" },
    imagePath: "/foods/kimchi.webp",
    imageSource: "local_seed",
    name: { en: "Kimchi", th: "กิมจิ", "zh-CN": "泡菜" },
    normalizedName: "kimchi",
    primaryUseCase: { en: "Fermented vegetable", th: "ผักหมักสำหรับเพิ่มความหลากหลายของจุลินทรีย์", "zh-CN": "有助于增加微生物多样性的发酵蔬菜" }
  },
  {
    category: { en: "Fermented foods", th: "อาหารหมัก", "zh-CN": "发酵食品" },
    imageAlt: { en: "Plain unsweetened yogurt", th: "โยเกิร์ตรสธรรมชาติไม่หวาน", "zh-CN": "原味无糖酸奶" },
    imagePath: "/foods/unsweetened_yogurt.webp",
    imageSource: "local_seed",
    name: { en: "Unsweetened yogurt", th: "โยเกิร์ตไม่หวาน", "zh-CN": "无糖酸奶" },
    normalizedName: "unsweetened_yogurt",
    primaryUseCase: { en: "Protein and live culture food", th: "แหล่งโปรตีนและจุลินทรีย์ที่ใช้ง่าย", "zh-CN": "方便的蛋白质和活菌食物" }
  },
  {
    category: { en: "Fish", th: "ปลา", "zh-CN": "鱼类" },
    imageAlt: { en: "Salmon fillet", th: "ชิ้นปลาแซลมอน", "zh-CN": "三文鱼鱼排" },
    imagePath: "/foods/salmon.webp",
    imageSource: "local_seed",
    name: { en: "Salmon", th: "ปลาแซลมอน", "zh-CN": "三文鱼" },
    normalizedName: "salmon",
    primaryUseCase: { en: "Omega-3 rich fish", th: "ปลาที่มีโอเมกา 3", "zh-CN": "富含 Omega-3 的鱼类" }
  },
  {
    category: { en: "Fish", th: "ปลา", "zh-CN": "鱼类" },
    imageAlt: { en: "Sardines on a plate", th: "ปลาซาร์ดีนบนจาน", "zh-CN": "盘中的沙丁鱼" },
    imagePath: "/foods/sardines.webp",
    imageSource: "local_seed",
    name: { en: "Sardines", th: "ปลาซาร์ดีน", "zh-CN": "沙丁鱼" },
    normalizedName: "sardines",
    primaryUseCase: { en: "Omega-3 and calcium rich fish", th: "ปลาเล็กที่มีโอเมกา 3 และแคลเซียม", "zh-CN": "富含 Omega-3 和钙的小鱼" }
  },
  {
    category: { en: "Fruit and vegetables", th: "ผักและผลไม้", "zh-CN": "水果和蔬菜" },
    imageAlt: { en: "Fresh papaya slices", th: "ชิ้นมะละกอสุก", "zh-CN": "新鲜木瓜片" },
    imagePath: "/foods/papaya.webp",
    imageSource: "local_seed",
    name: { en: "Papaya", th: "มะละกอ", "zh-CN": "木瓜" },
    normalizedName: "papaya",
    primaryUseCase: { en: "Thai fruit rich in carotenoids", th: "ผลไม้ไทยที่มีแคโรทีนอยด์", "zh-CN": "富含类胡萝卜素的热带水果" }
  },
  {
    category: { en: "Herbs and spices", th: "สมุนไพรและเครื่องเทศ", "zh-CN": "草本和香料" },
    imageAlt: { en: "Turmeric root and powder", th: "ขมิ้นสดและผงขมิ้น", "zh-CN": "姜黄根和姜黄粉" },
    imagePath: "/foods/turmeric.webp",
    imageSource: "local_seed",
    name: { en: "Turmeric", th: "ขมิ้น", "zh-CN": "姜黄" },
    normalizedName: "turmeric",
    primaryUseCase: { en: "Culinary spice", th: "เครื่องเทศสำหรับประกอบอาหาร", "zh-CN": "日常烹调用香料" }
  },
  {
    category: { en: "Protein foods", th: "อาหารโปรตีน", "zh-CN": "蛋白质食物" },
    imageAlt: { en: "Tofu cubes", th: "เต้าหู้หั่นชิ้น", "zh-CN": "豆腐块" },
    imagePath: "/foods/tofu.webp",
    imageSource: "local_seed",
    name: { en: "Tofu", th: "เต้าหู้", "zh-CN": "豆腐" },
    normalizedName: "tofu",
    primaryUseCase: { en: "Soy-based protein", th: "โปรตีนจากถั่วเหลือง", "zh-CN": "大豆来源蛋白质" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง", "zh-CN": "豆类" },
    imageAlt: { en: "Cooked chickpeas", th: "ถั่วลูกไก่ปรุงสุก", "zh-CN": "煮熟的鹰嘴豆" },
    imagePath: "/foods/chickpeas.webp",
    imageSource: "local_seed",
    name: { en: "Chickpeas", th: "ถั่วลูกไก่", "zh-CN": "鹰嘴豆" },
    normalizedName: "chickpeas",
    primaryUseCase: { en: "Fiber and plant protein", th: "ใยอาหารและโปรตีนจากพืช", "zh-CN": "膳食纤维和植物蛋白" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง", "zh-CN": "豆类" },
    imageAlt: { en: "Cooked lentils", th: "เลนทิลปรุงสุก", "zh-CN": "煮熟的小扁豆" },
    imagePath: "/foods/lentils.webp",
    imageSource: "local_seed",
    name: { en: "Lentils", th: "เลนทิล", "zh-CN": "小扁豆" },
    normalizedName: "lentils",
    primaryUseCase: { en: "Fiber and plant protein", th: "ใยอาหารและโปรตีนจากพืช", "zh-CN": "膳食纤维和植物蛋白" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง", "zh-CN": "豆类" },
    imageAlt: { en: "Mung beans", th: "ถั่วเขียว", "zh-CN": "绿豆" },
    imagePath: "/foods/mung_beans.webp",
    imageSource: "local_seed",
    name: { en: "Mung beans", th: "ถั่วเขียว", "zh-CN": "绿豆" },
    normalizedName: "mung_beans",
    primaryUseCase: { en: "Thai-friendly pulse option", th: "ถั่วที่เข้ากับอาหารไทยได้ง่าย", "zh-CN": "容易融入亚洲饮食的豆类选择" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช", "zh-CN": "种子" },
    imageAlt: { en: "Chia seeds", th: "เมล็ดเจีย", "zh-CN": "奇亚籽" },
    imagePath: "/foods/chia_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Chia seeds", th: "เมล็ดเจีย", "zh-CN": "奇亚籽" },
    normalizedName: "chia_seeds",
    primaryUseCase: { en: "Fiber and omega-3 rich seed", th: "เมล็ดพืชที่มีใยอาหารและโอเมกา 3", "zh-CN": "富含膳食纤维和 Omega-3 的种子" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช", "zh-CN": "种子" },
    imageAlt: { en: "Ground flaxseed", th: "เมล็ดแฟลกซ์บด", "zh-CN": "研磨亚麻籽" },
    imagePath: "/foods/flaxseed.webp",
    imageSource: "local_seed",
    name: { en: "Flaxseed", th: "เมล็ดแฟลกซ์", "zh-CN": "亚麻籽" },
    normalizedName: "flaxseed",
    primaryUseCase: { en: "Fiber and lignans", th: "ใยอาหารและลิกแนน", "zh-CN": "膳食纤维和木脂素" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช", "zh-CN": "种子" },
    imageAlt: { en: "Pumpkin seeds", th: "เมล็ดฟักทอง", "zh-CN": "南瓜籽" },
    imagePath: "/foods/pumpkin_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Pumpkin seeds", th: "เมล็ดฟักทอง", "zh-CN": "南瓜籽" },
    normalizedName: "pumpkin_seeds",
    primaryUseCase: { en: "Magnesium and zinc rich seed", th: "เมล็ดพืชที่มีแมกนีเซียมและสังกะสี", "zh-CN": "富含镁和锌的种子" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช", "zh-CN": "种子" },
    imageAlt: { en: "Sesame seeds", th: "เมล็ดงา", "zh-CN": "芝麻" },
    imagePath: "/foods/sesame_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Sesame seeds", th: "เมล็ดงา", "zh-CN": "芝麻" },
    normalizedName: "sesame_seeds",
    primaryUseCase: { en: "Mineral-rich seed", th: "เมล็ดพืชที่มีแร่ธาตุ", "zh-CN": "富含矿物质的种子" }
  },
  {
    category: { en: "Teas", th: "ชา", "zh-CN": "茶饮" },
    imageAlt: { en: "Cup of ginger tea", th: "ชาขิงหนึ่งถ้วย", "zh-CN": "一杯姜茶" },
    imagePath: "/foods/ginger_tea.webp",
    imageSource: "local_seed",
    name: { en: "Ginger tea", th: "ชาขิง", "zh-CN": "姜茶" },
    normalizedName: "ginger_tea",
    primaryUseCase: { en: "Digestive comfort", th: "เครื่องดื่มอุ่นที่ช่วยให้มื้ออาหารสบายขึ้น", "zh-CN": "温热饮品，帮助餐后更舒适" }
  },
  {
    category: { en: "Teas", th: "ชา", "zh-CN": "茶饮" },
    imageAlt: { en: "Cup of green tea", th: "ชาเขียวหนึ่งถ้วย", "zh-CN": "一杯绿茶" },
    imagePath: "/foods/green_tea.webp",
    imageSource: "local_seed",
    name: { en: "Green tea", th: "ชาเขียว", "zh-CN": "绿茶" },
    normalizedName: "green_tea",
    primaryUseCase: { en: "Polyphenol-rich drink", th: "เครื่องดื่มที่มีโพลีฟีนอล", "zh-CN": "富含多酚的饮品" }
  },
  {
    category: { en: "Thai staples", th: "วัตถุดิบไทย", "zh-CN": "泰式常用食材" },
    imageAlt: { en: "Holy basil leaves", th: "ใบกะเพรา", "zh-CN": "圣罗勒叶" },
    imagePath: "/foods/holy_basil.webp",
    imageSource: "local_seed",
    name: { en: "Holy basil", th: "กะเพรา", "zh-CN": "圣罗勒" },
    normalizedName: "holy_basil",
    primaryUseCase: { en: "Thai herb", th: "สมุนไพรไทยที่ใช้ในอาหารประจำวัน", "zh-CN": "日常泰式烹调草本" }
  },
  {
    category: { en: "Thai staples", th: "วัตถุดิบไทย", "zh-CN": "泰式常用食材" },
    imageAlt: { en: "Moringa leaves", th: "ใบมะรุม", "zh-CN": "辣木叶" },
    imagePath: "/foods/moringa_leaves.webp",
    imageSource: "local_seed",
    name: { en: "Moringa leaves", th: "ใบมะรุม", "zh-CN": "辣木叶" },
    normalizedName: "moringa_leaves",
    primaryUseCase: { en: "Leafy green Thai ingredient", th: "ผักใบเขียวแบบไทย", "zh-CN": "泰式绿叶食材" }
  },
  {
    category: { en: "Whole grains", th: "ธัญพืชไม่ขัดสี", "zh-CN": "全谷物" },
    imageAlt: { en: "Cooked brown rice", th: "ข้าวกล้องหุงสุก", "zh-CN": "煮熟的糙米" },
    imagePath: "/foods/brown_rice.webp",
    imageSource: "local_seed",
    name: { en: "Brown rice", th: "ข้าวกล้อง", "zh-CN": "糙米" },
    normalizedName: "brown_rice",
    primaryUseCase: { en: "Whole-grain staple", th: "อาหารหลักจากธัญพืชไม่ขัดสี", "zh-CN": "全谷物主食" }
  },
  {
    category: { en: "Whole grains", th: "ธัญพืชไม่ขัดสี", "zh-CN": "全谷物" },
    imageAlt: { en: "Oats in a bowl", th: "ข้าวโอ๊ตในชาม", "zh-CN": "碗里的燕麦" },
    imagePath: "/foods/oats.webp",
    imageSource: "local_seed",
    name: { en: "Oats", th: "ข้าวโอ๊ต", "zh-CN": "燕麦" },
    normalizedName: "oats",
    primaryUseCase: { en: "Beta-glucan fiber", th: "ธัญพืชที่มีใยอาหารเบต้ากลูแคน", "zh-CN": "含 β-葡聚糖纤维的谷物" }
  }
] as const satisfies readonly ManagedFoodSeed[];

export const managedFoodSeedByNormalizedName = new Map(
  managedFoodSeeds.map((food) => [food.normalizedName, food])
);

export function managedFoodImagePath(normalizedName: string) {
  return `${managedFoodImageDirectory}/${normalizedName}.webp`;
}

export function localizedManagedFoodSeedText(
  seed: ManagedFoodSeed,
  key: "category" | "imageAlt" | "name" | "primaryUseCase",
  locale: Locale
) {
  return seed[key][locale] || seed[key].en;
}
