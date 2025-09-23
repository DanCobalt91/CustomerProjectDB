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
let localStorageStorage: StorageApi | null = null

function ensureSupabaseStorage(): StorageApi {
  if (!supabaseStorage) {
    supabaseStorage = createSupabaseStorage(getSupabaseClient())
  }

  return supabaseStorage
}

function ensureLocalStorage(): StorageApi {
  if (!localStorageStorage) {
    localStorageStorage = createLocalStorageStorage()
  }

  return localStorageStorage
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

function normalizeSupabaseError(error: unknown, fallbackMessage: string): Error {
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
    throw normalizeSupabaseError(error, fallbackMessage)
  }
}

export function listCustomers(): Promise<Customer[]> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().listCustomers(),
      'Unable to load customers from Supabase.',
    )
  }

  return ensureLocalStorage().listCustomers()
}

export function listProjectsByCustomer(customerId: string): Promise<Project[]> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().listProjectsByCustomer(customerId),
      'Unable to load projects from Supabase.',
    )
  }

  return ensureLocalStorage().listProjectsByCustomer(customerId)
}

export function listWOs(projectId: string): Promise<WO[]> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().listWOs(projectId),
      'Unable to load work orders from Supabase.',
    )
  }

  return ensureLocalStorage().listWOs(projectId)
}

export function listPOs(projectId: string): Promise<PO[]> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().listPOs(projectId),
      'Unable to load purchase orders from Supabase.',
    )
  }

  return ensureLocalStorage().listPOs(projectId)
}

export function createCustomer(data: {
  name: string
  address?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}): Promise<Customer> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().createCustomer(data),
      'Failed to create customer.',
    )
  }

  return ensureLocalStorage().createCustomer(data)
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
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().updateCustomer(customerId, data),
      'Failed to update customer.',
    )
  }

  return ensureLocalStorage().updateCustomer(customerId, data)
}

export function deleteCustomer(customerId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().deleteCustomer(customerId),
      'Failed to delete customer.',
    )
  }

  return ensureLocalStorage().deleteCustomer(customerId)
}

export function createProject(customerId: string, number: string): Promise<Project> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().createProject(customerId, number),
      'Failed to create project.',
    )
  }

  return ensureLocalStorage().createProject(customerId, number)
}

export function updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().updateProject(projectId, data),
      'Failed to update project.',
    )
  }

  return ensureLocalStorage().updateProject(projectId, data)
}

export function deleteProject(projectId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().deleteProject(projectId),
      'Failed to delete project.',
    )
  }

  return ensureLocalStorage().deleteProject(projectId)
}

export function createWO(
  projectId: string,
  data: { number: string; type: WOType; note?: string },
): Promise<WO> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().createWO(projectId, data),
      'Failed to create work order.',
    )
  }

  return ensureLocalStorage().createWO(projectId, data)
}

export function deleteWO(woId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().deleteWO(woId),
      'Failed to delete work order.',
    )
  }

  return ensureLocalStorage().deleteWO(woId)
}

export function createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().createPO(projectId, data),
      'Failed to create purchase order.',
    )
  }

  return ensureLocalStorage().createPO(projectId, data)
}

