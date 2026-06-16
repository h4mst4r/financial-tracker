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

/**
 * A per-person preference row for one entity (ARCH §3 `entity_preferences`, FR-E-021).
 * NOTE: `person_id` is intentionally absent from the client type — the server derives it from the
 * session and scopes the `UNIQUE (person_id, entity_type, entity_id)` row to it. The client never
 * sends or receives a `person_id`; that is what guarantees one member's arrangement can't touch
 * another's (and can't be spoofed from the request body).
 */
export interface EntityPreference {
  entity_type: string
  entity_id: string
  is_favourite: boolean
  sort_order: number | null
}
