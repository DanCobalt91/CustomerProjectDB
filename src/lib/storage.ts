import type {
  Customer,
  CustomerContact,
  Project,
  ProjectActiveSubStatus,
  ProjectCustomerSignOff,
  ProjectDocuments,
  ProjectFile,
  ProjectFileCategory,
  ProjectStatusLogEntry,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
  WO,
  WOType,
} from '../types'
import {
  DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  DEFAULT_PROJECT_STATUS,
  PROJECT_ACTIVE_SUB_STATUS_OPTIONS,
  PROJECT_FILE_CATEGORIES,
  PROJECT_TASK_STATUSES,
} from '../types'
import { createId } from './id'

type ContactInput = Partial<Omit<CustomerContact, 'id'>> & { id?: string }
type ProjectDocumentsUpdate = Partial<Record<ProjectFileCategory, ProjectFile[] | ProjectFile | null>>

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
    data: {
      note?: string | null
      documents?: ProjectDocumentsUpdate
      status?: ProjectStatus
      activeSubStatus?: ProjectActiveSubStatus | null
      statusHistory?: ProjectStatusLogEntry[] | null
      customerSignOff?: ProjectCustomerSignOff | null
    },
  ): Promise<Project>
  deleteProject(projectId: string): Promise<void>
  createWO(projectId: string, data: { number: string; type: WOType; note?: string }): Promise<WO>
  deleteWO(woId: string): Promise<void>
  createTask(
    projectId: string,
    data: {
      name: string
      start: string
      end: string
      assignee?: string
      status: ProjectTaskStatus
    },
  ): Promise<ProjectTask>
  updateTask(
    projectId: string,
    taskId: string,
    data: {
      name?: string
      start?: string | null
      end?: string | null
      assignee?: string | null
      status?: ProjectTaskStatus
    },
  ): Promise<ProjectTask>
  deleteTask(projectId: string, taskId: string): Promise<void>
  exportDatabase(): Promise<{ customers: Customer[] }>
  importDatabase(data: unknown): Promise<Customer[]>
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
  data: {
    note?: string | null
    documents?: ProjectDocumentsUpdate
    status?: ProjectStatus
    activeSubStatus?: ProjectActiveSubStatus | null
    statusHistory?: ProjectStatusLogEntry[] | null
    customerSignOff?: ProjectCustomerSignOff | null
  },
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

export function createTask(
  projectId: string,
  data: { name: string; start: string; end: string; assignee?: string; status: ProjectTaskStatus },
): Promise<ProjectTask> {
  return ensureLocalStorage().createTask(projectId, data)
}

export function updateTask(
  projectId: string,
  taskId: string,
  data: {
    name?: string
    start?: string | null
    end?: string | null
    assignee?: string | null
    status?: ProjectTaskStatus
  },
): Promise<ProjectTask> {
  return ensureLocalStorage().updateTask(projectId, taskId, data)
}

export function deleteTask(projectId: string, taskId: string): Promise<void> {
  return ensureLocalStorage().deleteTask(projectId, taskId)
}

export function exportDatabase(): Promise<{ customers: Customer[] }> {
  return ensureLocalStorage().exportDatabase()
}

