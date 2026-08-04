# Questionnaire agent group

Deterministic chat questionnaire (**v6-conversational** schema; **v14** web UX with welcome landing + start CTA, calculating screen, review/edit). Reference: `files/v14.html`. Shared turn protocol for **web, LINE, and AI chats**.

Web chat must never show **sex at birth** in any locale — always **sex**:
- EN: “What is your sex?”
- TH: “เพศของคุณคือ” (never เพศกำเนิด)
- zh-CN: uses EN turns today; never 出生时的性别 / 出生性别

Do not auto-start chat on page load; require the welcome CTA (no `/begin|start/i` auto-click).

Copy/emojis come only from definition JSON (extracted from the guide). Do not invent extra icons in chrome.

## Agents

| Agent | ID | Role |
|-------|-----|------|
| Conversation | `questionnaire.conversation` | Pure turn machine: next question, apply answer, skip, progress |
| Capture | `questionnaire.capture` | Normalize answers → `POST/PATCH /api/assessment` |
| Progress | `questionnaire.progress` | BPM: `chat_*`, part checkpoints |

Coordinator: `QuestionnaireAgentCoordinator` in `lib/questionnaire/agents/index.ts`.

## AI chat integration (later)

1. Register tools from `questionnaireToolsForLlm()` on the chat tool router (Panya / OpenClaw).
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
