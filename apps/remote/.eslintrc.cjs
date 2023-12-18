module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    '../../.eslintrc',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Since we are shimming MSFS APIs that truly take `any` as a type, we need it
    '@typescript-eslint/no-explicit-any': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Configure prettier
    "prettier/prettier": [
      "error",
      {
        "singleQuote": true,
        "parser": "typescript",
        "printWidth": 120
      }
    ]
  }
}
