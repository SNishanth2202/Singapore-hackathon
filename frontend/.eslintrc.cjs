module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ['dist/', 'test-results/', 'showcase-test-results/', 'playwright-report/'],
  extends: ['eslint:recommended'],
  plugins: ['@typescript-eslint', 'react-hooks'],
  rules: {
    'no-undef': 'off', // TypeScript resolves names in both type and value positions.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
    'react-hooks/rules-of-hooks': 'error',
  },
}
