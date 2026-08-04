import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/artifacts/**",
      "**/build/**",
      "**/dist-installer/**",
      "**/test-results/**",
      "**/functions/lib/**",
      "**/*.d.ts",
      "renderer.js",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...eslint.configs.recommended,
    rules: {
      "no-constant-binary-expression": "error",
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "no-constant-binary-expression": "error",
      "no-unreachable": "off",
      "react-hooks/exhaustive-deps": "off",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
);
