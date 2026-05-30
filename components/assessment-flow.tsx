"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BeakerIcon } from "@heroicons/react/20/solid";
import {
  AssessmentIntroNote,
  AssessmentStepper,
  AssessmentTrustStrip,
  PrecisionGauge,
  QuestionnairePrecisionMeter
} from "@/components/assessment-flow-panels";
import {
  assessmentUiCopy,
  copies,
  gaugeLabelsByLocale
} from "@/components/assessment-flow-copy";
import {
  buildInitialAnswers,
  buildRandomDevAnswers,
  clampFirstNameInput,
  foodFrequencyKeys,
  formatHeightImperial,
  formatWeightImperial,
  hasAny,
  hasText,
  isPregnantOrBreastfeeding,
  optionalChecks,
  precisionProgress,
  selectedOther,
  type Answers,
  type FoodFrequencyKey
} from "@/components/assessment-flow-state";
import {
  OptionGrid,
  PillGroup,
  ProcessingPanel,
  Question,
  ScaleGroup,
  SectionCard,
  SkinToneGroup
} from "@/components/nutrition-flow/ui";
import { HealthScorePaymentPanel } from "@/components/nutrition-flow/healthscore-panel";
import {
  ASSESSMENT_FIRST_NAME_MAX_LENGTH,
  normalizeAssessmentFirstName
} from "@/lib/assessment-first-name";
import { getBpmPayload, trackBpmEvent } from "@/lib/bpm-client";
import type { HealthScoreResult } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import { estimateVo2Max } from "@/lib/vo2-estimate";

const buildTimeDevShortcutEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_SHOW_DEV_SHORTCUT === "true";

type AssessmentFlowProps = Readonly<{
  initialStage?: "healthscore" | "quiz";
  locale: Locale;
  paymentId?: string;
  prefillAnswers?: unknown;
  returningHealthScore?: HealthScoreResult | null;
  returningPlanId?: string;
  showDevShortcut?: boolean;
}>;

type AssessmentQuestion = Readonly<{
  content: React.ReactNode;
  hint?: string;
  id: string;
  isAnswered: boolean;
  label: string;
  why?: string;
}>;

type AssessmentSection = Readonly<{
  complete: boolean;
  description: string;
  id: string;
  questions: AssessmentQuestion[];
  title: string;
}>;

type ProcessingStepState = "active" | "complete" | "failed" | "pending";

type ProcessingStatus = Readonly<{
  healthScore?: HealthScoreResult;
  planId: string;
  queuePosition: number;
  status: "failed" | "preparing" | "queued" | "ready";
  steps: Array<
    Readonly<{
      id: string;
      state: ProcessingStepState;
    }>
  >;
}>;

const ASSESSMENT_REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ASSESSMENT_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildReturningScoreGateStatus(planId: string, healthScore: HealthScoreResult): ProcessingStatus {
  return {
    healthScore,
    planId,
    queuePosition: 0,
    status: "ready",
    steps: [
      { id: "assessment", state: "complete" },
      { id: "score", state: "complete" },
      { id: "results", state: "complete" }
    ]
  };
}

function healthScoreBpmFields(healthScore: HealthScoreResult | null | undefined) {
  const lowestDomain = healthScore?.domains.slice().sort((a, b) => a.score - b.score)[0];

  return {
    healthScore: healthScore?.score,
    lowestDomain: lowestDomain?.id,
    metrics: {
      domainScores: healthScore?.domains.reduce<Record<string, number>>((scores, domain) => {
        scores[domain.id] = domain.score;
        return scores;
      }, {})
    },
    scoreBand: healthScore?.band
  };
}

