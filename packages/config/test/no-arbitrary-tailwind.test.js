import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";

import { arbitraryClasses, noArbitraryTailwind } from "../eslint/no-arbitrary-tailwind.js";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("arbitraryClasses", () => {
  it("finds arbitrary values, variable shorthands and arbitrary properties", () => {
    expect(
      arbitraryClasses("bg-[#fff] p-[13px] md:max-w-[68ch] text-(--x) [mask-type:alpha]"),
    ).toEqual(["bg-[#fff]", "p-[13px]", "md:max-w-[68ch]", "text-(--x)", "[mask-type:alpha]"]);
  });

  it("allows token utilities and arbitrary variants", () => {
    expect(
      arbitraryClasses(
        "bg-accent max-w-page hover:bg-accent-hover data-[state=open]:bg-surface [&>svg]:size-4",
      ),
    ).toEqual([]);
  });
});

tester.run("vira/no-arbitrary-tailwind", noArbitraryTailwind, {
  valid: [
    'const a = <div className="bg-surface p-4 text-ink" />;',
    'const a = <div className={cn("rounded-md", active && "bg-accent-soft")} />;',
    "const a = <div className={`px-4 ${wide ? 'max-w-page' : ''}`} />;",
    // Brackets outside class names are not Tailwind.
    'const a = <input pattern="[0-9]{8}" aria-label="[CEP]" />;',
    'const label = "items [1]";',
  ],
  invalid: [
    {
      code: 'const a = <div className="bg-[#fff] p-4" />;',
      errors: [{ messageId: "arbitrary", data: { className: "bg-[#fff]" } }],
    },
    {
      code: "const a = <div className={`p-[13px] ${x}`} />;",
      errors: [{ messageId: "arbitrary", data: { className: "p-[13px]" } }],
    },
    {
      code: 'const a = <div className={cn("rounded-md", on && "lg:w-[37rem]")} />;',
      errors: [{ messageId: "arbitrary", data: { className: "lg:w-[37rem]" } }],
    },
    {
      code: 'const button = cva("inline-flex", { variants: { size: { lg: "h-(--h)" } } });',
      errors: [{ messageId: "arbitrary", data: { className: "h-(--h)" } }],
    },
  ],
});
