import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Customer, PO, Project, WO, WOType } from '../types'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'

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

const storage: StorageApi = isSupabaseConfigured()
  ? createSupabaseStorage(getSupabaseClient())
  : createBrowserStorage()

export const listCustomers = storage.listCustomers
export const listProjectsByCustomer = storage.listProjectsByCustomer
export const listWOs = storage.listWOs
export const listPOs = storage.listPOs
export const createCustomer = storage.createCustomer
export const updateCustomer = storage.updateCustomer
export const deleteCustomer = storage.deleteCustomer
export const createProject = storage.createProject
export const updateProject = storage.updateProject
export const deleteProject = storage.deleteProject
export const createWO = storage.createWO
export const deleteWO = storage.deleteWO
export const createPO = storage.createPO
export const deletePO = storage.deletePO

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
}

function createSupabaseStorage(client: SupabaseClient): StorageApi {
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

  return {
    async listCustomers(): Promise<Customer[]> {
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

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(row => mapCustomer({ ...row, projects: row.projects ?? [] })), customer => customer.name)
    },

    async listProjectsByCustomer(customerId: string): Promise<Project[]> {
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

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        return []
      }

      return sortByText(data.map(row => mapProject({ ...row })), project => project.number)
    },

    async listWOs(projectId: string): Promise<WO[]> {
      const { data, error } = await client
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
    },

    async listPOs(projectId: string): Promise<PO[]> {
      const { data, error } = await client
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
    },

    async createCustomer(data: {
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
        .select('id, name, address, contact_name, contact_phone, contact_email')
        .single()

      const result = requireData(row, error, 'Failed to update customer.')
      return mapCustomer({ ...result, projects: [] })
    },

    async deleteCustomer(customerId: string): Promise<void> {
      const { data: projects, error: projectError } = await client
        .from('projects')
        .select('id')
        .eq('customer_id', customerId)

      requireNoError(projectError)

      const projectIds = (projects ?? []).map(project => project.id)

      if (projectIds.length > 0) {
        const [{ error: woError }, { error: poError }, { error: deleteProjectsError }] = await Promise.all([
          client.from('work_orders').delete().in('project_id', projectIds),
          client.from('purchase_orders').delete().in('project_id', projectIds),
          client.from('projects').delete().in('id', projectIds),
        ])

        requireNoError(woError)
        requireNoError(poError)
        requireNoError(deleteProjectsError)
      }

      const { error } = await client.from('customers').delete().eq('id', customerId)
      requireNoError(error)
    },

    async createProject(customerId: string, number: string): Promise<Project> {
      const { data, error } = await client
        .from('projects')
        .insert({ customer_id: customerId, number, note: null })
        .select('id, customer_id, number, note')
        .single()

      const row = requireData(data, error, 'Failed to create project.')
      return mapProject({ ...row, work_orders: [], purchase_orders: [] })
    },

    async updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
      const payload: Record<string, unknown> = {}
      if (data.note !== undefined) payload.note = data.note

      const { data: row, error } = await client
        .from('projects')
        .update(payload)
        .eq('id', projectId)
        .select('id, customer_id, number, note')
        .single()

      const result = requireData(row, error, 'Failed to update project.')
      return mapProject({ ...result, work_orders: [], purchase_orders: [] })
    },

    async deleteProject(projectId: string): Promise<void> {
      const [{ error: woError }, { error: poError }, { error: projectError }] = await Promise.all([
        client.from('work_orders').delete().eq('project_id', projectId),
        client.from('purchase_orders').delete().eq('project_id', projectId),
        client.from('projects').delete().eq('id', projectId),
      ])

      requireNoError(woError)
      requireNoError(poError)
      requireNoError(projectError)
    },

    async createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
      const { data: row, error } = await client
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
    },

    async deleteWO(woId: string): Promise<void> {
      const { error } = await client.from('work_orders').delete().eq('id', woId)
      requireNoError(error)
    },

    async createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
      const { data: row, error } = await client
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
    },

    async deletePO(poId: string): Promise<void> {
      const { error } = await client.from('purchase_orders').delete().eq('id', poId)
      requireNoError(error)
    },
  }
}

