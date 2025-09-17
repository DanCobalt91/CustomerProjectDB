import type { PostgrestError } from '@supabase/supabase-js'
import type { Customer, Project, WO, WOType, PO } from '../types'
import { supabase } from './supabase'

type CustomerRow = {
  id: string
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  projects?: ProjectRow[] | null
}

type ProjectRow = {
  id: string
  customer_id: string
  number: string
  note: string | null
  work_orders?: WORow[] | null
  purchase_orders?: PORow[] | null
}

type WORow = {
  id: string
  project_id: string
  number: string
  type: WOType
  note: string | null
}

type PORow = {
  id: string
  project_id: string
  number: string
  note: string | null
}

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
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

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
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

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return []
  }

  return sortByText(data.map(row => mapCustomer({ ...row, projects: row.projects ?? [] })), customer => customer.name)
}

export async function listProjectsByCustomer(customerId: string): Promise<Project[]> {
  const { data, error } = await supabase
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

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return []
  }

  return sortByText(data.map(row => mapProject({ ...row })), project => project.number)
}

export async function listWOs(projectId: string): Promise<WO[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('id, project_id, number, type, note')
    .eq('project_id', projectId)

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return []
  }

  return sortByText(data.map(mapWO), wo => wo.number)
}

export async function listPOs(projectId: string): Promise<PO[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, project_id, number, note')
    .eq('project_id', projectId)

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return []
  }

  return sortByText(data.map(mapPO), po => po.number)
}

export async function createCustomer(data: {
  name: string
  address?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}): Promise<Customer> {
  const payload = {
    name: data.name,
    address: data.address ?? null,
    contact_name: data.contactName ?? null,
    contact_phone: data.contactPhone ?? null,
    contact_email: data.contactEmail ?? null,
  }

  const { data: row, error } = await supabase
    .from('customers')
    .insert(payload)
    .select('id, name, address, contact_name, contact_phone, contact_email')
    .single()

  const result = requireData(row, error, 'Failed to create customer.')
  return mapCustomer({ ...result, projects: [] })
}

export async function updateCustomer(
  customerId: string,
  data: {
    name?: string
    address?: string | null
    contactName?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
  },
): Promise<Customer> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name
  if (data.address !== undefined) payload.address = data.address
  if (data.contactName !== undefined) payload.contact_name = data.contactName
  if (data.contactPhone !== undefined) payload.contact_phone = data.contactPhone
  if (data.contactEmail !== undefined) payload.contact_email = data.contactEmail

  const { data: row, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select('id, name, address, contact_name, contact_phone, contact_email')
    .single()

  const result = requireData(row, error, 'Failed to update customer.')
  return mapCustomer({ ...result, projects: [] })
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('customer_id', customerId)

  requireNoError(projectError)

  const projectIds = (projects ?? []).map(project => project.id)

  if (projectIds.length > 0) {
    const [{ error: woError }, { error: poError }, { error: deleteProjectsError }] = await Promise.all([
      supabase.from('work_orders').delete().in('project_id', projectIds),
      supabase.from('purchase_orders').delete().in('project_id', projectIds),
      supabase.from('projects').delete().in('id', projectIds),
    ])

    requireNoError(woError)
    requireNoError(poError)
    requireNoError(deleteProjectsError)
  }

  const { error } = await supabase.from('customers').delete().eq('id', customerId)
  requireNoError(error)
}

export async function createProject(customerId: string, number: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ customer_id: customerId, number, note: null })
    .select('id, customer_id, number, note')
    .single()

  const row = requireData(data, error, 'Failed to create project.')
  return mapProject({ ...row, work_orders: [], purchase_orders: [] })
}

export async function updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
  const payload: Record<string, unknown> = {}
  if (data.note !== undefined) payload.note = data.note

  const { data: row, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select('id, customer_id, number, note')
    .single()

  const result = requireData(row, error, 'Failed to update project.')
  return mapProject({ ...result, work_orders: [], purchase_orders: [] })
}

export async function deleteProject(projectId: string): Promise<void> {
  const [{ error: woError }, { error: poError }, { error: projectError }] = await Promise.all([
    supabase.from('work_orders').delete().eq('project_id', projectId),
    supabase.from('purchase_orders').delete().eq('project_id', projectId),
    supabase.from('projects').delete().eq('id', projectId),
  ])

  requireNoError(woError)
  requireNoError(poError)
  requireNoError(projectError)
}

export async function createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
  const { data: row, error } = await supabase
    .from('work_orders')
    .insert({
      project_id: projectId,
      number: data.number,
      type: data.type,
      note: data.note ?? null,
    })
    .select('id, project_id, number, type, note')
    .single()

  const result = requireData(row, error, 'Failed to create work order.')
  return mapWO(result)
}

export async function deleteWO(woId: string): Promise<void> {
  const { error } = await supabase.from('work_orders').delete().eq('id', woId)
  requireNoError(error)
}

export async function createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
  const { data: row, error } = await supabase
    .from('purchase_orders')
    .insert({
      project_id: projectId,
      number: data.number,
      note: data.note ?? null,
    })
    .select('id, project_id, number, note')
    .single()

  const result = requireData(row, error, 'Failed to create purchase order.')
  return mapPO(result)
}

export async function deletePO(poId: string): Promise<void> {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', poId)
  requireNoError(error)
}
