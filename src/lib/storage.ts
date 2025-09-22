import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Customer, PO, Project, WO, WOType } from '../types'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import { extractSupabaseErrorMessage, isSupabaseUnavailableError } from './supabaseErrors'

type StorageApi = {
  listCustomers(): Promise<Customer[]>
  listProjectsByCustomer(customerId: string): Promise<Project[]>
  listWOs(projectId: string): Promise<WO[]>
  listPOs(projectId: string): Promise<PO[]>
  createCustomer(data: {
    name: string
    address?: string
    contactName?: string
    contactPhone?: string
    contactEmail?: string
  }): Promise<Customer>
  updateCustomer(
    customerId: string,
    data: {
      name?: string
      address?: string | null
      contactName?: string | null
      contactPhone?: string | null
      contactEmail?: string | null
    },
  ): Promise<Customer>
  deleteCustomer(customerId: string): Promise<void>
  createProject(customerId: string, number: string): Promise<Project>
  updateProject(projectId: string, data: { note?: string | null }): Promise<Project>
  deleteProject(projectId: string): Promise<void>
  createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO>
  deleteWO(woId: string): Promise<void>
  createPO(projectId: string, data: { number: string; note?: string }): Promise<PO>
  deletePO(poId: string): Promise<void>
}

let supabaseStorage: StorageApi | null = null

function ensureSupabaseStorage(): StorageApi {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase storage.',
    )
  }

  if (!supabaseStorage) {
    supabaseStorage = createSupabaseStorage(getSupabaseClient())
  }

  return supabaseStorage
}

function isRlsMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('row level security') ||
    normalized.includes('row-level security') ||
    normalized.includes('permission denied') ||
    normalized.includes('not authorized')
  )
}

function normalizeStorageError(error: unknown, fallbackMessage: string): Error {
  if (isSupabaseUnavailableError(error)) {
    return new Error('Unable to reach Supabase right now. Please check your connection and try again.')
  }

  if (error instanceof Error) {
    if (isRlsMessage(error.message)) {
      return new Error('Not authorized to perform this action.')
    }
    return error
  }

  const extracted = extractSupabaseErrorMessage(error)
  if (extracted) {
    if (isRlsMessage(extracted)) {
      return new Error('Not authorized to perform this action.')
    }
    return new Error(extracted)
  }

  return new Error(fallbackMessage)
}

async function runWithSupabase<T>(operation: () => Promise<T>, fallbackMessage: string): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw normalizeStorageError(error, fallbackMessage)
  }
}

export function listCustomers(): Promise<Customer[]> {
  return runWithSupabase(
    () => ensureSupabaseStorage().listCustomers(),
    'Unable to load customers from Supabase.',
  )
}

export function listProjectsByCustomer(customerId: string): Promise<Project[]> {
  return runWithSupabase(
    () => ensureSupabaseStorage().listProjectsByCustomer(customerId),
    'Unable to load projects from Supabase.',
  )
}

export function listWOs(projectId: string): Promise<WO[]> {
  return runWithSupabase(
    () => ensureSupabaseStorage().listWOs(projectId),
    'Unable to load work orders from Supabase.',
  )
}

export function listPOs(projectId: string): Promise<PO[]> {
  return runWithSupabase(
    () => ensureSupabaseStorage().listPOs(projectId),
    'Unable to load purchase orders from Supabase.',
  )
}

export function createCustomer(data: {
  name: string
  address?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}): Promise<Customer> {
  return runWithSupabase(
    () => ensureSupabaseStorage().createCustomer(data),
    'Failed to create customer.',
  )
}

export function updateCustomer(
  customerId: string,
  data: {
    name?: string
    address?: string | null
    contactName?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
  },
): Promise<Customer> {
  return runWithSupabase(
    () => ensureSupabaseStorage().updateCustomer(customerId, data),
    'Failed to update customer.',
  )
}

export function deleteCustomer(customerId: string): Promise<void> {
  return runWithSupabase(() => ensureSupabaseStorage().deleteCustomer(customerId), 'Failed to delete customer.')
}

export function createProject(customerId: string, number: string): Promise<Project> {
  return runWithSupabase(
    () => ensureSupabaseStorage().createProject(customerId, number),
    'Failed to create project.',
  )
}

export function updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
  return runWithSupabase(
    () => ensureSupabaseStorage().updateProject(projectId, data),
    'Failed to update project.',
  )
}

export function deleteProject(projectId: string): Promise<void> {
  return runWithSupabase(() => ensureSupabaseStorage().deleteProject(projectId), 'Failed to delete project.')
}

export function createWO(
  projectId: string,
  data: { number: string; type: WOType; note?: string },
): Promise<WO> {
  return runWithSupabase(
    () => ensureSupabaseStorage().createWO(projectId, data),
    'Failed to create work order.',
  )
}

export function deleteWO(woId: string): Promise<void> {
  return runWithSupabase(() => ensureSupabaseStorage().deleteWO(woId), 'Failed to delete work order.')
}

