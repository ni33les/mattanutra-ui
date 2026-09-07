/** V6 adds tools-only guidance while preserving the prior 4 KiB capability
 * budget. The separate 8 KiB documentation budget covers the measured 7.9 KiB
 * maximum across EN/TH/ZH and must contain meaningful current templates. */
export function infoConversationBudget(value: Record<string, unknown>) {
  const { clientInstructions, clientExamples, ...capabilities } = value;
  const bytes = (item: unknown) => Buffer.byteLength(JSON.stringify(item), "utf8");
  const examples = Array.isArray(clientExamples) ? clientExamples : [];
  const operations = examples.filter(example => example?.tool === "plan").map(example => example.arguments?.operation);
  const hasBasisExample = examples.some(example => example?.arguments?.request?.targets?.some((target: { basis?: string }) => target.basis === "supplemental"));
  const capabilityBytes = bytes(capabilities);
  const instructionBytes = bytes({ clientInstructions, clientExamples });
  const passed = capabilityBytes <= 4096 && instructionBytes <= 8192 &&
    typeof clientInstructions === "string" && /total_daily/.test(clientInstructions) && /supplemental/.test(clientInstructions) &&
    ["create", "get", "revise", "answer", "select"].every(operation => operations.includes(operation)) && hasBasisExample &&
    !Object.hasOwn(value, "planSchemaJson") && !Object.hasOwn(value, "clientGuideText");
  return { passed, capabilityBytes, instructionBytes };
}
