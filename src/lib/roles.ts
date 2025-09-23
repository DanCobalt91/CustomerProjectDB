import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import { extractSupabaseErrorMessage, isSupabaseEdgeFunctionUnavailable, isSupabaseUnavailableError } from './supabaseErrors'
import type { AppRole } from '../types'

type SupabaseClientGetter = () => ReturnType<typeof getSupabaseClient>

let resolveSupabaseClient: SupabaseClientGetter = getSupabaseClient

export function __setSupabaseClientGetterForTesting(getter: SupabaseClientGetter): void {
  resolveSupabaseClient = getter
}

export function __resetSupabaseClientGetterForTesting(): void {
  resolveSupabaseClient = getSupabaseClient
}

type RoleRow = { role: string | null }

export type ManagedUser = {
  id: string
  email: string | null
  roles: AppRole[]
  createdAt: string | null
  lastSignInAt: string | null
}

const VALID_ROLES: AppRole[] = ['admin', 'editor', 'viewer']

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null
  const lower = value.toLowerCase()
  return VALID_ROLES.find(role => role === lower) ?? null
}

function sortRoles(roles: AppRole[]): AppRole[] {
  const order = new Map<AppRole, number>([
    ['admin', 0],
    ['editor', 1],
    ['viewer', 2],
  ])
  return [...roles].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
}

export function isRlsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('row level security') ||
    message.includes('new row violates row-level security policy') ||
    message.includes('violates row level security policy') ||
    message.includes('permission denied') ||
    message.includes('not authorized')
  )
}

export function getFriendlySupabaseError(
  error: unknown,
  fallbackMessage: string,
  unauthorizedMessage = 'Not authorized to perform this action.',
): string {
  if (isSupabaseUnavailableError(error)) {
    return 'Unable to reach Supabase right now. Please check your connection and try again.'
  }

  if (isRlsError(error)) {
    return unauthorizedMessage
  }

  const message = extractSupabaseErrorMessage(error)
  return message || fallbackMessage
}

export async function fetchCurrentUserRoles(): Promise<AppRole[]> {
  const client = resolveSupabaseClient()
  const { data, error } = await client.from('me_roles').select('role')

  if (error) {
    throw new Error(error.message)
  }

  const seen = new Set<AppRole>()
  for (const row of data as RoleRow[] | null ?? []) {
    const normalized = normalizeRole(row?.role ?? null)
    if (normalized) {
      seen.add(normalized)
    }
  }

  return sortRoles(Array.from(seen))
}

export async function fetchManagedUsers(session: Session): Promise<ManagedUser[]> {
  if (!session?.access_token) {
    throw new Error('A valid session token is required to load users.')
  }

  const client = resolveSupabaseClient()
  const { data, error } = await client.functions.invoke('user-management', {
    body: { action: 'list-users' },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    if (isSupabaseEdgeFunctionUnavailable(error)) {
      throw new Error(
        'Unable to reach the Supabase user-management function. Confirm it is deployed and that your network can access it.',
      )
    }

    throw new Error(extractSupabaseErrorMessage(error) || 'Unable to load users.')
  }

  const rows: unknown = (data as { users?: unknown })?.users ?? data

  if (!Array.isArray(rows)) {
    return []
  }

  return rows
    .map(row => {
      const id = typeof row?.id === 'string' ? row.id : ''
      const email = typeof row?.email === 'string' ? row.email : null
      const createdAt = typeof row?.created_at === 'string' ? row.created_at : null
      const lastSignInAt = typeof row?.last_sign_in_at === 'string' ? row.last_sign_in_at : null
      const roleValues: unknown = Array.isArray(row?.roles) ? row.roles : []
      const normalizedRoles = Array.isArray(roleValues)
        ? sortRoles(
            roleValues
              .map(normalizeRole)
              .filter((role): role is AppRole => !!role),
          )
        : []

      return {
        id,
        email,
        createdAt,
        lastSignInAt,
        roles: normalizedRoles,
      }
    })
    .filter(user => user.id)
}

export async function updateUserRole(
  session: Session,
  payload: { email: string; role: AppRole; action: 'grant' | 'revoke' },
): Promise<{ message: string }> {
  if (!session?.access_token) {
    throw new Error('A valid session token is required to update roles.')
  }

  const client = resolveSupabaseClient()
  const { data, error } = await client.functions.invoke('user-management', {
    body: { action: 'update-role', email: payload.email, role: payload.role, mode: payload.action },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    if (isSupabaseEdgeFunctionUnavailable(error)) {
      throw new Error(
        'Unable to reach the Supabase user-management function. Confirm it is deployed and that your network can access it.',
      )
    }

    throw new Error(extractSupabaseErrorMessage(error) || 'Unable to update user role.')
  }

  const message =
    typeof (data as { message?: unknown })?.message === 'string'
      ? (data as { message?: string }).message
      : payload.action === 'grant'
        ? 'Role granted successfully.'
        : 'Role revoked successfully.'

  return { message }
}

