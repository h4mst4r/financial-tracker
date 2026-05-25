import { useState } from 'react';

/**
 * Theme Test Page
 * 
 * Demonstrates all design tokens, components, and patterns using Tailwind theme classes.
 * Everything inherits from index.css @theme {} — change a token once, update everywhere.
 */
export default function TestPage() {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-primary mb-1">Theme Test Page</h1>
        <p className="text-sm text-text-secondary">All elements inherit from <code className="px-1.5 py-0.5 bg-surface-elevated rounded text-xs text-text-muted">@theme {} in index.css</code></p>
      </div>

      {/* Section 1: Background Colors */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          1. Background Colors
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="card bg-background">
            <div className="text-xs text-text-secondary mb-1">bg-background</div>
            <div className="text-xs font-mono text-text">#0a0a0f</div>
          </div>
          <div className="card">
            <div className="text-xs text-text-secondary mb-1">bg-surface</div>
            <div className="text-xs font-mono text-text">#12121a</div>
          </div>
          <div className="card bg-surface-elevated">
            <div className="text-xs text-text-secondary mb-1">bg-surface-elevated</div>
            <div className="text-xs font-mono text-text">#1e1e2e</div>
          </div>
        </div>
      </section>

      {/* Section 2: Text Colors */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          2. Text Colors
        </h2>
        <div className="card space-y-2">
          <p className="text-sm text-primary">text-primary — #4fc3f7 (bright blue)</p>
          <p className="text-sm text-text">text-text — #e0e0e0 (light gray)</p>
          <p className="text-sm text-text-secondary">text-text-secondary — #888888 (medium gray)</p>
          <p className="text-sm text-text-muted">text-text-muted — #555555 (dark gray)</p>
          <p className="text-sm text-success">text-success — #69f0ae (green)</p>
          <p className="text-sm text-error">text-error — #ff5252 (red)</p>
          <p className="text-sm text-warning">text-warning — #ffd740 (yellow)</p>
          <p className="text-sm text-accent">text-accent — #00e5ff (cyan)</p>
        </div>
      </section>

      {/* Section 3: Buttons */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          3. Button Styles
        </h2>
        <div className="card flex flex-wrap gap-3">
          {/* Primary */}
          <button className="btn-primary px-4 py-2 text-sm">
            Primary
          </button>

          {/* Secondary / Outline */}
          <button className="btn-ghost px-4 py-2">
            Ghost
          </button>

          {/* Danger (like Revoke) */}
          <button className="btn-action-error px-4 py-2">
            Action Error
          </button>

          {/* Success (like Resend) */}
          <button className="btn-action-success px-4 py-2">
            Action Success
          </button>

          {/* Disabled */}
          <button disabled className="btn-primary px-4 py-2 text-sm">
            Disabled
          </button>
        </div>
      </section>

      {/* Section 4: Badges */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          4. Badge Styles
        </h2>
        <div className="card flex flex-wrap gap-2">
          <span className="tag badge-owner">Owner</span>
          <span className="tag badge-admin">Admin</span>
          <span className="tag badge-member">Member</span>
          <span className="tag badge-warning">Pending</span>
          <span className="tag badge-success">Accepted</span>
          <span className="tag badge-error">Revoked</span>
          <span className="tag badge-text-muted">Expired</span>
        </div>
      </section>

      {/* Section 5: Input Fields */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          5. Form Elements
        </h2>
        <div className="card space-y-4">
          <div>
            <label className="label mb-1">Text Input</label>
            <input
              type="text"
              placeholder="Enter your email..."
              className="input"
            />
          </div>
          <div>
            <label className="label mb-1">Select</label>
            <select className="select">
              <option>Owner</option>
              <option>Admin</option>
              <option>Member</option>
            </select>
          </div>
          <div>
            <label className="label mb-1">Textarea</label>
            <textarea
              rows={3}
              placeholder="Notes..."
              className="textarea"
            />
          </div>
        </div>
      </section>

      {/* Section 6: Alerts / Toast Messages */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          6. Alert & Toast Messages
        </h2>
        <div className="card space-y-3">
          <div className="alert-success text-sm py-2.5">
            Success: Invitation email resent successfully!
          </div>
          <div className="alert-error text-sm py-2.5">
            Error: Failed to revoke invitation
          </div>
          <div className="alert-warning text-sm py-2.5">
            Warning: This invitation expires in 2 days
          </div>
          <button
            onClick={() => setShowSuccessToast(!showSuccessToast)}
            className="btn-action-primary"
          >
            Toggle Toast Demo
          </button>
          {showSuccessToast && (
            <div className="toast-success animate-pulse">
              Toast notification — auto-dismiss in 3s
            </div>
          )}
        </div>
      </section>

      {/* Section 7: Modals & Dialogs */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          7. Modals & Dialogs
        </h2>
        <div className="card space-y-3">
          <p className="text-sm text-text-secondary">Test modal overlays, padding, and close behaviors:</p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary px-4 py-2 text-sm"
            >
              Open Invite Modal
            </button>
            <button
              onClick={() => setShowConfirmDialog(true)}
              className="btn-action-error"
            >
              Open Confirm Dialog
            </button>
          </div>
        </div>
      </section>

      {/* Section 8: Card / List Item Pattern */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          8. Card & List Item Patterns
        </h2>
        <div className="space-y-3">
          {/* Standard card */}
          <div className="invite-card">
            <div>
              <p className="text-text font-medium">member@example.com</p>
              <p className="text-sm text-text-secondary mt-1">Invited by Benjamin Khan</p>
            </div>
            <span className="tag badge-warning">Pending</span>
          </div>

          {/* Card with actions */}
          <div className="invite-card">
            <div>
              <p className="text-text font-medium">admin@example.com</p>
              <p className="text-sm text-text-secondary mt-1">Invited by Benjamin Khan · Expires Jun 1, 2026</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-action-primary">
                Resend
              </button>
              <button className="btn-action-error">
                Revoke
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: Category Card Pattern (Colored Border + Inner Glow) */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          9. Category Card Pattern
        </h2>
        <p className="text-sm text-text-secondary mb-3">Colored border with inner glow and tinted background — inherits category color via inline style.</p>
        <div className="space-y-3">
          {/* Blue */}
          <div
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{ backgroundColor: '#4fc3f714', borderColor: '#4fc3f7a0', boxShadow: 'inset 0 0 16px #4fc3f730' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📄</span>
              <span className="font-medium text-text">Bills</span>
            </div>
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">Default</span>
          </div>
          {/* Green */}
          <div
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{ backgroundColor: '#69f0ae14', borderColor: '#69f0aea0', boxShadow: 'inset 0 0 16px #69f0ae30' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🍽️</span>
              <span className="font-medium text-text">Dining</span>
            </div>
          </div>
          {/* Yellow */}
          <div
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{ backgroundColor: '#ffd74014', borderColor: '#ffd740a0', boxShadow: 'inset 0 0 16px #ffd74030' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✈️</span>
              <span className="font-medium text-text">Travel</span>
            </div>
          </div>
          {/* Red */}
          <div
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{ backgroundColor: '#ff525214', borderColor: '#ff5252a0', boxShadow: 'inset 0 0 16px #ff525230' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🏥</span>
              <span className="font-medium text-text">Healthcare</span>
            </div>
          </div>
          {/* Cyan */}
          <div
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{ backgroundColor: '#00e5ff14', borderColor: '#00e5ffa0', boxShadow: 'inset 0 0 16px #00e5ff30' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">💰</span>
              <span className="font-medium text-text">Savings</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 10: Empty States */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          10. Empty States
        </h2>
        <div className="card pt-12 pb-12 text-center">
          <p className="text-text-muted italic text-sm">No invitations yet</p>
        </div>
      </section>

      {/* Section 11: Navigation Links */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-text mb-3 pl-3 border-l-3 border-primary">
          10. Navigation & Links
        </h2>
        <div className="card flex items-center gap-4">
          <a href="/dashboard" className="nav-link">Dashboard</a>
          <span className="text-text-muted">|</span>
          <a href="/categories" className="nav-link">Categories</a>
          <span className="text-text-muted">|</span>
          <a href="/settings" className="nav-link">Settings</a>
          <span className="text-text-muted">|</span>
          <button className="nav-link hover:text-error">Logout</button>
        </div>
      </section>

      {/* ========================================= */}
      {/* MODAL: Invite Member (full example)       */}
      {/* ========================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-surface rounded-lg border border-border max-w-md w-full max-h-[90vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary">Invite Member</h3>
              <button
                onClick={() => setShowModal(false)}
                className="btn-close"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              <p className="text-sm text-text-secondary mb-4">Enter the email address of the person you want to invite.</p>
              
              <label className="label mb-1">Email</label>
              <input
                type="email"
                placeholder="member@example.com"
                className="input mb-4"
              />

              <label className="label mb-1">Role</label>
              <select className="select mb-4">
                <option>Member</option>
                <option>Admin</option>
              </select>

              {/* Success message example */}
              <div className="alert-success text-sm py-2.5 mb-4">
                Invitation sent successfully!
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
              <button
                onClick={() => setShowModal(false)}
                className="btn-cancel px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="btn-primary px-4 py-2 text-sm"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* DIALOG: Confirm Delete (full example)     */}
      {/* ========================================= */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmDialog(false)}>
          <div
            className="bg-surface rounded-lg border border-border max-w-sm w-full max-h-[90vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-error">Delete Household</h3>
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="btn-close"
              >
                &times;
              </button>
            </div>

            {/* Dialog Body */}
            <p className="text-sm text-text-secondary mb-2">
              Are you sure you want to delete this household? This action cannot be undone.
            </p>
            <p className="text-sm text-error mb-4">
              All members will be removed and all data will be permanently lost.
            </p>

            {/* Dialog Footer */}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="btn-cancel px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="btn-danger px-4 py-2 text-sm"
              >
                Delete Household
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
