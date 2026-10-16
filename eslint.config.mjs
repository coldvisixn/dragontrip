import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'src-tauri/**', 'backend/**', '.*/**'] },
  {
    files: ['frontend/**/*.{ts,tsx}', '*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Existing API boundaries use any; tsc still checks the project in strict mode.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['scripts/*.cjs', '*.mjs'],
    extends: [js.configs.recommended],
    // Playwright callbacks execute in the page, while the runner executes in Node.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
);
