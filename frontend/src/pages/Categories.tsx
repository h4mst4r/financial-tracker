import { useState } from 'react'
import { ACTION_ICON } from '../config/iconRegistry'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { EntityPage, EntityModal, BulkActionBar } from '../components/entity'
import type { BulkAction } from '../components/entity'
import { CategoryTree } from '../components/category/CategoryTree'
import { CategoryDefaultsPrompt } from '../components/category/CategoryDefaultsPrompt'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { Dropdown } from '../components/primitives/Dropdown'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { EmojiIconPicker, GlyphView } from '../components/primitives/EmojiIconPicker'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { useEntityManager } from '../hooks/useEntityManager'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useAlertStore } from '../stores/alertStore'
import { api, ApiError } from '../api/client'
import type { Category, CategoryType } from '../types/category'
import { CATEGORY_TYPE_META } from '../types/category'

// Categories page (UX §6) — the CategoryTree surface. Uses the EntityPage scaffold + the generic
// useEntityManager/EntityModal, but renders the CategoryTree body instead of EntityCards (the one
// sanctioned EntityCard exception). Fixed list view: a tree has no grid form. Create/Edit +
// Add-subcategory are the only mutations in Story 3.1 (archive/promote/merge are 3.2/3.4).

const DEFAULT_COLOUR = '#3b82f6'

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
  // The bulk type/move/merge chooser (one EntityModal + Dropdown; `value` is the picked option).
  const [chooser, setChooser] = useState<{ kind: 'type' | 'move' | 'merge'; value: string } | null>(
    null,
  )
  const [confirmArchive, setConfirmArchive] = useState(false)
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

  // The chooser confirm (Edit type / Move to / Merge) — dispatched by `chooser.kind`.
  const onChooserConfirm = () => {
    if (!chooser) return
    const { kind, value } = chooser
    if (kind === 'type') {
      runBulk(
        () => selected.map((c) => manager.update(c.id, { category_type: value })),
        'Could not change the category type.',
        'Category type updated',
      )
    } else if (kind === 'move') {
      runBulk(
        () => selected.map((c) => api.post(`/api/categories/${c.id}/move`, { parent_id: value })),
        'Could not move the categories.',
        'Categories moved',
      )
    } else {
      const sourceIds = selected.filter((c) => c.id !== value).map((c) => c.id)
      runAction(
        async () => {
          await api.post('/api/categories/merge', { source_ids: sourceIds, target_id: value })
          select.clear()
          manager.refetch()
        },
        'Could not merge the categories.',
        'Categories merged',
      )
    }
    setChooser(null)
  }

  // Options for the active chooser (top-level parents for Move; the selection itself for Merge).
  const moveParentOptions = manager.items
    .filter((c) => c.depth === 0 && c.status !== 'archived' && !select.isSelected(c.id))
    .map((c) => ({ value: c.id, label: glyphLabel(c) }))
  const mergeTargetOptions = selected.map((c) => ({ value: c.id, label: glyphLabel(c) }))
  const chooserConfig = chooser
    ? {
        type: { title: 'Edit type', label: 'New type', options: TYPE_OPTIONS, save: 'Apply' },
        move: { title: 'Move to…', label: 'Move under', options: moveParentOptions, save: 'Move' },
        merge: {
          title: 'Merge categories',
          label: 'Merge into',
          options: mergeTargetOptions,
          save: `Merge ${selected.length} categories`,
        },
      }[chooser.kind]
    : null

  const bulkActions: BulkAction[] = [
    { id: 'edit-type', label: 'Edit type', icon: ACTION_ICON.tag, onClick: () => setChooser({ kind: 'type', value: '' }) },
    {
      id: 'promote',
      label: 'Promote',
      icon: ACTION_ICON.promote,
      disabled: !allSubs,
      disabledReason: 'Only subcategories can be promoted',
      onClick: bulkPromote,
    },
    {
      id: 'move',
      label: 'Move to…',
      icon: ACTION_ICON.moveTo,
      disabled: !allSubs,
      disabledReason: 'Only subcategories can be moved',
      onClick: () => setChooser({ kind: 'move', value: '' }),
    },
    allArchived
      ? { id: 'restore', label: 'Restore', icon: ACTION_ICON.restore, onClick: bulkRestore }
      : { id: 'archive', label: 'Archive', icon: ACTION_ICON.archive, destructive: true, onClick: () => setConfirmArchive(true) },
    {
      id: 'merge',
      label: 'Merge',
      icon: ACTION_ICON.merge,
      destructive: true,
      disabled: selected.length < 2,
      disabledReason: 'Select at least 2 categories to merge',
      onClick: () => setChooser({ kind: 'merge', value: '' }),
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

  const saveDisabled = form.name.trim() === '' || !/^#[0-9a-fA-F]{6}$/.test(form.color)

  return (
    <div className="p-lg">
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
          <CategoryDefaultsPrompt
            onCreateDefaults={onCreateDefaults}
            onNewCategory={openCreate}
            isCreating={isSeeding}
          />
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

      {/* Bulk-action bar — pinned to the bottom of the list region; hidden at zero selection. */}
      <div className="sticky bottom-lg mt-md flex justify-center">
        <BulkActionBar count={selected.length} onClear={select.clear} actions={bulkActions} />
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit category' : form.parentId ? 'New subcategory' : 'New category'}
        onSave={handleSave}
        saveDisabled={saveDisabled}
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

      {/* Bulk type/move/merge chooser — one EntityModal + Dropdown; the modal is the single
          confirmation for the (destructive) Merge (§8.6). */}
      <EntityModal
        open={chooser !== null}
        onClose={() => setChooser(null)}
        title={chooserConfig?.title ?? ''}
        onSave={onChooserConfirm}
        saveLabel={chooserConfig?.save}
        saveDisabled={!chooser?.value}
      >
        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="bulk-chooser">{chooserConfig?.label}</Label>
          <Dropdown
            id="bulk-chooser"
            value={chooser?.value ?? ''}
            options={chooserConfig?.options ?? []}
            placeholder="Select…"
            onChange={(v) => setChooser((c) => (c ? { ...c, value: v } : c))}
          />
        </div>
      </EntityModal>

      <ConfirmationDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={bulkArchive}
        title="Archive categories"
        message={`Archive ${selected.length} ${selected.length === 1 ? 'category' : 'categories'}? Archiving a parent archives its subcategories too.`}
        confirmLabel="Archive"
      />
    </div>
  )
}
