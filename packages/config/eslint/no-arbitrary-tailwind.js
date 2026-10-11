// vira/no-arbitrary-tailwind: Tailwind classes must resolve to a design token
// (docs/DESIGN.md, section 2). Arbitrary values (`bg-[#fff]`, `p-[13px]`), CSS
// variable shorthands (`bg-(--x)`) and arbitrary properties (`[mask-type:alpha]`)
// bypass the theme, so they are rejected. Arbitrary *variants* such as
// `data-[state=open]:` select a state, not a value, and stay allowed.

/** Functions that receive class names (N2 components compose classes through them). */
const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "twJoin"]);

/**
 * Splits a class on the variant separator, ignoring colons inside brackets, and
 * returns the utility (the part after the last variant).
 *
 * @param {string} className
 */
function utilityOf(className) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < className.length; i += 1) {
    const char = className[i];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) start = i + 1;
  }
  return className.slice(start);
}

/**
 * The classes in `text` that carry an arbitrary value.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function arbitraryClasses(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((className) => /[[(]/.test(utilityOf(className)));
}

/**
 * The slice of an AST node this rule reads. JSX nodes are not part of the ESTree
 * typings, so ancestors are walked through this shape.
 *
 * @typedef {object} AncestorNode
 * @property {string} type
 * @property {AncestorNode | null | undefined} [parent]
 * @property {{ name?: unknown }} [name] JSXAttribute name
 * @property {{ type: string, name?: string }} [callee] CallExpression callee
 */

/** @param {AncestorNode} node */
function isClassFunctionCall(node) {
  const callee = node.type === "CallExpression" ? node.callee : undefined;
  return callee?.type === "Identifier" && CLASS_FUNCTIONS.has(callee.name ?? "");
}

/** @type {import("eslint").Rule.RuleModule} */
export const noArbitraryTailwind = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Tailwind arbitrary values; use the design tokens of @vira/ui instead",
    },
    schema: [],
    messages: {
      arbitrary:
        'Arbitrary Tailwind value "{{className}}": use a design token from @vira/ui (docs/DESIGN.md, section 2), or add one there.',
    },
  },
  create(context) {
    /**
     * Whether a string node sits in a className attribute or a class-composing call.
     *
     * @param {import("eslint").Rule.Node} node
     */
    function holdsClasses(node) {
      /** @type {AncestorNode | null | undefined} */
      let current = /** @type {AncestorNode} */ (/** @type {unknown} */ (node)).parent;
      for (; current; current = current.parent) {
        if (current.type === "JSXAttribute") {
          const name = current.name?.name;
          return name === "className" || name === "class";
        }
        if (isClassFunctionCall(current)) return true;
        if (current.type.endsWith("Statement") || current.type.endsWith("Declaration")) {
          return false;
        }
      }
      return false;
    }

    /**
     * @param {import("eslint").Rule.Node} node
     * @param {string} text
     */
    function check(node, text) {
      if (!holdsClasses(node)) return;
      for (const className of arbitraryClasses(text)) {
        context.report({ node, messageId: "arbitrary", data: { className } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export const viraPlugin = {
  meta: { name: "vira" },
  rules: { "no-arbitrary-tailwind": noArbitraryTailwind },
};
