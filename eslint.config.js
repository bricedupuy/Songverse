// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/.output/**",
      "**/.vinxi/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.gen.ts",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Prefixing with _ is the repo convention for intentionally unused args.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
