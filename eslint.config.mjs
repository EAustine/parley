import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  /**
   * Playwright fixtures are not React hooks.
   *
   * `react-hooks/rules-of-hooks` matches on the *name*, and a fixture's second
   * argument is `use` by convention — `async ({}, use) => { await use(code) }`.
   * The rule reports every fixture in `e2e/fixtures.ts` as a hook called
   * outside a component, and has done since the suite grew its own meeting
   * fixtures. There is no React in `e2e/`, so the rule has nothing to say here.
   *
   * Renaming the argument would silence it too, and would mean writing
   * non-idiomatic Playwright to satisfy a rule aimed at a different library.
   */
  {
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
