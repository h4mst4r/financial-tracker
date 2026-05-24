/**
 * Members List Component
 * 
 * Displays all household members with their roles.
 * Shows action buttons for role change and removal (Owner only).
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Member {
  id: string;
  household_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  joined_at?: string;
}

interface MembersListProps {
  householdId: string;
  members: Member[];
  userRole: string;
  onMemberUpdate: () => void;
}

export default function MembersList({ householdId, members, userRole, onMemberUpdate }: MembersListProps) {
  const { csrfToken } = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleUpdates, setRoleUpdates] = useState<Record<string, string>>({});

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (userRole !== 'owner') return;
    
    setUpdating(memberId);
    setError(null);
    
    try {
      const response = await fetch(`/api/households/${householdId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || '',
        },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update role');
      }
      
      onMemberUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (userRole !== 'owner') return;
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    
    setRemoving(memberId);
    setError(null);
    
    try {
      const response = await fetch(`/api/households/${householdId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken || '' },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to remove member');
      }
      
      onMemberUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRemoving(null);
    }
  };

  const getRoleBadgeClass = (role: string) => {
    if (role === 'owner') return 'badge-owner';
    if (role === 'admin') return 'badge-admin';
    return 'badge-member';
  };

  return (
    <div className="bg-surface rounded-lg border border-border p-6">
      <h2 className="text-2xl font-semibold text-primary mb-6">Household Members ({members.length})</h2>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-error/20 border border-error rounded-lg text-error text-sm">
          {error}
        </div>
      )}

      {/* Members Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-text-secondary font-medium">Name</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium">Email</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium">Role</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium">Joined</th>
              {userRole === 'owner' && (
                <th className="text-left py-3 px-4 text-text-secondary font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border hover:bg-surface-elevated/50">
                <td className="py-3 px-4 text-text font-medium">
                  {member.name || 'Unknown'}
                </td>
                <td className="py-3 px-4 text-text-secondary">
                  {member.email || 'N/A'}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeClass(member.role)}`}
                  >
                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                  </span>
                </td>
                <td className="py-3 px-4 text-text-secondary text-sm">
                  {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'N/A'}
                </td>
                {userRole === 'owner' && (
                  <td className="py-3 px-4">
                    {/* Skip actions for self */}
                    {member.role !== 'owner' && (
                      <div className="flex items-center gap-3">
                        {/* Role Dropdown */}
                        <select
                          value={roleUpdates[member.id] || member.role}
                          onChange={(e) => {
                            setRoleUpdates({ ...roleUpdates, [member.id]: e.target.value });
                            handleRoleChange(member.id, e.target.value);
                          }}
                          disabled={updating === member.id}
                          className="px-3 py-1 bg-background border-border rounded text-sm text-text"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>

                        {/* Remove Button */}
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removing === member.id}
                          className="px-3 py-1 bg-error/20 hover:bg-error/40 border border-error text-error rounded text-sm transition-colors disabled:opacity-50"
                        >
                          {removing === member.id ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
