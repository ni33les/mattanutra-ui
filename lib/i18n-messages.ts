import {
  defaultLocale,
  getLocaleConfig,
  publicLocales,
  type LocaleCode
} from "@/lib/i18n";
import { IntlMessageFormat } from "intl-messageformat";
import sourceCatalogJson from "@/content/i18n/source/en.json" with { type: "json" };
import thCatalogJson from "@/content/i18n/locales/th.json" with { type: "json" };
import zhCnCatalogJson from "@/content/i18n/locales/zh-CN.json" with { type: "json" };
import {
  messageIds,
  type MessageId,
  type MessageNamespace,
  type MessageValues
} from "@/content/i18n/generated";

export type {
  MessageId,
  MessageNamespace,
  MessageValues
} from "@/content/i18n/generated";

export type DeepPartialLocale<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { readonly [Key in keyof T]?: DeepPartialLocale<T[Key]> }
      : T;

export type LocaleBundle<T> = Readonly<{
  en: T;
}> &
  Readonly<Partial<Record<LocaleCode, DeepPartialLocale<T>>>>;

const registry = new Map<string, LocaleBundle<unknown>>();
const sourceCatalog = sourceCatalogJson;
const localeCatalogs = {
  th: thCatalogJson,
  "zh-CN": zhCnCatalogJson
} satisfies Partial<Record<LocaleCode, Partial<Record<MessageId, string>>>>;
const icuCache = new Map<string, IntlMessageFormat>();

type CatalogMessageDescriptor = (typeof sourceCatalog)[MessageId];

export type CatalogAuditFinding = Readonly<{
  file: string;
  id: string;
  issue: string;
}>;

export type CatalogMessageStatus = Readonly<{
  fallbackUsed: boolean;
  id: MessageId;
  locale: LocaleCode;
  missing: boolean;
  text: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeLocaleCopy<T>(base: T, override: DeepPartialLocale<T> | undefined): T {
  if (override === undefined || override === null) {
    return base;
  }

  if (Array.isArray(base) || Array.isArray(override)) {
    return override as T;
  }

  if (!isRecord(base) || !isRecord(override)) {
    return override as T;
  }

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeLocaleCopy(merged[key], value as never);
  }

  return merged as T;
}

export function defineLocaleBundle<const T>(bundle: LocaleBundle<T>) {
  return bundle;
}

export function localeFallbackChain(locale: LocaleCode) {
  const requested = locale || defaultLocale;
  const localeConfig = getLocaleConfig(requested);

  return [
    requested,
    localeConfig.fallbackLocale,
    defaultLocale,
    "en"
  ].filter((item, index, list): item is LocaleCode =>
    Boolean(item) && list.indexOf(item) === index
  );
}

export function resolveLocaleCopy<const T>(
  bundle: LocaleBundle<T>,
  locale: LocaleCode
): T {
  let resolved = bundle.en;

  for (const localeCode of localeFallbackChain(locale).reverse()) {
    const candidate = bundle[localeCode];

    if (candidate) {
      resolved = mergeLocaleCopy(resolved, candidate);
    }
  }

  return resolved;
}

export function registerMessageNamespace<const T>(
  namespace: string,
  bundle: LocaleBundle<T>
) {
  registry.set(namespace, bundle as LocaleBundle<unknown>);

  return bundle;
}

export function getMessages<T = unknown>(namespace: string, locale: LocaleCode): T {
  const bundle = registry.get(namespace);

  if (!bundle) {
    throw new Error(`Unknown i18n message namespace: ${namespace}`);
  }

  return resolveLocaleCopy(bundle, locale) as T;
}

export function registeredMessageNamespaces() {
  return [...registry.keys()].sort();
}

export function isMessageId(value: string): value is MessageId {
  return Object.prototype.hasOwnProperty.call(sourceCatalog, value);
}

export function catalogMessageDescriptor(id: MessageId): CatalogMessageDescriptor {
  return sourceCatalog[id];
}

function localeCatalog(locale: LocaleCode) {
  return locale === "th" || locale === "zh-CN"
    ? localeCatalogs[locale]
    : undefined;
}

function formattedMessage(
  locale: LocaleCode,
  id: MessageId,
  message: string,
  values?: MessageValues
) {
  const cacheKey = `${locale}:${id}:${message}`;
  const formatter =
    icuCache.get(cacheKey) ?? new IntlMessageFormat(message, locale);

  if (!icuCache.has(cacheKey)) {
    icuCache.set(cacheKey, formatter);
  }

  const formatted = formatter.format(values);

  return Array.isArray(formatted) ? formatted.join("") : String(formatted);
}

function sourceDefaultMessage(id: MessageId) {
  return sourceCatalog[id].defaultMessage;
}

function resolveCatalogMessage(locale: LocaleCode, id: MessageId) {
  const descriptor = sourceCatalog[id];

  for (const localeCode of localeFallbackChain(locale)) {
    if (localeCode === "en") {
      return {
        fallbackUsed: locale !== "en",
        locale: "en" as LocaleCode,
        message: descriptor.defaultMessage,
        missing: false
      };
    }

    const translated = localeCatalog(localeCode)?.[id];

    if (typeof translated === "string" && translated.trim()) {
      return {
        fallbackUsed: localeCode !== locale,
        locale: localeCode,
        message: translated,
        missing: false
      };
    }
  }

  return {
    fallbackUsed: true,
    locale: "en" as LocaleCode,
    message: descriptor.defaultMessage,
    missing: true
  };
}