export function deletePO(poId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    return runWithSupabase(
      () => ensureSupabaseStorage().deletePO(poId),
      'Failed to delete purchase order.',
    )
  }

  return ensureLocalStorage().deletePO(poId)
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

      return sortByText(data.map(row => mapWO({ ...row } as WORow)), wo => wo.number)
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

      return sortByText(data.map(row => mapPO({ ...row } as PORow)), po => po.number)
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
        .select(
          `
        id,
        name,
        address,
        contact_name,
        contact_phone,
        contact_email
      `,
        )
        .single()

      const inserted = requireData(row, error, 'Failed to create customer.')
      return mapCustomer({ ...inserted, projects: [] })
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
      const payload = {
        name: data.name,
        address: data.address ?? null,
        contact_name: data.contactName ?? null,
        contact_phone: data.contactPhone ?? null,
        contact_email: data.contactEmail ?? null,
      }

      const { data: row, error } = await client
        .from('customers')
        .update(payload)
        .eq('id', customerId)
        .eq('owner_id', userId)
        .select(
          `
        id,
        name,
        address,
        contact_name,
        contact_phone,
        contact_email
      `,
        )
        .single()

      const updated = requireData(row, error, 'Failed to update customer.')
      return mapCustomer({ ...updated, projects: [] })
    },

    async deleteCustomer(customerId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('customers').delete().eq('id', customerId).eq('owner_id', userId)
      requireNoError(error)
    },

    async createProject(customerId: string, number: string): Promise<Project> {
      const userId = await requireUserId()
      const payload = { customer_id: customerId, number, owner_id: userId }
      const { data: row, error } = await client
        .from('projects')
        .insert(payload)
        .select('id, customer_id, number, note')
        .single()

      const inserted = requireData(row, error, 'Failed to create project.')
      return mapProject({ ...inserted, work_orders: [], purchase_orders: [] })
    },

    async updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
      const userId = await requireUserId()
      const payload = { note: data.note ?? null }

      const { data: row, error } = await client
        .from('projects')
        .update(payload)
        .eq('id', projectId)
        .eq('owner_id', userId)
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
        .single()

      const updated = requireData(row, error, 'Failed to update project.')
      return mapProject({ ...updated })
    },

    async deleteProject(projectId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('projects').delete().eq('id', projectId).eq('owner_id', userId)
      requireNoError(error)
    },

    async createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
      const userId = await requireUserId()
      const payload = {
        project_id: projectId,
        owner_id: userId,
        number: data.number,
        type: data.type,
        note: data.note ?? null,
      }
      const { data: row, error } = await client.from('work_orders').insert(payload).select().single()

      const inserted = requireData(row, error, 'Failed to create work order.')
      return mapWO({ ...inserted } as WORow)
    },

    async deleteWO(woId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('work_orders').delete().eq('id', woId).eq('owner_id', userId)
      requireNoError(error)
    },

    async createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
      const userId = await requireUserId()
      const payload = {
        project_id: projectId,
        owner_id: userId,
        number: data.number,
        note: data.note ?? null,
      }
      const { data: row, error } = await client.from('purchase_orders').insert(payload).select().single()

      const inserted = requireData(row, error, 'Failed to create purchase order.')
      return mapPO({ ...inserted } as PORow)
    },

    async deletePO(poId: string): Promise<void> {
      const userId = await requireUserId()
      const { error } = await client.from('purchase_orders').delete().eq('id', poId).eq('owner_id', userId)
      requireNoError(error)
    },
  }
}
function createLocalStorageStorage(): StorageApi {
  type Database = { customers: Customer[] }

  type StorageLike = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }

  const STORAGE_KEY = 'customer-project-db'
  const memoryStorage: StorageLike = (() => {
    const store = new Map<string, string>()
    return {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null
      },
      setItem(key: string, value: string) {
        store.set(key, value)
      },
      removeItem(key: string) {
        store.delete(key)
      },
    }
  })()

  let cachedStorage: StorageLike | null = null

  function resolveStorage(): StorageLike {
    if (cachedStorage) {
      return cachedStorage
    }

    try {
      if (typeof globalThis !== 'undefined') {
        const potential = (globalThis as { localStorage?: unknown }).localStorage
        if (
          potential &&
          typeof (potential as StorageLike).getItem === 'function' &&
          typeof (potential as StorageLike).setItem === 'function' &&
          typeof (potential as StorageLike).removeItem === 'function'
        ) {
          const storage = potential as StorageLike
          const testKey = '__customer_project_db__'
          try {
            storage.setItem(testKey, testKey)
            storage.removeItem(testKey)
            cachedStorage = storage
            return cachedStorage
          } catch {
            // Ignore storage write errors and fall back to memory storage
          }
        }
      }
    } catch {
      // Ignore detection errors and fall back to memory storage
    }

    cachedStorage = memoryStorage
    return cachedStorage
  }

  function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  function normalizeWorkOrder(value: unknown): WO | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id : null
    const number = typeof raw.number === 'string' ? raw.number : null
    if (!id || !number) {
      return null
    }

    const type = raw.type === 'Build' || raw.type === 'Onsite' ? (raw.type as WOType) : 'Build'

    return {
      id,
      number,
      type,
      note: toOptionalString(raw.note),
    }
  }

  function normalizePurchaseOrder(value: unknown): PO | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id : null
    const number = typeof raw.number === 'string' ? raw.number : null
    if (!id || !number) {
      return null
    }

    return {
      id,
      number,
      note: toOptionalString(raw.note),
    }
  }

  function normalizeProject(value: unknown): Project | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id : null
    const number = typeof raw.number === 'string' ? raw.number : null
    if (!id || !number) {
      return null
    }

    const wosSource = Array.isArray(raw.wos) ? (raw.wos as unknown[]) : []
    const posSource = Array.isArray(raw.pos) ? (raw.pos as unknown[]) : []

    const wos = wosSource
      .map(normalizeWorkOrder)
      .filter((wo): wo is WO => !!wo)
    const pos = posSource
      .map(normalizePurchaseOrder)
      .filter((po): po is PO => !!po)

    return {
      id,
      number,
      note: toOptionalString(raw.note),
      wos: sortWOs(wos),
      pos: sortPOs(pos),
    }
  }

  function normalizeCustomer(value: unknown): Customer | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id : null
    const name = typeof raw.name === 'string' ? raw.name : null
    if (!id || !name) {
      return null
    }

    const projectsSource = Array.isArray(raw.projects) ? (raw.projects as unknown[]) : []
    const projects = projectsSource
      .map(normalizeProject)
      .filter((project): project is Project => !!project)

    return {
      id,
      name,
      address: toOptionalString(raw.address),
      contactName: toOptionalString(raw.contactName),
      contactPhone: toOptionalString(raw.contactPhone),
      contactEmail: toOptionalString(raw.contactEmail),
      projects: sortProjects(projects),
    }
  }

  function normalizeDatabase(value: unknown): Database {
    if (!value || typeof value !== 'object') {
      return { customers: [] }
    }

    const rawCustomers = Array.isArray((value as { customers?: unknown }).customers)
      ? ((value as { customers?: unknown }).customers as unknown[])
      : []

    const customers = rawCustomers
      .map(normalizeCustomer)
      .filter((customer): customer is Customer => !!customer)

    return { customers: sortCustomers(customers) }
  }

  function loadDatabase(): Database {
    const storage = resolveStorage()
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return { customers: [] }
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      return normalizeDatabase(parsed)
    } catch {
      return { customers: [] }
    }
  }

  function saveDatabase(db: Database): void {
    const storage = resolveStorage()
    const normalized = normalizeDatabase(db)
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }

  function cloneWorkOrder(wo: WO): WO {
    return {
      id: wo.id,
      number: wo.number,
      type: wo.type,
      note: wo.note,
    }
  }

  function clonePurchaseOrder(po: PO): PO {
    return {
      id: po.id,
      number: po.number,
      note: po.note,
    }
  }

  function cloneProject(project: Project): Project {
    return {
      id: project.id,
      number: project.number,
      note: project.note,
      wos: project.wos.map(cloneWorkOrder),
      pos: project.pos.map(clonePurchaseOrder),
    }
  }

  function cloneCustomer(customer: Customer): Customer {
    return {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      contactName: customer.contactName,
      contactPhone: customer.contactPhone,
      contactEmail: customer.contactEmail,
      projects: customer.projects.map(cloneProject),
    }
  }

  function sortCustomers(customers: Customer[]): Customer[] {
    return sortByText(customers, customer => customer.name)
  }

  function sortProjects(projects: Project[]): Project[] {
    return sortByText(projects, project => project.number)
  }

  function sortWOs(wos: WO[]): WO[] {
    return sortByText(wos, wo => wo.number)
  }

  function sortPOs(pos: PO[]): PO[] {
    return sortByText(pos, po => po.number)
  }

  function normalizeInput(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  function applyNullable(current: string | undefined, next: string | null | undefined): string | undefined {
    if (next === undefined) {
      return current
    }
    if (next === null) {
      return undefined
    }
    return normalizeInput(next)
  }

  function createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID()
      } catch {
        // Ignore and use fallback id generation
      }
    }
    return `id-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  }

  function locateCustomer(db: Database, customerId: string) {
    const index = db.customers.findIndex(customer => customer.id === customerId)
    if (index === -1) {
      return null
    }
    const customer = db.customers[index]
    return { index, customer }
  }

  function locateProject(db: Database, projectId: string) {
    for (let customerIndex = 0; customerIndex < db.customers.length; customerIndex += 1) {
      const customer = db.customers[customerIndex]
      const projectIndex = customer.projects.findIndex(project => project.id === projectId)
      if (projectIndex !== -1) {
        const project = customer.projects[projectIndex]
        return { customerIndex, projectIndex, customer, project }
      }
    }
    return null
  }

  function locateWorkOrder(db: Database, woId: string) {
    for (let customerIndex = 0; customerIndex < db.customers.length; customerIndex += 1) {
      const customer = db.customers[customerIndex]
      for (let projectIndex = 0; projectIndex < customer.projects.length; projectIndex += 1) {
        const project = customer.projects[projectIndex]
        const woIndex = project.wos.findIndex(wo => wo.id === woId)
        if (woIndex !== -1) {
          return { customerIndex, projectIndex, woIndex, customer, project }
        }
      }
    }
    return null
  }

  function locatePurchaseOrder(db: Database, poId: string) {
    for (let customerIndex = 0; customerIndex < db.customers.length; customerIndex += 1) {
      const customer = db.customers[customerIndex]
      for (let projectIndex = 0; projectIndex < customer.projects.length; projectIndex += 1) {
        const project = customer.projects[projectIndex]
        const poIndex = project.pos.findIndex(po => po.id === poId)
        if (poIndex !== -1) {
          return { customerIndex, projectIndex, poIndex, customer, project }
        }
      }
    }
    return null
  }

  return {
    async listCustomers(): Promise<Customer[]> {
      const db = loadDatabase()
      return db.customers.map(cloneCustomer)
    },

    async listProjectsByCustomer(customerId: string): Promise<Project[]> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        return []
      }
      return located.customer.projects.map(cloneProject)
    },

    async listWOs(projectId: string): Promise<WO[]> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        return []
      }
      return located.project.wos.map(cloneWorkOrder)
    },

    async listPOs(projectId: string): Promise<PO[]> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        return []
      }
      return located.project.pos.map(clonePurchaseOrder)
    },

    async createCustomer(data: {
      name: string
      address?: string
      contactName?: string
      contactPhone?: string
      contactEmail?: string
    }): Promise<Customer> {
      const db = loadDatabase()
      const customer: Customer = {
        id: createId(),
        name: data.name.trim(),
        address: normalizeInput(data.address),
        contactName: normalizeInput(data.contactName),
        contactPhone: normalizeInput(data.contactPhone),
        contactEmail: normalizeInput(data.contactEmail),
        projects: [],
      }

      const next: Database = { customers: [...db.customers, customer] }
      saveDatabase(next)
      return cloneCustomer(customer)
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
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const { index, customer } = located
      const nextCustomer: Customer = {
        ...customer,
        name: typeof data.name === 'string' ? data.name.trim() || customer.name : customer.name,
        address: applyNullable(customer.address, data.address),
        contactName: applyNullable(customer.contactName, data.contactName),
        contactPhone: applyNullable(customer.contactPhone, data.contactPhone),
        contactEmail: applyNullable(customer.contactEmail, data.contactEmail),
      }

      const nextCustomers = [...db.customers]
      nextCustomers[index] = nextCustomer
      saveDatabase({ customers: nextCustomers })
      return cloneCustomer(nextCustomer)
    },

    async deleteCustomer(customerId: string): Promise<void> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const nextCustomers = [...db.customers]
      nextCustomers.splice(located.index, 1)
      saveDatabase({ customers: nextCustomers })
    },

    async createProject(customerId: string, number: string): Promise<Project> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const projectNumber = number.trim()
      const project: Project = {
        id: createId(),
        number: projectNumber,
        note: undefined,
        wos: [],
        pos: [],
      }

      const nextCustomers = [...db.customers]
      const customer = located.customer
      const projects = sortProjects([...customer.projects, project])
      nextCustomers[located.index] = { ...customer, projects }
      saveDatabase({ customers: nextCustomers })
      return cloneProject(project)
    },

    async updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const nextProject: Project = {
        ...project,
        note: applyNullable(project.note, data.note),
      }

      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = nextProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
      return cloneProject(nextProject)
    },

    async deleteProject(projectId: string): Promise<void> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer } = located
      const updatedProjects = [...customer.projects]
      updatedProjects.splice(projectIndex, 1)
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
    },

    async createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const workOrder: WO = {
        id: createId(),
        number: data.number.trim(),
        type: data.type,
        note: normalizeInput(data.note),
      }

      const updatedProject: Project = {
        ...project,
        wos: sortWOs([...project.wos, workOrder]),
      }

      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
      return cloneWorkOrder(workOrder)
    },

    async deleteWO(woId: string): Promise<void> {
      const db = loadDatabase()
      const located = locateWorkOrder(db, woId)
      if (!located) {
        throw new Error('Work order not found.')
      }

      const { customerIndex, projectIndex, woIndex, customer, project } = located
      const updatedWos = [...project.wos]
      updatedWos.splice(woIndex, 1)
      const updatedProject: Project = { ...project, wos: sortWOs(updatedWos) }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
    },

    async createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const purchaseOrder: PO = {
        id: createId(),
        number: data.number.trim(),
        note: normalizeInput(data.note),
      }

      const updatedProject: Project = {
        ...project,
        pos: sortPOs([...project.pos, purchaseOrder]),
      }

      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
      return clonePurchaseOrder(purchaseOrder)
    },

    async deletePO(poId: string): Promise<void> {
      const db = loadDatabase()
      const located = locatePurchaseOrder(db, poId)
      if (!located) {
        throw new Error('Purchase order not found.')
      }

      const { customerIndex, projectIndex, poIndex, customer, project } = located
      const updatedPos = [...project.pos]
      updatedPos.splice(poIndex, 1)
      const updatedProject: Project = { ...project, pos: sortPOs(updatedPos) }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
    },
  }
}
