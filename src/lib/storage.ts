import type {
  AppRole,
  BusinessSettings,
  Customer,
  CustomerSite,
  CustomerSubCustomer,
  CustomerContact,
  Project,
  ProjectActiveSubStatus,
  ProjectCustomerSignOff,
  ProjectDocuments,
  ProjectFile,
  ProjectFileCategory,
  ProjectInfo,
  ProjectOnsiteReport,
  ProjectStatusLogEntry,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
  TwoFactorMethod,
  User,
  WO,
  WOType,
} from '../types'
import {
  BUSINESS_DAYS,
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  DEFAULT_PROJECT_STATUS,
  PROJECT_ACTIVE_SUB_STATUS_OPTIONS,
  PROJECT_FILE_CATEGORIES,
  PROJECT_TASK_STATUSES,
} from '../types'
import { createId } from './id'

const DEFAULT_USER_ID = 'user-demo'
const DEFAULT_USER_NAME = 'Demo User'
const DEFAULT_USER_EMAIL = 'demo@example.com'
const DEFAULT_USER_PASSWORD = 'Demo@123'

type ContactInput = Partial<Omit<CustomerContact, 'id'>> & { id?: string }
type CustomerSiteInput = Partial<Omit<CustomerSite, 'id'>> & { id?: string }
type CustomerSubCustomerInput = Partial<Omit<CustomerSubCustomer, 'id' | 'name'>> & {
  id?: string
  name?: string
}
type ProjectDocumentsUpdate = Partial<Record<ProjectFileCategory, ProjectFile[] | ProjectFile | null>>

type StorageApi = {
  listCustomers(): Promise<Customer[]>
  listUsers(): Promise<User[]>
  listProjectsByCustomer(customerId: string): Promise<Project[]>
  listWOs(projectId: string): Promise<WO[]>
  createCustomer(data: {
    name: string
    address?: string
    contacts?: ContactInput[]
    sites?: CustomerSiteInput[]
    subCustomers?: CustomerSubCustomerInput[]
  }): Promise<Customer>
  updateCustomer(
    customerId: string,
    data: {
      name?: string
      address?: string | null
      contacts?: ContactInput[] | null
      sites?: CustomerSiteInput[] | null
      subCustomers?: CustomerSubCustomerInput[] | null
    },
  ): Promise<Customer>
  deleteCustomer(customerId: string): Promise<void>
  createProject(
    customerId: string,
    data: {
      number: string
      info?: ProjectInfo | null
      tasks?: Array<{ name: string; status?: ProjectTaskStatus; assigneeId?: string }>
    },
  ): Promise<Project>
  updateProject(
    projectId: string,
    data: {
      note?: string | null
      documents?: ProjectDocumentsUpdate
      status?: ProjectStatus
      activeSubStatus?: ProjectActiveSubStatus | null
      statusHistory?: ProjectStatusLogEntry[] | null
      customerSignOff?: ProjectCustomerSignOff | null
      info?: ProjectInfo | null
      onsiteReports?: ProjectOnsiteReport[] | null
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
      assigneeId?: string
      assigneeName?: string
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
      assigneeId?: string | null
      assigneeName?: string | null
      status?: ProjectTaskStatus
    },
  ): Promise<ProjectTask>
  deleteTask(projectId: string, taskId: string): Promise<void>
  createUser(data: {
    name: string
    email: string
    password: string
    role: AppRole
    twoFactorEnabled: boolean
    twoFactorMethod?: TwoFactorMethod | null
  }): Promise<User>
  updateUser(
    userId: string,
    data: {
      name?: string
      email?: string | null
      password?: string | null
      role?: AppRole
      twoFactorEnabled?: boolean
      twoFactorMethod?: TwoFactorMethod | null
    },
  ): Promise<User>
  deleteUser(userId: string): Promise<void>
  authenticateUser(credentials: { email: string; password: string }): Promise<User>
  exportDatabase(): Promise<{ customers: Customer[]; users: User[]; businessSettings: BusinessSettings }>
  importDatabase(data: unknown): Promise<{
    customers: Customer[]
    users: User[]
    businessSettings: BusinessSettings
  }>
  getBusinessSettings(): Promise<BusinessSettings>
  updateBusinessSettings(settings: BusinessSettings): Promise<BusinessSettings>
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

export function listUsers(): Promise<User[]> {
  return ensureLocalStorage().listUsers()
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
  sites?: CustomerSiteInput[]
  subCustomers?: CustomerSubCustomerInput[]
}): Promise<Customer> {
  return ensureLocalStorage().createCustomer(data)
}

export function updateCustomer(
  customerId: string,
  data: {
    name?: string
    address?: string | null
    contacts?: ContactInput[] | null
    sites?: CustomerSiteInput[] | null
    subCustomers?: CustomerSubCustomerInput[] | null
  },
): Promise<Customer> {
  return ensureLocalStorage().updateCustomer(customerId, data)
}

export function deleteCustomer(customerId: string): Promise<void> {
  return ensureLocalStorage().deleteCustomer(customerId)
}

export function createProject(
  customerId: string,
  data: {
    number: string
    info?: ProjectInfo | null
    tasks?: Array<{ name: string; status?: ProjectTaskStatus; assigneeId?: string }>
    siteId?: string | null
  },
): Promise<Project> {
  return ensureLocalStorage().createProject(customerId, data)
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
    info?: ProjectInfo | null
    onsiteReports?: ProjectOnsiteReport[] | null
    siteId?: string | null
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
  data: {
    name: string
    start: string
    end: string
    assigneeId?: string
    assigneeName?: string
    status: ProjectTaskStatus
  },
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
    assigneeId?: string | null
    assigneeName?: string | null
    status?: ProjectTaskStatus
  },
): Promise<ProjectTask> {
  return ensureLocalStorage().updateTask(projectId, taskId, data)
}

