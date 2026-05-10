export const TASK_PRIORITY = {
  doNow: 6,
  high: 4,
  low: 2,
  normal: 3,
  urgent: 5,
  whenYouCan: 1
} as const;

export type TaskPriority = 1 | 2 | 3 | 4 | 5 | 6;
export type TaskDependencyType = "approved" | "complete" | "successful";

export type TaskSequenceDependencyInput = Readonly<{
  key?: string | null;
  taskId?: string | null;
  type?: TaskDependencyType;
}>;

export type TaskSequencePlanTaskInput = Readonly<{
  dependsOn?: ReadonlyArray<TaskSequenceDependencyInput>;
  key?: string | null;
  title?: string;
  taskType: string;
}>;

export type TaskSequencePlanStageInput = Readonly<{
  dependencyType?: TaskDependencyType;
  dependsOnPreviousStage?: boolean;
  tasks: ReadonlyArray<TaskSequencePlanTaskInput>;
}>;

export type TaskSequencePlanItem = Readonly<{
  dependencies: ReadonlyArray<Readonly<{
    key?: string;
    taskId?: string;
    type: TaskDependencyType;
  }>>;
  key: string;
  stageIndex: number;
  taskIndex: number;
}>;

export function normalizeTaskPriority(value: unknown): TaskPriority {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : TASK_PRIORITY.normal;

  if (!Number.isFinite(numeric)) {
    return TASK_PRIORITY.normal;
  }

  return Math.max(1, Math.min(6, Math.round(numeric))) as TaskPriority;
}

export function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) =>
          typeof item === "string" ? item.trim().toLowerCase() : ""
        )
        .filter(Boolean)
    )
  ).sort();
}

export function hasRequiredCapabilities(
  requiredCapabilities: readonly string[],
  availableCapabilities: readonly string[]
) {
  if (requiredCapabilities.length < 1) {
    return true;
  }

  const available = new Set(normalizeCapabilities([...availableCapabilities]));

  return normalizeCapabilities([...requiredCapabilities]).every((capability) =>
    available.has(capability)
  );
}

export function normalizeLeaseSeconds(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 300;

  if (!Number.isFinite(numeric)) {
    return 300;
  }

  return Math.max(30, Math.min(3600, Math.round(numeric)));
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : fallback;
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function normalizeTaskDependencyType(value: unknown): TaskDependencyType {
  return value === "approved" || value === "successful" ? value : "complete";
}

function sequenceTaskKey(
  task: Pick<TaskSequencePlanTaskInput, "key" | "taskType">,
  stageIndex: number,
  taskIndex: number
) {
  return (
    optionalText(task.key) ??
    `${stageIndex + 1}.${taskIndex + 1}:${cleanText(task.taskType, "task")}`
  );
}

export function buildTaskSequenceDependencyPlan(
  stages: ReadonlyArray<TaskSequencePlanStageInput>
): TaskSequencePlanItem[] {
  const knownKeys = new Set<string>();
  const plan: TaskSequencePlanItem[] = [];
  let previousStageKeys: string[] = [];

  stages.forEach((stage, stageIndex) => {
    const currentStageKeys: string[] = [];

    stage.tasks.forEach((task, taskIndex) => {
      const key = sequenceTaskKey(task, stageIndex, taskIndex);

      if (knownKeys.has(key)) {
        throw new Error(`Duplicate task sequence key: ${key}`);
      }

      const dependencies: Array<{
        key?: string;
        taskId?: string;
        type: TaskDependencyType;
      }> = [];
      const stageDependencyType = normalizeTaskDependencyType(stage.dependencyType);

      if (stageIndex > 0 && stage.dependsOnPreviousStage !== false) {
        for (const previousKey of previousStageKeys) {
          dependencies.push({
            key: previousKey,
            type: stageDependencyType
          });
        }
      }

      for (const dependency of task.dependsOn ?? []) {
        const dependencyKey = optionalText(dependency.key);
        const dependencyTaskId = uuidOrNull(dependency.taskId);
        const dependencyType = normalizeTaskDependencyType(dependency.type);

        if (dependencyKey) {
          if (!knownKeys.has(dependencyKey)) {
            throw new Error(`Unknown task sequence dependency key: ${dependencyKey}`);
          }

          dependencies.push({
            key: dependencyKey,
            type: dependencyType
          });
          continue;
        }

        if (!dependencyTaskId) {
          throw new Error("Task sequence dependency requires a known key or valid taskId");
        }

        dependencies.push({
          taskId: dependencyTaskId,
          type: dependencyType
        });
      }

      plan.push({
        dependencies,
        key,
        stageIndex,
        taskIndex
      });
      knownKeys.add(key);
      currentStageKeys.push(key);
    });

    previousStageKeys = currentStageKeys;
  });

  return plan;
}
