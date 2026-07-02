import { useState } from 'react'
import { ACTION_ICON } from '../config/iconRegistry'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { EntityPage, EntityModal, BulkActionBar } from '../components/entity'
import type { BulkAction } from '../components/entity'
import { CategoryTree } from '../components/category/CategoryTree'
import { Button } from '../components/primitives/Button'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { Dropdown } from '../components/primitives/Dropdown'
import { ColourPicker, DEFAULT_ENTITY_COLOUR } from '../components/primitives/ColourPicker'
import { EmojiIconPicker, GlyphView } from '../components/primitives/EmojiIconPicker'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { useEntityManager } from '../hooks/useEntityManager'
import { useFormValidation, REQUIRED_FIELDS_NOTE } from '../components/primitives/behaviors'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useAlertStore } from '../stores/alertStore'
import { api, ApiError } from '../api/client'
import type { Category, CategoryType } from '../types/category'
import { CATEGORY_TYPE_META } from '../types/category'

// Categories page (UX §6) — the CategoryTree surface. Uses the EntityPage scaffold + the generic
// useEntityManager/EntityModal, but renders the CategoryTree body instead of EntityCards (the one
// sanctioned EntityCard exception). Fixed list view: a tree has no grid form. Create/Edit +
// Add-subcategory are the only mutations in Story 3.1 (archive/promote/merge are 3.2/3.4).

const DEFAULT_COLOUR = DEFAULT_ENTITY_COLOUR

// Type options with semantic-coloured labels (Expense red · Income green · Both blue) — the label
// text colour matches the CategoryTree type badge (UX §6 / §0.1 inflow-outflow semantics).
const TYPE_OPTIONS = (['expense', 'income', 'both'] as CategoryType[]).map((t) => ({
  value: t,
  label: <span className={CATEGORY_TYPE_META[t].text}>{CATEGORY_TYPE_META[t].label}</span>,
}))

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]

// A Dropdown option label for a bulk chooser: the category's glyph (if any) + its name, so the
// picked Move/Merge target is unambiguous.
function glyphLabel(c: Category) {
  return (
    <span className="flex items-center gap-2">
      {c.icon ? <GlyphView glyph={c.icon} size={16} /> : null}
      {c.name}
    </span>
  )
}

interface FormState {
  id: string | null
  parentId: string | null
  name: string
  color: string
  vivid: boolean
  icon: string | null
  categoryType: Category['category_type']
}

const EMPTY_FORM: FormState = {
  id: null,
  parentId: null,
  name: '',
  color: DEFAULT_COLOUR,
  vivid: false,
  icon: null,
  categoryType: 'expense',
}

