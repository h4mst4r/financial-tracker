/**
 * Create Household Modal
 * 
 * Modal dialog for creating the first household on first login.
 */

import { useState } from 'react';

interface CreateHouseholdModalProps {
  onClose: () => void;
  onSuccess: () => void;
  csrfToken: string;
}

export default function CreateHouseholdModal({ onClose, onSuccess, csrfToken }: CreateHouseholdModalProps) {
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!householdName.trim()) {
      setError('Household name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch('/api/households', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
        },
        body: JSON.stringify({ name: householdName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create household');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg border border-border max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-primary mb-4">Create Your Household</h2>
        <p className="text-text-secondary mb-6">
          Welcome! Let's create your household to get started. This is where you'll manage finances with your family or roommates.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="householdName" className="block text-sm font-medium text-text mb-2">
              Household Name
            </label>
            <input
              type="text"
              id="householdName"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g., The Smith Family, Roommates, etc."
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-error/20 border border-error rounded-lg text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-text-secondary hover:text-text transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !householdName.trim()}
              className="px-6 py-2 bg-primary hover:bg-primary-hover disabled:bg-border disabled:cursor-not-allowed text-background font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Household'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
