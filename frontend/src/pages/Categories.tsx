import { useState } from 'react'
import { FolderTree } from 'lucide-react'
import { EntityPage, EntityModal } from '../components/entity'
import { CategoryTree } from '../components/category/CategoryTree'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { Dropdown } from '../components/primitives/Dropdown'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { EmojiIconPicker } from '../components/primitives/EmojiIconPicker'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { useEntityManager } from '../hooks/useEntityManager'
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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)
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
  const onDelete = (c: Category) => setConfirmDelete(c)
  const doDelete = (c: Category) =>
    runAction(
      () => manager.deletePermanently(c.id),
      'Could not delete the category.',
      'Category deleted',
    )

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
        emptyIcon={FolderTree}
        emptyTitle="No categories yet"
        emptyDescription="Create your first category to start classifying activity."
      >
        <CategoryTree
          items={visible}
          onEdit={openEdit}
          onAddSubcategory={openAddSub}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          onMove={onMove}
        />
      </EntityPage>

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
    </div>
  )
}