export function deleteTask(projectId: string, taskId: string): Promise<void> {
  return ensureLocalStorage().deleteTask(projectId, taskId)
}

export function createUser(data: {
  name: string
  email: string
  password: string
  role: AppRole
  twoFactorEnabled: boolean
  twoFactorMethod?: TwoFactorMethod | null
}): Promise<User> {
  return ensureLocalStorage().createUser(data)
}

export function updateUser(
  userId: string,
  data: {
    name?: string
    email?: string | null
    password?: string | null
    role?: AppRole
    twoFactorEnabled?: boolean
    twoFactorMethod?: TwoFactorMethod | null
  },
): Promise<User> {
  return ensureLocalStorage().updateUser(userId, data)
}

export function deleteUser(userId: string): Promise<void> {
  return ensureLocalStorage().deleteUser(userId)
}

export function authenticateUser(credentials: { email: string; password: string }): Promise<User> {
  return ensureLocalStorage().authenticateUser(credentials)
}

export function exportDatabase(): Promise<{
  customers: Customer[]
  users: User[]
  businessSettings: BusinessSettings
}> {
  return ensureLocalStorage().exportDatabase()
}

export function importDatabase(data: unknown): Promise<{
  customers: Customer[]
  users: User[]
  businessSettings: BusinessSettings
}> {
  return ensureLocalStorage().importDatabase(data)
}

export function getBusinessSettings(): Promise<BusinessSettings> {
  return ensureLocalStorage().getBusinessSettings()
}

export function updateBusinessSettings(settings: BusinessSettings): Promise<BusinessSettings> {
  return ensureLocalStorage().updateBusinessSettings(settings)
}

function sortByText<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true, sensitivity: 'base' }))
}