function createBrowserStorage(): StorageApi {
  const STORAGE_KEY = 'cpdb.v1'

  type StorageLike = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }

  const memoryStore: Record<string, string> = Object.create(null)

  function getStorage(): StorageLike {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }

    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null
      },
      setItem(key, value) {
        memoryStore[key] = value
      },
      removeItem(key) {
        delete memoryStore[key]
      },
    }
  }

  const store = getStorage()

  function read(): Customer[] {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      return normalizeCustomers(parsed)
    } catch (error) {
      console.warn('Failed to parse saved data. Resetting local cache.', error)
      store.removeItem(STORAGE_KEY)
      return []
    }
  }

  function write(customers: Customer[]): void {
    store.setItem(STORAGE_KEY, JSON.stringify(customers))
  }

  function generateId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`
    }
    const random = Math.random().toString(36).slice(2, 9)
    const time = Date.now().toString(36).slice(-4)
    return `${prefix}_${random}${time}`
  }

  function normalizeCustomers(value: unknown): Customer[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value
      .map(normalizeCustomer)
      .map(customer => ({
        ...customer,
        projects: sortByText(customer.projects, project => project.number).map(project => ({
          ...project,
          wos: sortByText(project.wos, wo => wo.number),
          pos: sortByText(project.pos, po => po.number),
        })),
      }))
  }

  function normalizeCustomer(value: any): Customer {
    return {
      id: typeof value?.id === 'string' ? value.id : generateId('cust'),
      name: typeof value?.name === 'string' ? value.name : '',
      address: typeof value?.address === 'string' ? value.address : undefined,
      contactName: typeof value?.contactName === 'string' ? value.contactName : undefined,
      contactPhone: typeof value?.contactPhone === 'string' ? value.contactPhone : undefined,
      contactEmail: typeof value?.contactEmail === 'string' ? value.contactEmail : undefined,
      projects: Array.isArray(value?.projects) ? value.projects.map(normalizeProject) : [],
    }
  }

  function normalizeProject(value: any): Project {
    const note = typeof value?.note === 'string' ? value.note : undefined
    return {
      id: typeof value?.id === 'string' ? value.id : generateId('proj'),
      number: typeof value?.number === 'string' ? value.number : '',
      note: note && note.trim().length > 0 ? note : undefined,
      wos: Array.isArray(value?.wos) ? value.wos.map(normalizeWO) : [],
      pos: Array.isArray(value?.pos) ? value.pos.map(normalizePO) : [],
    }
  }

  function normalizeWO(value: any): WO {
    const note = typeof value?.note === 'string' ? value.note : undefined
    const type = value?.type === 'Onsite' ? 'Onsite' : 'Build'
    return {
      id: typeof value?.id === 'string' ? value.id : generateId('wo'),
      number: typeof value?.number === 'string' ? value.number : '',
      type,
      note: note && note.trim().length > 0 ? note : undefined,
    }
  }

  function normalizePO(value: any): PO {
    const note = typeof value?.note === 'string' ? value.note : undefined
    return {
      id: typeof value?.id === 'string' ? value.id : generateId('po'),
      number: typeof value?.number === 'string' ? value.number : '',
      note: note && note.trim().length > 0 ? note : undefined,
    }
  }

  function cloneCustomer(customer: Customer): Customer {
    return {
      ...customer,
      projects: customer.projects.map(cloneProject),
    }
  }

  function cloneProject(project: Project): Project {
    return {
      ...project,
      wos: project.wos.map(cloneWO),
      pos: project.pos.map(clonePO),
    }
  }

  function cloneWO(wo: WO): WO {
    return { ...wo }
  }

  function clonePO(po: PO): PO {
    return { ...po }
  }

  function locateProject(db: Customer[], projectId: string): { customerIndex: number; projectIndex: number } | null {
    for (let customerIndex = 0; customerIndex < db.length; customerIndex += 1) {
      const projectIndex = db[customerIndex].projects.findIndex(project => project.id === projectId)
      if (projectIndex !== -1) {
        return { customerIndex, projectIndex }
      }
    }
    return null
  }

  function locateWO(db: Customer[], woId: string): { customerIndex: number; projectIndex: number; woIndex: number } | null {
    for (let customerIndex = 0; customerIndex < db.length; customerIndex += 1) {
      const customer = db[customerIndex]
      for (let projectIndex = 0; projectIndex < customer.projects.length; projectIndex += 1) {
        const woIndex = customer.projects[projectIndex].wos.findIndex(wo => wo.id === woId)
        if (woIndex !== -1) {
          return { customerIndex, projectIndex, woIndex }
        }
      }
    }
    return null
  }

  function locatePO(db: Customer[], poId: string): { customerIndex: number; projectIndex: number; poIndex: number } | null {
    for (let customerIndex = 0; customerIndex < db.length; customerIndex += 1) {
      const customer = db[customerIndex]
      for (let projectIndex = 0; projectIndex < customer.projects.length; projectIndex += 1) {
        const poIndex = customer.projects[projectIndex].pos.findIndex(po => po.id === poId)
        if (poIndex !== -1) {
          return { customerIndex, projectIndex, poIndex }
        }
      }
    }
    return null
  }

  return {
    async listCustomers(): Promise<Customer[]> {
      const db = read()
      return sortByText(db.map(cloneCustomer), customer => customer.name)
    },

    async listProjectsByCustomer(customerId: string): Promise<Project[]> {
      const db = read()
      const customer = db.find(c => c.id === customerId)
      if (!customer) {
        return []
      }
      return sortByText(customer.projects.map(cloneProject), project => project.number)
    },

    async listWOs(projectId: string): Promise<WO[]> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        return []
      }
      const project = db[location.customerIndex].projects[location.projectIndex]
      return sortByText(project.wos.map(cloneWO), wo => wo.number)
    },

    async listPOs(projectId: string): Promise<PO[]> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        return []
      }
      const project = db[location.customerIndex].projects[location.projectIndex]
      return sortByText(project.pos.map(clonePO), po => po.number)
    },

    async createCustomer(data: {
      name: string
      address?: string
      contactName?: string
      contactPhone?: string
      contactEmail?: string
    }): Promise<Customer> {
      const db = read()
      const customer: Customer = {
        id: generateId('cust'),
        name: data.name,
        address: data.address ?? undefined,
        contactName: data.contactName ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        contactEmail: data.contactEmail ?? undefined,
        projects: [],
      }
      write([customer, ...db])
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
      const db = read()
      const index = db.findIndex(c => c.id === customerId)
      if (index === -1) {
        throw new Error('Customer not found.')
      }
      const current = db[index]
      const updated: Customer = {
        ...current,
        name: data.name ?? current.name,
        address: data.address === undefined ? current.address : data.address ?? undefined,
        contactName: data.contactName === undefined ? current.contactName : data.contactName ?? undefined,
        contactPhone: data.contactPhone === undefined ? current.contactPhone : data.contactPhone ?? undefined,
        contactEmail: data.contactEmail === undefined ? current.contactEmail : data.contactEmail ?? undefined,
      }
      const next = [...db]
      next[index] = updated
      write(next)
      return cloneCustomer(updated)
    },

    async deleteCustomer(customerId: string): Promise<void> {
      const db = read()
      const next = db.filter(c => c.id !== customerId)
      if (next.length === db.length) {
        return
      }
      write(next)
    },

    async createProject(customerId: string, number: string): Promise<Project> {
      const db = read()
      const index = db.findIndex(c => c.id === customerId)
      if (index === -1) {
        throw new Error('Customer not found.')
      }
      const project: Project = {
        id: generateId('proj'),
        number,
        note: undefined,
        wos: [],
        pos: [],
      }
      const customer = db[index]
      const updatedCustomer: Customer = {
        ...customer,
        projects: sortByText([...customer.projects, project], p => p.number),
      }
      const next = [...db]
      next[index] = updatedCustomer
      write(next)
      return cloneProject(project)
    },

    async updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        throw new Error('Project not found.')
      }
      const customer = db[location.customerIndex]
      const project = customer.projects[location.projectIndex]
      const updatedProject: Project = {
        ...project,
        note: data.note === undefined ? project.note : data.note ?? undefined,
      }
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.map((p, idx) => (idx === location.projectIndex ? updatedProject : p)),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
      return cloneProject(updatedProject)
    },

    async deleteProject(projectId: string): Promise<void> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        return
      }
      const customer = db[location.customerIndex]
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.filter(project => project.id !== projectId),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
    },

    async createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        throw new Error('Project not found.')
      }
      const customer = db[location.customerIndex]
      const project = customer.projects[location.projectIndex]
      const newWO: WO = {
        id: generateId('wo'),
        number: data.number,
        type: data.type,
        note: data.note && data.note.trim().length > 0 ? data.note : undefined,
      }
      const updatedProject: Project = {
        ...project,
        wos: sortByText([...project.wos, newWO], wo => wo.number),
      }
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.map((p, idx) => (idx === location.projectIndex ? updatedProject : p)),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
      return cloneWO(newWO)
    },

    async deleteWO(woId: string): Promise<void> {
      const db = read()
      const location = locateWO(db, woId)
      if (!location) {
        return
      }
      const customer = db[location.customerIndex]
      const project = customer.projects[location.projectIndex]
      const updatedProject: Project = {
        ...project,
        wos: project.wos.filter((_, idx) => idx !== location.woIndex),
      }
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.map((p, idx) => (idx === location.projectIndex ? updatedProject : p)),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
    },

    async createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
      const db = read()
      const location = locateProject(db, projectId)
      if (!location) {
        throw new Error('Project not found.')
      }
      const customer = db[location.customerIndex]
      const project = customer.projects[location.projectIndex]
      const newPO: PO = {
        id: generateId('po'),
        number: data.number,
        note: data.note && data.note.trim().length > 0 ? data.note : undefined,
      }
      const updatedProject: Project = {
        ...project,
        pos: sortByText([...project.pos, newPO], po => po.number),
      }
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.map((p, idx) => (idx === location.projectIndex ? updatedProject : p)),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
      return clonePO(newPO)
    },

    async deletePO(poId: string): Promise<void> {
      const db = read()
      const location = locatePO(db, poId)
      if (!location) {
        return
      }
      const customer = db[location.customerIndex]
      const project = customer.projects[location.projectIndex]
      const updatedProject: Project = {
        ...project,
        pos: project.pos.filter((_, idx) => idx !== location.poIndex),
      }
      const updatedCustomer: Customer = {
        ...customer,
        projects: customer.projects.map((p, idx) => (idx === location.projectIndex ? updatedProject : p)),
      }
      const next = [...db]
      next[location.customerIndex] = updatedCustomer
      write(next)
    },
  }
}
