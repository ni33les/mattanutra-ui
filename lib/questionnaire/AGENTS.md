# Questionnaire agent group

The web questionnaire uses **v15.5-screens**, with 24 compact screens in six sections, explicit Continue, review/edit, and the existing capture/recovery flow. Reference content is extracted into `content/questionnaire/v15-5`. The **v6-conversational** protocol remains available for LINE and AI chats and historical drafts; do not change its version or reinterpret its saved turn indices.

Web chat must never show **sex at birth** in any locale — always **sex**:
- EN: “What is your sex?”
- TH: “เพศของคุณคือ” (never เพศกำเนิด)
- zh-CN: uses EN turns today; never 出生时的性别 / 出生性别

Ordinary web visits require the welcome CTA (no `/begin|start/i` auto-click). The pharmacy journey has its own landing-page CTA: its quiz opens the first question directly, including after an explicit restart. Preserve saved-answer resume and completed-draft recovery.

Copy/emojis come only from definition JSON (extracted from the guide). Do not invent extra icons in chrome.

## Agents

| Agent | ID | Role |
|-------|-----|------|
| Conversation | `questionnaire.conversation` | Pure turn machine: next question, apply answer, skip, progress |
| Capture | `questionnaire.capture` | Normalize answers → `POST/PATCH /api/assessment` |
| Progress | `questionnaire.progress` | BPM: `chat_*`, part checkpoints |

Coordinator: `QuestionnaireAgentCoordinator` in `lib/questionnaire/agents/index.ts`.

## AI chat integration (later)

1. Register tools from `questionnaireToolsForLlm()` on the chat tool router (Nong Mata / OpenClaw).
2. For each tool call, `await coordinator.invoke({ name, args })`.
3. Render `get_next_prompt` options as buttons / quick replies — **do not let the LLM invent field keys or option values**.
4. On `complete`, call `finalize_assessment` then deep-link to Health Score.

```ts
import {
  QuestionnaireAgentCoordinator,
  questionnaireToolsForLlm
} from "@/lib/questionnaire";

const tools = questionnaireToolsForLlm();
const coord = new QuestionnaireAgentCoordinator({
  locale: "th",
  channel: "agent"
});
const result = await coord.invoke({ name: "start_session", args: {} });
```

## Kill switch

`NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5=0` restores classic `AssessmentFlow` on `/nutrition/quiz`.