export function Categories() {
  const manager = useEntityManager<Category>({
    entityType: 'categories',
    basePath: '/api/categories',
  })
  const select = useMultiSelect()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  // Merge is destructive → the inline BulkActionBar picker selects the target, then a ConfirmationDialog
  // confirms (UX §8.6 — the bar owns the pick inline; there is no bulk-chooser modal).
  const [confirmMerge, setConfirmMerge] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const pushToast = useAlertStore((s) => s.pushToast)

  // RFC 7807 `detail` is a string for our typed errors (an array only for 422 field errors);
  // 401 short-circuits to /login upstream.
  const toastError = (err: unknown, fallback: string) => {
    const detail = err instanceof ApiError ? err.details?.detail : undefined
    const message =
      typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : fallback
    pushToast({ variant: 'error', message })
  }
  const runAction = async (fn: () => Promise<unknown>, fallback: string, success?: string) => {
    try {
      await fn()
      if (success) pushToast({ variant: 'success', message: success })
    } catch (err) {
      toastError(err, fallback)
    }
  }

  const onArchive = (c: Category) =>
    runAction(() => manager.archive(c.id), 'Could not archive the category.', 'Category archived')
  const onRestore = (c: Category) =>
    runAction(() => manager.restore(c.id), 'Could not restore the category.', 'Category restored')
  // Promote (parentId=null) / re-parent — the single move behind both ⋮ and drag. useEntityManager
  // has no `move`, so call the category-specific endpoint and refetch the tree.
  const onMove = (id: string, parentId: string | null) =>
    runAction(async () => {
      await api.post(`/api/categories/${id}/move`, { parent_id: parentId })
      manager.refetch()
    }, 'Could not move the category.')
  // Create-defaults recovery (FR-C-007) — seeds the 13 starters idempotently, then refetches the
  // tree. useEntityManager has no seed method, so call the endpoint directly (the onMove precedent).
  const onCreateDefaults = () =>
    runAction(
      async () => {
        setIsSeeding(true)
        try {
          await api.post('/api/categories/defaults')
          manager.refetch()
        } finally {
          setIsSeeding(false)
        }
      },
      'Could not create the default categories.',
      'Default categories created',
    )
  const onDelete = (c: Category) => setConfirmDelete(c)
  const doDelete = (c: Category) =>
    runAction(
      () => manager.deletePermanently(c.id),
      'Could not delete the category.',
      'Category deleted',
    )

  // ── Bulk multi-select (Story 3.4, FR-E-020) ──
  const selected = manager.items.filter((c) => select.isSelected(c.id))
  const allSubs = selected.length > 0 && selected.every((c) => c.depth === 1)
  const allArchived = selected.length > 0 && selected.every((c) => c.status === 'archived')
  // Bulk hard-delete is offered only for an archived selection where every row is empty (no subs / not
  // in use) — `can_delete` is the backend's authoritative emptiness signal (Story 3.2). FR-C-006 / §8.1.
  const allCanDelete = selected.length > 0 && selected.every((c) => c.can_delete)

  // Run a batch of single-row mutations, then clear the selection + refetch the tree. Each per-row
  // endpoint audits its own item and the archive cascade/idempotency hold, so no bulk endpoint is
  // needed (only Merge is server-side atomic).
  const runBulk = (makeCalls: () => Promise<unknown>[], fallback: string, success: string) =>
    runAction(
      async () => {
        await Promise.all(makeCalls())
        select.clear()
        manager.refetch()
      },
      fallback,
      success,
    )

  const bulkPromote = () =>
    runBulk(
      () => selected.map((c) => api.post(`/api/categories/${c.id}/move`, { parent_id: null })),
      'Could not promote the categories.',
      'Categories promoted',
    )
  const bulkArchive = () =>
    runBulk(
      () => selected.map((c) => manager.archive(c.id)),
      'Could not archive the categories.',
      'Categories archived',
    )
  const bulkRestore = () =>
    runBulk(
      () => selected.map((c) => manager.restore(c.id)),
      'Could not restore the categories.',
      'Categories restored',
    )

  // ── Inline bulk-picker handlers (UX §8.6 — the pick applies directly; Merge confirms first) ──
  const bulkEditType = (value: string) =>
    runBulk(
      () => selected.map((c) => manager.update(c.id, { category_type: value })),
      'Could not change the category type.',
      'Category type updated',
    )
  const bulkMove = (parentId: string) =>
    runBulk(
      () => selected.map((c) => api.post(`/api/categories/${c.id}/move`, { parent_id: parentId })),
      'Could not move the categories.',
      'Categories moved',
    )
  const bulkDelete = () =>
    runBulk(
      () => selected.map((c) => manager.deletePermanently(c.id)),
      'Could not delete the categories.',
      'Categories deleted',
    )
  // Merge the (non-target) sources into the chosen target, after the ConfirmationDialog (destructive).
  const doMerge = (targetId: string) => {
    const sourceIds = selected.filter((c) => c.id !== targetId).map((c) => c.id)
    runAction(
      async () => {
        await api.post('/api/categories/merge', { source_ids: sourceIds, target_id: targetId })
        select.clear()
        manager.refetch()
      },
      'Could not merge the categories.',
      'Categories merged',
    )
  }

  // Inline-picker option lists (top-level parents for Move; the selection itself for Merge). `searchText`
  // lets the searchable Move picker match on the category name (not just the glyph node).
  const moveParentOptions = manager.items
    .filter((c) => c.depth === 0 && c.status !== 'archived' && !select.isSelected(c.id))
    .map((c) => ({ value: c.id, label: glyphLabel(c), searchText: c.name }))
  const mergeTargetOptions = selected.map((c) => ({ value: c.id, label: glyphLabel(c), searchText: c.name }))
  const mergeTarget = confirmMerge ? selected.find((c) => c.id === confirmMerge) ?? null : null

  const bulkActions: BulkAction[] = [
    { kind: 'picker', id: 'edit-type', label: 'Edit type', options: TYPE_OPTIONS, onPick: bulkEditType },
    {
      id: 'promote',
      label: 'Promote',
      icon: ACTION_ICON.promote,
      disabled: !allSubs,
      disabledReason: 'Only subcategories can be promoted',
      onClick: bulkPromote,
    },
    {
      kind: 'picker',
      id: 'move',
      label: 'Move to…',
      options: moveParentOptions,
      searchable: true,
      disabled: !allSubs,
      disabledReason: 'Only subcategories can be moved',
      onPick: bulkMove,
    },
    allArchived
      ? { id: 'restore', label: 'Restore', icon: ACTION_ICON.restore, onClick: bulkRestore }
      : { id: 'archive', label: 'Archive', icon: ACTION_ICON.archive, destructive: true, onClick: () => setConfirmArchive(true) },
    // Delete (archived-only): hard-delete the empty selection — distinct from Archive, and it actually
    // removes the rows (FR-C-006 / §8.1). Disabled with a reason when any selected row still has deps.
    ...(allArchived
      ? [
          {
            id: 'delete',
            label: 'Delete',
            icon: ACTION_ICON.delete,
            destructive: true,
            disabled: !allCanDelete,
            disabledReason: 'Only empty categories (no subcategories, transactions, or budgets) can be deleted',
            onClick: () => setConfirmBulkDelete(true),
          } satisfies BulkAction,
        ]
      : []),
    {
      kind: 'picker',
      id: 'merge',
      label: 'Merge',
      options: mergeTargetOptions,
      destructive: true,
      disabled: selected.length < 2,
      disabledReason: 'Select at least 2 categories to merge',
      onPick: setConfirmMerge,
    },
  ]

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  const openEdit = (category: Category) => {
    setForm({
      id: category.id,
      parentId: category.parent_id,
      name: category.name,
      color: category.color,
      vivid: category.vivid,
      icon: category.icon,
      categoryType: category.category_type,
    })
    setModalOpen(true)
  }
  const openAddSub = (parent: Category) => {
    setForm({ ...EMPTY_FORM, parentId: parent.id, categoryType: parent.category_type })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      color: form.color,
      icon: form.icon,
      category_type: form.categoryType,
      vivid: form.vivid,
      parent_id: form.parentId,
    }
    try {
      if (form.id) await manager.update(form.id, payload)
      else await manager.create(payload)
      setModalOpen(false)
    } catch (err) {
      // 409 (duplicate name) / 400 (bad type) etc. surface here, keeping the modal open.
      toastError(err, 'Could not save the category.')
    }
  }

  // Filter by type + search, keeping parents of matched children so the tree can still render them.
  const q = search.trim().toLowerCase()
  const matchesType = (c: Category) =>
    typeFilter === 'all' || c.category_type === typeFilter || c.category_type === 'both'
  const matchesSearch = (c: Category) => q === '' || c.name.toLowerCase().includes(q)
  const directMatches = manager.items.filter((c) => matchesType(c) && matchesSearch(c))
  const matchIds = new Set(directMatches.map((c) => c.id))
  const parentIds = new Set(
    directMatches.filter((c) => c.parent_id !== null).map((c) => c.parent_id as string),
  )
  const visible = manager.items.filter((c) => matchIds.has(c.id) || parentIds.has(c.id))

  // UX §6 — Save is never disabled for missing fields; a submit attempt reddens + shakes the offending
  // Field, focuses the first, and shows the summary note. Colour is always a valid hex from the picker.
  const validation = useFormValidation({
    fields: [
      { id: 'cat-name', invalid: form.name.trim() === '' },
      { id: 'cat-colour', invalid: !/^#[0-9a-fA-F]{6}$/.test(form.color) },
    ],
  })

  return (
    <div>
      <EntityPage
        title="Categories"
        info="Organise spending and income into a 2-level tree."
        newLabel="category"
        onNew={openCreate}
        search={search}
        onSearchChange={setSearch}
        view="list"
        onViewChange={() => {}}
        hideViewToggle
        hideSort
        showArchived={manager.showArchived}
        onShowArchivedChange={manager.setShowArchived}
        filters={
          <SegmentedControl value={typeFilter} options={FILTER_OPTIONS} onChange={setTypeFilter} />
        }
        isLoading={manager.isLoading}
        isError={manager.isError}
        onRetry={manager.refetch}
        isEmpty={manager.items.length === 0}
        emptyIcon={EMPTY_STATE.categories.icon}
        emptyTitle={EMPTY_STATE.categories.title}
        emptyDescription={EMPTY_STATE.categories.description}
        emptyAction={
          <div className="flex flex-wrap items-center justify-center gap-sm">
            <Button onClick={onCreateDefaults} disabled={isSeeding}>
              Create defaults
            </Button>
            <Button variant="outline" onClick={openCreate}>
              New category
            </Button>
          </div>
        }
      >
        <CategoryTree
          items={visible}
          onEdit={openEdit}
          onAddSubcategory={openAddSub}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          onMove={onMove}
          selectedIds={select.selectedIds}
          onToggleSelect={select.toggle}
        />
      </EntityPage>

      {/* Bulk-action bar — pinned to the bottom of the list region; hidden at zero selection. < md it
          pins flush above the fixed mobile nav and goes full-width (the bar itself scrolls its actions).
          NB: `bottom-0` (not bottom-nav-mobile) — `AppShell <main>` already insets its bottom by
          --nav-mobile-h (UX §17), and sticky `bottom` is measured from that padded scrollport edge, so a
          second nav-height offset here would COMPOUND into a gap. ≥ md it's the centred sticky bar. */}
      <div className="sticky bottom-lg max-md:bottom-0 mt-md flex justify-center">
        <BulkActionBar count={selected.length} onClear={select.clear} actions={bulkActions} />
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit category' : form.parentId ? 'New subcategory' : 'New category'}
        onSave={() => validation.submit(handleSave)}
        saveDisabled={manager.isSaving}
        errorSummary={validation.showSummary ? REQUIRED_FIELDS_NOTE : undefined}
        shakeSave={validation.shaking}
        saveLabel={form.id ? 'Save' : 'Create'}
      >
        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="cat-name" required>
            Name
          </Label>
          <Input
            id="cat-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Groceries"
            error={validation.errors['cat-name']}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <Label htmlFor="cat-type">Type</Label>
          <Dropdown
            id="cat-type"
            value={form.categoryType}
            options={TYPE_OPTIONS}
            onChange={(v) => setForm((f) => ({ ...f, categoryType: v as Category['category_type'] }))}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <Label htmlFor="cat-icon">Icon</Label>
          <EmojiIconPicker
            id="cat-icon"
            value={form.icon}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
          />
        </div>

        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="cat-colour">Colour</Label>
          <ColourPicker
            id="cat-colour"
            value={form.color}
            onChange={(color) => setForm((f) => ({ ...f, color }))}
            vivid={form.vivid}
            onVividChange={(vivid) => setForm((f) => ({ ...f, vivid }))}
          />
        </div>
      </EntityModal>

      <ConfirmationDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) doDelete(confirmDelete)
        }}
        title="Delete category"
        message={
          confirmDelete
            ? `Permanently delete "${confirmDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
      />

      <ConfirmationDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={bulkArchive}
        title="Archive categories"
        message={`Archive ${selected.length} ${selected.length === 1 ? 'category' : 'categories'}? Archiving a parent archives its subcategories too.`}
        confirmLabel="Archive"
      />

      {/* Merge confirm — the inline picker chose the surviving target; this is the destructive gate (§8.6). */}
      <ConfirmationDialog
        open={confirmMerge !== null}
        onClose={() => setConfirmMerge(null)}
        onConfirm={() => {
          if (confirmMerge) doMerge(confirmMerge)
        }}
        title="Merge categories"
        message={
          mergeTarget
            ? `Merge ${selected.length - 1} ${selected.length - 1 === 1 ? 'category' : 'categories'} into "${mergeTarget.name}"? Their transactions move to "${mergeTarget.name}" and the merged categories are archived.`
            : ''
        }
        confirmLabel="Merge"
      />

      <ConfirmationDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        title="Delete categories"
        message={`Permanently delete ${selected.length} ${selected.length === 1 ? 'category' : 'categories'}? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
