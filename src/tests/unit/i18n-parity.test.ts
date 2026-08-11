import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "../../i18n/ar.json";
import en from "../../i18n/en.json";

// A key that exists in one locale and not the other is invisible until an
// Arabic-speaking user meets it, and then it renders as the literal key path —
// `admin.classes.cards.status.issued` sitting where a status chip should be.
// The Playwright suite catches that on the pages it visits; this catches it
// everywhere, and before a browser is involved.

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

describe("translation parity", () => {
  const enKeys = new Set(flatten(en as Tree));
  const arKeys = new Set(flatten(ar as Tree));

  it("has an Arabic string for every English one", () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k));
    expect(missing, "keys present in en.json but missing from ar.json").toEqual([]);
  });

  it("has an English string for every Arabic one", () => {
    const missing = [...arKeys].filter((k) => !enKeys.has(k));
    expect(missing, "keys present in ar.json but missing from en.json").toEqual([]);
  });

  it("leaves no Arabic string identical to its English counterpart by accident", () => {
    // Some legitimately match — course codes, brand names, numerals. The point
    // is to notice when a whole block was copied across and never translated.
    const flatEn = Object.fromEntries([...enKeys].map((k) => [k, valueAt(en as Tree, k)]));
    const untranslated = [...arKeys].filter((k) => {
      const arValue = valueAt(ar as Tree, k);
      // Anything containing Arabic script has clearly been through a
      // translator; anything purely ASCII and long enough to be a sentence
      // has probably not.
      return arValue === flatEn[k] && !/[؀-ۿ]/.test(arValue) && arValue.length > 24;
    });
    expect(untranslated, "Arabic strings that look like untranslated English").toEqual([]);
  });
});

function valueAt(tree: Tree, path: string): string {
  return path.split(".").reduce<string | Tree>((node, key) => (node as Tree)[key], tree) as string;
}

describe("the new admin panels reference only keys that exist", () => {
  // Extracted from source rather than listed by hand, so a key added to a
  // panel tomorrow is covered without anyone remembering to add it here.
  const PANELS = [
    "src/app/[locale]/(admin)/admin/classes/[id]/assessment-panel.tsx",
    "src/app/[locale]/(admin)/admin/classes/[id]/cards-panel.tsx",
  ];
  const NAMESPACE = /useTranslations\("([^"]+)"\)/;
  const CALL = /\bt\("([^"]+)"/g;

  for (const panel of PANELS) {
    it(`${panel.split("/").pop()} resolves every key in both locales`, () => {
      const source = readFileSync(join(process.cwd(), panel), "utf8");
      const namespace = source.match(NAMESPACE)?.[1];
      expect(namespace, "panel must declare a namespace").toBeTruthy();

      const keys = [...source.matchAll(CALL)].map((m) => `${namespace}.${m[1]}`);
      expect(keys.length, "panel should use translations").toBeGreaterThan(5);

      const enKeys = new Set(flatten(en as Tree));
      const arKeys = new Set(flatten(ar as Tree));
      for (const key of keys) {
        expect(enKeys.has(key), `${key} missing from en.json`).toBe(true);
        expect(arKeys.has(key), `${key} missing from ar.json`).toBe(true);
      }
    });
  }
});
