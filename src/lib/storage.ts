import type { Customer, PO, Project, WO, WOType } from '../types'

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

let localStorageStorage: StorageApi | null = null

function ensureLocalStorage(): StorageApi {
  if (!localStorageStorage) {
    localStorageStorage = createLocalStorageStorage()
  }

  return localStorageStorage
}

export function listCustomers(): Promise<Customer[]> {
  return ensureLocalStorage().listCustomers()
}

export function listProjectsByCustomer(customerId: string): Promise<Project[]> {
  return ensureLocalStorage().listProjectsByCustomer(customerId)
}

export function listWOs(projectId: string): Promise<WO[]> {
  return ensureLocalStorage().listWOs(projectId)
}

export function listPOs(projectId: string): Promise<PO[]> {
  return ensureLocalStorage().listPOs(projectId)
}

export function createCustomer(data: {
  name: string
  address?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}): Promise<Customer> {
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
  return ensureLocalStorage().updateCustomer(customerId, data)
}

export function deleteCustomer(customerId: string): Promise<void> {
  return ensureLocalStorage().deleteCustomer(customerId)
}

export function createProject(customerId: string, number: string): Promise<Project> {
  return ensureLocalStorage().createProject(customerId, number)
}

export function updateProject(projectId: string, data: { note?: string | null }): Promise<Project> {
  return ensureLocalStorage().updateProject(projectId, data)
}

export function deleteProject(projectId: string): Promise<void> {
  return ensureLocalStorage().deleteProject(projectId)
}

export function createWO(
  projectId: string,
  data: { number: string; type: WOType; note?: string },
): Promise<WO> {
  return ensureLocalStorage().createWO(projectId, data)
}

export function deleteWO(woId: string): Promise<void> {
  return ensureLocalStorage().deleteWO(woId)
}

export function createPO(projectId: string, data: { number: string; note?: string }): Promise<PO> {
  return ensureLocalStorage().createPO(projectId, data)
}

export function deletePO(poId: string): Promise<void> {
  return ensureLocalStorage().deletePO(poId)
}

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
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
          const wo = project.wos[woIndex]
          return { customerIndex, projectIndex, woIndex, customer, project, wo }
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
          const po = project.pos[poIndex]
          return { customerIndex, projectIndex, poIndex, customer, project, po }
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

      const nextCustomers = sortCustomers([customer, ...db.customers])
      saveDatabase({ customers: nextCustomers })
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
      saveDatabase({ customers: sortCustomers(nextCustomers) })
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

      const { index, customer } = located
      const project: Project = {
        id: createId(),
        number: number.trim(),
        note: undefined,
        wos: [],
        pos: [],
      }

      const nextProjects = sortProjects([project, ...customer.projects])
      const nextCustomers = [...db.customers]
      nextCustomers[index] = { ...customer, projects: nextProjects }
      saveDatabase({ customers: sortCustomers(nextCustomers) })
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
