/**
 * TanStack Query hooks for household, persons, and invitations.
 *
 * AUTH-004 — Household settings and member management frontend
 * ARCH §6.2, §7.2 — Household API endpoints
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// --- TypeScript Interfaces ---

/** GET /api/household, PATCH /api/household response */
export interface HouseholdData {
  id: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  createdAt: string;       // ISO datetime string
}

/** GET /api/persons items, PATCH /api/persons/{id} response */
export interface MemberData {
  id: string;              // person UUID
  displayName: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  displayCurrency: string;
  defaultView: 'household' | 'personal';
  pictureUrl: string | null;
  createdAt: string;       // ISO datetime — use as "Joined" date
}

/** GET /api/persons/invitations items */
export interface InvitationData {
  id: string;
  householdId: string;
  invitedEmail: string;
  invitedBy: string;       // person UUID
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
}

/** PATCH /api/household body */
export interface HouseholdUpdate {
  name?: string;
  timezone?: string;
}

/** PATCH /api/persons/{id} body */
export interface PersonUpdate {
  displayName?: string;
  displayCurrency?: string;
  defaultView?: 'household' | 'personal';
}

/** PATCH /api/persons/{id}/role body */
export interface RoleUpdate {
  role: 'admin' | 'member';   // 'owner' cannot be set via this endpoint
}

/** POST /api/persons/invite body */
export interface InvitationCreate {
  invitedEmail: string;
}

// --- Query Hooks ---

/** GET /api/household */
export function useHousehold() {
  return useQuery({
    queryKey: ['household'],
    queryFn: () => api.get<HouseholdData>('/api/household').then(r => r.data),
  });
}

/** GET /api/persons */
export function usePersons() {
  return useQuery({
    queryKey: ['persons'],
    queryFn: () => api.get<MemberData[]>('/api/persons').then(r => r.data),
  });
}

/** GET /api/persons/invitations */
export function useInvitations() {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get<InvitationData[]>('/api/persons/invitations').then(r => r.data),
  });
}

// --- Mutation Hooks ---

/** PATCH /api/household */
export function useUpdateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: HouseholdUpdate) =>
      api.patch<HouseholdData>('/api/household', update).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['household'] });
    },
  });
}

/** PATCH /api/persons/{id} */
export function useUpdatePersonProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PersonUpdate }) =>
      api.patch<MemberData>(`/api/persons/${id}`, update).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

/** PATCH /api/persons/{id}/role */
export function useUpdatePersonRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: RoleUpdate['role'] }) =>
      api.patch<MemberData>(`/api/persons/${id}/role`, { role }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

/** DELETE /api/persons/{id} */
export function useRemovePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/persons/${id}`).then(() => {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

/** POST /api/persons/invite */
export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InvitationCreate) =>
      api.post<InvitationData>('/api/persons/invite', input).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

/** DELETE /api/persons/invitations/{id} */
export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<InvitationData>(`/api/persons/invitations/${id}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

/** DELETE /api/household — requires confirm_name in body */
export function useDeleteHousehold() {
  return useMutation({
    mutationFn: (confirmName: string) =>
      api.delete('/api/household', { body: { confirm_name: confirmName } }).then(r => r.data),
  });
}

/** POST /api/invitations/{token}/decline */
export function useDeclineInvitation() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post(`/api/invitations/${token}/decline`).then(r => r.data),
  });
}

/** POST /api/persons/leave */
export function useLeaveHousehold() {
  return useMutation({
    mutationFn: () =>
      api.post('/api/persons/leave').then(r => r.data),
  });
}
