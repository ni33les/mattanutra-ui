export type JsonSchema = Readonly<Record<string, unknown>>;

const PLAN_ANSWERS: JsonSchema = {
  items: {
    additionalProperties: false,
    properties: {
      choice: { type: "string" },
      questionId: { type: "string" }
    },
    required: ["questionId", "choice"],
    type: "object"
  },
  type: "array",
  uniqueItems: true
};

const PLAN_SAFETY_ACK: JsonSchema = {
  additionalProperties: false,
  properties: {
    confirmed: { const: true },
    guidanceIds: {
      items: { type: "string" },
      minItems: 1,
      type: "array",
      uniqueItems: true
    },
    revision: { minimum: 1, type: "integer" }
  },
  required: ["revision", "guidanceIds", "confirmed"],
  type: "object"
};

const PLAN_REQUEST: JsonSchema = {
  additionalProperties: false,
  properties: {
    answers: PLAN_ANSWERS,
    conditionCodes: {
      items: { type: "string" },
      type: "array",
      uniqueItems: true
    },
    currentSupplements: {
      items: {
        additionalProperties: false,
        properties: {
          dailyAmount: { exclusiveMinimum: 0, type: "number" },
          name: { type: "string" },
          supplementId: { pattern: "^sup_", type: "string" },
          unit: {
            enum: ["mcg", "mg", "g", "IU", "CFU", "ml", "serving"],
            type: "string"
          }
        },
        required: ["name", "dailyAmount", "unit"],
        type: "object"
      },
      maxItems: 50,
      type: "array"
    },
    destinationCountry: {
      description:
        "ISO 3166-1 alpha-2 destination. Call info for supportedCountries. If MattaNutra does not deliver there yet, plan returns unsupported_country with a polite cannot-deliver message.",
      pattern: "^[A-Z]{2}$",
      type: "string"
    },
    locale: { type: "string" },
    medicationCodes: {
      items: { type: "string" },
      type: "array",
      uniqueItems: true
    },
    optimization: {
      enum: ["balanced", "best_coverage", "lowest_cost", "fewest_pills"],
      type: "string"
    },
    profile: {
      additionalProperties: false,
      properties: {
        ageYears: { maximum: 120, minimum: 0, type: "integer" },
        goals: {
          items: { maxLength: 80, type: "string" },
          type: "array",
          uniqueItems: true
        },
        lifeStage: {
          enum: ["adult", "child", "pregnant", "breastfeeding", "trying_to_conceive"],
          type: "string"
        },
        sex: {
          description: "Person sex: female, male, intersex, or unspecified.",
          enum: ["female", "male", "intersex", "unspecified"],
          type: "string"
        }
      },
      required: ["ageYears", "sex", "lifeStage"],
      type: "object"
    },
    requirements: {
      additionalProperties: false,
      properties: {
        allowedForms: {
          items: {
            enum: [
              "capsule",
              "softgel",
              "tablet",
              "powder",
              "liquid",
              "gummy",
              "sachet",
              "other"
            ],
            type: "string"
          },
          type: "array",
          uniqueItems: true
        },
        dietaryPreference: {
          enum: ["any", "plant_based", "vegan"],
          type: "string"
        },
        excludeSupplementIds: {
          items: { pattern: "^sup_", type: "string" },
          type: "array",
          uniqueItems: true
        },
        maxDailyPills: { minimum: 0, type: "number" },
        maxPriceMinor: { minimum: 0, type: "integer" },
        maxProductCount: { maximum: 30, minimum: 1, type: "integer" },
        omega3SourcePreference: {
          enum: ["any", "algae_only", "fish_allowed"],
          type: "string"
        },
        retainProductIds: {
          items: { pattern: "^prd_", type: "string" },
          type: "array",
          uniqueItems: true
        },
        retainSupplementIds: {
          items: { pattern: "^sup_", type: "string" },
          type: "array",
          uniqueItems: true
        }
      },
      type: "object"
    },
    safetyAcknowledgement: PLAN_SAFETY_ACK,
    targets: {
      items: {
        additionalProperties: false,
        properties: {
          amount: { exclusiveMinimum: 0, type: "number" },
          name: { minLength: 1, type: "string" },
          supplementId: { pattern: "^sup_", type: "string" },
          unit: {
            enum: ["mcg", "mg", "g", "IU", "CFU", "ml", "serving"],
            type: "string"
          }
        },
        required: ["name", "amount", "unit"],
        type: "object"
      },
      maxItems: 30,
      minItems: 1,
      type: "array"
    }
  },
  required: [
    "locale",
    "destinationCountry",
    "optimization",
    "profile",
    "requirements",
    "targets"
  ],
  type: "object"
};

const IDEMPOTENCY_KEY: JsonSchema = {
  maxLength: 128,
  minLength: 16,
  type: "string"
};

const HANDLE: JsonSchema = {
  minLength: 32,
  type: "string"
};

export const INFO_INPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    locale: {
      description: "Optional BCP 47 response locale.",
      type: "string"
    }
  },
  type: "object"
};

