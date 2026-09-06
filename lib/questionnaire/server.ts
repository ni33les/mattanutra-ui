import { captureAssessment } from "@/lib/assessment-capture";
import { QuestionnaireAgentCoordinator, type CoordinatorOptions } from "@/lib/questionnaire/agents";

/** Server entry point: finalization joins the same capture service as the HTTP routes. */
export function createServerQuestionnaireCoordinator(options: CoordinatorOptions, serialized?: string) {
  const serverOptions = { ...options, capture: { ...options.capture, captureImpl: captureAssessment } };
  return (serialized ? QuestionnaireAgentCoordinator.fromSerialized(serialized, serverOptions) : null)
    ?? new QuestionnaireAgentCoordinator(serverOptions);
}