export function createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
  return runWithSupabase(
    () => ensureSupabaseStorage().createPO(projectId, data),
    'Failed to create purchase order.',
  )
}

export function deletePO(poId: string): Promise<void> {
  return runWithSupabase(() => ensureSupabaseStorage().deletePO(poId), 'Failed to delete purchase order.')
}

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
}

function createSupabaseStorage(client: SupabaseClient): StorageApi {
  type CustomerRow = {
    id: string
    owner_id?: string | null
    name: string
    address: string | null
    contact_name: string | null
    contact_phone: string | null
    contact_email: string | null
    projects?: ProjectRow[] | null
  }

  type ProjectRow = {
    id: string
    owner_id?: string | null
    customer_id: string
    number: string
    note: string | null
    work_orders?: WORow[] | null
    purchase_orders?: PORow[] | null
  }

  type WORow = {
    id: string
    owner_id?: string | null
    project_id: string
    number: string
    type: WOType
    note: string | null
  }

  type PORow = {
    id: string
    owner_id?: string | null
    project_id: string
    number: string
    note: string | null
  }

  function mapWO(row: WORow): WO {
    return {
      id: row.id,
      number: row.number,
      type: row.type,
      note: row.note ?? undefined,
    }
  }

  function mapPO(row: PORow): PO {
    return {
      id: row.id,
      number: row.number,
      note: row.note ?? undefined,
    }
  }

  function mapProject(row: ProjectRow): Project {
    const wos = sortByText((row.work_orders ?? []).map(mapWO), wo => wo.number)
    const pos = sortByText((row.purchase_orders ?? []).map(mapPO), po => po.number)

    return {
      id: row.id,
      number: row.number,
      note: row.note ?? undefined,
      wos,
      pos,
    }
  }

  function mapCustomer(row: CustomerRow): Customer {
    const projects = sortByText((row.projects ?? []).map(mapProject), project => project.number)

    return {
      id: row.id,
      name: row.name,
      address: row.address ?? undefined,
      contactName: row.contact_name ?? undefined,
      contactPhone: row.contact_phone ?? undefined,
      contactEmail: row.contact_email ?? undefined,
      projects,
    }
  }

  function requireData<T>(data: T | null, error: PostgrestError | null, fallbackMessage: string): T {
    if (error) {
      throw new Error(error.message)
    }
    if (!data) {
      throw new Error(fallbackMessage)
    }
    return data
  }

  function requireNoError(error: PostgrestError | null): void {
    if (error) {
      throw new Error(error.message)
    }
  }

  async function requireUserId(): Promise<string> {
    const { data, error } = await client.auth.getSession()
    if (error) {
      throw new Error(error.message)
    }
    const userId = data.session?.user?.id
    if (!userId) {
      throw new Error('You must be signed in to access the database.')
    }
    return userId
  }

  return {
    async listCustomers(): Promise<Customer[]> {
      const userId = await requireUserId()
      const { data, error } = await client
        .from('customers')
        .select(
          `
        id,
        name,
        address,
        contact_name,
        contact_phone,
        contact_email,
        projects:projects (
          id,
          customer_id,
          number,
          note,
          work_orders:work_orders (
            id,
            project_id,
            number,
            type,
            note
          ),
          purchase_orders:purchase_orders (
            id,
            project_id,
            number,
            note
          )
        )
      `,
        )
        .eq('owner_id', userId)

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(row => mapCustomer({ ...row, projects: row.projects ?? [] })), customer => customer.name)
    },

    async listProjectsByCustomer(customerId: string): Promise<Project[]> {
      const userId = await requireUserId()
      const { data, error } = await client
        .from('projects')
        .select(
          `
        id,
        customer_id,
        number,
        note,
        work_orders:work_orders (
          id,
          project_id,
          number,
          type,
          note
        ),
        purchase_orders:purchase_orders (
          id,
          project_id,
          number,
          note
        )
      `,
        )
        .eq('customer_id', customerId)
        .eq('owner_id', userId)

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(row => mapProject({ ...row })), project => project.number)
    },

    async listWOs(projectId: string): Promise<WO[]> {
      const userId = await requireUserId()
      const { data, error } = await client
        .from('work_orders')
        .select('id, project_id, number, type, note')
        .eq('project_id', projectId)
        .eq('owner_id', userId)

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(mapWO), wo => wo.number)
    },

    async listPOs(projectId: string): Promise<PO[]> {
      const userId = await requireUserId()
      const { data, error } = await client
        .from('purchase_orders')
        .select('id, project_id, number, note')
        .eq('project_id', projectId)
        .eq('owner_id', userId)

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(mapPO), po => po.number)
    },

    async createCustomer(data: {
      name: string
      address?: string
      contactName?: string
      contactPhone?: string
      contactEmail?: string
    }): Promise<Customer> {
      const userId = await requireUserId()
      const payload = {
        name: data.name,
        address: data.address ?? null,
        contact_name: data.contactName ?? null,
        contact_phone: data.contactPhone ?? null,
        contact_email: data.contactEmail ?? null,
        owner_id: userId,
      }

      const { data: row, error } = await client
        .from('customers')
        .insert(payload)
        .select('id, name, address, contact_name, contact_phone, contact_email')
        .single()

      const result = requireData(row, error, 'Failed to create customer.')
      return mapCustomer({ ...result, projects: [] })
    },

    async updateCustomer(
      customerId: string,
      data: {
        name?: string
        address?: string | null
        contactName?: string | null
        contactPhone?: string | null
        contactEmail?: string | null
      },
    ): Promise<Customer> {
      const userId = await requireUserId()
      const payload: Record<string, unknown> = {}
      if (data.name !== undefined) payload.name = data.name
      if (data.address !== undefined) payload.address = data.address
      if (data.contactName !== undefined) payload.contact_name = data.contactName
      if (data.contactPhone !== undefined) payload.contact_phone = data.contactPhone
      if (data.contactEmail !== undefined) payload.contact_email = data.contactEmail

      const { data: row, error } = await client
        .from('customers')
        .update(payload)
        .eq('id', customerId)
        .eq('owner_id', userId)
        .select('id, name, address, contact_name, contact_phone, contact_email')
        .single()

      const result = requireData(row, error, 'Failed to update customer.')
      return mapCustomer({ ...result, projects: [] })
    },

    async deleteCustomer(customerId: string): Promise<void> {
      const userId = await requireUserId()
      const { data: projects, error: projectError } = await client
        .from('projects')
        .select('id')
        .eq('customer_id', customerId)
        .eq('owner_id', userId)

      requireNoError(projectError)

      const projectIds = (projects ?? []).map(project => project.id)

      if (projectIds.length > 0) {
        const [{ error: woError }, { error: poError }, { error: deleteProjectsError }] = await Promise.all([
          client.from('work_orders').delete().in('project_id', projectIds).eq('owner_id', userId),
          client.from('purchase_orders').delete().in('project_id', projectIds).eq('owner_id', userId),
          client.from('projects').delete().in('id', projectIds).eq('owner_id', userId),
        ])

        requireNoError(woError)
        requireNoError(poError)
        requireNoError(deleteProjectsError)
      }

      const { error } = await client.from('customers').delete().eq('id', customerId).eq('owner_id', userId)
      requireNoError(error)
    },

    async createProject(customerId: string, number: string): Promise<Project> {
      const userId = await requireUserId()
      const { data, error } = await client
        .from('projects')
        .insert({ customer_id: customerId, number, note: null, owner_id: userId })
        .select('id, customer_id, number, note')
        .single()

      const row = requireData(data, error, 'Failed to create project.')
      return mapProject({ ...row, work_orders: [], purchase_orders: [] })
    },

    async updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
      const userId = await requireUserId()
      const payload: Record<string, unknown> = {}
      if (data.note !== undefined) payload.note = data.note

      const { data: row, error } = await client
        .from('projects')
        .update(payload)
        .eq('id', projectId)
        .eq('owner_id', userId)
        .select('id, customer_id, number, note')
        .single()

      const result = requireData(row, error, 'Failed to update project.')
      return mapProject({ ...result, work_orders: [], purchase_orders: [] })
    },

    async deleteProject(projectId: string): Promise<void> {
      const userId = await requireUserId()
      const [{ error: woError }, { error: poError }, { error: projectError }] = await Promise.all([
        client.from('work_orders').delete().eq('project_id', projectId).eq('owner_id', userId),
        client.from('purchase_orders').delete().eq('project_id', projectId).eq('owner_id', userId),
        client.from('projects').delete().eq('id', projectId).eq('owner_id', userId),
      ])

      requireNoError(woError)
      requireNoError(poError)
      requireNoError(projectError)
    },

    async createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
      const userId = await requireUserId()
      const { data: row, error } = await client
        .from('work_orders')
        .insert({
          project_id: projectId,
          number: data.number,
          type: data.type,
          note: data.note ?? null,
          owner_id: userId,
        })
        .select('id, project_id, number, type, note')
        .single()

      const result = requireData(row, error, 'Failed to create work order.')
      return mapWO(result)
    },

    async deleteWO(woId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('work_orders').delete().eq('id', woId).eq('owner_id', userId)
      requireNoError(error)
    },

    async createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
      const userId = await requireUserId()
      const { data: row, error } = await client
        .from('purchase_orders')
        .insert({
          project_id: projectId,
          number: data.number,
          note: data.note ?? null,
          owner_id: userId,
        })
        .select('id, project_id, number, note')
        .single()

      const result = requireData(row, error, 'Failed to create purchase order.')
      return mapPO(result)
    },

    async deletePO(poId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('purchase_orders').delete().eq('id', poId).eq('owner_id', userId)
      requireNoError(error)
    },
  }
}
