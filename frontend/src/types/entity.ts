// Generic shapes for the generic entity layer (ARCH §4.10/§6.4). Concrete entity types
// (Account, Category, …) extend BaseEntity in their own epics; nothing here models a concrete entity.

/** The standardized list-endpoint shape every entity returns: `GET /api/<es>` → { items, total } (ARCH §4.10). */
export interface EntityListResponse<T> {
  items: T[]
  total: number
}

/** Minimal fields shared by every entity row. Concrete types extend this. */
export interface BaseEntity {
  id: string
  status: 'active' | 'archived'
}
