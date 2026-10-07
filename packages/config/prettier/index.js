// Shared Prettier config. Markdown is linted by markdownlint instead.

/** @type {import("prettier").Config} */
const config = {
  printWidth: 100,
  singleQuote: false,
  trailingComma: "all",
  endOfLine: "lf",
};

export default config;
