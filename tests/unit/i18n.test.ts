import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { createT } from "@/i18n/translate";
import { localeFromAcceptLanguage } from "@/i18n/config";

type Tree = { [k: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages", () => {
  const en = new Map(leaves(messages.en as unknown as Tree));
  const zh = new Map(leaves(messages.zh as unknown as Tree));

  it("has a non-empty Chinese string for every English key, and nothing extra", () => {
    const missing = [...en.keys()].filter((k) => !zh.get(k)?.trim());
    const extra = [...zh.keys()].filter((k) => !en.has(k));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("uses the same {placeholders} in both languages", () => {
    const mismatched = [...en].filter(([k, v]) => zh.has(k) && placeholders(v).join() !== placeholders(zh.get(k)!).join()).map(([k]) => k);
    expect(mismatched).toEqual([]);
  });
});

describe("createT", () => {
  it("fills placeholders and falls back to English", () => {
    const t = createT("zh");
    expect(t("common.save")).toBe("保存");
    expect(createT("en")("nav.today")).toBe("Today");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("prefers the first supported language", () => {
    expect(localeFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,zh;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("ms-MY,zh-TW;q=0.5")).toBe("zh");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });
});
