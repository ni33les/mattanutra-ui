import type { Locale } from "@/lib/i18n";

export type ManagedFoodSeed = Readonly<{
  category: Readonly<Record<"en" | "th", string>>;
  imageAlt: Readonly<Record<"en" | "th", string>>;
  imagePath: string;
  imageSource: string;
  name: Readonly<Record<"en" | "th", string>>;
  normalizedName: string;
  primaryUseCase: Readonly<Record<"en" | "th", string>>;
}>;

export const foodGapSupportVersion = "food-gap:v1" as const;
export const managedFoodImageDirectory = "/foods" as const;

export const managedFoodSeeds = [
  {
    category: { en: "Fermented foods", th: "อาหารหมัก" },
    imageAlt: { en: "Kimchi in a small bowl", th: "กิมจิในถ้วยเล็ก" },
    imagePath: "/foods/kimchi.webp",
    imageSource: "local_seed",
    name: { en: "Kimchi", th: "กิมจิ" },
    normalizedName: "kimchi",
    primaryUseCase: { en: "Fermented vegetable", th: "ผักหมักสำหรับเพิ่มความหลากหลายของจุลินทรีย์" }
  },
  {
    category: { en: "Fermented foods", th: "อาหารหมัก" },
    imageAlt: { en: "Plain unsweetened yogurt", th: "โยเกิร์ตรสธรรมชาติไม่หวาน" },
    imagePath: "/foods/unsweetened_yogurt.webp",
    imageSource: "local_seed",
    name: { en: "Unsweetened yogurt", th: "โยเกิร์ตไม่หวาน" },
    normalizedName: "unsweetened_yogurt",
    primaryUseCase: { en: "Protein and live culture food", th: "แหล่งโปรตีนและจุลินทรีย์ที่ใช้ง่าย" }
  },
  {
    category: { en: "Fish", th: "ปลา" },
    imageAlt: { en: "Salmon fillet", th: "ชิ้นปลาแซลมอน" },
    imagePath: "/foods/salmon.webp",
    imageSource: "local_seed",
    name: { en: "Salmon", th: "ปลาแซลมอน" },
    normalizedName: "salmon",
    primaryUseCase: { en: "Omega-3 rich fish", th: "ปลาที่มีโอเมกา 3" }
  },
  {
    category: { en: "Fish", th: "ปลา" },
    imageAlt: { en: "Sardines on a plate", th: "ปลาซาร์ดีนบนจาน" },
    imagePath: "/foods/sardines.webp",
    imageSource: "local_seed",
    name: { en: "Sardines", th: "ปลาซาร์ดีน" },
    normalizedName: "sardines",
    primaryUseCase: { en: "Omega-3 and calcium rich fish", th: "ปลาเล็กที่มีโอเมกา 3 และแคลเซียม" }
  },
  {
    category: { en: "Fruit and vegetables", th: "ผักและผลไม้" },
    imageAlt: { en: "Fresh papaya slices", th: "ชิ้นมะละกอสุก" },
    imagePath: "/foods/papaya.webp",
    imageSource: "local_seed",
    name: { en: "Papaya", th: "มะละกอ" },
    normalizedName: "papaya",
    primaryUseCase: { en: "Thai fruit rich in carotenoids", th: "ผลไม้ไทยที่มีแคโรทีนอยด์" }
  },
  {
    category: { en: "Herbs and spices", th: "สมุนไพรและเครื่องเทศ" },
    imageAlt: { en: "Turmeric root and powder", th: "ขมิ้นสดและผงขมิ้น" },
    imagePath: "/foods/turmeric.webp",
    imageSource: "local_seed",
    name: { en: "Turmeric", th: "ขมิ้น" },
    normalizedName: "turmeric",
    primaryUseCase: { en: "Culinary spice", th: "เครื่องเทศสำหรับประกอบอาหาร" }
  },
  {
    category: { en: "Protein foods", th: "อาหารโปรตีน" },
    imageAlt: { en: "Tofu cubes", th: "เต้าหู้หั่นชิ้น" },
    imagePath: "/foods/tofu.webp",
    imageSource: "local_seed",
    name: { en: "Tofu", th: "เต้าหู้" },
    normalizedName: "tofu",
    primaryUseCase: { en: "Soy-based protein", th: "โปรตีนจากถั่วเหลือง" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง" },
    imageAlt: { en: "Cooked chickpeas", th: "ถั่วลูกไก่ปรุงสุก" },
    imagePath: "/foods/chickpeas.webp",
    imageSource: "local_seed",
    name: { en: "Chickpeas", th: "ถั่วลูกไก่" },
    normalizedName: "chickpeas",
    primaryUseCase: { en: "Fiber and plant protein", th: "ใยอาหารและโปรตีนจากพืช" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง" },
    imageAlt: { en: "Cooked lentils", th: "เลนทิลปรุงสุก" },
    imagePath: "/foods/lentils.webp",
    imageSource: "local_seed",
    name: { en: "Lentils", th: "เลนทิล" },
    normalizedName: "lentils",
    primaryUseCase: { en: "Fiber and plant protein", th: "ใยอาหารและโปรตีนจากพืช" }
  },
  {
    category: { en: "Pulses", th: "ถั่วเมล็ดแห้ง" },
    imageAlt: { en: "Mung beans", th: "ถั่วเขียว" },
    imagePath: "/foods/mung_beans.webp",
    imageSource: "local_seed",
    name: { en: "Mung beans", th: "ถั่วเขียว" },
    normalizedName: "mung_beans",
    primaryUseCase: { en: "Thai-friendly pulse option", th: "ถั่วที่เข้ากับอาหารไทยได้ง่าย" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช" },
    imageAlt: { en: "Chia seeds", th: "เมล็ดเจีย" },
    imagePath: "/foods/chia_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Chia seeds", th: "เมล็ดเจีย" },
    normalizedName: "chia_seeds",
    primaryUseCase: { en: "Fiber and omega-3 rich seed", th: "เมล็ดพืชที่มีใยอาหารและโอเมกา 3" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช" },
    imageAlt: { en: "Ground flaxseed", th: "เมล็ดแฟลกซ์บด" },
    imagePath: "/foods/flaxseed.webp",
    imageSource: "local_seed",
    name: { en: "Flaxseed", th: "เมล็ดแฟลกซ์" },
    normalizedName: "flaxseed",
    primaryUseCase: { en: "Fiber and lignans", th: "ใยอาหารและลิกแนน" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช" },
    imageAlt: { en: "Pumpkin seeds", th: "เมล็ดฟักทอง" },
    imagePath: "/foods/pumpkin_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Pumpkin seeds", th: "เมล็ดฟักทอง" },
    normalizedName: "pumpkin_seeds",
    primaryUseCase: { en: "Magnesium and zinc rich seed", th: "เมล็ดพืชที่มีแมกนีเซียมและสังกะสี" }
  },
  {
    category: { en: "Seeds", th: "เมล็ดพืช" },
    imageAlt: { en: "Sesame seeds", th: "เมล็ดงา" },
    imagePath: "/foods/sesame_seeds.webp",
    imageSource: "local_seed",
    name: { en: "Sesame seeds", th: "เมล็ดงา" },
    normalizedName: "sesame_seeds",
    primaryUseCase: { en: "Mineral-rich seed", th: "เมล็ดพืชที่มีแร่ธาตุ" }
  },
  {
    category: { en: "Teas", th: "ชา" },
    imageAlt: { en: "Cup of ginger tea", th: "ชาขิงหนึ่งถ้วย" },
    imagePath: "/foods/ginger_tea.webp",
    imageSource: "local_seed",
    name: { en: "Ginger tea", th: "ชาขิง" },
    normalizedName: "ginger_tea",
    primaryUseCase: { en: "Digestive comfort", th: "เครื่องดื่มอุ่นที่ช่วยให้มื้ออาหารสบายขึ้น" }
  },
  {
    category: { en: "Teas", th: "ชา" },
    imageAlt: { en: "Cup of green tea", th: "ชาเขียวหนึ่งถ้วย" },
    imagePath: "/foods/green_tea.webp",
    imageSource: "local_seed",
    name: { en: "Green tea", th: "ชาเขียว" },
    normalizedName: "green_tea",
    primaryUseCase: { en: "Polyphenol-rich drink", th: "เครื่องดื่มที่มีโพลีฟีนอล" }
  },
  {
    category: { en: "Thai staples", th: "วัตถุดิบไทย" },
    imageAlt: { en: "Holy basil leaves", th: "ใบกะเพรา" },
    imagePath: "/foods/holy_basil.webp",
    imageSource: "local_seed",
    name: { en: "Holy basil", th: "กะเพรา" },
    normalizedName: "holy_basil",
    primaryUseCase: { en: "Thai herb", th: "สมุนไพรไทยที่ใช้ในอาหารประจำวัน" }
  },
  {
    category: { en: "Thai staples", th: "วัตถุดิบไทย" },
    imageAlt: { en: "Moringa leaves", th: "ใบมะรุม" },
    imagePath: "/foods/moringa_leaves.webp",
    imageSource: "local_seed",
    name: { en: "Moringa leaves", th: "ใบมะรุม" },
    normalizedName: "moringa_leaves",
    primaryUseCase: { en: "Leafy green Thai ingredient", th: "ผักใบเขียวแบบไทย" }
  },
  {
    category: { en: "Whole grains", th: "ธัญพืชไม่ขัดสี" },
    imageAlt: { en: "Cooked brown rice", th: "ข้าวกล้องหุงสุก" },
    imagePath: "/foods/brown_rice.webp",
    imageSource: "local_seed",
    name: { en: "Brown rice", th: "ข้าวกล้อง" },
    normalizedName: "brown_rice",
    primaryUseCase: { en: "Whole-grain staple", th: "อาหารหลักจากธัญพืชไม่ขัดสี" }
  },
  {
    category: { en: "Whole grains", th: "ธัญพืชไม่ขัดสี" },
    imageAlt: { en: "Oats in a bowl", th: "ข้าวโอ๊ตในชาม" },
    imagePath: "/foods/oats.webp",
    imageSource: "local_seed",
    name: { en: "Oats", th: "ข้าวโอ๊ต" },
    normalizedName: "oats",
    primaryUseCase: { en: "Beta-glucan fiber", th: "ธัญพืชที่มีใยอาหารเบต้ากลูแคน" }
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