export const PLAN_INPUT_SCHEMA: JsonSchema = {
  $defs: {
    PlanRequest: PLAN_REQUEST
  },
  oneOf: [
    {
      additionalProperties: false,
      properties: {
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: { const: "create" },
        request: PLAN_REQUEST
      },
      required: ["operation", "idempotencyKey", "request"],
      type: "object"
    },
    {
      additionalProperties: false,
      properties: {
        expectedRevision: { minimum: 1, type: "integer" },
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: { const: "revise" },
        planHandle: HANDLE,
        request: PLAN_REQUEST
      },
      required: ["operation", "idempotencyKey", "planHandle", "expectedRevision", "request"],
      type: "object"
    },
    {
      additionalProperties: false,
      properties: {
        answers: PLAN_ANSWERS,
        expectedRevision: { minimum: 1, type: "integer" },
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: { const: "answer" },
        planHandle: HANDLE,
        safetyAcknowledgement: PLAN_SAFETY_ACK
      },
      required: ["operation", "idempotencyKey", "planHandle", "expectedRevision"],
      type: "object"
    },
    {
      additionalProperties: false,
      properties: {
        expectedRevision: { minimum: 1, type: "integer" },
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: { const: "select" },
        optionId: { minLength: 8, type: "string" },
        planHandle: HANDLE
      },
      required: [
        "operation",
        "idempotencyKey",
        "planHandle",
        "expectedRevision",
        "optionId"
      ],
      type: "object"
    },
    {
      additionalProperties: false,
      properties: {
        operation: { const: "get" },
        planHandle: HANDLE
      },
      required: ["operation", "planHandle"],
      type: "object"
    }
  ]
};

export const PLAN_ADVERTISED_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    answers: PLAN_ANSWERS,
    expectedRevision: { minimum: 1, type: "integer" },
    idempotencyKey: IDEMPOTENCY_KEY,
    operation: {
      enum: ["answer", "create", "get", "revise", "select"],
      type: "string"
    },
    optionId: { minLength: 8, type: "string" },
    planHandle: HANDLE,
    request: PLAN_REQUEST,
    safetyAcknowledgement: PLAN_SAFETY_ACK
  },
  type: "object"
};

export const EXECUTE_INPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    expectedRevision: { minimum: 1, type: "integer" },
    idempotencyKey: IDEMPOTENCY_KEY,
    planHandle: HANDLE
  },
  required: ["planHandle", "expectedRevision", "idempotencyKey"],
  type: "object"
};

export const ORDER_INPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    orderHandle: HANDLE
  },
  required: ["orderHandle"],
  type: "object"
};

export const SUPPORT_INPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    idempotencyKey: IDEMPOTENCY_KEY,
    message: { maxLength: 4000, minLength: 1, type: "string" },
    orderHandle: HANDLE,
    supportHandle: HANDLE
  },
  required: ["orderHandle", "idempotencyKey", "message"],
  type: "object"
};

export const FEEDBACK_INPUT_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    consentConfirmed: { const: true },
    expectedRevision: { minimum: 1, type: "integer" },
    idempotencyKey: IDEMPOTENCY_KEY,
    optionId: { minLength: 8, type: "string" },
    planHandle: HANDLE,
    points: {
      items: { maxLength: 240, minLength: 1, type: "string" },
      maxItems: 8,
      type: "array",
      uniqueItems: true
    },
    rating: { maximum: 5, minimum: 1, type: "integer" },
    summary: { maxLength: 1000, minLength: 1, type: "string" }
  },
  required: [
    "idempotencyKey",
    "planHandle",
    "expectedRevision",
    "consentConfirmed"
  ],
  type: "object"
};

export const EXECUTE_ADVERTISED_SCHEMA = EXECUTE_INPUT_SCHEMA;
export const ORDER_ADVERTISED_SCHEMA = ORDER_INPUT_SCHEMA;
export const SUPPORT_ADVERTISED_SCHEMA = SUPPORT_INPUT_SCHEMA;
export const FEEDBACK_ADVERTISED_SCHEMA = FEEDBACK_INPUT_SCHEMA;

export const AGENTIC_INPUT_SCHEMAS = {
  execute: EXECUTE_INPUT_SCHEMA,
  feedback: FEEDBACK_INPUT_SCHEMA,
  info: INFO_INPUT_SCHEMA,
  order: ORDER_INPUT_SCHEMA,
  plan: PLAN_INPUT_SCHEMA,
  support: SUPPORT_INPUT_SCHEMA
} as const;

export const AGENTIC_TOOL_SCHEMAS = {
  execute: EXECUTE_ADVERTISED_SCHEMA,
  feedback: FEEDBACK_ADVERTISED_SCHEMA,
  info: INFO_INPUT_SCHEMA,
  order: ORDER_ADVERTISED_SCHEMA,
  plan: PLAN_ADVERTISED_SCHEMA,
  support: SUPPORT_ADVERTISED_SCHEMA
} as const;
