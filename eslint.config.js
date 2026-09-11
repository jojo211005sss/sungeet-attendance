import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      // Browser globals. These were incomplete — setTimeout and
      // AbortController in the existing api() helper were already being
      // reported as undefined, so `npm run lint` never came back clean.
      globals: {
        AbortController: "readonly",
        alert: "readonly",
        Blob: "readonly",
        console: "readonly",
        createImageBitmap: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        fetch: "readonly",
        File: "readonly",
        FileReader: "readonly",
        localStorage: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        window: "readonly"
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }]
    }
  }
];
