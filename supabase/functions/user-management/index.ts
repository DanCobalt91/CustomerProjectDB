import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4?dts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AppRole = 'viewer' | 'editor' | 'admin'

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null
  const lower = value.toLowerCase()
  if (lower === 'viewer' || lower === 'editor' || lower === 'admin') {
    return lower
  }
  return null
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Service not configured.', { status: 500, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()

  if (!token) {
    return new Response('Missing authorization token.', { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const {
    data: userResult,
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !userResult?.user) {
    return new Response('Unauthorized.', { status: 401, headers: corsHeaders })
  }

  const actor = userResult.user
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', actor.id)

  if (rolesError) {
    return new Response('Unable to verify roles.', { status: 500, headers: corsHeaders })
  }

  const actorRoles = (roleRows ?? [])
    .map(row => normalizeRole((row as { role?: string | null })?.role ?? null))
    .filter((role): role is AppRole => !!role)

  if (!actorRoles.includes('admin')) {
    return new Response('Forbidden.', { status: 403, headers: corsHeaders })
  }

  let body: any
  try {
    body = await req.json()
  } catch (_error) {
    return new Response('Invalid JSON body.', { status: 400, headers: corsHeaders })
  }

  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'list-users') {
    const {
      data: listResult,
      error: listError,
    } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })

    if (listError) {
      return new Response('Failed to list users.', { status: 500, headers: corsHeaders })
    }

    const users = listResult?.users ?? []
    const userIds = users.map(user => user.id)

    const {
      data: allRoles,
      error: allRolesError,
    } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

    if (allRolesError) {
      return new Response('Failed to load user roles.', { status: 500, headers: corsHeaders })
    }

    const roleMap = new Map<string, AppRole[]>()
    for (const entry of allRoles ?? []) {
      const userId = typeof (entry as { user_id?: string | null }).user_id === 'string' ? (entry as any).user_id : null
      const role = normalizeRole((entry as { role?: string | null }).role ?? null)
      if (!userId || !role) continue
      const current = roleMap.get(userId) ?? []
      if (!current.includes(role)) {
        current.push(role)
        roleMap.set(userId, current)
      }
    }

    const responseUsers = users.map(user => ({
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      roles: roleMap.get(user.id) ?? [],
    }))

    return new Response(JSON.stringify({ users: responseUsers }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'update-role') {
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const role = normalizeRole(body?.role)
    const mode = body?.mode === 'grant' ? 'grant' : body?.mode === 'revoke' ? 'revoke' : null

    if (!email || !role || !mode) {
      return new Response('Email, role, and mode are required.', { status: 400, headers: corsHeaders })
    }

    const { error: rpcError } = await supabase.rpc('grant_role_by_email', {
      target_email: email,
      target_role: role,
      should_grant: mode === 'grant',
      performed_by: actor.id,
    })

    if (rpcError) {
      return new Response(rpcError.message ?? 'Role update failed.', { status: 400, headers: corsHeaders })
    }

    const message = mode === 'grant' ? `Granted ${role} role.` : `Revoked ${role} role.`

    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response('Unknown action.', { status: 400, headers: corsHeaders })
})
