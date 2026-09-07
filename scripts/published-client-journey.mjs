/** Public connector documents and responses are this client's only contract source. */
export function contractFromToolDiscovery(info, tools, guide) {
  const examples = [];
  for (const match of guide.matchAll(/^### ([^\n]+)\n+```json\n([\s\S]*?)\n```/gm)) {
    const request = JSON.parse(match[2]);
    if (request.method === "tools/call" && request.params?.name && request.params.arguments) {
      examples.push({ name: match[1].trim(), tool: request.params.name, arguments: request.params.arguments });
    }
  }
  if (!examples.length) throw new Error("Connector guide has no executable examples");
  return { contractVersion: info.contractVersion, tools: Object.fromEntries(tools.map(tool => [tool.name, { inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }])), examples };
}

export function selectPublishedResources(info, resources) {
  const schema = resources.find(row => row.uri === info.contractSchema && row.mimeType === "application/schema+json");
  const guide = resources.find(row => row.uri === info.clientGuide && row.mimeType === "text/markdown");
  if (!schema || !guide) throw new Error("Connector is missing its published current schema and client guide");
  return { schema, guide };
}
export function publishedExample(contract, name) {
  const example = contract.examples.find(row => row.name === name);
  if (!example || example.tool !== "plan") throw new Error(`Connector is missing published example: ${name}`);
  return structuredClone(example.arguments);
}

/** Reload the published resource before applying an unchanged customer patch. */
export async function recoverPublishedPatch({ contract, intended, idempotencyKey, callPlan, current }) {
  const latest = await current(await callPlan({
    ...publishedExample(contract, "get-current-or-processing"),
    planHandle: intended.planHandle,
  }));
  if (!latest?.ok || typeof latest.planHandle !== "string" || !latest.planHandle ||
      !Number.isSafeInteger(latest.revision) || latest.revision < 1) {
    throw new Error("Unable to reload the current plan revision");
  }
  const recovered = await current(await callPlan({
    ...structuredClone(intended),
    planHandle: latest.planHandle,
    expectedRevision: latest.revision,
    idempotencyKey,
  }));
  return { current: latest, recovered };
}

export function selectPurchaseTradeOff(plan) {
  const recommended = plan.options.find(row => row.recommended || row.roles?.includes("closest_dose"));
  const option = plan.options.find(row => row.optionId !== (recommended?.optionId ?? plan.optionId) && row.purchaseEligible && row.basket?.length && row.roles?.some(role => ["lower_cost", "simpler", "fewer_concerns", "purchase_fallback"].includes(role)));
  if (!option) throw new Error("The documented fixture did not produce a distinct purchasable trade-off");
  return option;
}

/** The current guide documents this returned semantic key across translated labels. */
export function customerTargetConfirmation(plan) {
  const question = plan.questions.find(row => row.choices.some(choice => choice.labelKey === "plan.question.satisfy_prerequisite"));
  const choice = question?.choices.find(row => row.labelKey === "plan.question.satisfy_prerequisite");
  if (!question || !choice) throw new Error("Connector is missing its documented customer confirmation choice");
  return { question, choice };
}
