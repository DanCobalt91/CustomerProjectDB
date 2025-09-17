import type { Customer, Project, WO, WOType, PO } from '../types'
import { supabase } from './supabase'

type CustomerRow = {
  id: string
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
}

type ProjectRow = {
  id: string
  customer_id: string
  number: string
  note: string | null
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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string>
  body?: Record<string, unknown> | Record<string, unknown>[]
  preferReturn?: boolean
}

async function supabaseRequest<T>(table: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, preferReturn = false } = options
  const url = new URL(`/rest/v1/${table}`, supabase.url)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
  }

  const headers: Record<string, string> = {
    apikey: supabase.anonKey,
    Authorization: `Bearer ${supabase.anonKey}`,
  }

  let payload: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  if (preferReturn) {
    headers['Prefer'] = 'return=representation'
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: payload,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Supabase request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return null as T
  }

  const text = await response.text()
  if (!text) {
    return null as T
  }

  return JSON.parse(text) as T
}

function mapCustomer(row: CustomerRow, projects: Project[]): Customer {
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

function mapProject(row: ProjectRow, wos: WO[], pos: PO[]): Project {
  return {
    id: row.id,
    number: row.number,
    note: row.note ?? undefined,
    wos,
    pos,
  }
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

function buildInFilter(column: string, values: string[]): Record<string, string> {
  const escaped = values.map(value => `"${value.replace(/"/g, '""')}"`).join(',')
  return { [column]: `in.(${escaped})` }
}

function buildEqFilter(column: string, value: string): Record<string, string> {
  return { [column]: `eq.${value}` }
}

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
}

export async function listCustomers(): Promise<Customer[]> {
  const [customerRows, projectRows, woRows, poRows] = await Promise.all([
    supabaseRequest<CustomerRow[]>('customers', { query: { select: '*' } }),
    supabaseRequest<ProjectRow[]>('projects', { query: { select: '*' } }),
    supabaseRequest<WORow[]>('work_orders', { query: { select: '*' } }),
    supabaseRequest<PORow[]>('purchase_orders', { query: { select: '*' } }),
  ])

  const wosByProject = new Map<string, WO[]>()
  for (const row of woRows) {
    const group = wosByProject.get(row.project_id)
    if (group) {
      group.push(mapWO(row))
    } else {
      wosByProject.set(row.project_id, [mapWO(row)])
    }
  }

  const posByProject = new Map<string, PO[]>()
  for (const row of poRows) {
    const group = posByProject.get(row.project_id)
    if (group) {
      group.push(mapPO(row))
    } else {
      posByProject.set(row.project_id, [mapPO(row)])
    }
  }

  const projectsByCustomer = new Map<string, Project[]>()
  for (const row of projectRows) {
    const wos = sortByText(wosByProject.get(row.id) ?? [], wo => wo.number)
    const pos = sortByText(posByProject.get(row.id) ?? [], po => po.number)
    const project = mapProject(row, wos, pos)
    const group = projectsByCustomer.get(row.customer_id)
    if (group) {
      group.push(project)
    } else {
      projectsByCustomer.set(row.customer_id, [project])
    }
  }

  const customers = customerRows.map(row => {
    const projects = sortByText(projectsByCustomer.get(row.id) ?? [], project => project.number)
    return mapCustomer(row, projects)
  })

  return sortByText(customers, customer => customer.name)
}

export async function listProjectsByCustomer(customerId: string): Promise<Project[]> {
  const projects = await supabaseRequest<ProjectRow[]>('projects', {
    query: { ...buildEqFilter('customer_id', customerId), select: '*' },
  })

  if (projects.length === 0) {
    return []
  }

  const projectIds = projects.map(project => project.id)
  const [wos, pos] = await Promise.all([
    supabaseRequest<WORow[]>('work_orders', { query: { ...buildInFilter('project_id', projectIds), select: '*' } }),
    supabaseRequest<PORow[]>('purchase_orders', { query: { ...buildInFilter('project_id', projectIds), select: '*' } }),
  ])

  const wosByProject = new Map<string, WO[]>()
  for (const row of wos) {
    const group = wosByProject.get(row.project_id)
    if (group) {
      group.push(mapWO(row))
    } else {
      wosByProject.set(row.project_id, [mapWO(row)])
    }
  }

  const posByProject = new Map<string, PO[]>()
  for (const row of pos) {
    const group = posByProject.get(row.project_id)
    if (group) {
      group.push(mapPO(row))
    } else {
      posByProject.set(row.project_id, [mapPO(row)])
    }
  }

  return sortByText(
    projects.map(project => {
      const wosForProject = sortByText(wosByProject.get(project.id) ?? [], item => item.number)
      const posForProject = sortByText(posByProject.get(project.id) ?? [], item => item.number)
      return mapProject(project, wosForProject, posForProject)
    }),
    project => project.number,
  )
}

export async function listWOs(projectId: string): Promise<WO[]> {
  const rows = await supabaseRequest<WORow[]>('work_orders', {
    query: { ...buildEqFilter('project_id', projectId), select: '*' },
  })
  return sortByText(rows.map(mapWO), wo => wo.number)
}

export async function listPOs(projectId: string): Promise<PO[]> {
  const rows = await supabaseRequest<PORow[]>('purchase_orders', {
    query: { ...buildEqFilter('project_id', projectId), select: '*' },
  })
  return sortByText(rows.map(mapPO), po => po.number)
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

  const rows = await supabaseRequest<CustomerRow[]>('customers', {
    method: 'POST',
    body: payload,
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to create customer.')
  }

  return mapCustomer(rows[0], [])
}

export async function updateCustomer(customerId: string, data: {
  name?: string
  address?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
}): Promise<Customer> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name
  if (data.address !== undefined) payload.address = data.address
  if (data.contactName !== undefined) payload.contact_name = data.contactName
  if (data.contactPhone !== undefined) payload.contact_phone = data.contactPhone
  if (data.contactEmail !== undefined) payload.contact_email = data.contactEmail

  const rows = await supabaseRequest<CustomerRow[]>('customers', {
    method: 'PATCH',
    query: buildEqFilter('id', customerId),
    body: payload,
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to update customer.')
  }

  return mapCustomer(rows[0], [])
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const projects = await supabaseRequest<ProjectRow[]>('projects', {
    query: { ...buildEqFilter('customer_id', customerId), select: 'id' },
  })

  if (projects.length > 0) {
    const projectIds = projects.map(project => project.id)
    await Promise.all([
      supabaseRequest('work_orders', {
        method: 'DELETE',
        query: buildInFilter('project_id', projectIds),
      }),
      supabaseRequest('purchase_orders', {
        method: 'DELETE',
        query: buildInFilter('project_id', projectIds),
      }),
    ])

    await supabaseRequest('projects', {
      method: 'DELETE',
      query: buildInFilter('id', projectIds),
    })
  }

  await supabaseRequest('customers', {
    method: 'DELETE',
    query: buildEqFilter('id', customerId),
  })
}

export async function createProject(customerId: string, number: string): Promise<Project> {
  const rows = await supabaseRequest<ProjectRow[]>('projects', {
    method: 'POST',
    body: { customer_id: customerId, number, note: null },
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to create project.')
  }

  return mapProject(rows[0], [], [])
}

export async function updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
  const payload: Record<string, unknown> = {}
  if (data.note !== undefined) payload.note = data.note

  const rows = await supabaseRequest<ProjectRow[]>('projects', {
    method: 'PATCH',
    query: buildEqFilter('id', projectId),
    body: payload,
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to update project.')
  }

  return mapProject(rows[0], [], [])
}

export async function deleteProject(projectId: string): Promise<void> {
  await Promise.all([
    supabaseRequest('work_orders', {
      method: 'DELETE',
      query: buildEqFilter('project_id', projectId),
    }),
    supabaseRequest('purchase_orders', {
      method: 'DELETE',
      query: buildEqFilter('project_id', projectId),
    }),
  ])

  await supabaseRequest('projects', {
    method: 'DELETE',
    query: buildEqFilter('id', projectId),
  })
}

export async function createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
  const rows = await supabaseRequest<WORow[]>('work_orders', {
    method: 'POST',
    body: {
      project_id: projectId,
      number: data.number,
      type: data.type,
      note: data.note ?? null,
    },
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to create work order.')
  }

  return mapWO(rows[0])
}

export async function deleteWO(woId: string): Promise<void> {
  await supabaseRequest('work_orders', {
    method: 'DELETE',
    query: buildEqFilter('id', woId),
  })
}

export async function createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
  const rows = await supabaseRequest<PORow[]>('purchase_orders', {
    method: 'POST',
    body: {
      project_id: projectId,
      number: data.number,
      note: data.note ?? null,
    },
    preferReturn: true,
  })

  if (!rows.length) {
    throw new Error('Failed to create purchase order.')
  }

  return mapPO(rows[0])
}

export async function deletePO(poId: string): Promise<void> {
  await supabaseRequest('purchase_orders', {
    method: 'DELETE',
    query: buildEqFilter('id', poId),
  })
}
