import { Button } from '../primitives/Button'
import type { CategoryType } from '../../types/category'

// The zero-active-categories prompt (UX §6, FR-C-007): a preview of the 13 starter categories as
// chips + a primary "Create defaults" and a secondary "New category". Presentational only — the
// authoritative seed lives server-side (`POST /api/categories/defaults`); these chips just mirror
// the names/icons (ARCH §3.7). Income chips are tinted with the semantic income colour.
const DEFAULT_PREVIEW: { name: string; icon: string; type: CategoryType }[] = [
  { name: 'Food & Dining', icon: '🍔', type: 'expense' },
  { name: 'Groceries', icon: '🛒', type: 'expense' },
  { name: 'Transport', icon: '🚇', type: 'expense' },
  { name: 'Housing', icon: '🏠', type: 'expense' },
  { name: 'Utilities', icon: '💡', type: 'expense' },
  { name: 'Healthcare', icon: '🏥', type: 'expense' },
  { name: 'Shopping', icon: '🛍', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', type: 'expense' },
  { name: 'Insurance', icon: '🛡', type: 'expense' },
  { name: 'Education', icon: '🎓', type: 'expense' },
  { name: 'Salary', icon: '💰', type: 'income' },
  { name: 'Investment Income', icon: '📈', type: 'income' },
  { name: 'Miscellaneous', icon: '📦', type: 'both' },
]

interface CategoryDefaultsPromptProps {
  onCreateDefaults: () => void
  onNewCategory: () => void
  isCreating?: boolean
}

export function CategoryDefaultsPrompt({
  onCreateDefaults,
  onNewCategory,
  isCreating,
}: CategoryDefaultsPromptProps) {
  return (
    <div data-testid="category-defaults-prompt" className="flex flex-col items-center gap-md">
      <div className="flex flex-wrap justify-center gap-xs">
        {DEFAULT_PREVIEW.map((c) => (
          <span
            key={c.name}
            className={`inline-flex items-center gap-xs rounded-full border border-border px-sm py-xs text-xs ${
              c.type === 'income' ? 'bg-success-fill text-success' : 'text-text-secondary'
            }`}
          >
            <span className="font-emoji">{c.icon}</span>
            {c.name}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-sm">
        <Button onClick={onCreateDefaults} disabled={isCreating}>
          Create defaults
        </Button>
        <Button variant="secondary" onClick={onNewCategory}>
          New category
        </Button>
      </div>
    </div>
  )
}
