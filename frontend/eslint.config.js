import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importX from 'eslint-plugin-import-x'
import jsxA11y from 'eslint-plugin-jsx-a11y'

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
      // a11y is part of the L15 gate (Part II) — contrast/never-colour-alone/focus are unit + behavior
      // tests; the structural a11y rules (alt text, label association, no static-element interactions,
      // valid aria) are this lint layer (FRONTEND-AUDIT F4 — the plugin was previously not installed).
      jsxA11y.flatConfigs.recommended,
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
      // autoFocus is intentional UX here, not an a11y defect: pickers focus their search Input on open
      // and inline-edit cells focus the editor when entered (focus management owned by the 5f-1
      // behaviors). The L15 focus terminal is covered by the behavior/integration tests, so the blanket
      // `no-autofocus` ban is off (its absence would regress the focus-on-open affordance).
      'jsx-a11y/no-autofocus': 'off',
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
      // L14 (Part II) — glyphs are routed through the §11 icon registry so a library swap is one edit.
      // A lucide VALUE import is banned outside the registry homes (the file-override below re-allows
      // them); `allowTypeImports: true` keeps the type-only `LucideIcon` import legal everywhere.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'Do not import a lucide glyph directly — add it to the §11 icon registry (config/iconRegistry.ts et al.) and render via <Icon>. Type-only `import type { LucideIcon }` is allowed.',
              allowTypeImports: true,
            },
          ],
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
        // L8 (Part II) — a raw element a primitive provides must use the primitive. Promoted to `error`
        // (these have zero raw uses outside primitives/, so they lock the surface against future drift):
        {
          selector: 'JSXOpeningElement[name.name="hr"]',
          message: 'Do not hand-roll an <hr>. Import the Divider primitive from components/primitives.',
        },
        {
          selector: 'JSXOpeningElement[name.name="progress"]',
          message: 'Do not hand-roll a <progress>. Import the ProgressBar primitive from components/primitives.',
        },
        {
          selector: 'JSXOpeningElement[name.name="dialog"]',
          message: 'Do not hand-roll a <dialog>. Import the Modal primitive from components/primitives.',
        },
        // ── AUDIT BACKLOG (still deferred — each blocked on a prerequisite, not yet promotable) ──
        // <button>  → Button   DEFERRED to Story 5.12 (Primitive Retrofit). The Button variant set is now
        //                        complete (5f-9: filled/outline/ghost/danger/text/link/icon — the bare
        //                        size-to-child `icon` variant is the target the ~15 raw uses need:
        //                        CategoryTree drag handle, EntityCard stretched click-overlay, BulkActionBar/
        //                        AccountModal/AccountDetailView icon buttons, Sidebar nav, EntityPage). The
        //                        remaining blocker is the consumer migration itself (recompose each raw
        //                        <button> onto the right variant, parity-preserving P0) — that + flipping
        //                        this row to `error` is Story 5.12's job. Stays commented until then.
        // <input>   → Input    (raw only in DesignSystem demo)
        // <table>/<thead>/<tbody>/<tr>/<td>/<th> → Table  → promote in Story 5.12 (Primitive Retrofit —
        //                        its ACs migrate F1/F2: the AccountDetailView SnapshotLedger + the
        //                        Currencies/Members/Invitations/FX-provider lists onto Table).
      ],
    },
  },
  {
    // The primitive layer is the one place these controls are allowed to be defined.
    files: ['src/components/primitives/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // L14 allowlist — the §11 icon registry homes are the ONE place lucide glyphs are value-imported
    // (config registries + the nav/public registries + the Icon primitive + the demo gallery). A glyph
    // swap is a single edit here; everywhere else routes through <Icon>.
    files: [
      'src/config/**/*.{ts,tsx}',
      'src/components/shell/navigation.ts',
      'src/pages/public/publicPages.ts',
      'src/components/primitives/Icon.tsx',
      'src/pages/DesignSystem.tsx',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Test files render synthetic interactive `<div>`s as fixtures to exercise the headless behaviors
    // (e.g. behaviors.test.tsx, favourite-star.test.tsx) — those are test scaffolding, not product UI,
    // so the structural a11y rules don't apply. Product a11y is enforced on src/**.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      // Tests import real lucide glyphs as fixtures to verify the §11 registry / Icon rendering.
      'no-restricted-imports': 'off',
    },
  },
)
