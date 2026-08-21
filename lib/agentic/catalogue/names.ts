export const MEDICATION_ALIASES: Record<string, string> = {
  apixaban: "apixaban",
  eliquis: "apixaban"
};

export const CONDITION_ALIASES: Record<string, string> = {
  af: "atrial_fibrillation",
  atrial_fibrillation: "atrial_fibrillation",
  ckd: "ckd",
  chronic_kidney_disease: "ckd"
};

export const RECOGNISED_MEDICATION_CODES = ["apixaban", "eliquis"] as const;

export const RECOGNISED_CONDITION_CODES = [
  "af",
  "atrial_fibrillation",
  "ckd",
  "chronic_kidney_disease"
] as const;
