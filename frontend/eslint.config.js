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
      // Reuse over reinvention: a raw HTML element that already has a primitive wrapper must not be
      // hand-rolled outside `primitives/`. This fails the duplication (the radio-button class of bug)
      // at generation time, not review. Only tags with ZERO legitimate raw use are listed as `error`;
      // the rest are an AUDIT BACKLOG below — promote each to `error` as the file-by-file audit
      // migrates its remaining raw uses to the primitive (the rule going green IS the audit's DoD).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXOpeningElement[name.name="input"]:has(JSXAttribute[name.name="type"] > Literal[value=/^(checkbox|radio)$/])',
          message:
            'Do not hand-roll a checkbox/radio. Import the Checkbox/Toggle primitive from components/primitives.',
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: 'Do not hand-roll a <select>. Import the Dropdown primitive from components/primitives.',
        },
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message: 'Do not hand-roll a <textarea>. Import the Input primitive from components/primitives.',
        },
        // ── AUDIT BACKLOG: uncomment each as its raw uses are migrated to the primitive ──
        // <button>  → Button   (raw in CategoryTree, BulkActionBar, EntityCard, EntityPage, Sidebar,
        //                        AccountDetailView, AccountModal, DesignSystem — many legit icon/nav
        //                        buttons; needs case-by-case triage, not a blanket migration)
        // <input>   → Input    (raw only in DesignSystem demo)
        // <table>/<thead>/<tbody>/<tr>/<td>/<th> → Table  (hand-rolled tables in AccountDetailView,
        //                        Currencies — direct parallel to the radio-button bug)
        // <hr>      → Divider
        // <progress>→ ProgressBar
        // <dialog>  → Modal
      ],
    },
  },
  {
    // The primitive layer is the one place these controls are allowed to be defined.
    files: ['src/components/primitives/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
