/**
 * Category API client functions.
 *
 * Handles all category-related API calls with proper credentials,
 * session headers, and CSRF tokens.
 */

// --- Types ---

export interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  type: string;
  is_default: boolean;
  is_archived: boolean;
  parent_id: string | null;
  children_count: number;
  household_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CategoryCreateData {
  name: string;
  color?: string;
  icon?: string | null;
  parent_id?: string | null;
}

export interface CategoryUpdateData {
  name?: string;
  color?: string;
  icon?: string | null;
  parent_id?: string | null;
}

export interface CategoryTreeNode {
  id: string;
  household_id: string | null;
  parent_id: string | null;
  name: string;
  type: string;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  is_archived: boolean;
  children_count: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  children: CategoryTreeNode[];
}

export interface SpendingBreakdown {
  category_id: string;
  category_name: string;
  amount: number;
  transaction_count: number;
}

export interface SpendingSummary {
  category_id: string;
  category_name: string;
  direct_amount: number;
  direct_transaction_count: number;
  children_amount: number;
  children_count: number;
  total_amount: number;
  total_transaction_count: number;
  children_breakdown: SpendingBreakdown[];
}

export interface ReassignChildrenResponse {
  reassigned_count: number;
  reassigned_ids: string[];
  new_parent_id: string | null;
}

// --- Import Category Mapping ---

export interface ImportedCategory {
  imported_name: string;
  transaction_count: number;
  matched_category_id: string | null;
  matched_category_name: string | null;
  match_type: "exact" | "trimmed" | "fuzzy" | "unmapped";
  needs_mapping: boolean;
}

export interface ImportPreviewResponse {
  mappings: ImportedCategory[];
  total_categories: number;
  exact_matches: number;
  fuzzy_matches: number;
  unmapped_count: number;
}

export interface MappingOverride {
  imported_name: string;
  mapped_to_id: string | null;
  create_new: boolean;
}

export interface CreatedCategory {
  id: string;
  name: string;
  color: string;
}

export interface AppliedMapping {
  imported_name: string;
  mapped_to_id: string;
  action: "mapped_to_existing" | "auto_created";
}

export interface ImportMappingResponse {
  created_categories: CreatedCategory[];
  applied_mappings: AppliedMapping[];
  total_created: number;
  total_mapped: number;
}

export interface SeedStatus {
  is_seeded: boolean;
  expense_count: number;
  income_count: number;
}

export interface MergeSourceResult {
  id: string;
  name: string;
  transactions_reassigned: number;
  subcategories_reassigned: number;
}

export interface MergeResponse {
  success: boolean;
  target_category: Record<string, unknown>;
  sources_merged: MergeSourceResult[];
  total_transactions_reassigned: number;
  total_subcategories_reassigned: number;
  message: string;
}

export interface DuplicateCategory {
  id: string;
  name: string;
  transaction_count: number;
}

export interface DuplicateGroup {
  group_id: number;
  categories: DuplicateCategory[];
  similarity: string;
}

export interface DuplicatesResponse {
  duplicate_groups: DuplicateGroup[];
}

// --- Helpers ---

function getSessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const sessionId = localStorage.getItem('session_id');
  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }
  return headers;
}

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf-token', {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: ${response.statusText}`);
  }
  const data = await response.json();
  return data.csrf_token;
}

// --- API Functions ---

/**
 * Fetch categories for the current user's household.
 */
export const fetchCategories = async (params?: {
  include_archived?: boolean;
  parent_id?: string;
  top_level?: boolean;
}): Promise<Category[]> => {
  const searchParams = new URLSearchParams();
  if (params?.include_archived) searchParams.set('include_archived', 'true');
  if (params?.parent_id) searchParams.set('parent_id', params.parent_id);
  if (params?.top_level) searchParams.set('top_level', 'true');

  const url = `/api/categories?${searchParams.toString()}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to fetch categories: ${response.statusText}`);
  return response.json();
};

/**
 * Create a new custom category.
 */
export const createCategory = async (data: CategoryCreateData): Promise<Category> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/categories', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create category: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Update an existing category.
 */
export const updateCategory = async (id: string, data: CategoryUpdateData): Promise<Category> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch(`/api/categories/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update category: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Archive (soft-delete) a category.
 */
export const archiveCategory = async (id: string): Promise<{ message: string }> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch(`/api/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to archive category: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Restore an archived category.
 */
export const restoreCategory = async (id: string): Promise<Category> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch(`/api/categories/${id}/restore`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to restore category: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Permanently delete an archived category.
 */
export const deleteCategoryPermanently = async (id: string): Promise<{ message: string; promoted_children: number }> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch(`/api/categories/${id}/permanent`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to permanently delete category: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Create all default categories for the current household.
 * Skips categories that already exist by name.
 */
export const createDefaultCategories = async (): Promise<Category[]> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/categories/create-defaults', {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create default categories: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Check if default categories have been seeded.
 */
export const getSeedStatus = async (): Promise<SeedStatus> => {
  const response = await fetch('/api/categories/seed-status', {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to fetch seed status: ${response.statusText}`);
  return response.json();
};

/**
 * Fetch categories as a nested tree structure.
 */
export const fetchCategoryTree = async (include_archived: boolean = false): Promise<CategoryTreeNode[]> => {
  const url = `/api/categories/tree?include_archived=${include_archived}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to fetch category tree: ${response.statusText}`);
  return response.json();
};

/**
 * Fetch spending summary for a category (includes subcategory rollup).
 */
export const fetchCategorySpending = async (
  categoryId: string,
  startDate?: string,
  endDate?: string
): Promise<SpendingSummary> => {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const url = `/api/categories/${categoryId}/spending-summary?${params.toString()}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to fetch spending summary: ${response.statusText}`);
  return response.json();
};

/**
 * Bulk reassign all subcategories of a category to a new parent.
 */
/**
 * Preview how imported category names map to existing categories.
 */
export const previewImportMapping = async (
  categoryValues: string[]
): Promise<ImportPreviewResponse> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/categories/import/preview', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ category_values: categoryValues }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to preview import mapping: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Save user's manual mapping overrides and auto-create unmapped categories.
 */
export const saveImportMapping = async (
  mappingOverrides: MappingOverride[]
): Promise<ImportMappingResponse> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/categories/import/mapping', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ mapping_overrides: mappingOverrides }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to save import mapping: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Bulk reassign all subcategories of a category to a new parent.
 */
export const reassignChildren = async (
  categoryId: string,
  newParentId: string | null
): Promise<ReassignChildrenResponse> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch(`/api/categories/${categoryId}/reassign-children`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ new_parent_id: newParentId }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to reassign children: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Merge multiple source categories into a target category.
 */
export const mergeCategories = async (
  targetId: string,
  sourceIds: string[]
): Promise<MergeResponse> => {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/categories/merge', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeaders(),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ target_id: targetId, source_ids: sourceIds }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to merge categories: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Detect potential duplicate categories using name similarity.
 */
export const detectDuplicates = async (): Promise<DuplicatesResponse> => {
  const response = await fetch('/api/categories/duplicates', {
    credentials: 'include',
    headers: getSessionHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to detect duplicates: ${response.statusText}`);
  return response.json();
};
