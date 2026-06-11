export function formatOutboundLineMessage(message: string) {
  return message.trim().replace(/^(DEV|UAT)\n\n/i, "");
}
