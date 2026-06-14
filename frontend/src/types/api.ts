/** RFC 7807 Problem Details field error (422 validation).
 *  Mirrors the backend's wrapped shape (backend/main.py validation handler):
 *  `loc` is dot-joined into `field`, and `msg` is surfaced as `message`. */
export interface ProblemFieldError {
  /** dot-joined field path, e.g. "body.name" */
  field: string
  /** human-readable message */
  message: string
  /** error type slug */
  type: string
}

/** RFC 7807 Problem Details response body (§4.6) */
export interface ProblemDetail {
  /** stable machine slug (snake_case) */
  type: string
  /** human summary */
  title: string
  /** HTTP status code */
  status: number
  /** specific message or field-error array for 422 */
  detail: string | ProblemFieldError[]
  /** optional request path */
  instance?: string
}
