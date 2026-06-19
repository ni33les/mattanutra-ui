import { readFile, writeFile } from "node:fs/promises";

const generatedPath = "content/i18n/generated.ts";

function generatedContent() {
  return `import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };

export type SourceMessageCatalog = typeof sourceCatalog;
export type MessageId = keyof SourceMessageCatalog;
export type MessageDescriptor = SourceMessageCatalog[MessageId];
export type MessageNamespace = MessageDescriptor["namespace"];
export type MessageAudience = MessageDescriptor["audience"];
export type MessageSurface = MessageDescriptor["surface"];

export type MessageValue = string | number | bigint | boolean | Date | null | undefined;
export type MessageValues = Readonly<Record<string, MessageValue>>;

export const sourceMessageCatalog = sourceCatalog;
export const messageIds = Object.keys(sourceCatalog).sort() as MessageId[];
`;
}

async function main() {
  const next = generatedContent();

  if (process.argv.includes("--check")) {
    const current = await readFile(generatedPath, "utf8");

    if (current !== next) {
      throw new Error(`${generatedPath} is out of date. Run npm run i18n:generate.`);
    }

    console.log(JSON.stringify({ file: generatedPath, status: "ok" }, null, 2));
    return;
  }

  await writeFile(generatedPath, next);
  console.log(JSON.stringify({ file: generatedPath, status: "written" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