export function tStatus(
  locale: LocaleCode,
  id: MessageId,
  values?: MessageValues
): CatalogMessageStatus {
  const resolved = resolveCatalogMessage(locale, id);

  return {
    fallbackUsed: resolved.fallbackUsed,
    id,
    locale: resolved.locale,
    missing: resolved.missing,
    text: formattedMessage(resolved.locale, id, resolved.message, values)
  };
}

export function t(locale: LocaleCode, id: MessageId, values?: MessageValues) {
  return tStatus(locale, id, values).text;
}

function rawCatalogMessage(locale: LocaleCode, id: MessageId) {
  return resolveCatalogMessage(locale, id).message;
}

function assignNestedValue(
  target: Record<string, unknown>,
  path: readonly string[],
  value: string
) {
  let cursor = target;

  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      cursor[segment] = value;
      return;
    }

    const existing = cursor[segment];

    if (!isRecord(existing)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  });
}

function numericObjectToArray(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(numericObjectToArray);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value);
  const allNumericKeys =
    entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key));

  if (allNumericKeys) {
    return entries
      .sort(([first], [second]) => Number(first) - Number(second))
      .map(([, item]) => numericObjectToArray(item));
  }

  return Object.fromEntries(
    entries.map(([key, item]) => [key, numericObjectToArray(item)])
  );
}

export function getNamespace<T = unknown>(
  locale: LocaleCode,
  namespace: MessageNamespace,
  valuesById: Partial<Record<MessageId, MessageValues>> = {}
): T {
  const prefix = `${namespace}.`;
  const messages: Record<string, unknown> = {};

  messageIds
    .filter((id) => id.startsWith(prefix))
    .forEach((id) => {
      const path = id.slice(prefix.length).split(".");
      const values = valuesById[id];

      assignNestedValue(
        messages,
        path,
        values ? t(locale, id, values) : rawCatalogMessage(locale, id)
      );
    });

  return numericObjectToArray(messages) as T;
}

export function extractIcuVariables(message: string) {
  const variables = new Set<string>();
  const ast = new IntlMessageFormat(message, "en").getAst();

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const type = typeof node.type === "number" ? node.type : null;

    if (type !== null && type !== 0 && typeof node.value === "string") {
      variables.add(node.value);
    }

    if (isRecord(node.options)) {
      Object.values(node.options).forEach((option) => {
        if (isRecord(option)) {
          visit(option.value);
        }
      });
    }

    if (Array.isArray(node.children)) {
      visit(node.children);
    }
  }

  visit(ast);

  return [...variables].sort();
}

function normalizedVariables(value: readonly string[] | undefined) {
  return [...new Set(value ?? [])].sort();
}

function variablesMatch(first: readonly string[], second: readonly string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function pushIcuFinding(
  findings: CatalogAuditFinding[],
  input: Readonly<{
    descriptorVariables: readonly string[];
    file: string;
    id: MessageId;
    message: string;
  }>
) {
  try {
    const actualVariables = extractIcuVariables(input.message);
    const expectedVariables = normalizedVariables(input.descriptorVariables);

    if (!variablesMatch(actualVariables, expectedVariables)) {
      findings.push({
        file: input.file,
        id: input.id,
        issue: `ICU placeholders [${actualVariables.join(", ")}] do not match descriptor variables [${expectedVariables.join(", ")}].`
      });
    }
  } catch (error) {
    findings.push({
      file: input.file,
      id: input.id,
      issue: `Invalid ICU message: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

export function catalogIntegrityReport() {
  const findings: CatalogAuditFinding[] = [];

  for (const id of messageIds) {
    const descriptor = sourceCatalog[id];
    const descriptorVariables = normalizedVariables(descriptor.variables);

    if (!descriptor.defaultMessage.trim()) {
      findings.push({
        file: "content/i18n/source/en.json",
        id,
        issue: "Source descriptor is missing defaultMessage."
      });
    }

    if (!descriptor.namespace.trim()) {
      findings.push({
        file: "content/i18n/source/en.json",
        id,
        issue: "Source descriptor is missing namespace."
      });
    }

    pushIcuFinding(findings, {
      descriptorVariables,
      file: "content/i18n/source/en.json",
      id,
      message: descriptor.defaultMessage
    });

    if (descriptor.translatable === false) {
      continue;
    }

    for (const locale of publicLocales) {
      if (locale === "en") {
        continue;
      }

      const message = localeCatalog(locale)?.[id];

      if (typeof message !== "string" || !message.trim()) {
        findings.push({
          file: `content/i18n/locales/${locale}.json`,
          id,
          issue: "Missing required locale translation."
        });
        continue;
      }

      pushIcuFinding(findings, {
        descriptorVariables,
        file: `content/i18n/locales/${locale}.json`,
        id,
        message
      });
    }
  }

  for (const [locale, catalog] of Object.entries(localeCatalogs)) {
    for (const id of Object.keys(catalog)) {
      if (!isMessageId(id)) {
        findings.push({
          file: `content/i18n/locales/${locale}.json`,
          id,
          issue: "Translation exists for an unknown source ID."
        });
      }
    }
  }

  return {
    findings,
    messageCount: messageIds.length,
    publicLocales
  };
}

export function assertCatalogComplete() {
  const report = catalogIntegrityReport();

  if (report.findings.length > 0) {
    throw new Error(
      report.findings
        .map((finding) => `${finding.file}:${finding.id}: ${finding.issue}`)
        .join("\n")
    );
  }

  return report;
}

export { sourceDefaultMessage };