export function AssessmentFlow({
  initialStage = "quiz",
  locale,
  paymentId,
  prefillAnswers,
  returningHealthScore,
  returningPlanId,
  showDevShortcut = false
}: AssessmentFlowProps) {
  const copy = copies[locale];
  const router = useRouter();
  const returningScoreStatus = returningPlanId && returningHealthScore
    ? buildReturningScoreGateStatus(returningPlanId, returningHealthScore)
    : null;
  const [answers, setAnswers] = useState<Answers>(() => buildInitialAnswers(prefillAnswers));
  const canShowDevShortcut = buildTimeDevShortcutEnabled || showDevShortcut;
  const [sectionIndex, setSectionIndex] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState("");
  const [capturedStatus, setCapturedStatus] = useState<ProcessingStatus | null>(returningScoreStatus);
  const [showHealthScore, setShowHealthScore] = useState(Boolean(returningScoreStatus || initialStage === "healthscore"));
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(returningHealthScore ?? null);
  const captureInFlight = useRef<Promise<ProcessingStatus | null> | null>(null);
  const assessmentStartedTracked = useRef(false);
  const healthScoreViewedTracked = useRef(false);
  const precision = precisionProgress(answers);
  const displayFirstName = normalizeAssessmentFirstName(answers.firstName);
  const vo2Estimate = estimateVo2Max(answers);
  const gaugeLabels = gaugeLabelsByLocale[locale];

  function clearProcessingStatus() {
    setProcessingStatus(null);
  }

  useEffect(() => {
    if (assessmentStartedTracked.current || precision.essentialDone <= 0) return;

    assessmentStartedTracked.current = true;
    trackBpmEvent("assessment_started", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: precision.essentialDone,
        returningPlanId: returningPlanId || undefined
      }
    });
  }, [locale, precision.essentialDone, returningPlanId]);

  useEffect(() => {
    if (!showHealthScore || healthScoreViewedTracked.current) return;

    healthScoreViewedTracked.current = true;
    trackBpmEvent("healthscore_viewed", {
      eventType: "funnel",
      locale,
      planId: capturedStatus?.planId,
      properties: {
        returningPlanId: returningPlanId || undefined
      },
      ...healthScoreBpmFields(healthScore)
    });
  }, [capturedStatus?.planId, healthScore, locale, returningPlanId, showHealthScore]);

  const ui = assessmentUiCopy[locale];

  function setSingle(key: keyof Answers, value: string) {
    const nextValue = key === "firstName" ? clampFirstNameInput(value) : value;

    setAnswers((current) => ({
      ...current,
      [key]: nextValue,
      ...(key === "sex" && nextValue !== "female" ? { flow: "", menopause: "", reproStatus: "" } : {}),
      ...(key === "reproStatus" && (nextValue === "pregnant" || nextValue === "breastfeeding") ? { flow: "" } : {}),
      ...(key === "meds" && nextValue !== "yes" ? { medTypes: [], otherMed: "" } : {}),
      ...(key === "tracker" && nextValue !== "other" ? { otherTracker: "" } : {})
    }));
  }

  function toggleMulti(key: "allergies" | "family" | "goals" | "medTypes" | "suppAllergies" | "symptoms", value: string, max = 99) {
    setAnswers((current) => {
      const values = current[key];
      const selected = values.includes(value);

      if (!selected && values.length >= max) return current;

      if (key === "allergies" || key === "family" || key === "suppAllergies") {
        if (value === "none") {
          return { ...current, [key]: selected ? [] : ["none"] };
        }

        return {
          ...current,
          [key]: selected ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "none"), value]
        };
      }

      if (key === "symptoms" && value === "great") {
        return { ...current, symptoms: selected ? [] : ["great"] };
      }

      return {
        ...current,
        [key]: selected ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "great"), value]
      };
    });
  }

  function updateFoodFrequency(key: FoodFrequencyKey, value: string) {
    setAnswers((current) => ({
      ...current,
      foodFrequency: {
        ...current.foodFrequency,
        [key]: value
      }
    }));
  }

  function updateLabValue(key: string, value: string) {
    setAnswers((current) => ({
      ...current,
      labs: {
        ...current.labs,
        [key]: value
      }
    }));
  }

  function updateLabUnit(key: string, value: string) {
    setAnswers((current) => ({
      ...current,
      labUnits: {
        ...current.labUnits,
        [key]: value
      }
    }));
  }

  const rawSections: Array<Omit<AssessmentSection, "complete">> = [
    {
      description: copy.about.subtitle,
      id: "about",
      questions: [
        {
          content: (
            <label className="block">
              <span className="mn-question__heading">
                <span className="mn-question__label">{copy.about.firstName}</span>
                <span className="mn-optional-badge">{copy.about.firstNameOptional}</span>
              </span>
              <span className="mn-question__hint">{copy.about.firstNameHint}</span>
              <input
                autoComplete="given-name"
                className="mn-text-input"
                maxLength={ASSESSMENT_FIRST_NAME_MAX_LENGTH}
                placeholder={copy.about.firstName}
                type="text"
                value={answers.firstName}
                onChange={(event) => setSingle("firstName", event.target.value)}
              />
            </label>
          ),
          id: "firstName",
          isAnswered: normalizeAssessmentFirstName(answers.firstName) !== null,
          label: ""
        },
        {
          content: (
            <PillGroup
              options={copy.about.sexOptions}
              selected={answers.sex}
              onSelect={(value) => setSingle("sex", value)}
            />
          ),
          id: "sex",
          isAnswered: hasText(answers.sex),
          label: copy.about.sex,
          why: copy.coach.sex
        },
        {
          content: (
            <PillGroup
              options={copy.about.ageOptions}
              selected={answers.age}
              onSelect={(value) => setSingle("age", value)}
            />
          ),
          id: "age",
          isAnswered: hasText(answers.age),
          label: copy.about.age
        },
        {
          content: (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">
                  <span>{copy.about.height}</span>
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-[var(--mn-gold)]">
                    {answers.heightCm || "170"} cm
                  </span>
                </span>
                <input
                  type="range"
                  min={120}
                  max={220}
                  step={1}
                  value={answers.heightCm || "170"}
                  className="mt-3 block w-full accent-[var(--mn-teal)]"
                  onChange={(event) => setSingle("heightCm", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--mn-gold)]">
                    {formatHeightImperial(answers.heightCm || "170")}
                  </span>
                </span>
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">
                  <span>{copy.about.weight}</span>
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-[var(--mn-gold)]">
                    {answers.weightKg || "70"} kg
                  </span>
                </span>
                <input
                  type="range"
                  min={35}
                  max={180}
                  step={1}
                  value={answers.weightKg || "70"}
                  className="mt-3 block w-full accent-[var(--mn-teal)]"
                  onChange={(event) => setSingle("weightKg", event.target.value)}
                />
                <span className="mt-2 flex justify-end">
                  <span className="rounded-md bg-[color-mix(in_srgb,var(--mn-gold)_10%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--mn-gold)]">
                    {formatWeightImperial(answers.weightKg || "70")}
                  </span>
                </span>
              </label>
            </div>
          ),
          id: "body-size",
          isAnswered: hasText(answers.heightCm) && hasText(answers.weightKg),
          label: ui.heightWeight
        },
        {
          content: (
            <SkinToneGroup
              options={copy.about.skinOptions}
              selected={answers.skin}
              onSelect={(value) => setSingle("skin", value)}
            />
          ),
          id: "skin",
          isAnswered: hasText(answers.skin),
          label: copy.about.skin
        },
        {
          content: (
            <div className="grid gap-5 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)] md:items-start">
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">
                  {copy.about.sunscreen}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {ui.sunHint}
                </p>
                <div className="mt-3">
                  <PillGroup
                    options={copy.about.sunscreenOptions}
                    selected={answers.sunscreen}
                    onSelect={(value) => setSingle("sunscreen", value)}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">
                  {copy.about.sun}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {copy.coach.sun}
                </p>
                <div className="mt-3">
                  <PillGroup
                    options={copy.about.sunOptions}
                    selected={answers.sun}
                    onSelect={(value) => setSingle("sun", value)}
                  />
                </div>
              </div>
            </div>
          ),
          id: "sunscreen-sun",
          isAnswered: hasText(answers.sunscreen) && hasText(answers.sun),
          label: ""
        },
        {
          content: (
            <label className="block">
              <span className="text-sm font-semibold text-[var(--mn-ink)]">
                {copy.about.country}
              </span>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {ui.countryHint}
              </p>
              <select
                value={answers.country}
                className="mn-text-input mt-3 px-4 py-3 font-semibold"
                onChange={(event) => setSingle("country", event.target.value)}
              >
                <option value="">{ui.selectCountry}</option>
                {copy.about.countryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ),
          id: "country",
          isAnswered: hasText(answers.country),
          label: ""
        },
        ...(answers.sex === "female"
          ? [
              {
                content: (
                  <div className="space-y-5 rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-teal)_5%,transparent)] p-4">
                    <Question
                      infoLabel={ui.infoLabel}
                      label={copy.about.reproStatus}
                      why={copy.coach.sex}
                    >
                      <PillGroup
                        options={copy.about.reproStatusOptions}
                        selected={answers.reproStatus}
                        onSelect={(value) => setSingle("reproStatus", value)}
                      />
                    </Question>
                    <Question
                      infoLabel={ui.infoLabel}
                      label={copy.about.menopause}
                    >
                      <PillGroup
                        options={copy.about.menopauseOptions}
                        selected={answers.menopause}
                        onSelect={(value) => setSingle("menopause", value)}
                      />
                    </Question>
                    {!isPregnantOrBreastfeeding(answers) ? (
                      <Question
                        infoLabel={ui.infoLabel}
                        label={copy.about.flow}
                      >
                        <PillGroup
                          options={copy.about.flowOptions}
                          selected={answers.flow}
                          onSelect={(value) => setSingle("flow", value)}
                        />
                      </Question>
                    ) : null}
                  </div>
                ),
                id: "female-context",
                isAnswered:
                  hasText(answers.reproStatus) &&
                  hasText(answers.menopause) &&
                  (isPregnantOrBreastfeeding(answers) || hasText(answers.flow)),
                label: copy.about.femaleTitle
              }
            ]
          : [])
      ],
      title: copy.about.title
    },
    {
      description: copy.goals.subtitle,
      id: "goals",
      questions: [
        {
          content: (
            <OptionGrid
              max={3}
              options={copy.goals.goalOptions}
              selected={answers.goals}
              onToggle={(value) => toggleMulti("goals", value, 3)}
            />
          ),
          hint: copy.goals.goalHint,
          id: "goals",
          isAnswered: hasAny(answers.goals),
          label: copy.goals.goals,
          why: copy.coach.goals
        },
        {
          content: (
            <OptionGrid
              options={copy.goals.symptomOptions}
              selected={answers.symptoms}
              onToggle={(value) => toggleMulti("symptoms", value)}
            />
          ),
          hint: copy.goals.symptomHint,
          id: "symptoms",
          isAnswered: hasAny(answers.symptoms),
          label: copy.goals.symptoms
        }
      ],
      title: copy.goals.title
    },
    {
      description: copy.daily.subtitle,
      id: "daily",
      questions: [
        {
          content: <PillGroup options={copy.daily.sleepOptions} selected={answers.sleepHrs} onSelect={(value) => setSingle("sleepHrs", value)} />,
          id: "sleepHrs",
          isAnswered: hasText(answers.sleepHrs),
          label: copy.daily.sleepHrs
        },
        {
          content: <ScaleGroup options={copy.daily.energyOptions} selected={answers.energy} onSelect={(value) => setSingle("energy", value)} />,
          id: "energy",
          isAnswered: hasText(answers.energy),
          label: copy.daily.energy
        },
        {
          content: <PillGroup options={copy.daily.activityOptions} selected={answers.activity} onSelect={(value) => setSingle("activity", value)} />,
          id: "activity",
          isAnswered: hasText(answers.activity),
          label: copy.daily.activity
        },
        {
          content: <ScaleGroup options={copy.daily.stressOptions} selected={answers.stress} onSelect={(value) => setSingle("stress", value)} />,
          id: "stress",
          isAnswered: hasText(answers.stress),
          label: copy.daily.stress
        },
        {
          content: <PillGroup options={copy.daily.digestionOptions} selected={answers.digestion} onSelect={(value) => setSingle("digestion", value)} />,
          id: "digestion",
          isAnswered: hasText(answers.digestion),
          label: copy.daily.digestion
        },
        {
          content: <PillGroup options={copy.daily.digConditionOptions} selected={answers.digCondition} onSelect={(value) => setSingle("digCondition", value)} />,
          id: "digCondition",
          isAnswered: hasText(answers.digCondition),
          label: copy.daily.digCondition
        },
        {
          content: <PillGroup options={copy.daily.smokingOptions} selected={answers.smoking} onSelect={(value) => setSingle("smoking", value)} />,
          id: "smoking",
          isAnswered: hasText(answers.smoking),
          label: copy.daily.smoking
        },
        {
          content: <PillGroup options={copy.daily.alcoholOptions} selected={answers.alcohol} onSelect={(value) => setSingle("alcohol", value)} />,
          id: "alcohol",
          isAnswered: hasText(answers.alcohol),
          label: copy.daily.alcohol
        },
        {
          content: <PillGroup options={copy.daily.caffeineOptions} selected={answers.caffeine} onSelect={(value) => setSingle("caffeine", value)} />,
          id: "caffeine",
          isAnswered: hasText(answers.caffeine),
          label: copy.daily.caffeine
        }
      ],
      title: copy.daily.title
    },
    {
      description: copy.food.subtitle,
      id: "food",
      questions: [
        {
          content: <PillGroup options={copy.food.dietOptions} selected={answers.diet} onSelect={(value) => setSingle("diet", value)} />,
          id: "diet",
          isAnswered: hasText(answers.diet),
          label: copy.food.diet
        },
        ...foodFrequencyKeys.map((key) => ({
          content: (
            <PillGroup
              options={copy.food.frequencyOptions[key]}
              selected={answers.foodFrequency[key]}
              onSelect={(value) => updateFoodFrequency(key, value)}
            />
          ),
          id: `food-${key}`,
          isAnswered: hasText(answers.foodFrequency[key]),
          label: copy.food.frequencyTitles[key]
        })),
        {
          content: (
            <PillGroup multi={true} options={copy.food.allergyOptions} selected={answers.allergies} onToggle={(value) => toggleMulti("allergies", value)} />
          ),
          id: "allergies",
          isAnswered: hasAny(answers.allergies),
          label: copy.food.allergies,
          why: copy.coach.allergies
        },
        {
          content: (
            <label className="mn-disclosure-card">
              <input
                checked={answers.disclosure}
                className="mt-1 size-4 rounded border-foreground/20 text-[var(--mn-teal)] focus:ring-[var(--mn-teal)]"
                type="checkbox"
                onChange={(event) => setAnswers((current) => ({ ...current, disclosure: event.target.checked }))}
              />
              <span>
                <span className="block font-medium text-[var(--mn-ink)]">{copy.food.disclosureTitle}</span>
                <span className="mt-1 block">{copy.food.disclosureBody}</span>
              </span>
            </label>
          ),
          id: "disclosure",
          isAnswered: answers.disclosure,
          label: copy.food.disclosureTitle
        }
      ],
      title: copy.food.title
    },
    {
      description: copy.safety.subtitle,
      id: "safety",
      questions: [
        {
          content: (
            <div className="space-y-4">
              <PillGroup options={copy.safety.medicationOptions} selected={answers.meds} onSelect={(value) => setSingle("meds", value)} />
              {answers.meds === "yes" ? (
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-teal)_5%,transparent)] p-4">
                  <p className="mb-3 text-sm font-semibold text-[var(--mn-ink)]">{copy.safety.medicationType}</p>
                  <PillGroup multi={true} options={copy.safety.medicationTypeOptions} selected={answers.medTypes} onToggle={(value) => toggleMulti("medTypes", value)} />
                  {selectedOther(answers.medTypes) ? (
                    <input
                      className="mn-text-input"
                      placeholder={copy.safety.otherMedPlaceholder}
                      value={answers.otherMed}
                      onChange={(event) => setSingle("otherMed", event.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
          hint: copy.safety.medicationHint,
          id: "meds",
          isAnswered: hasText(answers.meds) && (answers.meds !== "yes" || hasAny(answers.medTypes)),
          label: copy.safety.medications,
          why: copy.coach.medications
        },
        {
          content: <PillGroup options={copy.safety.kidneyOptions} selected={answers.kidney} onSelect={(value) => setSingle("kidney", value)} />,
          id: "kidney",
          isAnswered: hasText(answers.kidney),
          label: copy.safety.kidney
        },
        {
          content: <PillGroup options={copy.safety.liverOptions} selected={answers.liver} onSelect={(value) => setSingle("liver", value)} />,
          id: "liver",
          isAnswered: hasText(answers.liver),
          label: copy.safety.liver
        },
        {
          content: <PillGroup options={copy.safety.surgeryOptions} selected={answers.surgery} onSelect={(value) => setSingle("surgery", value)} />,
          id: "surgery",
          isAnswered: hasText(answers.surgery),
          label: copy.safety.surgery
        },
        {
          content: <PillGroup options={copy.safety.antibioticsOptions} selected={answers.antibiotics} onSelect={(value) => setSingle("antibiotics", value)} />,
          id: "antibiotics",
          isAnswered: hasText(answers.antibiotics),
          label: copy.safety.antibiotics
        },
        {
          content: <PillGroup options={copy.safety.supplementsOptions} selected={answers.supplements} onSelect={(value) => setSingle("supplements", value)} />,
          id: "supplements",
          isAnswered: hasText(answers.supplements),
          label: copy.safety.supplements
        },
        {
          content: <PillGroup multi={true} options={copy.safety.suppAllergyOptions} selected={answers.suppAllergies} onToggle={(value) => toggleMulti("suppAllergies", value)} />,
          id: "suppAllergies",
          isAnswered: hasAny(answers.suppAllergies),
          label: copy.safety.suppAllergies
        }
      ],
      title: copy.safety.title
    },
    {
      description: copy.precision.subtitle,
      id: "precision",
      questions: [
        {
          content: <PillGroup options={copy.precision.budgetOptions} selected={answers.budget} onSelect={(value) => setSingle("budget", value)} />,
          id: "budget",
          isAnswered: hasText(answers.budget),
          label: copy.precision.budget
        },
        {
          content: <PillGroup options={copy.precision.maxPillsOptions} selected={answers.maxPills} onSelect={(value) => setSingle("maxPills", value)} />,
          id: "maxPills",
          isAnswered: hasText(answers.maxPills),
          label: copy.precision.maxPills
        },
        {
          content: <PillGroup options={copy.precision.formOptions} selected={answers.form} onSelect={(value) => setSingle("form", value)} />,
          id: "form",
          isAnswered: hasText(answers.form),
          label: copy.precision.form
        },
        {
          content: (
            <div className="space-y-5 rounded-lg border border-[color-mix(in_srgb,var(--mn-gold)_15%,transparent)] bg-[color-mix(in_srgb,var(--mn-gold)_5%,transparent)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.optionalBanner}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.precision.optionalBody}</p>
              </div>
              <Question infoLabel={ui.infoLabel} label={copy.precision.protein} why={copy.coach.precision}>
                <PillGroup options={copy.precision.proteinOptions} selected={answers.protein} onSelect={(value) => setSingle("protein", value)} />
              </Question>
              <Question infoLabel={ui.infoLabel} label={copy.precision.family}>
                <OptionGrid options={copy.precision.familyOptions} selected={answers.family} onToggle={(value) => toggleMulti("family", value, 8)} />
              </Question>
              <Question infoLabel={ui.infoLabel} label={copy.precision.tracker}>
                <PillGroup options={copy.precision.trackerOptions} selected={answers.tracker} onSelect={(value) => setSingle("tracker", value)} />
                {answers.tracker === "other" ? (
                  <input className="mn-text-input" value={answers.otherTracker} onChange={(event) => setSingle("otherTracker", event.target.value)} />
                ) : null}
              </Question>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="block">
                  <label className="block">
                    <span className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.vo2}</span>
                    <input
                      className="mn-text-input"
                      inputMode="decimal"
                      placeholder={ui.vo2Placeholder}
                      value={answers.vo2}
                      onChange={(event) => setSingle("vo2", event.target.value)}
                    />
                  </label>
                  <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_15%,transparent)] bg-[var(--mn-paper)] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.vo2Estimate}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {vo2Estimate === null
                            ? copy.precision.vo2EstimateNeeds
                            : copy.precision.vo2EstimateReady(vo2Estimate)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={vo2Estimate === null}
                        className="mn-soft-action-button"
                        onClick={() => {
                          if (vo2Estimate !== null) {
                            setSingle("vo2", String(vo2Estimate));
                          }
                        }}
                      >
                        {copy.precision.vo2EstimateButton}
                      </button>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-[var(--mn-ink)]">{copy.precision.hrv}</span>
                  <input className="mn-text-input" inputMode="decimal" value={answers.hrv} onChange={(event) => setSingle("hrv", event.target.value)} />
                </label>
              </div>
              <Question infoLabel={ui.infoLabel} label={copy.precision.labs} hint={copy.precision.labsHint} why={copy.coach.labs}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {copy.precision.labFields.map((field) => (
                    <label key={field.value} className="block rounded-lg border border-foreground/10 bg-[var(--mn-paper)] p-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mn-ink)]">{field.label}</span>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="mn-lab-input"
                          inputMode="decimal"
                          value={answers.labs[field.value] ?? ""}
                          onChange={(event) => updateLabValue(field.value, event.target.value)}
                        />
                        <select
                          className="mn-lab-unit"
                          value={answers.labUnits[field.value] ?? field.units[0]}
                          onChange={(event) => updateLabUnit(field.value, event.target.value)}
                        >
                          {field.units.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    </label>
                  ))}
                </div>
              </Question>
            </div>
          ),
          id: "optional-precision",
          isAnswered: optionalChecks(answers).some(Boolean),
          label: copy.precision.optionalBanner,
          why: copy.coach.precision
        }
      ],
      title: copy.precision.title
    }
  ];

  const sections: AssessmentSection[] = rawSections.map((section) => ({
    ...section,
    complete: section.questions.some((question) => question.isAnswered)
  }));


  function fillRandomDefaultsAndFinalStep() {
    setAnswers(buildRandomDevAnswers());
    setProcessingError("");
    setShowHealthScore(false);
    clearProcessingStatus();
    setCapturedStatus(null);
    captureInFlight.current = null;
    setSectionIndex(sections.length - 1);
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const currentSection = sections[Math.min(sectionIndex, sections.length - 1)];
  const renderedQuestions = currentSection.questions;
  const isFinalStep = sectionIndex === sections.length - 1;
  const disclosureRequiredForAction = ["food", "safety", "precision"].includes(currentSection.id);
  const primaryActionDisabled =
    disclosureRequiredForAction && !answers.disclosure;

  function goBack() {
    setProcessingError("");

    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1);
      return;
    }

    return;
  }

  function goToSection(index: number) {
    setProcessingError("");
    setSectionIndex(Math.min(Math.max(index, 0), sections.length - 1));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  function goNext() {
    if (primaryActionDisabled) {
      return;
    }

    if (isFinalStep) {
      void prepareHealthScoreGate(answers);
      return;
    }

    setSectionIndex(Math.min(sectionIndex + 1, sections.length - 1));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  async function prepareHealthScoreGate(answerPayload = answers) {
    setProcessingError("");
    setProcessingStatus({
      planId: "",
      queuePosition: 0,
      status: "preparing",
      steps: [
        { id: "assessment", state: "complete" },
        { id: "score", state: "active" },
        { id: "results", state: "pending" }
      ]
    });
    window.scrollTo({ behavior: "smooth", top: 0 });
    trackBpmEvent("assessment_submitted", {
      eventType: "funnel",
      locale,
      properties: {
        completedRequired: precision.essentialDone,
        requiredTotal: precision.essentialTotal
      }
    });

    try {
      const captured = await captureAssessment(true, answerPayload);

      if (!captured?.planId) {
        throw new Error("Unable to capture assessment");
      }

      let readyStatus = captured;

      if (readyStatus.status !== "ready") {
        setProcessingStatus(readyStatus);
        readyStatus = await waitForHealthScoreAnalysis(readyStatus.planId);
      }

      if (!readyStatus.healthScore) {
        throw new Error("Assessment capture did not return a HealthScore");
      }

      setHealthScore(readyStatus.healthScore);
      setCapturedStatus(readyStatus);
      setProcessingStatus(null);
      setShowHealthScore(true);
      router.replace(
        paymentId
          ? nutritionRevealPath(locale, readyStatus.planId)
          : nutritionHealthScorePath(locale, readyStatus.planId)
      );
    } catch {
      clearProcessingStatus();
      setProcessingError(ui.processingError);
    }
  }

  async function waitForHealthScoreAnalysis(planId: string) {
    let latestStatus: ProcessingStatus | null = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetchWithTimeout(
        `/api/assessment/${encodeURIComponent(planId)}?view=healthscore&locale=${encodeURIComponent(locale)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Unable to load HealthScore analysis status");
      }

      latestStatus = (await response.json()) as ProcessingStatus;
      setProcessingStatus(latestStatus);

      if (latestStatus.status === "ready") {
        return latestStatus;
      }

      if (latestStatus.status === "failed") {
        throw new Error("HealthScore analysis failed");
      }

      await sleep(1500);
    }

    throw new Error("HealthScore analysis timed out");
  }

  async function captureAssessment(force = false, answerPayload = answers) {
    if (!force && capturedStatus?.planId) {
      return capturedStatus;
    }

    if (captureInFlight.current) {
      return captureInFlight.current;
    }

    captureInFlight.current = (async () => {
      try {
        const response = returningPlanId
          ? await fetchWithTimeout(
              `/api/assessment/${encodeURIComponent(returningPlanId)}`,
              {
                body: JSON.stringify({
                  answers: answerPayload,
                  bpm: getBpmPayload(),
                  intent: "capture",
                  locale,
                  paymentId
                }),
                cache: "no-store",
                headers: {
                  "content-type": "application/json"
                },
                method: "PATCH"
              }
            )
          : await fetchWithTimeout("/api/assessment", {
              body: JSON.stringify({
                answers: answerPayload,
                bpm: getBpmPayload(),
                intent: "capture",
                locale,
                paymentId
              }),
              cache: "no-store",
              headers: {
                "content-type": "application/json"
              },
              method: "POST"
            });

        if (!response.ok) {
          throw new Error("Unable to capture assessment plan");
        }

        const status = (await response.json()) as ProcessingStatus;
        setCapturedStatus(status);
        return status;
      } catch {
        return null;
      } finally {
        captureInFlight.current = null;
      }
    })();

    return captureInFlight.current;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pb-16 lg:pt-14">
        {processingStatus ? (
          <ProcessingPanel
            error={
              processingStatus.status === "failed"
                ? ui.processingError
                : processingError
            }
            onRetry={() => void prepareHealthScoreGate()}
            retryLabel={ui.retry}
            subtitle={ui.scoreProcessingSubtitle}
            title={ui.scoreProcessingTitle}
          />
	        ) : showHealthScore ? (
	          <HealthScoreOnlyPanel
	            firstName={displayFirstName}
	            healthScore={healthScore}
	            locale={locale}
	            planId={capturedStatus?.planId ?? returningPlanId ?? undefined}
	          />
	        ) : (
	          <div className="space-y-6">
            <QuestionnairePrecisionMeter precision={precision} ui={ui} />
            <div className="py-3">
              <AssessmentStepper
                ariaLabel={ui.stagesAria}
                currentIndex={sectionIndex}
                onSelect={goToSection}
                phases={copy.stagePhases}
                sections={sections}
                stages={copy.stages}
              />
            </div>

            <SectionCard
              description={currentSection.description}
              done={currentSection.complete}
              footer={
                <div className="space-y-4">
                  <PrecisionGauge
                    ariaLabel={ui.formulaPrecision}
                    labels={gaugeLabels}
                    progress={precision.progress}
                  />
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        disabled={sectionIndex === 0}
                        className="mn-secondary-button"
                        onClick={goBack}
                      >
                        {ui.back}
                      </button>
                      {canShowDevShortcut ? (
                        <button
                          type="button"
                          className="mn-secondary-button mn-secondary-button--compact"
                          onClick={fillRandomDefaultsAndFinalStep}
                        >
                          {ui.devDefaults}
                        </button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={primaryActionDisabled}
                      className="mn-assessment-continue-button"
                      onClick={goNext}
                    >
                      {isFinalStep ? copy.fixedAction.generate : ui.continue}
                      {isFinalStep ? (
                        <BeakerIcon aria-hidden={true} className="size-5" />
                      ) : null}
                    </button>
                  </div>
                </div>
              }
              sectionLabel={copy.stagePhases[sectionIndex] ?? ""}
              stepLabel={ui.section(sectionIndex + 1, sections.length)}
              supportingNote={sectionIndex === 0 ? undefined : copy.sectionNotes[sectionIndex]}
              title={currentSection.title}
            >
              <div
                className="space-y-7"
              >
                {sectionIndex === 0 ? (
                  <AssessmentIntroNote
                    body={copy.about.honestyBody}
                    firstName={displayFirstName}
                    greeting={displayFirstName ? ui.nameGreeting(displayFirstName) : ""}
                  />
                ) : null}
                {renderedQuestions.map((question) => (
                  <Question
                    key={question.id}
                    hint={question.hint}
                    infoLabel={ui.infoLabel}
                    label={question.label}
                    why={question.why}
                  >
                    {question.content}
                  </Question>
                ))}
                {sectionIndex === 0 ? (
                  <AssessmentTrustStrip items={copy.about.trustItems} />
                ) : null}
              </div>
            </SectionCard>

            {processingError ? (
              <p className="text-sm font-medium text-red-600">
                {processingError}
              </p>
            ) : null}
          </div>
        )}
    </main>
  );
}

function HealthScoreOnlyPanel({
  firstName,
  healthScore,
  locale,
  planId
}: Readonly<{
  firstName?: string | null;
  healthScore: HealthScoreResult | null;
  locale: Locale;
  planId?: string;
}>) {
  if (!healthScore) return null;

  return (
    <HealthScorePaymentPanel
      firstName={firstName ?? undefined}
      locale={locale}
      planId={planId}
      result={healthScore}
    />
  );
}
