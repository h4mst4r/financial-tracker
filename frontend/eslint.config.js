import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importX from 'eslint-plugin-import-x'

// JS-side lint gate (complements the type checker + stylelint). Enforces the project rules CI
// previously left to review: no `any` (P-coding-standards), imports at the top + grouped order,
// and the rules-of-hooks. Type-aware linting is intentionally NOT enabled (tsc -b already owns
// type errors); this keeps `eslint .` fast and project-free.
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    // react-hooks v7's flat preset still ships a legacy `plugins: [...]` array, so register it
    // manually and pin its two rules instead of extending the (broken) preset.
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { 'import-x': importX, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Fast-refresh is a dev-server HMR nicety, not correctness — advisory only. Some files
      // legitimately export a tested pure helper alongside their component (e.g. sparkPoints).
      'react-refresh/only-export-components': 'warn',
      // Imports live at the top, grouped external → internal → relative. No alphabetisation
      // (it would churn already-tidy files); ordering + no-duplicates is the value.
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'ignore',
        },
      ],
    },
  },
)
