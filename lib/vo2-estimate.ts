export type Vo2MaxEstimateInput = Readonly<{
  activity: string;
  age: string;
  heightCm: string;
  sex: string;
  weightKg: string;
}>;

function numericAnswer(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function ageEstimate(value: string) {
  const direct = numericAnswer(value);

  if (direct !== null) {
    return direct;
  }

  return {
    "18-25": 22,
    "26-35": 31,
    "36-45": 41,
    "46-55": 51,
    "56-65": 61,
    "66+": 66
  }[value] ?? null;
}

export function estimateVo2Max(answers: Vo2MaxEstimateInput) {
  const age = ageEstimate(answers.age);
  const heightCm = numericAnswer(answers.heightCm);
  const weightKg = numericAnswer(answers.weightKg);
  const sexFactor = answers.sex === "male" ? 1 : answers.sex === "female" ? 0 : null;
  const activityRating = {
    active: 6,
    athlete: 7,
    light: 2,
    moderate: 4,
    sedentary: 0,
    sitting: 0
  }[answers.activity];

  if (
    age === null ||
    heightCm === null ||
    weightKg === null ||
    sexFactor === null ||
    activityRating === undefined ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return null;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const estimate =
    56.363 +
    1.921 * activityRating -
    0.381 * age -
    0.754 * bmi +
    10.987 * sexFactor;

  return Math.min(70, Math.max(18, Math.round(estimate)));
}
