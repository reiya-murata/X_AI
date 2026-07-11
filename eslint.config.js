import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "functions/**", ".firebase-home/**", ".firebase-emulator-data/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    files: ["scripts/**/*.{js,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
  },
];
