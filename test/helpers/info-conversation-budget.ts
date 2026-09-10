/** Current progressive discovery keeps the 4 KiB capability and 8 KiB guide
 * budgets. Overview carries flat create and poll templates; all mutation combinations are
 * available through the advertised guide/schema retrieval. */
export function infoConversationBudget(value: Record<string, unknown>) {
  const { clientInstructions, clientExamples, ...capabilities } = value;
  const bytes = (item: unknown) => Buffer.byteLength(JSON.stringify(item), "utf8");
  const examples = Array.isArray(clientExamples) ? clientExamples : [];
  const plans = examples.filter(example => example?.tool === "plan").map(example => example.arguments);
  const hasBasisExample = examples.some(example => example?.arguments?.targets?.some((target: { basis?: string }) => ["supplemental", "total_daily"].includes(target.basis ?? "")));
  const capabilityBytes = bytes(capabilities);
  const instructionBytes = bytes({ clientInstructions, clientExamples });
  const passed = capabilityBytes <= 4096 && instructionBytes <= 8192 &&
    typeof clientInstructions === "string" && /total_daily/.test(clientInstructions) && /supplemental/.test(clientInstructions) &&
    plans.length === 2 && Array.isArray(plans[0].targets) && typeof plans[1].planHandle === "string" && Object.keys(plans[1]).length === 1 && hasBasisExample &&
    typeof value.clientGuide === "string" && typeof value.contractSchema === "string" &&
    !Object.hasOwn(value, "planSchemaJson") && !Object.hasOwn(value, "clientGuideText");
  return { passed, capabilityBytes, instructionBytes };
}
