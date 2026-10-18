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
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // TUI colours come from cli/src/theme.ts and formatters.ts (which gates
    // NO_COLOR / --no-color). A hex literal or a raw ANSI escape here bypasses
    // one or both — that is how the unreadable navy and the uncoloured-but-
    // still-coloured Files/Patterns tabs happened.
    files: ["sidekick-docker-cli/src/dashboard/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]", message: "Use a colour token from cli/src/theme.ts." },
        { selector: "Literal[value=/\\u001b\\[[0-9;]*m/]", message: "Use the ansi.* helpers in formatters.ts so NO_COLOR/--no-color apply." },
        { selector: "TemplateElement[value.cooked=/\\u001b\\[[0-9;]*m/]", message: "Use the ansi.* helpers in formatters.ts so NO_COLOR/--no-color apply." },
      ],
    },
  },
  {
    rules: {
      "no-control-regex": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
