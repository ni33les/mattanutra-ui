/** Current progressive discovery keeps the 4 KiB capability and 8 KiB guide
 * budgets. Overview carries one create template; all five operations are
 * available through the advertised guide/schema retrieval. */
export function infoConversationBudget(value: Record<string, unknown>) {
  const { clientInstructions, clientExamples, ...capabilities } = value;
  const bytes = (item: unknown) => Buffer.byteLength(JSON.stringify(item), "utf8");
  const examples = Array.isArray(clientExamples) ? clientExamples : [];
  const operations = examples.filter(example => example?.tool === "plan").map(example => example.arguments?.operation);
  const hasBasisExample = examples.some(example => example?.arguments?.request?.targets?.some((target: { basis?: string }) => ["supplemental", "total_daily"].includes(target.basis ?? "")));
  const capabilityBytes = bytes(capabilities);
  const instructionBytes = bytes({ clientInstructions, clientExamples });
  const passed = capabilityBytes <= 4096 && instructionBytes <= 8192 &&
    typeof clientInstructions === "string" && /total_daily/.test(clientInstructions) && /supplemental/.test(clientInstructions) &&
    operations.length === 1 && operations[0] === "create" && hasBasisExample &&
    typeof value.clientGuide === "string" && typeof value.contractSchema === "string" &&
    !Object.hasOwn(value, "planSchemaJson") && !Object.hasOwn(value, "clientGuideText");
  return { passed, capabilityBytes, instructionBytes };
}