export function importDatabase(data: unknown): Promise<Customer[]> {
  return ensureLocalStorage().importDatabase(data)
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
    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const id = idRaw || createId()
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
      id,
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
        const entry = raw[category]
        const files: ProjectFile[] = []
        if (Array.isArray(entry)) {
          for (const candidate of entry) {
            const file = normalizeProjectFile(candidate)
            if (file) {
              files.push(file)
            }
          }
        } else {
          const file = normalizeProjectFile(entry)
          if (file) {
            files.push(file)
          }
        }
        if (files.length > 0) {
          documents[category] = files
        }
      }
    }
    return documents
  }

  function normalizeStatusHistoryEntry(value: unknown): ProjectStatusLogEntry | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const statusValue = (raw as { status?: unknown }).status
    if (!isProjectStatus(statusValue)) {
      return null
    }

    let activeSubStatus: ProjectActiveSubStatus | undefined
    if (statusValue === 'Active') {
      const candidate = (raw as { activeSubStatus?: unknown }).activeSubStatus
      if (isProjectActiveSubStatus(candidate)) {
        activeSubStatus = candidate
      }
    }

    const changedByRaw = typeof raw.changedBy === 'string' ? raw.changedBy.trim() : ''
    const changedBy = changedByRaw || 'Unknown'
    const changedAtRaw = typeof raw.changedAt === 'string' ? raw.changedAt : null
    const changedAt = changedAtRaw && !Number.isNaN(Date.parse(changedAtRaw))
      ? changedAtRaw
      : new Date().toISOString()

    return {
      id: idRaw || createId(),
      status: statusValue,
      activeSubStatus,
      changedAt,
      changedBy,
    }
  }

  function normalizeCustomerSignOff(value: unknown): ProjectCustomerSignOff | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const typeRaw = (raw as { type?: unknown }).type
    const type = typeRaw === 'upload' || typeRaw === 'generated' ? typeRaw : null
    if (!type) {
      return null
    }

    const file = normalizeProjectFile((raw as { file?: unknown }).file)
    if (!file) {
      return null
    }

    const completedAtRaw = typeof raw.completedAt === 'string' ? raw.completedAt : null
    const completedAt = completedAtRaw && !Number.isNaN(Date.parse(completedAtRaw))
      ? completedAtRaw
      : new Date().toISOString()

    const decisionRaw = (raw as { decision?: unknown }).decision
    const decision =
      decisionRaw === 'option1' || decisionRaw === 'option2' || decisionRaw === 'option3'
        ? decisionRaw
        : undefined

    const snagsSource = Array.isArray((raw as { snags?: unknown }).snags)
      ? ((raw as { snags?: unknown }).snags as unknown[])
      : []
    const snags = snagsSource
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(item => item.length > 0)

    return {
      id: idRaw || createId(),
      type,
      file,
      completedAt,
      decision,
      snags: snags.length > 0 ? snags : undefined,
      signedByName: toOptionalString((raw as { signedByName?: unknown }).signedByName),
      signedByPosition: toOptionalString((raw as { signedByPosition?: unknown }).signedByPosition),
      signatureDataUrl: toOptionalString((raw as { signatureDataUrl?: unknown }).signatureDataUrl),
    }
  }

  function isProjectStatus(value: unknown): value is ProjectStatus {
    return value === 'Active' || value === 'Complete'
  }

  function isProjectActiveSubStatus(value: unknown): value is ProjectActiveSubStatus {
    return (
      typeof value === 'string' &&
      PROJECT_ACTIVE_SUB_STATUS_OPTIONS.includes(value as ProjectActiveSubStatus)
    )
  }

  function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
    return (
      typeof value === 'string' &&
      PROJECT_TASK_STATUSES.includes(value as ProjectTaskStatus)
    )
  }

  function normalizeDateTimeValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) {
      return undefined
    }
    return new Date(parsed).toISOString()
  }

  function hasProjectDocuments(documents?: ProjectDocuments): documents is ProjectDocuments {
    if (!documents) {
      return false
    }
    return PROJECT_FILE_CATEGORIES.some(category => (documents[category]?.length ?? 0) > 0)
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

  function normalizeProjectTask(value: unknown): ProjectTask | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) {
      return null
    }

    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const start = normalizeDateTimeValue((raw as { start?: unknown }).start)
    const end = normalizeDateTimeValue((raw as { end?: unknown }).end)

    let normalizedEnd = end
    if (start && end) {
      if (new Date(end).getTime() < new Date(start).getTime()) {
        normalizedEnd = start
      }
    }

    const statusRaw = (raw as { status?: unknown }).status
    const status: ProjectTaskStatus = isProjectTaskStatus(statusRaw)
      ? statusRaw
      : 'Not started'

    return {
      id: idRaw || createId(),
      name,
      status,
      start: start ?? undefined,
      end: normalizedEnd ?? undefined,
      assignee: toOptionalString((raw as { assignee?: unknown }).assignee),
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
        documents.fds = [legacyFds]
      }
    }

    const rawStatus = (raw as { status?: unknown }).status
    const status: ProjectStatus = isProjectStatus(rawStatus) ? rawStatus : DEFAULT_PROJECT_STATUS
    const rawActiveSubStatus = (raw as { activeSubStatus?: unknown }).activeSubStatus
    const activeSubStatus: ProjectActiveSubStatus | undefined =
      status === 'Active'
        ? isProjectActiveSubStatus(rawActiveSubStatus)
          ? rawActiveSubStatus
          : DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        : undefined

    const historySource = Array.isArray((raw as { statusHistory?: unknown }).statusHistory)
      ? ((raw as { statusHistory?: unknown }).statusHistory as unknown[])
      : []
    const statusHistory = historySource
      .map(normalizeStatusHistoryEntry)
      .filter((entry): entry is ProjectStatusLogEntry => !!entry)

    const customerSignOff = normalizeCustomerSignOff(
      (raw as { customerSignOff?: unknown }).customerSignOff,
    )

    const tasksSource = Array.isArray((raw as { tasks?: unknown }).tasks)
      ? ((raw as { tasks?: unknown }).tasks as unknown[])
      : []
    const tasks = tasksSource
      .map(normalizeProjectTask)
      .filter((task): task is ProjectTask => !!task)

    return {
      id,
      number,
      status,
      activeSubStatus,
      note: toOptionalString(raw.note),
      wos: sortWOs(wos),
      documents: hasProjectDocuments(documents) ? documents : undefined,
      statusHistory:
        statusHistory.length > 0
          ? sortStatusHistory(statusHistory)
          : [
              {
                id: createId(),
                status,
                activeSubStatus,
                changedAt: new Date().toISOString(),
                changedBy: 'System',
              },
            ],
      customerSignOff: customerSignOff ?? undefined,
      tasks: tasks.length > 0 ? sortTasks(tasks) : [],
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

  function cloneProjectTask(task: ProjectTask): ProjectTask {
    return {
      id: task.id,
      name: task.name,
      status: task.status,
      start: task.start,
      end: task.end,
      assignee: task.assignee,
    }
  }

  function cloneProjectFile(file: ProjectFile): ProjectFile {
    return {
      id: file.id,
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
    const entries: [ProjectFileCategory, ProjectFile[]][] = []
    for (const category of PROJECT_FILE_CATEGORIES) {
      const files = documents[category]
      if (files && files.length > 0) {
        entries.push([category, files.map(cloneProjectFile)])
      }
    }
    if (entries.length === 0) {
      return undefined
    }
    return Object.fromEntries(entries) as ProjectDocuments
  }

  function cloneStatusHistoryEntry(entry: ProjectStatusLogEntry): ProjectStatusLogEntry {
    return {
      id: entry.id,
      status: entry.status,
      activeSubStatus: entry.activeSubStatus,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy,
    }
  }

  function cloneCustomerSignOff(signOff: ProjectCustomerSignOff): ProjectCustomerSignOff {
    return {
      id: signOff.id,
      type: signOff.type,
      completedAt: signOff.completedAt,
      file: cloneProjectFile(signOff.file),
      signedByName: signOff.signedByName,
      signedByPosition: signOff.signedByPosition,
      decision: signOff.decision,
      snags: signOff.snags ? [...signOff.snags] : undefined,
      signatureDataUrl: signOff.signatureDataUrl,
    }
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
      status: project.status,
      activeSubStatus: project.activeSubStatus,
      note: project.note,
      wos: project.wos.map(cloneWorkOrder),
      tasks: project.tasks ? project.tasks.map(cloneProjectTask) : [],
      documents: cloneProjectDocuments(project.documents),
      statusHistory: project.statusHistory?.map(cloneStatusHistoryEntry),
      customerSignOff: project.customerSignOff
        ? cloneCustomerSignOff(project.customerSignOff)
        : undefined,
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

  function sortTasks(tasks: ProjectTask[]): ProjectTask[] {
    return [...tasks].sort((a, b) => {
      const aStart = a.start ? Date.parse(a.start) : Number.NaN
      const bStart = b.start ? Date.parse(b.start) : Number.NaN
      const aValid = !Number.isNaN(aStart)
      const bValid = !Number.isNaN(bStart)
      if (aValid && bValid) {
        if (aStart === bStart) {
          return a.name.localeCompare(b.name)
        }
        return aStart - bStart
      }
      if (aValid) {
        return -1
      }
      if (bValid) {
        return 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  function sortStatusHistory(entries: ProjectStatusLogEntry[]): ProjectStatusLogEntry[] {
    return [...entries].sort(
      (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    )
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
      status: DEFAULT_PROJECT_STATUS,
      activeSubStatus: DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
      note: undefined,
      wos: [],
      tasks: [],
      documents: undefined,
      statusHistory: [
        {
          id: createId(),
          status: DEFAULT_PROJECT_STATUS,
            activeSubStatus: DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
            changedAt: new Date().toISOString(),
            changedBy: 'System',
          },
        ],
        customerSignOff: undefined,
      }

      const nextProjects = sortProjects([project, ...customer.projects])
      const nextCustomers = [...db.customers]
      nextCustomers[index] = { ...customer, projects: nextProjects }
      saveDatabase({ customers: sortCustomers(nextCustomers) })
      return cloneProject(project)
    },

    async updateProject(
      projectId: string,
      data: {
        note?: string | null
        documents?: ProjectDocumentsUpdate
        status?: ProjectStatus
        activeSubStatus?: ProjectActiveSubStatus | null
        statusHistory?: ProjectStatusLogEntry[] | null
        customerSignOff?: ProjectCustomerSignOff | null
      },
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
        documentsUpdate = {
          ...(documentsUpdate ?? {}),
          fds: legacyFds === null ? null : [legacyFds],
        }
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
          const candidates = Array.isArray(value) ? value : [value]
          const normalizedFiles: ProjectFile[] = []
          for (const candidate of candidates) {
            const normalized = normalizeProjectFile(candidate)
            if (normalized) {
              normalizedFiles.push(normalized)
            }
          }
          if (normalizedFiles.length > 0) {
            nextDocuments[category] = normalizedFiles
          } else {
            delete nextDocuments[category]
          }
        }
      }
      const normalizedDocuments = hasProjectDocuments(nextDocuments) ? nextDocuments : undefined

      let nextStatus = project.status
      if (data.status !== undefined && isProjectStatus(data.status)) {
        nextStatus = data.status
      }

      let nextActiveSubStatus = project.activeSubStatus
      if (data.activeSubStatus !== undefined) {
        if (data.activeSubStatus === null) {
          nextActiveSubStatus = undefined
        } else if (isProjectActiveSubStatus(data.activeSubStatus)) {
          nextActiveSubStatus = data.activeSubStatus
        }
      }

      if (nextStatus === 'Complete') {
        nextActiveSubStatus = undefined
      } else {
        nextActiveSubStatus = nextActiveSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
      }

      let nextStatusHistory = project.statusHistory ?? []
      if (data.statusHistory !== undefined) {
        if (data.statusHistory === null) {
          nextStatusHistory = []
        } else {
          nextStatusHistory = data.statusHistory
            .map(normalizeStatusHistoryEntry)
            .filter((entry): entry is ProjectStatusLogEntry => !!entry)
        }
      }

      if (nextStatusHistory.length === 0) {
        nextStatusHistory = [
          {
            id: createId(),
            status: nextStatus,
            activeSubStatus: nextActiveSubStatus,
            changedAt: new Date().toISOString(),
            changedBy: 'System',
          },
        ]
      }
      const normalizedStatusHistory = sortStatusHistory(nextStatusHistory)

      let nextCustomerSignOff = project.customerSignOff
      if (data.customerSignOff !== undefined) {
        if (data.customerSignOff === null) {
          nextCustomerSignOff = undefined
        } else {
          const normalized = normalizeCustomerSignOff(data.customerSignOff)
          if (normalized) {
            nextCustomerSignOff = normalized
          }
        }
      }

      const nextProject: Project = {
        ...project,
        status: nextStatus,
        activeSubStatus: nextActiveSubStatus,
        note: applyNullable(project.note, data.note),
        documents: normalizedDocuments,
        statusHistory: normalizedStatusHistory,
        customerSignOff: nextCustomerSignOff,
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

    async createTask(
      projectId: string,
      data: { name: string; start: string; end: string; assignee?: string; status: ProjectTaskStatus },
    ): Promise<ProjectTask> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const task: ProjectTask = {
        id: createId(),
        name: data.name.trim(),
        status: data.status,
        start: data.start,
        end: data.end,
        assignee: normalizeInput(data.assignee),
      }

      const updatedTasks = sortTasks([...(project.tasks ?? []), task])
      const updatedProject: Project = { ...project, tasks: updatedTasks }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
      return cloneProjectTask(task)
    },

    async updateTask(
      projectId: string,
      taskId: string,
      data: {
        name?: string
        start?: string | null
        end?: string | null
        assignee?: string | null
        status?: ProjectTaskStatus
      },
    ): Promise<ProjectTask> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const tasks = [...(project.tasks ?? [])]
      const taskIndex = tasks.findIndex(task => task.id === taskId)
      if (taskIndex === -1) {
        throw new Error('Task not found.')
      }

      const current = tasks[taskIndex]
      const updated: ProjectTask = {
        ...current,
        name: data.name !== undefined ? data.name.trim() : current.name,
        start: data.start === undefined ? current.start : data.start ?? undefined,
        end: data.end === undefined ? current.end : data.end ?? undefined,
        assignee:
          data.assignee === undefined
            ? current.assignee
            : data.assignee === null
            ? undefined
            : normalizeInput(data.assignee),
        status: data.status ?? current.status,
      }

      tasks[taskIndex] = updated
      const updatedProject: Project = { ...project, tasks: sortTasks(tasks) }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
      return cloneProjectTask(updated)
    },

    async deleteTask(projectId: string, taskId: string): Promise<void> {
      const db = loadDatabase()
      const located = locateProject(db, projectId)
      if (!located) {
        throw new Error('Project not found.')
      }

      const { customerIndex, projectIndex, customer, project } = located
      const tasks = [...(project.tasks ?? [])]
      const taskIndex = tasks.findIndex(task => task.id === taskId)
      if (taskIndex === -1) {
        throw new Error('Task not found.')
      }

      tasks.splice(taskIndex, 1)
      const updatedProject: Project = { ...project, tasks: sortTasks(tasks) }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers })
    },

    async exportDatabase(): Promise<{ customers: Customer[] }> {
      const db = loadDatabase()
      return {
        customers: db.customers.map(cloneCustomer),
      }
    },

    async importDatabase(data: unknown): Promise<Customer[]> {
      let source: unknown = data
      if (typeof data === 'string') {
        try {
          source = JSON.parse(data) as unknown
        } catch {
          throw new Error('The provided file is not valid JSON.')
        }
      }

      const normalized = normalizeDatabase(source)
      saveDatabase(normalized)
      return normalized.customers.map(cloneCustomer)
    },
  }
}
