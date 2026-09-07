/** Public connector documents and responses are this client's only contract source. */
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
