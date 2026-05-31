import nextConfig from "eslint-config-next"

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    settings: {
      react: { version: "19" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/display-name":                 "off",
      // Backend is API-only — React hook rules don't apply to route handlers
      "react-hooks/rules-of-hooks":         "off",
      "react-hooks/exhaustive-deps":        "off",
      "react-hooks/set-state-in-effect":    "off",
      "react-hooks/immutability":           "off",
      // <img> acceptable in this server context
      "@next/next/no-img-element":          "off",
    },
  },
]

export default config
