import { labFields } from "@/components/assessment-flow-state";
import type { Copy, Option } from "@/components/assessment-flow-copy-types";

export const countryOptions: Option[] = [
  { label: "Thailand", value: "TH" },
  { label: "Singapore", value: "SG" },
  { label: "Malaysia", value: "MY" },
  { label: "Indonesia", value: "ID" },
  { label: "Philippines", value: "PH" },
  { label: "Vietnam", value: "VN" },
  { label: "Myanmar", value: "MM" },
  { label: "United States", value: "US" },
  { label: "Australia", value: "AU" },
  { label: "United Kingdom", value: "GB" },
  { label: "Canada", value: "CA" },
  { label: "Germany", value: "DE" },
  { label: "France", value: "FR" },
  { label: "Japan", value: "JP" },
  { label: "South Korea", value: "KR" },
  { label: "India", value: "IN" },
  { label: "China", value: "CN" },
  { label: "Other", value: "OTHER" }
];

export const en: Copy = {
  about: {
    title: "First, the basics about you",
    subtitle: "A few quick taps to start. This sets the baseline the rest of your formula is built on.",
    firstName: "First name",
    firstNameHint: "So we can personalise your Right Amount.",
    firstNameOptional: "Optional",
    honestyBody:
      "There are no right or wrong answers here, only true ones. The more honestly you answer, the more exactly your formula fits, and the safer it is alongside anything you already take.",
    sex: "Sex",
    sexOptions: [
      { label: "Male", value: "male" },
      { label: "Female", value: "female" }
    ],
    age: "Age",
    ageOptions: [
      { label: "18-25", value: "18-25" },
      { label: "26-35", value: "26-35" },
      { label: "36-45", value: "36-45" },
      { label: "46-55", value: "46-55" },
      { label: "56-65", value: "56-65" },
      { label: "66+", value: "66+" }
    ],
    height: "Height",
    weight: "Weight",
    skin: "Skin tone",
    skinOptions: [
      { label: "Skin tone 1", value: "I" },
      { label: "Skin tone 2", value: "II" },
      { label: "Skin tone 3", value: "III" },
      { label: "Skin tone 4", value: "IV" },
      { label: "Skin tone 5", value: "V" },
      { label: "Skin tone 6", value: "VI" }
    ],
    country: "Country",
    countryOptions,
    sun: "Sun exposure ( Min / day )",
    sunOptions: [
      { label: "Under 15", value: "u15" },
      { label: "15-30", value: "15-30" },
      { label: "30-60", value: "30-60" },
      { label: "60+", value: "60+" }
    ],
    sunscreen: "Sunscreen use",
    sunscreenOptions: [
      { label: "Rarely", value: "rarely" },
      { label: "Sometimes", value: "sometimes" },
      { label: "Daily", value: "daily" }
    ],
    femaleTitle: "Female health context",
    reproStatus: "Pregnancy / breastfeeding status",
    reproStatusOptions: [
      { label: "None", value: "none" },
      { label: "Trying to conceive", value: "ttc" },
      { label: "Pregnant", value: "pregnant" },
      { label: "Breastfeeding", value: "breastfeeding" }
    ],
    menopause: "Menopause stage",
    menopauseOptions: [
      { label: "Pre-menopause", value: "pre" },
      { label: "Perimenopause", value: "peri" },
      { label: "Post-menopause", value: "post" },
      { label: "Unsure", value: "unsure" }
    ],
    flow: "Menstrual flow",
    flowOptions: [
      { label: "No periods", value: "none" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Heavy", value: "heavy" }
    ],
    trustItems: [
      {
        body: "Every formula is screened against your medicines, labs, and Thai FDA registration.",
        title: "Reviewed for safety"
      },
      {
        body: "Your answers stay tied to your plan. We do not sell them or share them with advertisers.",
        title: "Private by default"
      },
      {
        body: "Guidance to support your goals, always shareable with your doctor.",
        title: "Wellness, not diagnosis"
      }
    ]
  },
  coach: {
    allergies: "Food allergy context keeps the supplement brief practical without adding a free-text avoidance field.",
    foodFrequency: "Food frequency improves micronutrient gap estimates without adding food matching back into the active product engine.",
    goals: "Choose up to three. The formulation uses these as priorities rather than trying to optimise everything equally.",
    labs: "Units matter. We keep the number and unit together before sending data to AI.",
    medications: "This is not for diagnosis. It gives the AI and deterministic safety layer the context needed to add cautions.",
    precision: "These optional fields move the last 20% of the precision meter.",
    sex: "Sex and reproductive context affect dose caution, iron logic, and product audience filtering.",
    sun: "Skin tone, sun, and sunscreen help estimate vitamin D context more honestly."
  },
  daily: {
    title: "Your daily life",
    subtitle: "This turns the formula from a generic stack into something that fits your routine.",
    sleepHrs: "Sleep per night ( hours )",
    sleepOptions: [
      { label: "Under 5", value: "u5" },
      { label: "5-6", value: "5-6" },
      { label: "6-7", value: "6-7" },
      { label: "7-8", value: "7-8" },
      { label: "8-9", value: "8-9" },
      { label: "Over 9", value: "9+" }
    ],
    energy: "Energy level",
    energyOptions: [
      { label: "Drained", value: "drained", tone: "Low" },
      { label: "Low", value: "low", tone: "Low" },
      { label: "OK", value: "ok", tone: "Mid" },
      { label: "Good", value: "good", tone: "High" },
      { label: "Excellent", value: "excellent", tone: "High" }
    ],
    activity: "Activity level",
    activityOptions: [
      { label: "Mostly sitting", value: "sitting" },
      { label: "Light", value: "light" },
      { label: "Moderate", value: "moderate" },
      { label: "Active", value: "active" },
      { label: "Athlete", value: "athlete" }
    ],
    stress: "Stress level",
    stressOptions: [
      { label: "Very low", value: "verylow", tone: "Low" },
      { label: "Low", value: "low", tone: "Low" },
      { label: "Moderate", value: "moderate", tone: "Mid" },
      { label: "High", value: "high", tone: "High" },
      { label: "Extreme", value: "extreme", tone: "High" }
    ],
    digestion: "Digestion",
    digestionOptions: [
      { label: "No issue", value: "none" },
      { label: "Bloating", value: "bloating" },
      { label: "Constipation", value: "constipation" },
      { label: "Loose stools", value: "loose" }
    ],
    digCondition: "Digestive condition",
    digConditionOptions: [
      { label: "None", value: "none" },
      { label: "IBS", value: "ibs" },
      { label: "Celiac", value: "celiac" },
      { label: "IBD", value: "ibd" },
      { label: "Bariatric surgery", value: "bariatric" }
    ],
    smoking: "Smoking",
    smokingOptions: [
      { label: "Never", value: "never" },
      { label: "Ex >5 years", value: "ex5+" },
      { label: "Ex <5 years", value: "ex5" },
      { label: "Occasional", value: "occasional" },
      { label: "Daily", value: "daily" }
    ],
    alcohol: "Alcohol ( Drinks / week )",
    alcoholOptions: [
      { label: "None", value: "none" },
      { label: "1-3", value: "1-3" },
      { label: "4-7", value: "4-7" },
      { label: "8+", value: "8+" }
    ],
    caffeine: "Caffeine ( Cups / day )",
    caffeineOptions: [
      { label: "None", value: "none" },
      { label: "1", value: "1" },
      { label: "2-3", value: "2-3" },
      { label: "4+", value: "4+" }
    ]
  },
  fixedAction: {
    generate: "Generate my health score"
  },
  food: {
    title: "Food & nutrition",
    subtitle: "Food context sharpens the supplement brief, even while product matching remains supplement-only.",
    diet: "Diet pattern",
    dietOptions: [
      { label: "No pattern", value: "none" },
      { label: "Processed", value: "processed" },
      { label: "Balanced", value: "balanced" },
      { label: "Whole foods", value: "whole" },
      { label: "Mediterranean", value: "mediterranean" },
      { label: "Plant-based", value: "plant" },
      { label: "Vegan", value: "vegan" },
      { label: "Carnivore", value: "carnivore" }
    ],
    frequency: "How often do you eat...",
    frequencyTitles: {
      dairy: "Dairy ( Servings / day )",
      eggs: "Eggs",
      fish: "Fatty fish",
      fruitveg: "Fruit & veg ( Servings / day )",
      legumes: "Legumes / nuts",
      redmeat: "Red meat ( Servings / week )"
    },
    frequencyOptions: {
      dairy: [
        { label: "Never", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      eggs: [
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "weekly" },
        { label: "Most days", value: "most" }
      ],
      fish: [
        { label: "Never", value: "never" },
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "once" },
        { label: "Often", value: "often" }
      ],
      fruitveg: [
        { label: "Not daily", value: "notdaily" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ],
      legumes: [
        { label: "Rarely", value: "rare" },
        { label: "Weekly", value: "weekly" },
        { label: "Most days", value: "most" }
      ],
      redmeat: [
        { label: "Never", value: "never" },
        { label: "1-2", value: "1-2" },
        { label: "3+", value: "3+" }
      ]
    },
    allergies: "Food allergies",
    allergyOptions: [
      { label: "None", value: "none" },
      { label: "Milk", value: "milk" },
      { label: "Eggs", value: "eggs" },
      { label: "Fish", value: "fish" },
      { label: "Shellfish", value: "shellfish" },
      { label: "Tree nuts", value: "treenuts" },
      { label: "Peanuts", value: "peanuts" },
      { label: "Wheat", value: "wheat" },
      { label: "Soy", value: "soy" },
      { label: "Sesame", value: "sesame" }
    ],
    disclosureTitle: "I confirm I have disclosed relevant allergies, conditions, medications and dietary restrictions.",
    disclosureBody: "MattaNutra guidance supports general wellness and does not replace medical advice."
  },
  goals: {
    title: "Your goals & how you feel",
    subtitle: "Your top priorities and current symptoms guide the order of the formulation.",
    goals: "Primary health goals",
    goalHint: "Pick up to 3",
    goalOptions: [
      { label: "Energy", value: "energy" },
      { label: "Sleep", value: "sleep" },
      { label: "Focus", value: "focus" },
      { label: "Longevity", value: "longevity" },
      { label: "Immunity", value: "immunity" },
      { label: "Fitness", value: "fitness" },
      { label: "Weight", value: "weight" },
      { label: "Mood", value: "mood" },
      { label: "Heart", value: "heart" },
      { label: "Joints", value: "joints" },
      { label: "Skin", value: "skin" },
      { label: "Hormones", value: "hormones" }
    ],
    symptoms: "Current symptoms",
    symptomHint: "Select all that apply. Choose Feeling great by itself if nothing stands out.",
    symptomOptions: [
      { label: "Fatigue", value: "fatigue" },
      { label: "Brain fog", value: "brainfog" },
      { label: "Mood", value: "mood" },
      { label: "Joint pain", value: "joint" },
      { label: "Digestion", value: "digestion" },
      { label: "Poor sleep", value: "sleep" },
      { label: "Stress", value: "stress" },
      { label: "Skin", value: "skin" },
      { label: "Hair loss", value: "hair" },
      { label: "Low libido", value: "libido" },
      { label: "Frequent colds", value: "colds" },
      { label: "Feeling great", value: "great" }
    ]
  },
  precision: {
    title: "Your preferences",
    subtitle: "Set practical constraints first, then add optional precision if you have it.",
    budget: "Monthly supplement budget ( THB )",
    budgetOptions: [
      { label: "Under 1,000", value: "u1000" },
      { label: "1,000-2,500", value: "1000-2500" },
      { label: "2,500-5,000", value: "2500-5000" },
      { label: "5,000+", value: "5000+" }
    ],
    maxPills: "Max pills / capsules ( Per day )",
    maxPillsOptions: [
      { label: "1-3", value: "1-3" },
      { label: "4-6", value: "4-6" },
      { label: "7-10", value: "7-10" },
      { label: "No limit", value: "nolimit" }
    ],
    form: "Preferred form",
    formOptions: [
      { label: "Capsules", value: "capsules" },
      { label: "Powder / shake", value: "powder" },
      { label: "Gummies", value: "gummies" },
      { label: "Mixed is fine", value: "mixed" }
    ],
    optionalBanner: "Optional precision tier",
    optionalBody: "Add any details you know to move the final 20% of precision.",
    protein: "Protein ( G / kg / day )",
    proteinOptions: [
      { label: "Under 1", value: "u1" },
      { label: "1-1.5", value: "1-1.5" },
      { label: "1.5-2", value: "1.5-2" },
      { label: "Over 2", value: "2+" }
    ],
    family: "Family history",
    familyOptions: [
      { label: "Heart disease", value: "heart" },
      { label: "Alzheimer's", value: "alzheimers" },
      { label: "Diabetes", value: "diabetes" },
      { label: "Cancer", value: "cancer" },
      { label: "Osteoporosis", value: "osteoporosis" },
      { label: "None", value: "none" }
    ],
    tracker: "Fitness tracker",
    trackerOptions: [
      { label: "No wearable", value: "none" },
      { label: "Garmin", value: "garmin" },
      { label: "Oura", value: "oura" },
      { label: "WHOOP", value: "whoop" },
      { label: "Apple Watch", value: "apple" },
      { label: "Fitbit", value: "fitbit" },
      { label: "Other", value: "other" }
    ],
    vo2: "VO2 max",
    vo2Estimate: "VO2 estimator",
    vo2EstimateButton: "Use estimate",
    vo2EstimateNeeds: "Answer sex, age, height, weight and activity to estimate VO2.",
    vo2EstimateReady: (value) => `Estimated ${value} ml/kg/min from your current answers.`,
    hrv: "Average HRV",
    labs: "Recent lab values",
    labsHint: "Only if you have them. Units matter.",
    labFields
  },
  safety: {
    title: "Medications & safety",
    subtitle: "These answers are used for cautions and deterministic safety checks.",
    medications: "Do you take any medications?",
    medicationHint: "Used for cautions only.",
    medicationOptions: [
      { label: "None", value: "none" },
      { label: "Yes", value: "yes" }
    ],
    medicationType: "Medication type(s)",
    medicationTypeOptions: [
      { label: "Statin", value: "statin" },
      { label: "Metformin", value: "metformin" },
      { label: "PPI / Omeprazole", value: "ppi" },
      { label: "Diuretic", value: "diuretic" },
      { label: "Contraceptive pill", value: "contraceptive" },
      { label: "Antidepressant", value: "antidepressant" },
      { label: "Blood thinner / aspirin", value: "bloodthinner" },
      { label: "Thyroid medication", value: "thyroid" },
      { label: "Blood pressure", value: "bp" },
      { label: "Corticosteroid", value: "corticosteroid" },
      { label: "Other", value: "other" }
    ],
    otherMedPlaceholder: "Please describe the medication and what it is for",
    suppAllergies: "Supplement ingredient allergies or intolerances",
    suppAllergyOptions: [
      { label: "None known", value: "none" },
      { label: "Iodine", value: "iodine" },
      { label: "Iron", value: "iron" },
      { label: "CoQ10", value: "coq10" },
      { label: "B vitamins", value: "bvit" },
      { label: "Soy-derived", value: "soyderived" },
      { label: "Shellfish-derived", value: "shellfishderived" },
      { label: "Other", value: "other" }
    ],
    kidney: "Kidney function",
    kidneyOptions: [
      { label: "No known issue", value: "normal" },
      { label: "Reduced function", value: "reduced" },
      { label: "Kidney disease", value: "disease" }
    ],
    liver: "Liver condition",
    liverOptions: [
      { label: "No known issue", value: "normal" },
      { label: "Liver condition", value: "condition" }
    ],
    surgery: "Surgery in the next 30 days?",
    surgeryOptions: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    antibiotics: "Antibiotics in the last 3 months?",
    antibioticsOptions: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" }
    ],
    supplements: "Supplements you take now",
    supplementsOptions: [
      { label: "None", value: "none" },
      { label: "Basic multi", value: "basic" },
      { label: "D3 / Omega-3", value: "d3omega" },
      { label: "Several targeted", value: "targeted" }
    ]
  },
  sectionNotes: [
    "The more we understand you, the better our recommendations become.",
    "",
    "",
    "",
    "",
    ""
  ],
  stagePhases: ["It's all you", "Foundation", "Foundation", "Foundation", "Safety", "Personalise"],
  stages: ["About you", "Goals", "Daily life", "Food", "Safety", "Precision"]
};
