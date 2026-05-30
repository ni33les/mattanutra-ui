import type { FoodFrequencyKey, LabField } from "@/components/assessment-flow-state";
export type Option = Readonly<{
  label: string;
  value: string;
}>;

export type ScaleOption = Option &
  Readonly<{
    tone: string;
  }>;

export type Copy = Readonly<{
  about: {
    age: string;
    ageOptions: Option[];
    country: string;
    countryOptions: Option[];
    femaleTitle: string;
    firstName: string;
    firstNameHint: string;
    firstNameOptional: string;
    flow: string;
    flowOptions: Option[];
    honestyBody: string;
    height: string;
    menopause: string;
    menopauseOptions: Option[];
    reproStatus: string;
    reproStatusOptions: Option[];
    sex: string;
    sexOptions: Option[];
    skin: string;
    skinOptions: Option[];
    subtitle: string;
    sun: string;
    sunOptions: Option[];
    sunscreen: string;
    sunscreenOptions: Option[];
    title: string;
    trustItems: readonly Readonly<{
      body: string;
      title: string;
    }>[];
    weight: string;
  };
  coach: Record<string, string>;
  daily: {
    activity: string;
    activityOptions: Option[];
    alcohol: string;
    alcoholOptions: Option[];
    caffeine: string;
    caffeineOptions: Option[];
    digCondition: string;
    digConditionOptions: Option[];
    digestion: string;
    digestionOptions: Option[];
    energy: string;
    energyOptions: ScaleOption[];
    sleepHrs: string;
    sleepOptions: Option[];
    smoking: string;
    smokingOptions: Option[];
    stress: string;
    stressOptions: ScaleOption[];
    subtitle: string;
    title: string;
  };
  fixedAction: {
    generate: string;
  };
  food: {
    allergies: string;
    allergyOptions: Option[];
    diet: string;
    dietOptions: Option[];
    disclosureBody: string;
    disclosureTitle: string;
    frequency: string;
    frequencyOptions: Record<FoodFrequencyKey, Option[]>;
    frequencyTitles: Record<FoodFrequencyKey, string>;
    subtitle: string;
    title: string;
  };
  goals: {
    goalHint: string;
    goalOptions: Option[];
    goals: string;
    subtitle: string;
    symptomHint: string;
    symptomOptions: Option[];
    symptoms: string;
    title: string;
  };
  precision: {
    budget: string;
    budgetOptions: Option[];
    family: string;
    familyOptions: Option[];
    form: string;
    formOptions: Option[];
    hrv: string;
    labs: string;
    labsHint: string;
    labFields: LabField[];
    maxPills: string;
    maxPillsOptions: Option[];
    optionalBanner: string;
    optionalBody: string;
    protein: string;
    proteinOptions: Option[];
    subtitle: string;
    title: string;
    tracker: string;
    trackerOptions: Option[];
    vo2: string;
    vo2Estimate: string;
    vo2EstimateButton: string;
    vo2EstimateNeeds: string;
    vo2EstimateReady: (value: number) => string;
  };
  safety: {
    antibiotics: string;
    antibioticsOptions: Option[];
    kidney: string;
    kidneyOptions: Option[];
    liver: string;
    liverOptions: Option[];
    medications: string;
    medicationHint: string;
    medicationOptions: Option[];
    medicationType: string;
    medicationTypeOptions: Option[];
    otherMedPlaceholder: string;
    suppAllergies: string;
    suppAllergyOptions: Option[];
    supplements: string;
    supplementsOptions: Option[];
    surgery: string;
    surgeryOptions: Option[];
    subtitle: string;
    title: string;
  };
  stagePhases: string[];
  sectionNotes: string[];
  stages: string[];
}>;
