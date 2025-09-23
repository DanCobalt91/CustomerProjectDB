import type {
  Customer,
  CustomerContact,
  Project,
  ProjectDocuments,
  ProjectFile,
  ProjectFileCategory,
  WO,
  WOType,
} from '../types'
import { PROJECT_FILE_CATEGORIES } from '../types'

type ContactInput = Partial<Omit<CustomerContact, 'id'>> & { id?: string }
type ProjectDocumentsUpdate = Partial<Record<ProjectFileCategory, ProjectFile | null>>

type StorageApi = {
  listCustomers(): Promise<Customer[]>
  listProjectsByCustomer(customerId: string): Promise<Project[]>
  listWOs(projectId: string): Promise<WO[]>
  createCustomer(data: {
    name: string
    address?: string
    contacts?: ContactInput[]
  }): Promise<Customer>
  updateCustomer(
    customerId: string,
    data: {
      name?: string
      address?: string | null
      contacts?: ContactInput[] | null
    },
  ): Promise<Customer>
  deleteCustomer(customerId: string): Promise<void>
  createProject(customerId: string, number: string): Promise<Project>
  updateProject(
    projectId: string,
    data: { note?: string | null; documents?: ProjectDocumentsUpdate },
  ): Promise<Project>
  deleteProject(projectId: string): Promise<void>
  createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO>
  deleteWO(woId: string): Promise<void>
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

export function createCustomer(data: {
  name: string
  address?: string
  contacts?: ContactInput[]
}): Promise<Customer> {
  return ensureLocalStorage().createCustomer(data)
}

export function updateCustomer(
  customerId: string,
  data: {
    name?: string
    address?: string | null
    contacts?: ContactInput[] | null
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

export function updateProject(
  projectId: string,
  data: { note?: string | null; documents?: ProjectDocumentsUpdate },
): Promise<Project> {
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

  function normalizeProjectFile(value: unknown): ProjectFile | undefined {
    if (!value || typeof value !== 'object') {
      return undefined
    }

    const raw = value as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name : null
    const type = typeof raw.type === 'string' && raw.type ? raw.type : 'application/octet-stream'
    const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : null
    const uploadedAtRaw = typeof raw.uploadedAt === 'string' ? raw.uploadedAt : null

    if (!name || !dataUrl) {
      return undefined
    }

    const uploadedAt = uploadedAtRaw && !Number.isNaN(Date.parse(uploadedAtRaw))
      ? uploadedAtRaw
      : new Date().toISOString()

    return {
      name,
      type,
      dataUrl,
      uploadedAt,
    }
  }

  function normalizeProjectDocuments(value: unknown): ProjectDocuments {
    const documents: ProjectDocuments = {}
    if (value && typeof value === 'object') {
      const raw = value as Record<string, unknown>
      for (const category of PROJECT_FILE_CATEGORIES) {
        const file = normalizeProjectFile(raw[category])
        if (file) {
          documents[category] = file
        }
      }
    }
    return documents
  }

  function hasProjectDocuments(documents?: ProjectDocuments): documents is ProjectDocuments {
    if (!documents) {
      return false
    }
    return PROJECT_FILE_CATEGORIES.some(category => !!documents[category])
  }

  function normalizeCustomerContact(value: unknown): CustomerContact | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = toOptionalString(raw.name)
    const position = toOptionalString(raw.position)
    const phone = toOptionalString(raw.phone)
    const email = toOptionalString(raw.email)

    if (!name && !position && !phone && !email) {
      return null
    }

    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const id = idRaw || createId()

    return {
      id,
      name,
      position,
      phone,
      email,
    }
  }

  function sortContacts(contacts: CustomerContact[]): CustomerContact[] {
    return sortByText(contacts, contact => contact.name || contact.position || contact.email || contact.phone || contact.id)
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

    const wos = wosSource
      .map(normalizeWorkOrder)
      .filter((wo): wo is WO => !!wo)
    const documents = normalizeProjectDocuments((raw as { documents?: unknown }).documents)
    if (!documents.fds) {
      const legacyFds = normalizeProjectFile((raw as { fds?: unknown }).fds)
      if (legacyFds) {
        documents.fds = legacyFds
      }
    }

    return {
      id,
      number,
      note: toOptionalString(raw.note),
      wos: sortWOs(wos),
      documents: hasProjectDocuments(documents) ? documents : undefined,
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

    const contactsSource = Array.isArray((raw as { contacts?: unknown }).contacts)
      ? ((raw as { contacts?: unknown }).contacts as unknown[])
      : []
    let contacts = contactsSource
      .map(normalizeCustomerContact)
      .filter((contact): contact is CustomerContact => !!contact)

    if (contacts.length === 0) {
      const fallbackContact = normalizeCustomerContact({
        name: (raw as { contactName?: unknown }).contactName,
        phone: (raw as { contactPhone?: unknown }).contactPhone,
        email: (raw as { contactEmail?: unknown }).contactEmail,
      })
      if (fallbackContact) {
        contacts = [fallbackContact]
      }
    }

    return {
      id,
      name,
      address: toOptionalString(raw.address),
      contacts: sortContacts(contacts),
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

  function cloneProjectFile(file: ProjectFile): ProjectFile {
    return {
      name: file.name,
      type: file.type,
      dataUrl: file.dataUrl,
      uploadedAt: file.uploadedAt,
    }
  }

  function cloneProjectDocuments(documents?: ProjectDocuments): ProjectDocuments | undefined {
    if (!documents) {
      return undefined
    }
    const entries: [ProjectFileCategory, ProjectFile][] = []
    for (const category of PROJECT_FILE_CATEGORIES) {
      const file = documents[category]
      if (file) {
        entries.push([category, cloneProjectFile(file)])
      }
    }
    if (entries.length === 0) {
      return undefined
    }
    return Object.fromEntries(entries) as ProjectDocuments
  }

  function cloneCustomerContact(contact: CustomerContact): CustomerContact {
    return {
      id: contact.id,
      name: contact.name,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
    }
  }

  function cloneProject(project: Project): Project {
    return {
      id: project.id,
      number: project.number,
      note: project.note,
      wos: project.wos.map(cloneWorkOrder),
      documents: cloneProjectDocuments(project.documents),
    }
  }

  function cloneCustomer(customer: Customer): Customer {
    return {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      contacts: customer.contacts.map(cloneCustomerContact),
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

    async createCustomer(data: {
      name: string
      address?: string
      contacts?: ContactInput[]
    }): Promise<Customer> {
      const db = loadDatabase()
      const contactsSource = Array.isArray(data.contacts) ? data.contacts : []
      const contacts = sortContacts(
        contactsSource
          .map(normalizeCustomerContact)
          .filter((contact): contact is CustomerContact => !!contact),
      )
      const customer: Customer = {
        id: createId(),
        name: data.name.trim(),
        address: normalizeInput(data.address),
        contacts,
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
        contacts?: ContactInput[] | null
      },
    ): Promise<Customer> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const { index, customer } = located
      const contacts =
        data.contacts === undefined
          ? customer.contacts
          : data.contacts === null
          ? []
          : sortContacts(
              data.contacts
                .map(normalizeCustomerContact)
                .filter((contact): contact is CustomerContact => !!contact),
            )
      const nextCustomer: Customer = {
        ...customer,
        name: typeof data.name === 'string' ? data.name.trim() || customer.name : customer.name,
        address: applyNullable(customer.address, data.address),
        contacts,
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
      }

      const nextProjects = sortProjects([project, ...customer.projects])
      const nextCustomers = [...db.customers]
      nextCustomers[index] = { ...customer, projects: nextProjects }
      saveDatabase({ customers: sortCustomers(nextCustomers) })
      return cloneProject(project)
    },

    async updateProject(
      projectId: string,
      data: { note?: string | null; documents?: ProjectDocumentsUpdate },
    ): Promise<Project> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      let documentsUpdate = data.documents
      const legacyFds = (data as { fds?: ProjectFile | null }).fds
      if (legacyFds !== undefined) {
        documentsUpdate = { ...(documentsUpdate ?? {}), fds: legacyFds }
      }

      const nextDocuments: ProjectDocuments = { ...(project.documents ?? {}) }
      if (documentsUpdate) {
        for (const category of PROJECT_FILE_CATEGORIES) {
          if (!(category in documentsUpdate)) {
            continue
          }
          const value = documentsUpdate[category]
          if (value === undefined) {
            continue
          }
          if (value === null) {
            delete nextDocuments[category]
            continue
          }
          const normalized = normalizeProjectFile(value)
          if (normalized) {
            nextDocuments[category] = normalized
          }
        }
      }
      const normalizedDocuments = hasProjectDocuments(nextDocuments) ? nextDocuments : undefined
      const nextProject: Project = {
        ...project,
        note: applyNullable(project.note, data.note),
        documents: normalizedDocuments,
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
  }
}
