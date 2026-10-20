// Tiny typed translator: t("today.greeting.morning", { name }) with {placeholders}.
import type { Locale } from "./config";
import { messages, type Messages } from "./messages";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;
export type T = ((key: MessageKey, vars?: Vars) => string) & {
  /** Picks `${key}One` / `${key}Other` by count; {count} is filled in. */
  plural: (key: string, count: number, vars?: Vars) => string;
  locale: Locale;
};

function lookup(tree: unknown, key: string): string | undefined {
  let node = tree;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

export function createT(locale: Locale): T {
  const resolve = (key: string, vars?: Vars) => fill(lookup(messages[locale], key) ?? lookup(messages.en, key) ?? key, vars);
  const t = ((key: MessageKey, vars?: Vars) => resolve(key, vars)) as T;
  t.plural = (key, count, vars) => resolve(`${key}${count === 1 ? "One" : "Other"}`, { count, ...vars });
  t.locale = locale;
  return t;
}