function createLocalStorageStorage(): StorageApi {
  type Database = { customers: Customer[]; users: User[]; businessSettings: BusinessSettings }

  type StorageLike = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }

  const STORAGE_KEY = 'customer-project-db'
  const LEGACY_STORAGE_KEYS = ['cpdb.v1'] as const
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

  function normalizeEmail(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    return trimmed.toLowerCase()
  }

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  function hashPassword(password: string): string {
    const normalized = password.normalize('NFKC')
    let hashA = 0x811c9dc5
    let hashB = 0x01000193
    for (const char of normalized) {
      const code = char.codePointAt(0) ?? 0
      hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0
      hashB = Math.imul(hashB + code, 0x01000193) >>> 0
      hashB ^= (hashA << 5) | (hashA >>> 27)
    }
    const segmentA = hashA.toString(16).padStart(8, '0')
    const segmentB = hashB.toString(16).padStart(8, '0')
    return `cpdb$${segmentA}${segmentB}`
  }

  function verifyPassword(password: string, expectedHash: string): boolean {
    if (typeof expectedHash !== 'string' || expectedHash.length === 0) {
      return false
    }
    const actual = hashPassword(password)
    if (actual.length !== expectedHash.length) {
      return false
    }
    let mismatch = 0
    for (let index = 0; index < expectedHash.length; index += 1) {
      mismatch |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index)
    }
    return mismatch === 0
  }

  const DEFAULT_USER_PASSWORD_HASH = hashPassword(DEFAULT_USER_PASSWORD)

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
      projectInfo: normalizeProjectInfo((raw as { projectInfo?: unknown }).projectInfo) ?? undefined,
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

  function normalizeCustomerSite(value: unknown): CustomerSite | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = toOptionalString(raw.name)
    const address = toOptionalString(raw.address)
    const notes = toOptionalString(raw.notes)

    if (!name && !address && !notes) {
      return null
    }

    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    return {
      id: idRaw || createId(),
      name,
      address,
      notes,
    }
  }

  function normalizeCustomerSubCustomer(
    value: unknown,
    availableSites?: CustomerSite[],
  ): CustomerSubCustomer | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = toOptionalString(raw.name)
    if (!name) {
      return null
    }

    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const address = toOptionalString(raw.address)
    const notes = toOptionalString(raw.notes)
    const siteIdRaw = toOptionalString((raw as { siteId?: unknown }).siteId)

    let siteId: string | undefined
    if (siteIdRaw && (!availableSites || availableSites.some(site => site.id === siteIdRaw))) {
      siteId = siteIdRaw
    }

    return {
      id: idRaw || createId(),
      name,
      address,
      notes,
      siteId,
    }
  }

  function normalizeCustomerContact(
    value: unknown,
    availableSites?: CustomerSite[],
  ): CustomerContact | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = toOptionalString(raw.name)
    const position = toOptionalString(raw.position)
    const phone = toOptionalString(raw.phone)
    const email = toOptionalString(raw.email)
    const siteIdRaw = toOptionalString((raw as { siteId?: unknown }).siteId)

    let siteId: string | undefined
    if (siteIdRaw && (!availableSites || availableSites.some(site => site.id === siteIdRaw))) {
      siteId = siteIdRaw
    }

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
      siteId,
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
      assigneeId: toOptionalString((raw as { assigneeId?: unknown }).assigneeId),
      assigneeName: toOptionalString(
        (raw as { assigneeName?: unknown; assignee?: unknown }).assigneeName ??
          (raw as { assignee?: unknown }).assignee,
      ),
    }
  }

  function normalizeStringArrayValue(value: unknown): string[] | undefined {
    if (value === undefined || value === null) {
      return undefined
    }

    const accumulator: string[] = []

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          const normalized = entry.trim()
          if (normalized) {
            accumulator.push(normalized)
          }
        }
      }
    } else if (typeof value === 'string') {
      const parts = value.split(/\r?\n|,/)
      for (const part of parts) {
        const normalized = part.trim()
        if (normalized) {
          accumulator.push(normalized)
        }
      }
    }

    if (accumulator.length === 0) {
      return undefined
    }

    return accumulator
  }

  function normalizeDateOnlyValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = Date.parse(trimmed)
      if (Number.isNaN(parsed)) {
        return undefined
      }
      const iso = new Date(parsed).toISOString()
      return iso.slice(0, 10)
    }
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) {
      return undefined
    }
    return trimmed
  }

  function normalizeTimeOnlyValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const match = trimmed.match(/^([0-9]{1,2}):([0-9]{2})$/)
    if (!match) {
      return undefined
    }
    const hours = Number.parseInt(match[1], 10)
    const minutes = Number.parseInt(match[2], 10)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return undefined
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return undefined
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  function normalizeBusinessSettings(value: unknown): BusinessSettings {
    const base = DEFAULT_BUSINESS_SETTINGS
    const normalized: BusinessSettings = {
      businessName: base.businessName,
      hours: BUSINESS_DAYS.reduce((acc, day) => {
        const source = base.hours[day]
        acc[day] = { ...source }
        return acc
      }, {} as BusinessSettings['hours']),
    }

    if (!value || typeof value !== 'object') {
      return normalized
    }

    const raw = value as Record<string, unknown>
    const name = toOptionalString(raw.businessName)
    if (name) {
      normalized.businessName = name
    }

    const hoursValue = (raw as { hours?: unknown }).hours
    if (hoursValue && typeof hoursValue === 'object') {
      const hoursRaw = hoursValue as Record<string, unknown>
      for (const day of BUSINESS_DAYS) {
        const entry = hoursRaw[day]
        if (!entry || typeof entry !== 'object') {
          continue
        }
        const entryRaw = entry as Record<string, unknown>
        const enabled = Boolean(entryRaw.enabled)
        const start = normalizeTimeOnlyValue(entryRaw.start) ?? normalized.hours[day].start
        const end = normalizeTimeOnlyValue(entryRaw.end) ?? normalized.hours[day].end
        normalized.hours[day] = { enabled, start, end }
      }
    }

    return normalized
  }

  function normalizeProjectInfo(value: unknown): ProjectInfo | undefined {
    if (!value || typeof value !== 'object') {
      return undefined
    }

    const raw = value as Record<string, unknown>
    const lineReference = toOptionalString(
      (raw as { lineReference?: unknown; lineName?: unknown; lineNumber?: unknown }).lineReference ??
        (raw as { lineName?: unknown }).lineName ??
        (raw as { lineNumber?: unknown }).lineNumber,
    )
    const machineSerialNumbers = normalizeStringArrayValue(
      (raw as { machineSerialNumbers?: unknown; machineSerials?: unknown }).machineSerialNumbers ??
        (raw as { machineSerials?: unknown }).machineSerials,
    )
    const toolSerialNumbers = normalizeStringArrayValue(
      (raw as { toolSerialNumbers?: unknown; toolSerials?: unknown }).toolSerialNumbers ??
        (raw as { toolSerials?: unknown }).toolSerials,
    )
    const cobaltOrderNumber = toOptionalString((raw as { cobaltOrderNumber?: unknown }).cobaltOrderNumber)
    const customerOrderNumber = toOptionalString(
      (raw as { customerOrderNumber?: unknown; purchaseOrder?: unknown }).customerOrderNumber ??
        (raw as { purchaseOrder?: unknown }).purchaseOrder,
    )
    const salespersonId = toOptionalString((raw as { salespersonId?: unknown }).salespersonId)
    const salespersonName = toOptionalString(
      (raw as { salespersonName?: unknown; salesperson?: unknown }).salespersonName ??
        (raw as { salesperson?: unknown }).salesperson,
    )
    const startDate = normalizeDateOnlyValue((raw as { startDate?: unknown }).startDate)
    const proposedCompletionDate = normalizeDateOnlyValue(
      (raw as { proposedCompletionDate?: unknown; targetCompletionDate?: unknown }).proposedCompletionDate ??
        (raw as { targetCompletionDate?: unknown }).targetCompletionDate,
    )

    const info: ProjectInfo = {}
    if (lineReference) info.lineReference = lineReference
    if (machineSerialNumbers) info.machineSerialNumbers = machineSerialNumbers
    if (toolSerialNumbers) info.toolSerialNumbers = toolSerialNumbers
    if (cobaltOrderNumber) info.cobaltOrderNumber = cobaltOrderNumber
    if (customerOrderNumber) info.customerOrderNumber = customerOrderNumber
    if (salespersonId) info.salespersonId = salespersonId
    if (salespersonName) info.salespersonName = salespersonName
    if (startDate) info.startDate = startDate
    if (proposedCompletionDate) info.proposedCompletionDate = proposedCompletionDate

    const hasInfo = Object.values(info).some(value => {
      if (Array.isArray(value)) {
        return value.length > 0
      }
      return value !== undefined
    })

    return hasInfo ? info : undefined
  }

  function normalizeOnsiteReport(value: unknown): ProjectOnsiteReport | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const reportDate =
      normalizeDateOnlyValue((raw as { reportDate?: unknown }).reportDate) ??
      new Date().toISOString().slice(0, 10)
    const arrivalTime = normalizeTimeOnlyValue((raw as { arrivalTime?: unknown }).arrivalTime)
    const departureTime = normalizeTimeOnlyValue((raw as { departureTime?: unknown }).departureTime)
    const engineerName = toOptionalString((raw as { engineerName?: unknown }).engineerName) ?? ''
    const customerContact = toOptionalString((raw as { customerContact?: unknown }).customerContact)
    const siteAddress = toOptionalString((raw as { siteAddress?: unknown }).siteAddress)
    const workSummary = toOptionalString((raw as { workSummary?: unknown }).workSummary) ?? ''
    const materialsUsed = toOptionalString((raw as { materialsUsed?: unknown }).materialsUsed)
    const additionalNotes = toOptionalString((raw as { additionalNotes?: unknown }).additionalNotes)
    const signedByName = toOptionalString((raw as { signedByName?: unknown }).signedByName)
    const signedByPosition = toOptionalString((raw as { signedByPosition?: unknown }).signedByPosition)
    const signatureDataUrl = toOptionalString((raw as { signatureDataUrl?: unknown }).signatureDataUrl)
    const pdfDataUrl = toOptionalString((raw as { pdfDataUrl?: unknown }).pdfDataUrl)
    const createdAtRaw = typeof raw.createdAt === 'string' ? raw.createdAt : null
    const createdAt =
      createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
        ? createdAtRaw
        : new Date().toISOString()

    return {
      id: idRaw || createId(),
      reportDate,
      arrivalTime,
      departureTime,
      engineerName,
      customerContact,
      siteAddress,
      workSummary,
      materialsUsed,
      additionalNotes,
      signedByName,
      signedByPosition,
      signatureDataUrl,
      pdfDataUrl,
      createdAt,
    }
  }

  function sortContacts(contacts: CustomerContact[]): CustomerContact[] {
    return sortByText(contacts, contact => contact.name || contact.position || contact.email || contact.phone || contact.id)
  }

  function sortSites(sites: CustomerSite[]): CustomerSite[] {
    return sortByText(sites, site => site.name || site.address || site.id)
  }

  function sortSubCustomers(subCustomers: CustomerSubCustomer[]): CustomerSubCustomer[] {
    return sortByText(subCustomers, subCustomer => subCustomer.name || subCustomer.id)
  }

  function normalizeProject(value: unknown, availableSites?: CustomerSite[]): Project | null {
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

    const onsiteReportsSource = Array.isArray((raw as { onsiteReports?: unknown }).onsiteReports)
      ? ((raw as { onsiteReports?: unknown }).onsiteReports as unknown[])
      : []
    const onsiteReports = onsiteReportsSource
      .map(normalizeOnsiteReport)
      .filter((report): report is ProjectOnsiteReport => !!report)

    const info = normalizeProjectInfo((raw as { info?: unknown }).info)
    const siteIdRaw = toOptionalString((raw as { siteId?: unknown }).siteId)

    let siteId: string | undefined
    if (siteIdRaw && (!availableSites || availableSites.some(site => site.id === siteIdRaw))) {
      siteId = siteIdRaw
    }

    return {
      id,
      number,
      status,
      activeSubStatus,
      note: toOptionalString(raw.note),
      siteId,
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
      info: info ?? undefined,
      onsiteReports: onsiteReports.length > 0 ? onsiteReports : [],
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

    const sitesSource = Array.isArray((raw as { sites?: unknown }).sites)
      ? ((raw as { sites?: unknown }).sites as unknown[])
      : []
    let sites = sitesSource.map(normalizeCustomerSite).filter((site): site is CustomerSite => !!site)

    if (sites.length === 0) {
      const fallbackSite = normalizeCustomerSite({ address: raw.address })
      if (fallbackSite) {
        sites = [fallbackSite]
      }
    }

    const projectsSource = Array.isArray(raw.projects) ? (raw.projects as unknown[]) : []
    const projects = projectsSource
      .map(entry => normalizeProject(entry, sites))
      .filter((project): project is Project => !!project)

    const contactsSource = Array.isArray((raw as { contacts?: unknown }).contacts)
      ? ((raw as { contacts?: unknown }).contacts as unknown[])
      : []
    let contacts = contactsSource
      .map(entry => normalizeCustomerContact(entry, sites))
      .filter((contact): contact is CustomerContact => !!contact)

    if (contacts.length === 0) {
      const fallbackContact = normalizeCustomerContact({
        name: (raw as { contactName?: unknown }).contactName,
        position: (raw as { contactPosition?: unknown }).contactPosition,
        phone: (raw as { contactPhone?: unknown }).contactPhone,
        email: (raw as { contactEmail?: unknown }).contactEmail,
      }, sites)
      if (fallbackContact) {
        contacts = [fallbackContact]
      }
    }

    const subCustomersSource = Array.isArray((raw as { subCustomers?: unknown }).subCustomers)
      ? ((raw as { subCustomers?: unknown }).subCustomers as unknown[])
      : []
    const subCustomers = subCustomersSource
      .map(entry => normalizeCustomerSubCustomer(entry, sites))
      .filter((entry): entry is CustomerSubCustomer => !!entry)

    const address = toOptionalString(raw.address) ?? sites[0]?.address

    return {
      id,
      name,
      address,
      sites: sortSites(sites),
      subCustomers: sortSubCustomers(subCustomers),
      contacts: sortContacts(contacts),
      projects: sortProjects(projects),
    }
  }

  function normalizeTwoFactorMethod(value: unknown): TwoFactorMethod | undefined {
    if (value === 'sms' || value === 'authenticator') {
      return value
    }
    return undefined
  }

  function normalizeUser(value: unknown): User | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const idRaw = typeof raw.id === 'string' ? raw.id.trim() : ''
    const name = toOptionalString(raw.name)
    if (!name) {
      return null
    }

    const roleRaw = (raw as { role?: unknown }).role
    const role: AppRole = roleRaw === 'admin' || roleRaw === 'editor' || roleRaw === 'viewer' ? roleRaw : 'viewer'

    const normalizedId = idRaw || createId()
    const email = normalizeEmail(raw.email) ?? `${normalizedId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'user'}@local.invalid`
    const passwordHashRaw = toOptionalString((raw as { passwordHash?: unknown }).passwordHash)
    const passwordHash = passwordHashRaw && passwordHashRaw.startsWith('cpdb$')
      ? passwordHashRaw
      : (() => {
          const fallbackPassword = toOptionalString((raw as { password?: unknown }).password)
          if (fallbackPassword) {
            return hashPassword(fallbackPassword)
          }
          if (normalizedId === DEFAULT_USER_ID) {
            return DEFAULT_USER_PASSWORD_HASH
          }
          return hashPassword(DEFAULT_USER_PASSWORD)
        })()
    const twoFactorEnabled = Boolean((raw as { twoFactorEnabled?: unknown }).twoFactorEnabled)
    let twoFactorMethod = normalizeTwoFactorMethod((raw as { twoFactorMethod?: unknown }).twoFactorMethod)
    if (!twoFactorEnabled) {
      twoFactorMethod = undefined
    }

    return {
      id: normalizedId,
      name,
      email,
      role,
      twoFactorEnabled,
      twoFactorMethod,
      passwordHash,
    }
  }

  function sortUsers(users: User[]): User[] {
    return sortByText(users, user => user.name)
  }

  function ensureDefaultUsers(users: User[]): User[] {
    if (users.length > 0) {
      return users
    }
    return [
      {
        id: DEFAULT_USER_ID,
        name: DEFAULT_USER_NAME,
        email: DEFAULT_USER_EMAIL,
        role: 'editor',
        twoFactorEnabled: false,
        twoFactorMethod: undefined,
        passwordHash: DEFAULT_USER_PASSWORD_HASH,
      },
    ]
  }

  function normalizeDatabase(value: unknown): Database {
    if (!value || typeof value !== 'object') {
      return {
        customers: [],
        users: ensureDefaultUsers([]),
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
      }
    }

    const rawCustomers = Array.isArray((value as { customers?: unknown }).customers)
      ? ((value as { customers?: unknown }).customers as unknown[])
      : []

    const customers = rawCustomers
      .map(normalizeCustomer)
      .filter((customer): customer is Customer => !!customer)

    const rawUsers = Array.isArray((value as { users?: unknown }).users)
      ? ((value as { users?: unknown }).users as unknown[])
      : []

    const users = rawUsers
      .map(normalizeUser)
      .filter((user): user is User => !!user)

    const seenIds = new Set<string>()
    const seenEmails = new Set<string>()
    const dedupedUsers: User[] = []
    for (const user of users) {
      if (seenIds.has(user.id) || seenEmails.has(user.email)) {
        continue
      }
      seenIds.add(user.id)
      seenEmails.add(user.email)
      dedupedUsers.push(user)
    }

    const normalizedUsers = ensureDefaultUsers(sortUsers(dedupedUsers))

    const businessSettings = normalizeBusinessSettings(
      (value as { businessSettings?: unknown }).businessSettings,
    )

    return {
      customers: sortCustomers(customers),
      users: normalizedUsers,
      businessSettings,
    }
  }

  function readStoredDatabase(storage: StorageLike): { key: string; value: string } | null {
    const currentValue = storage.getItem(STORAGE_KEY)
    if (currentValue) {
      return { key: STORAGE_KEY, value: currentValue }
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyValue = storage.getItem(legacyKey)
      if (legacyValue) {
        return { key: legacyKey, value: legacyValue }
      }
    }

    return null
  }

  function loadDatabase(): Database {
    const storage = resolveStorage()
    const stored = readStoredDatabase(storage)
    if (!stored) {
      return {
        customers: [],
        users: ensureDefaultUsers([]),
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
      }
    }

    try {
      const parsed = JSON.parse(stored.value) as unknown
      const normalized = normalizeDatabase(parsed)
      if (stored.key !== STORAGE_KEY) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
          storage.removeItem(stored.key)
        } catch {
          // Ignore migration write failures so the session can continue with in-memory data.
        }
      }
      return normalized
    } catch {
      if (stored.key !== STORAGE_KEY) {
        try {
          storage.removeItem(stored.key)
        } catch {
          // Ignore failures to clean up invalid legacy data.
        }
      }
      return {
        customers: [],
        users: ensureDefaultUsers([]),
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
      }
    }
  }

  function saveDatabase(db: Database): void {
    const storage = resolveStorage()
    const normalized = normalizeDatabase(db)
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      try {
        storage.removeItem(legacyKey)
      } catch {
        // Ignore removal errors; they only affect optional clean-up of legacy data.
      }
    }
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
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
    }
  }

  function cloneProjectInfo(info?: ProjectInfo): ProjectInfo | undefined {
    if (!info) {
      return undefined
    }
    return {
      lineReference: info.lineReference,
      machineSerialNumbers: info.machineSerialNumbers ? [...info.machineSerialNumbers] : undefined,
      toolSerialNumbers: info.toolSerialNumbers ? [...info.toolSerialNumbers] : undefined,
      cobaltOrderNumber: info.cobaltOrderNumber,
      customerOrderNumber: info.customerOrderNumber,
      salespersonId: info.salespersonId,
      salespersonName: info.salespersonName,
      startDate: info.startDate,
      proposedCompletionDate: info.proposedCompletionDate,
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
      projectInfo: cloneProjectInfo(signOff.projectInfo),
    }
  }

  function cloneOnsiteReport(report: ProjectOnsiteReport): ProjectOnsiteReport {
    return { ...report }
  }

  function cloneBusinessSettings(settings: BusinessSettings): BusinessSettings {
    return {
      businessName: settings.businessName,
      hours: BUSINESS_DAYS.reduce((acc, day) => {
        acc[day] = { ...settings.hours[day] }
        return acc
      }, {} as BusinessSettings['hours']),
    }
  }

  function cloneCustomerContact(contact: CustomerContact): CustomerContact {
    return {
      id: contact.id,
      name: contact.name,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      siteId: contact.siteId,
    }
  }

  function cloneCustomerSite(site: CustomerSite): CustomerSite {
    return {
      id: site.id,
      name: site.name,
      address: site.address,
      notes: site.notes,
    }
  }

  function cloneCustomerSubCustomer(subCustomer: CustomerSubCustomer): CustomerSubCustomer {
    return {
      id: subCustomer.id,
      name: subCustomer.name,
      address: subCustomer.address,
      notes: subCustomer.notes,
      siteId: subCustomer.siteId,
    }
  }

  function cloneUser(user: User): User {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
      passwordHash: user.passwordHash,
    }
  }

  function cloneProject(project: Project): Project {
    return {
      id: project.id,
      number: project.number,
      status: project.status,
      activeSubStatus: project.activeSubStatus,
      note: project.note,
      siteId: project.siteId,
      wos: project.wos.map(cloneWorkOrder),
      tasks: project.tasks ? project.tasks.map(cloneProjectTask) : [],
      documents: cloneProjectDocuments(project.documents),
      statusHistory: project.statusHistory?.map(cloneStatusHistoryEntry),
      customerSignOff: project.customerSignOff
        ? cloneCustomerSignOff(project.customerSignOff)
        : undefined,
      info: cloneProjectInfo(project.info),
      onsiteReports: project.onsiteReports ? project.onsiteReports.map(cloneOnsiteReport) : [],
    }
  }

  function cloneCustomer(customer: Customer): Customer {
    return {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      sites: customer.sites.map(cloneCustomerSite),
      subCustomers: customer.subCustomers.map(cloneCustomerSubCustomer),
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

    async listUsers(): Promise<User[]> {
      const db = loadDatabase()
      return db.users.map(cloneUser)
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
      sites?: CustomerSiteInput[]
      subCustomers?: CustomerSubCustomerInput[]
    }): Promise<Customer> {
      const db = loadDatabase()
      const sitesSource = Array.isArray(data.sites) ? data.sites : []
      let sites = sitesSource
        .map(normalizeCustomerSite)
        .filter((site): site is CustomerSite => !!site)
      if (sites.length === 0) {
        const fallbackSite = normalizeCustomerSite({ address: data.address })
        if (fallbackSite) {
          sites = [fallbackSite]
        }
      }
      sites = sortSites(sites)

      const contactsSource = Array.isArray(data.contacts) ? data.contacts : []
      const contacts = sortContacts(
        contactsSource
          .map(entry => normalizeCustomerContact(entry, sites))
          .filter((contact): contact is CustomerContact => !!contact),
      )

      const subCustomersSource = Array.isArray(data.subCustomers) ? data.subCustomers : []
      const subCustomers = sortSubCustomers(
        subCustomersSource
          .map(entry => normalizeCustomerSubCustomer(entry, sites))
          .filter((entry): entry is CustomerSubCustomer => !!entry),
      )

      const customer: Customer = {
        id: createId(),
        name: data.name.trim(),
        address: normalizeInput(data.address) ?? sites[0]?.address,
        sites,
        subCustomers,
        contacts,
        projects: [],
      }

      const nextCustomers = sortCustomers([customer, ...db.customers])
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
      return cloneCustomer(customer)
    },

    async updateCustomer(
      customerId: string,
      data: {
        name?: string
        address?: string | null
        contacts?: ContactInput[] | null
        sites?: CustomerSiteInput[] | null
        subCustomers?: CustomerSubCustomerInput[] | null
      },
    ): Promise<Customer> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const { index, customer } = located
      const sites =
        data.sites === undefined
          ? customer.sites
          : data.sites === null
          ? []
          : sortSites(
              data.sites
                .map(normalizeCustomerSite)
                .filter((site): site is CustomerSite => !!site),
            )
      const contactsSource =
        data.contacts === undefined
          ? customer.contacts.map(contact =>
              contact.siteId && !sites.some(site => site.id === contact.siteId)
                ? { ...contact, siteId: undefined }
                : contact,
            )
          : data.contacts === null
          ? []
          : data.contacts
              .map(entry => normalizeCustomerContact(entry, sites))
              .filter((contact): contact is CustomerContact => !!contact)
      const contacts = sortContacts(contactsSource)
      const subCustomers =
        data.subCustomers === undefined
          ? customer.subCustomers
          : data.subCustomers === null
          ? []
          : sortSubCustomers(
              data.subCustomers
                .map(entry => normalizeCustomerSubCustomer(entry, sites))
                .filter((entry): entry is CustomerSubCustomer => !!entry),
            )

      let nextAddress = applyNullable(customer.address, data.address)
      if (data.address === undefined && !nextAddress && sites.length > 0) {
        nextAddress = sites[0]?.address
      }

      const nextCustomer: Customer = {
        ...customer,
        name: typeof data.name === 'string' ? data.name.trim() || customer.name : customer.name,
        address: nextAddress,
        sites,
        subCustomers,
        contacts,
      }

      const nextCustomers = [...db.customers]
      nextCustomers[index] = nextCustomer
      saveDatabase({
        customers: sortCustomers(nextCustomers),
        users: db.users,
        businessSettings: db.businessSettings,
      })
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
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
    },

    async createProject(
      customerId: string,
      data: {
        number: string
        info?: ProjectInfo | null
        tasks?: Array<{ name: string; status?: ProjectTaskStatus; assigneeId?: string }>
        siteId?: string | null
      },
    ): Promise<Project> {
      const db = loadDatabase()
      const located = locateCustomer(db, customerId)
      if (!located) {
        throw new Error('Customer not found.')
      }

      const { index, customer } = located
      const normalizedNumber = data.number.trim()
      if (!normalizedNumber) {
        throw new Error('Project number is required.')
      }

      const info = normalizeProjectInfo(data.info ?? undefined)
      const templateTasks = Array.isArray(data.tasks) ? data.tasks : []
      const normalizedTasks: ProjectTask[] = []

      for (const task of templateTasks) {
        if (!task || typeof task !== 'object') {
          continue
        }
        const name = typeof task.name === 'string' ? task.name.trim() : ''
        if (!name) {
          continue
        }
        const status =
          task.status && isProjectTaskStatus(task.status) ? task.status : 'Not started'
        let assigneeId: string | undefined
        let assigneeName: string | undefined
        if (typeof task.assigneeId === 'string') {
          const candidateId = task.assigneeId.trim()
          if (candidateId) {
            const user = db.users.find(entry => entry.id === candidateId)
            if (user) {
              assigneeId = user.id
              assigneeName = user.name
            }
          }
        }

        normalizedTasks.push({
          id: createId(),
          name,
          status,
          assigneeId,
          assigneeName,
        })
      }

      const initialTasks = normalizedTasks.length > 0 ? sortTasks(normalizedTasks) : []

      let siteId: string | undefined
      if (typeof data.siteId === 'string') {
        const candidateSiteId = data.siteId.trim()
        if (candidateSiteId && customer.sites.some(site => site.id === candidateSiteId)) {
          siteId = candidateSiteId
        }
      }

      const project: Project = {
        id: createId(),
        number: normalizedNumber,
        status: DEFAULT_PROJECT_STATUS,
        activeSubStatus: DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
        note: undefined,
        siteId,
        wos: [],
        tasks: initialTasks,
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
        info: info ?? undefined,
        onsiteReports: [],
      }

      const nextProjects = sortProjects([project, ...customer.projects])
      const nextCustomers = [...db.customers]
      nextCustomers[index] = { ...customer, projects: nextProjects }
      saveDatabase({
        customers: sortCustomers(nextCustomers),
        users: db.users,
        businessSettings: db.businessSettings,
      })
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
        info?: ProjectInfo | null
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

      let nextInfo = project.info
      if (data.info !== undefined) {
        if (data.info === null) {
          nextInfo = undefined
        } else {
          const normalizedInfo = normalizeProjectInfo(data.info)
          nextInfo = normalizedInfo ?? undefined
        }
      }

      let nextOnsiteReports = project.onsiteReports ?? []
      if ((data as { onsiteReports?: ProjectOnsiteReport[] | null }).onsiteReports !== undefined) {
        const reports = (data as { onsiteReports?: ProjectOnsiteReport[] | null }).onsiteReports
        if (reports === null) {
          nextOnsiteReports = []
        } else if (Array.isArray(reports)) {
          const normalized = reports
            .map(normalizeOnsiteReport)
            .filter((report): report is ProjectOnsiteReport => !!report)
          nextOnsiteReports = normalized
        }
      }

      let nextSiteId = project.siteId
      if ((data as { siteId?: string | null }).siteId !== undefined) {
        const requestedSiteId = (data as { siteId?: string | null }).siteId
        if (requestedSiteId === null) {
          nextSiteId = undefined
        } else if (typeof requestedSiteId === 'string') {
          const trimmedSiteId = requestedSiteId.trim()
          if (trimmedSiteId && customer.sites.some(site => site.id === trimmedSiteId)) {
            nextSiteId = trimmedSiteId
          } else {
            nextSiteId = undefined
          }
        } else {
          nextSiteId = undefined
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
        info: nextInfo,
        onsiteReports: nextOnsiteReports,
        siteId: nextSiteId,
      }

      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = nextProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
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
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
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
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
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
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
    },

    async createTask(
      projectId: string,
      data: {
        name: string
        start: string
        end: string
        assigneeId?: string
        assigneeName?: string
        status: ProjectTaskStatus
      },
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
        assigneeId: normalizeInput(data.assigneeId),
        assigneeName: normalizeInput(data.assigneeName),
      }

      const updatedTasks = sortTasks([...(project.tasks ?? []), task])
      const updatedProject: Project = { ...project, tasks: updatedTasks }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
      return cloneProjectTask(task)
    },

    async updateTask(
      projectId: string,
      taskId: string,
      data: {
        name?: string
        start?: string | null
        end?: string | null
        assigneeId?: string | null
        assigneeName?: string | null
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
      let nextAssigneeId = current.assigneeId
      if (data.assigneeId !== undefined) {
        if (data.assigneeId === null) {
          nextAssigneeId = undefined
        } else {
          const trimmed = data.assigneeId.trim()
          nextAssigneeId = trimmed ? trimmed : undefined
        }
      }

      let nextAssigneeName = current.assigneeName
      if (data.assigneeName !== undefined) {
        if (data.assigneeName === null) {
          nextAssigneeName = undefined
        } else {
          const trimmedName = data.assigneeName.trim()
          nextAssigneeName = trimmedName ? trimmedName : undefined
        }
      }

      const updated: ProjectTask = {
        ...current,
        name: data.name !== undefined ? data.name.trim() : current.name,
        start: data.start === undefined ? current.start : data.start ?? undefined,
        end: data.end === undefined ? current.end : data.end ?? undefined,
        assigneeId: nextAssigneeId,
        assigneeName: nextAssigneeName,
        status: data.status ?? current.status,
      }

      tasks[taskIndex] = updated
      const updatedProject: Project = { ...project, tasks: sortTasks(tasks) }
      const updatedProjects = [...customer.projects]
      updatedProjects[projectIndex] = updatedProject
      const nextCustomers = [...db.customers]
      nextCustomers[customerIndex] = { ...customer, projects: sortProjects(updatedProjects) }
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
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
      saveDatabase({ customers: nextCustomers, users: db.users, businessSettings: db.businessSettings })
    },

    async createUser(data: {
      name: string
      email: string
      password: string
      role: AppRole
      twoFactorEnabled: boolean
      twoFactorMethod?: TwoFactorMethod | null
    }): Promise<User> {
      const db = loadDatabase()
      const name = data.name.trim()
      if (!name) {
        throw new Error('User name is required.')
      }

      const email = normalizeEmail(data.email)
      if (!email) {
        throw new Error('Email is required.')
      }
      if (!isValidEmail(email)) {
        throw new Error('Enter a valid email address.')
      }
      if (db.users.some(user => user.email === email)) {
        throw new Error('A user with this email already exists.')
      }

      const password = typeof data.password === 'string' ? data.password : ''
      if (!password.trim()) {
        throw new Error('Password is required.')
      }

      const role: AppRole =
        data.role === 'admin' || data.role === 'editor' || data.role === 'viewer' ? data.role : 'viewer'

      const twoFactorEnabled = Boolean(data.twoFactorEnabled)
      let twoFactorMethod = normalizeTwoFactorMethod(data.twoFactorMethod)
      if (!twoFactorEnabled) {
        twoFactorMethod = undefined
      }

      const user: User = {
        id: createId(),
        name,
        email,
        role,
        twoFactorEnabled,
        twoFactorMethod,
        passwordHash: hashPassword(password),
      }

      const nextUsers = sortUsers([...db.users, user])
      saveDatabase({ customers: db.customers, users: nextUsers, businessSettings: db.businessSettings })
      return cloneUser(user)
    },

    async updateUser(
      userId: string,
      data: {
        name?: string
        email?: string | null
        password?: string | null
        role?: AppRole
        twoFactorEnabled?: boolean
        twoFactorMethod?: TwoFactorMethod | null
      },
    ): Promise<User> {
      const db = loadDatabase()
      const index = db.users.findIndex(user => user.id === userId)
      if (index === -1) {
        throw new Error('User not found.')
      }

      const current = db.users[index]
      const nextName = data.name !== undefined ? data.name.trim() : current.name
      if (!nextName) {
        throw new Error('User name is required.')
      }

      let nextEmail = current.email
      if (data.email !== undefined) {
        if (data.email === null) {
          throw new Error('Email is required.')
        }
        const normalizedEmail = normalizeEmail(data.email)
        if (!normalizedEmail) {
          throw new Error('Email is required.')
        }
        if (!isValidEmail(normalizedEmail)) {
          throw new Error('Enter a valid email address.')
        }
        if (db.users.some(user => user.id !== userId && user.email === normalizedEmail)) {
          throw new Error('A user with this email already exists.')
        }
        nextEmail = normalizedEmail
      }

      let nextRole = current.role
      if (data.role && (data.role === 'admin' || data.role === 'editor' || data.role === 'viewer')) {
        nextRole = data.role
      }

      let nextPasswordHash = current.passwordHash
      if (data.password !== undefined) {
        if (data.password === null) {
          throw new Error('Password is required.')
        }
        if (!data.password.trim()) {
          throw new Error('Password is required.')
        }
        nextPasswordHash = hashPassword(data.password)
      }

      let nextTwoFactorEnabled = current.twoFactorEnabled
      if (data.twoFactorEnabled !== undefined) {
        nextTwoFactorEnabled = Boolean(data.twoFactorEnabled)
      }

      let nextTwoFactorMethod = current.twoFactorMethod
      if (data.twoFactorMethod !== undefined) {
        if (data.twoFactorMethod === null) {
          nextTwoFactorMethod = undefined
        } else {
          nextTwoFactorMethod = normalizeTwoFactorMethod(data.twoFactorMethod) ?? nextTwoFactorMethod
        }
      }

      if (!nextTwoFactorEnabled) {
        nextTwoFactorMethod = undefined
      }

      const updated: User = {
        id: current.id,
        name: nextName,
        email: nextEmail,
        role: nextRole,
        twoFactorEnabled: nextTwoFactorEnabled,
        twoFactorMethod: nextTwoFactorMethod,
        passwordHash: nextPasswordHash,
      }

      const nextUsers = sortUsers([
        ...db.users.slice(0, index),
        updated,
        ...db.users.slice(index + 1),
      ])
      saveDatabase({ customers: db.customers, users: nextUsers, businessSettings: db.businessSettings })
      return cloneUser(updated)
    },

    async authenticateUser(credentials: { email: string; password: string }): Promise<User> {
      const email = normalizeEmail(credentials.email)
      const password = typeof credentials.password === 'string' ? credentials.password : ''
      if (!email || !password) {
        throw new Error('Enter your email and password to sign in.')
      }

      const db = loadDatabase()
      const user = db.users.find(entry => entry.email === email)
      if (!user) {
        throw new Error('Invalid email or password.')
      }

      if (!verifyPassword(password, user.passwordHash)) {
        throw new Error('Invalid email or password.')
      }

      return cloneUser(user)
    },

    async deleteUser(userId: string): Promise<void> {
      const db = loadDatabase()
      const nextUsers = db.users.filter(user => user.id !== userId)
      if (nextUsers.length === db.users.length) {
        throw new Error('User not found.')
      }
      saveDatabase({ customers: db.customers, users: nextUsers, businessSettings: db.businessSettings })
    },

    async exportDatabase(): Promise<{
      customers: Customer[]
      users: User[]
      businessSettings: BusinessSettings
    }> {
      const db = loadDatabase()
      return {
        customers: db.customers.map(cloneCustomer),
        users: db.users.map(cloneUser),
        businessSettings: cloneBusinessSettings(db.businessSettings),
      }
    },

    async importDatabase(data: unknown): Promise<{
      customers: Customer[]
      users: User[]
      businessSettings: BusinessSettings
    }> {
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
      return {
        customers: normalized.customers.map(cloneCustomer),
        users: normalized.users.map(cloneUser),
        businessSettings: cloneBusinessSettings(normalized.businessSettings),
      }
    },

    async getBusinessSettings(): Promise<BusinessSettings> {
      const db = loadDatabase()
      return cloneBusinessSettings(db.businessSettings)
    },

    async updateBusinessSettings(settings: BusinessSettings): Promise<BusinessSettings> {
      const normalized = normalizeBusinessSettings(settings)
      const db = loadDatabase()
      saveDatabase({ customers: db.customers, users: db.users, businessSettings: normalized })
      return cloneBusinessSettings(normalized)
    },
  }
}
