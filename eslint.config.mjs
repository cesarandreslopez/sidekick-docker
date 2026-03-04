import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["**/node_modules/", "**/dist/", "**/out/", "**/*.mjs", "**/*.js"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["sidekick-docker-cli/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["sidekick-docker-*/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "no-control-regex": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
