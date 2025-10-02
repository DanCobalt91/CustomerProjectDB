import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, CSSProperties } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Pencil,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Menu,
  Download,
  Upload,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  Customer,
  CustomerContact,
  CustomerSite,
  Project,
  ProjectActiveSubStatus,
  ProjectCustomerSignOff,
  ProjectFile,
  ProjectFileCategory,
  ProjectInfo,
  ProjectOnsiteReport,
  ProjectStatus,
  ProjectStatusLogEntry,
  WOType,
  CustomerSignOffDecision,
  CustomerSignOffSubmission,
  ProjectTask,
  ProjectTaskStatus,
  User,
  TwoFactorMethod,
  AppRole,
  BusinessLogo,
  BusinessSettings,
  BusinessDay,
} from '../types'
import {
  BUSINESS_DAYS,
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  PROJECT_FILE_CATEGORIES,
  PROJECT_TASK_STATUSES,
  formatProjectStatus,
} from '../types'
import {
  listCustomers,
  listUsers,
  createCustomer as createCustomerRecord,
  updateCustomer as updateCustomerRecord,
  deleteCustomer as deleteCustomerRecord,
  createProject as createProjectRecord,
  deleteProject as deleteProjectRecord,
  createWO as createWORecord,
  deleteWO as deleteWORecord,
  updateProject as updateProjectRecord,
  createTask as createTaskRecord,
  updateTask as updateTaskRecord,
  deleteTask as deleteTaskRecord,
  createUser as createUserRecord,
  updateUser as updateUserRecord,
  deleteUser as deleteUserRecord,
  exportDatabase as exportDatabaseRecords,
  importDatabase as importDatabaseRecords,
  getBusinessSettings,
  updateBusinessSettings as updateBusinessSettingsRecord,
} from '../lib/storage'
import { createId } from '../lib/id'
import { generateCustomerSignOffPdf, generateOnsiteReportPdf } from '../lib/signOff'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import MachineToolListInput from '../components/ui/MachineToolListInput'
import SerialNumberListInput from '../components/ui/SerialNumberListInput'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import ProjectPage from './ProjectPage'
import PieChart from '../components/ui/PieChart'
import {
  createProjectInfoDraft,
  parseProjectInfoDraft,
  type ProjectInfoDraft,
  type ProjectInfoDraftDefaults,
} from '../lib/projectInfo'
import type { OnsiteReportSubmission } from '../lib/onsiteReport'

const PROJECT_FILE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
}

const BUSINESS_LOGO_MAX_WIDTH = 240
const BUSINESS_LOGO_MAX_HEIGHT = 120
const BUSINESS_LOGO_OUTPUT_MIME: BusinessLogo['mimeType'] = 'image/jpeg'
const BUSINESS_LOGO_OUTPUT_QUALITY = 0.9

function guessMimeTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return PROJECT_FILE_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function isAllowedProjectFile(file: File): boolean {
  const normalizedType = file.type?.toLowerCase()
  if (normalizedType && Object.values(PROJECT_FILE_MIME_BY_EXTENSION).includes(normalizedType)) {
    return true
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return !!PROJECT_FILE_MIME_BY_EXTENSION[extension]
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('Unable to read file.'))
      }
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read file.'))
    }
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    image.src = dataUrl
  })
}

async function createBusinessLogoFromFile(file: File): Promise<BusinessLogo> {
  const normalizedType = file.type?.toLowerCase() ?? ''
  if (!normalizedType.startsWith('image/')) {
    throw new Error('Select an image file for the company logo.')
  }

  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImageFromDataUrl(dataUrl)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) {
    throw new Error('Unable to read the logo dimensions.')
  }

  const scale = Math.min(1, BUSINESS_LOGO_MAX_WIDTH / width, BUSINESS_LOGO_MAX_HEIGHT / height)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to process the company logo.')
  }
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const resizedDataUrl = canvas.toDataURL(BUSINESS_LOGO_OUTPUT_MIME, BUSINESS_LOGO_OUTPUT_QUALITY)
  return {
    dataUrl: resizedDataUrl,
    width: targetWidth,
    height: targetHeight,
    mimeType: BUSINESS_LOGO_OUTPUT_MIME,
  }
}

type CustomerSiteDraft = {
  id: string
  name: string
  address: string
  notes: string
}

type NewCustomerDraft = {
  name: string
  contactName: string
  contactPosition: string
  contactPhone: string
  contactEmail: string
  sites: CustomerSiteDraft[]
  parentCustomerId: string
}

type CustomerEditorDraftState = {
  name: string
  sites: CustomerSiteDraft[]
  parentCustomerId: string
}

type CustomerSiteTabKey = string

type CustomerSiteTab =
  | { key: CustomerSiteTabKey; label: string; type: 'site'; site: CustomerSite }
  | { key: CustomerSiteTabKey; label: string; type: 'unassigned' }

const UNASSIGNED_SITE_TAB_KEY: CustomerSiteTabKey = 'unassigned'

type MachineEditorState = {
  mode: 'create' | 'edit'
  customerId: string
  siteTabKey: CustomerSiteTabKey
  projectId: string
  machineIndex?: number
  machineSerialNumber: string
  lineReference: string
  toolSerialNumbers: string[]
}

function createSiteDraft(site?: CustomerSite | null): CustomerSiteDraft {
  return {
    id: site?.id ?? createId(),
    name: site?.name ?? '',
    address: site?.address ?? '',
    notes: site?.notes ?? '',
  }
}

function ensureSiteDrafts(drafts: CustomerSiteDraft[]): CustomerSiteDraft[] {
  return drafts.length > 0 ? drafts : [createSiteDraft()]
}

function createNewCustomerDraftState(): NewCustomerDraft {
  return {
    name: '',
    contactName: '',
    contactPosition: '',
    contactPhone: '',
    contactEmail: '',
    sites: [createSiteDraft()],
    parentCustomerId: '',
  }
}

function createCustomerEditorDraftState(customer?: Customer | null): CustomerEditorDraftState {
  if (!customer) {
    return {
      name: '',
      sites: [createSiteDraft()],
      parentCustomerId: '',
    }
  }
  return {
    name: customer.name,
    sites: ensureSiteDrafts(customer.sites.map(createSiteDraft)),
    parentCustomerId: customer.parentCustomerId ?? '',
  }
}

function resolveCustomerPrimaryAddress(customer: Customer): string | null {
  const siteAddress = customer.sites.find(site => site.address?.trim())?.address?.trim()
  if (siteAddress) {
    return siteAddress
  }
  return customer.address?.trim() || null
}

function stripPrefix(value: string, pattern: RegExp): string {
  const trimmed = value.trim()
  const match = trimmed.match(pattern)
  return match ? match[1].trim() : trimmed
}

const JS_DAY_TO_BUSINESS_DAY: BusinessDay[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const BUSINESS_DAY_ORDER: Array<{ key: BusinessDay; label: string }> = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

function cloneBusinessLogo(logo: BusinessLogo | null): BusinessLogo | null {
  if (!logo) {
    return null
  }
  return { dataUrl: logo.dataUrl, width: logo.width, height: logo.height, mimeType: logo.mimeType }
}

function cloneBusinessSettings(settings: BusinessSettings): BusinessSettings {
  return {
    businessName: settings.businessName,
    hours: BUSINESS_DAYS.reduce((acc, day) => {
      const hours = settings.hours[day]
      acc[day] = hours ? { ...hours } : { ...DEFAULT_BUSINESS_SETTINGS.hours[day] }
      return acc
    }, {} as BusinessSettings['hours']),
    logo: cloneBusinessLogo(settings.logo),
  }
}

function businessSettingsEqual(a: BusinessSettings, b: BusinessSettings): boolean {
  if (a.businessName.trim() !== b.businessName.trim()) {
    return false
  }
  if (!businessLogosEqual(a.logo, b.logo)) {
    return false
  }
  return BUSINESS_DAYS.every(day => {
    const aHours = a.hours[day]
    const bHours = b.hours[day]
    return (
      aHours?.enabled === bHours?.enabled &&
      aHours?.start === bHours?.start &&
      aHours?.end === bHours?.end
    )
  })
}

function businessLogosEqual(a: BusinessLogo | null, b: BusinessLogo | null): boolean {
  if (!a && !b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  return (
    a.dataUrl === b.dataUrl &&
    a.width === b.width &&
    a.height === b.height &&
    a.mimeType === b.mimeType
  )
}

function getBusinessDayKey(date: Date): BusinessDay {
  return JS_DAY_TO_BUSINESS_DAY[date.getDay()] ?? 'monday'
}

function isWorkingDay(settings: BusinessSettings, date: Date): boolean {
  const entry = settings.hours[getBusinessDayKey(date)]
  return Boolean(entry && entry.enabled)
}

function findNextWorkingDate(
  settings: BusinessSettings,
  start: Date,
  includeCurrent: boolean,
): Date {
  for (let offset = includeCurrent ? 0 : 1; offset < 21; offset += 1) {
    const candidate = new Date(start.getTime())
    candidate.setDate(candidate.getDate() + offset)
    if (isWorkingDay(settings, candidate)) {
      return candidate
    }
  }
  return new Date(start.getTime())
}

function formatDateForInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatDateTimeForInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function applyTimeToDate(base: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(part => Number.parseInt(part, 10))
  const result = new Date(base.getTime())
  if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
    result.setHours(hours, minutes, 0, 0)
  }
  return result
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const originalDate = result.getDate()
  result.setMonth(result.getMonth() + months)
  if (result.getDate() !== originalDate) {
    result.setDate(0)
  }
  return result
}

function computeProjectDateDefaults(settings: BusinessSettings): ProjectInfoDraftDefaults {
  const today = new Date()
  const startDate = findNextWorkingDate(settings, today, true)
  const completionBase = addMonths(startDate, 1)
  const completionDate = findNextWorkingDate(settings, completionBase, true)
  return {
    startDate: formatDateForInput(startDate),
    proposedCompletionDate: formatDateForInput(completionDate),
  }
}

function computeTaskScheduleDefaults(settings: BusinessSettings): { start: string; end: string } {
  const today = new Date()
  const startHours =
    settings.hours[getBusinessDayKey(today)] ?? DEFAULT_BUSINESS_SETTINGS.hours.monday
  const startDateTime = applyTimeToDate(today, startHours.start)
  const endDate = new Date(today.getTime())
  endDate.setDate(endDate.getDate() + 7)
  const endHours = settings.hours[getBusinessDayKey(endDate)] ?? DEFAULT_BUSINESS_SETTINGS.hours.monday
  const endDateTime = applyTimeToDate(endDate, endHours.end)
  return {
    start: formatDateTimeForInput(startDateTime),
    end: formatDateTimeForInput(endDateTime),
  }
}

type ProjectStatusBucket =
  | 'active_fds'
  | 'active_design'
  | 'active_build'
  | 'active_install'
  | 'active_install_snagging'
  | 'complete'

const PROJECT_STATUS_BUCKETS: ProjectStatusBucket[] = [
  'active_fds',
  'active_design',
  'active_build',
  'active_install',
  'active_install_snagging',
  'complete',
]

const PROJECT_STATUS_BUCKET_META: Record<
  ProjectStatusBucket,
  { label: string; description: string; colorClass: string; color: string }
> = {
  active_fds: {
    label: 'FDS',
    description: 'Projects currently in the front-end design stage.',
    colorClass: 'bg-indigo-500',
    color: '#6366f1',
  },
  active_design: {
    label: 'Design',
    description: 'Projects progressing through design activities.',
    colorClass: 'bg-sky-500',
    color: '#0ea5e9',
  },
  active_build: {
    label: 'Build',
    description: 'Projects moving through build execution.',
    colorClass: 'bg-emerald-500',
    color: '#10b981',
  },
  active_install: {
    label: 'Install',
    description: 'Projects carrying out installation work.',
    colorClass: 'bg-amber-500',
    color: '#f59e0b',
  },
  active_install_snagging: {
    label: 'Install (Snagging)',
    description: 'Projects addressing outstanding snags during install.',
    colorClass: 'bg-rose-500',
    color: '#f43f5e',
  },
  complete: {
    label: 'Complete',
    description: 'Projects that have been marked as complete.',
    colorClass: 'bg-slate-400',
    color: '#94a3b8',
  },
}

const FALLBACK_CURRENT_USER_NAME = 'Team Member'
const LOCAL_WORKSPACE_USER: User = {
  id: 'local-workspace-user',
  name: FALLBACK_CURRENT_USER_NAME,
  email: '',
  role: 'admin',
  twoFactorEnabled: false,
  twoFactorMethod: undefined,
  passwordHash: '',
}

const TASK_STATUS_META: Record<ProjectTaskStatus, { badgeClass: string; swatchClass: string }> = {
  'Not started': {
    badgeClass: 'bg-rose-100 text-rose-700',
    swatchClass: 'bg-rose-500',
  },
  Started: {
    badgeClass: 'bg-sky-100 text-sky-700',
    swatchClass: 'bg-sky-500',
  },
  Complete: {
    badgeClass: 'bg-emerald-100 text-emerald-700',
    swatchClass: 'bg-emerald-500',
  },
}

const DEFAULT_PROJECT_TASK_OPTIONS = [
  { id: 'design', name: 'Design' },
  { id: 'build', name: 'Build' },
  { id: 'install', name: 'Install' },
] as const

type DefaultTaskOption = (typeof DEFAULT_PROJECT_TASK_OPTIONS)[number]
type DefaultTaskSelectionMap = Record<DefaultTaskOption['id'], boolean>

function createDefaultTaskSelectionMap(): DefaultTaskSelectionMap {
  return DEFAULT_PROJECT_TASK_OPTIONS.reduce((acc, option) => {
    acc[option.id] = true
    return acc
  }, {} as DefaultTaskSelectionMap)
}

function resolveProjectStatusBucket(project: Project): ProjectStatusBucket {
  if (project.status === 'Complete') {
    return 'complete'
  }
  const stage = project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
  switch (stage) {
    case 'Design':
      return 'active_design'
    case 'Build':
      return 'active_build'
    case 'Install':
      return 'active_install'
    case 'Install (Snagging)':
      return 'active_install_snagging'
    default:
      return 'active_fds'
  }
}

function compareTasksBySchedule(a: ProjectTask, b: ProjectTask): number {
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
  if (aValid) return -1
  if (bValid) return 1
  return a.name.localeCompare(b.name)
}

function formatTaskRange(task: ProjectTask): string {
  if (!task.start || !task.end) {
    return 'No schedule recorded'
  }
  const start = new Date(task.start)
  const end = new Date(task.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'No schedule recorded'
  }
  const startLabel = start.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const endLabel = end.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${startLabel} – ${endLabel}`
}

function passwordMeetsRequirements(password: string): boolean {
  if (password.length < 8) {
    return false
  }
  if (!/[A-Z]/.test(password)) {
    return false
  }
  if (!/\d/.test(password)) {
    return false
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return false
  }
  return true
}

function calculatePasswordScore(password: string): number {
  if (!password) {
    return 0
  }
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(score, 4)
}

function getPasswordStrengthMeta(password: string): { label: string; className: string; width: string } {
  const score = calculatePasswordScore(password)
  const scale = [
    { label: 'Very weak', className: 'bg-rose-500', width: '5%' },
    { label: 'Weak', className: 'bg-amber-500', width: '30%' },
    { label: 'Fair', className: 'bg-yellow-500', width: '55%' },
    { label: 'Good', className: 'bg-emerald-500', width: '80%' },
    { label: 'Strong', className: 'bg-emerald-600', width: '100%' },
  ] as const
  return scale[score]
}

function AppContent() {
  const [db, setDb] = useState<Customer[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<
    'home' | 'myTasks' | 'customers' | 'projects' | 'customerDetail' | 'projectDetail' | 'settings'
  >('home')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS)
  const [businessSettingsDraft, setBusinessSettingsDraft] = useState<BusinessSettings>(() =>
    cloneBusinessSettings(DEFAULT_BUSINESS_SETTINGS),
  )
  const [isSavingBusinessSettings, setIsSavingBusinessSettings] = useState(false)
  const [isProcessingLogo, setIsProcessingLogo] = useState(false)
  const [businessSettingsMessage, setBusinessSettingsMessage] = useState<string | null>(null)
  const [businessSettingsError, setBusinessSettingsError] = useState<string | null>(null)
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSection, setSettingsSection] = useState<'users' | 'data' | 'business'>('users')
  const [isExportingData, setIsExportingData] = useState(false)
  const [isImportingData, setIsImportingData] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const businessLogoInputRef = useRef<HTMLInputElement | null>(null)
  const storageLabel = 'Local browser storage'
  const storageTitle = 'Data is stored locally in this browser for testing.'
  const storageBadgeClass = 'border-slate-300 bg-white text-slate-700'
  const storageNotice = 'Data is stored in your browser for testing only. Clearing your cache will remove it.'

  const toErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message
    }
    if (typeof error === 'string' && error) {
      return error
    }
    return fallback
  }, [])

  // Search
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const trimmedGlobalSearch = globalSearchQuery.trim()
  const hasGlobalSearch = trimmedGlobalSearch.length > 0
  const handleClearGlobalSearch = useCallback(() => {
    setGlobalSearchQuery('')
  }, [setGlobalSearchQuery])

  // Create customer (modal)
  const [newCust, setNewCust] = useState<NewCustomerDraft>(() => createNewCustomerDraftState())
  const addNewCustomerSite = () => {
    setNewCust(prev => ({ ...prev, sites: [...prev.sites, createSiteDraft()] }))
  }
  const updateNewCustomerSite = (siteId: string, updates: Partial<CustomerSiteDraft>) => {
    setNewCust(prev => ({
      ...prev,
      sites: prev.sites.map(site => (site.id === siteId ? { ...site, ...updates } : site)),
    }))
  }
  const removeNewCustomerSite = (siteId: string) => {
    setNewCust(prev => {
      if (prev.sites.length <= 1) {
        return prev
      }
      return { ...prev, sites: prev.sites.filter(site => site.id !== siteId) }
    })
  }
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [showNewContactForm, setShowNewContactForm] = useState(false)
  const [newContact, setNewContact] = useState({
    name: '',
    position: '',
    phone: '',
    email: '',
    siteId: '',
  })
  const [contactError, setContactError] = useState<string | null>(null)
  const [machineEditor, setMachineEditor] = useState<MachineEditorState | null>(null)
  const [machineEditorError, setMachineEditorError] = useState<string | null>(null)
  const [isSavingMachineEditor, setIsSavingMachineEditor] = useState(false)
  const [showCustomerEditor, setShowCustomerEditor] = useState(false)
  const [customerEditorDraft, setCustomerEditorDraft] = useState<CustomerEditorDraftState>(() =>
    createCustomerEditorDraftState(),
  )
  const addEditorSite = () => {
    setCustomerEditorDraft(prev => ({ ...prev, sites: [...prev.sites, createSiteDraft()] }))
  }
  const updateEditorSite = (siteId: string, updates: Partial<CustomerSiteDraft>) => {
    setCustomerEditorDraft(prev => ({
      ...prev,
      sites: prev.sites.map(site => (site.id === siteId ? { ...site, ...updates } : site)),
    }))
  }
  const removeEditorSite = (siteId: string) => {
    setCustomerEditorDraft(prev => {
      if (prev.sites.length <= 1) {
        return prev
      }
      return {
        ...prev,
        sites: prev.sites.filter(site => site.id !== siteId),
      }
    })
  }
  const [customerEditorError, setCustomerEditorError] = useState<string | null>(null)
  const [isSavingCustomerEditor, setIsSavingCustomerEditor] = useState(false)
  const [customerSiteTab, setCustomerSiteTab] = useState<CustomerSiteTabKey>('')
  const [activeContactIdsByTab, setActiveContactIdsByTab] = useState<Record<string, string | null>>({})
  const [customerProjectSection, setCustomerProjectSection] = useState<'projects' | 'lines' | 'subCustomers'>(
    'projects',
  )
  const [customerProjectsTab, setCustomerProjectsTab] = useState<'active' | 'complete'>('active')
  const [isCompletedProjectsCollapsed, setIsCompletedProjectsCollapsed] = useState(true)

  // Create project (modal)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectCustomerId, setNewProjectCustomerId] = useState<string>('')
  const [newProjectNumber, setNewProjectNumber] = useState('')
  const [newProjectSiteId, setNewProjectSiteId] = useState('')
  const [newProjectLinkedSubCustomerId, setNewProjectLinkedSubCustomerId] = useState('')
  const [newProjectLinkedSubCustomerSiteId, setNewProjectLinkedSubCustomerSiteId] = useState('')
  const [newProjectError, setNewProjectError] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectInfoDraft, setNewProjectInfoDraft] = useState<ProjectInfoDraft>(() =>
    createProjectInfoDraft(undefined, users, computeProjectDateDefaults(DEFAULT_BUSINESS_SETTINGS)),
  )
  const [newProjectTaskSelections, setNewProjectTaskSelections] =
    useState<DefaultTaskSelectionMap>(createDefaultTaskSelectionMap)
  const updateNewProjectInfoField = useCallback(
    <K extends keyof ProjectInfoDraft>(field: K, value: ProjectInfoDraft[K]) => {
      setNewProjectInfoDraft(prev => ({ ...prev, [field]: value }))
      if (newProjectError) {
        setNewProjectError(null)
      }
    },
    [newProjectError],
  )
  const toggleNewProjectTaskSelection = useCallback(
    (id: DefaultTaskOption['id']) => {
      setNewProjectTaskSelections(prev => {
        const next = { ...prev }
        next[id] = !prev[id]
        return next
      })
      if (newProjectError) {
        setNewProjectError(null)
      }
    },
    [newProjectError],
  )
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | ProjectTaskStatus>('all')
  const [taskAssigneeFilter, setTaskAssigneeFilter] =
    useState<'current' | 'all' | 'unassigned' | string>('current')
  const [newUserDraft, setNewUserDraft] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'viewer' as AppRole,
    twoFactorEnabled: false,
    twoFactorMethod: 'authenticator' as TwoFactorMethod,
  })
  const [userFormError, setUserFormError] = useState<string | null>(null)
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userEditDraft, setUserEditDraft] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'viewer' as AppRole,
    twoFactorEnabled: false,
    twoFactorMethod: 'authenticator' as TwoFactorMethod,
  })
  const [userEditError, setUserEditError] = useState<string | null>(null)
  const [isSavingUserEdit, setIsSavingUserEdit] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const resetNewUserDraft = () =>
    setNewUserDraft({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'viewer',
      twoFactorEnabled: false,
      twoFactorMethod: 'authenticator',
    })
  const [contactEditor, setContactEditor] = useState<{
    customerId: string
    contactId: string
    name: string
    position: string
    phone: string
    email: string
    siteId: string
  } | null>(null)
  const [contactEditorError, setContactEditorError] = useState<string | null>(null)
  const [isSavingContactEdit, setIsSavingContactEdit] = useState(false)
  const closeContactEditor = useCallback(() => {
    setContactEditor(null)
    setContactEditorError(null)
    setIsSavingContactEdit(false)
  }, [])

  const refreshCustomers = useCallback(
    async (initial = false) => {
      if (initial) {
        setIsLoading(true)
      } else {
        setIsSyncing(true)
      }

      try {
        const [customers, usersResult, settingsResult] = await Promise.all([
          listCustomers(),
          listUsers(),
          getBusinessSettings(),
        ])
        setDb(customers)
        setUsers(usersResult)
        setBusinessSettings(settingsResult)
        setBusinessSettingsDraft(cloneBusinessSettings(settingsResult))
        setBusinessSettingsMessage(null)
        setBusinessSettingsError(null)
        setLoadError(null)
      } catch (error) {
        console.error('Failed to load customers', error)
        setLoadError(toErrorMessage(error, 'Unable to load customers from local storage.'))
      } finally {
        if (initial) {
          setIsLoading(false)
        } else {
          setIsSyncing(false)
        }
      }
    },
    [toErrorMessage],
  )

  useEffect(() => {
    void refreshCustomers(true)
  }, [refreshCustomers])

  useEffect(() => {
    setNewProjectInfoDraft(prev => {
      if (!prev.salespersonId) {
        return prev
      }
      if (users.some(user => user.id === prev.salespersonId)) {
        return prev
      }
      return { ...prev, salespersonId: '' }
    })
  }, [users])

  useEffect(() => {
    if (activePage !== 'settings') {
      setSettingsSuccess(null)
      setSettingsError(null)
    }
  }, [activePage])

  useEffect(() => {
    if (settingsSection !== 'data') {
      setSettingsError(null)
      setSettingsSuccess(null)
    }
  }, [settingsSection])

  useEffect(() => {
    if (settingsSection !== 'business') {
      setBusinessSettingsMessage(null)
      setBusinessSettingsError(null)
    }
  }, [settingsSection])


  const customerLookup = useMemo(() => new Map(db.map(customer => [customer.id, customer] as const)), [db])
  const selectedCustomer = useMemo(
    () => customerLookup.get(selectedCustomerId) ?? null,
    [customerLookup, selectedCustomerId],
  )
  const selectedCustomerSites = selectedCustomer?.sites ?? []
  const childCustomers = useMemo(() => {
    if (!selectedCustomer) {
      return [] as Customer[]
    }
    return db
      .filter(customer => customer.parentCustomerId === selectedCustomer.id)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db, selectedCustomer])
  const siteTabs = useMemo(() => {
    if (!selectedCustomer) {
      return [] as CustomerSiteTab[]
    }

    const tabs: CustomerSiteTab[] = []

    selectedCustomer.sites.forEach(site => {
      const name = site.name?.trim()
      const address = site.address?.trim()
      const label = name || (address ? address.split('\n')[0] : 'Unnamed site')
      tabs.push({ key: site.id, label, type: 'site', site })
    })

    const hasUnassignedContacts = selectedCustomer.contacts.some(contact => !contact.siteId)
    let hasUnassignedProjects = selectedCustomer.projects.some(project => !project.siteId)
    if (selectedCustomer.parentCustomerId) {
      const parent = customerLookup.get(selectedCustomer.parentCustomerId) ?? null
      if (parent) {
        hasUnassignedProjects ||= parent.projects.some(
          project => project.linkedSubCustomerId === selectedCustomer.id && !project.linkedSubCustomerSiteId,
        )
      }
    }

    if (hasUnassignedContacts || hasUnassignedProjects) {
      tabs.push({ key: UNASSIGNED_SITE_TAB_KEY, label: 'Unassigned', type: 'unassigned' })
    }

    return tabs
  }, [customerLookup, selectedCustomer])
  const contactsBySiteTab = useMemo(() => {
    if (!selectedCustomer) {
      return {} as Record<string, CustomerContact[]>
    }
    const map: Record<string, CustomerContact[]> = {}
    selectedCustomer.sites.forEach(site => {
      map[site.id] = selectedCustomer.contacts.filter(contact => contact.siteId === site.id)
    })
    const unassignedContacts = selectedCustomer.contacts.filter(contact => !contact.siteId)
    if (unassignedContacts.length > 0) {
      map[UNASSIGNED_SITE_TAB_KEY] = unassignedContacts
    }
    return map
  }, [selectedCustomer])
  const projectsBySiteTab = useMemo(() => {
    if (!selectedCustomer) {
      return {} as Record<string, Project[]>
    }

    const map: Record<string, Project[]> = {}
    const ensureSiteBucket = (siteId: string) => {
      if (!map[siteId]) {
        map[siteId] = []
      }
    }
    const addToUnassigned = (project: Project) => {
      ensureSiteBucket(UNASSIGNED_SITE_TAB_KEY)
      map[UNASSIGNED_SITE_TAB_KEY].push(project)
    }
    const addProjectToSite = (project: Project, siteId?: string) => {
      if (siteId && map[siteId]) {
        map[siteId].push(project)
      } else {
        addToUnassigned(project)
      }
    }

    selectedCustomer.sites.forEach(site => {
      map[site.id] = []
    })

    selectedCustomer.projects.forEach(project => {
      addProjectToSite(project, project.siteId)
    })

    if (selectedCustomer.parentCustomerId) {
      const parent = customerLookup.get(selectedCustomer.parentCustomerId) ?? null
      if (parent) {
        parent.projects.forEach(project => {
          if (project.linkedSubCustomerId === selectedCustomer.id) {
            addProjectToSite(project, project.linkedSubCustomerSiteId)
          }
        })
      }
    }

    if ((map[UNASSIGNED_SITE_TAB_KEY] ?? []).length === 0) {
      delete map[UNASSIGNED_SITE_TAB_KEY]
    }

    const compareProjects = (a: Project, b: Project) =>
      a.number.localeCompare(b.number, undefined, { sensitivity: 'base', numeric: true })
    for (const key of Object.keys(map)) {
      map[key] = map[key].slice().sort(compareProjects)
    }

    return map
  }, [customerLookup, selectedCustomer])
  const parentCustomer = useMemo(() => {
    if (!selectedCustomer?.parentCustomerId) {
      return null
    }
    return customerLookup.get(selectedCustomer.parentCustomerId) ?? null
  }, [customerLookup, selectedCustomer?.parentCustomerId])
  const activeSiteTab = siteTabs.find(tab => tab.key === customerSiteTab) ?? null
  const activeCustomerSite = activeSiteTab?.type === 'site' ? activeSiteTab.site : null
  const selectedCustomerPrimarySite = selectedCustomerSites.find(site => site.address?.trim()) ?? null
  const selectedCustomerAddressForMap =
    (activeCustomerSite?.address?.trim() ||
      selectedCustomerPrimarySite?.address?.trim() ||
      selectedCustomer?.address?.trim() ||
      null)
  const defaultSiteTabKey = useMemo(() => {
    if (siteTabs.length === 0) {
      return ''
    }
    const firstSiteWithAddress = siteTabs.find(
      tab => tab.type === 'site' && tab.site.address && tab.site.address.trim(),
    )
    if (firstSiteWithAddress) {
      return firstSiteWithAddress.key
    }
    const firstSite = siteTabs.find(tab => tab.type === 'site')
    if (firstSite) {
      return firstSite.key
    }
    return siteTabs[0]?.key ?? ''
  }, [siteTabs])
  useEffect(() => {
    if (!selectedCustomer) {
      if (customerSiteTab !== '') {
        setCustomerSiteTab('')
      }
      setActiveContactIdsByTab({})
      return
    }
    if (siteTabs.length === 0) {
      if (customerSiteTab !== '') {
        setCustomerSiteTab('')
      }
      return
    }
    if (!siteTabs.some(tab => tab.key === customerSiteTab)) {
      setCustomerSiteTab(defaultSiteTabKey)
    }
  }, [customerSiteTab, defaultSiteTabKey, selectedCustomer, siteTabs])
  useEffect(() => {
    if (!selectedCustomer) {
      return
    }
    setActiveContactIdsByTab(prev => {
      let changed = false
      const next: Record<string, string | null> = {}
      for (const tab of siteTabs) {
        const contactsForTab = contactsBySiteTab[tab.key] ?? []
        const previous = prev[tab.key] ?? null
        const selected = previous && contactsForTab.some(contact => contact.id === previous)
          ? previous
          : contactsForTab[0]?.id ?? null
        next[tab.key] = selected
        if (previous !== selected) {
          changed = true
        }
      }
      if (Object.keys(prev).length !== siteTabs.length) {
        changed = true
      }
      return changed ? next : prev
    })
  }, [selectedCustomer, siteTabs, contactsBySiteTab])
  useEffect(() => {
    if (showNewContactForm && !activeSiteTab) {
      setShowNewContactForm(false)
    }
  }, [activeSiteTab, showNewContactForm])
  useEffect(() => {
    if (customerProjectSection === 'subCustomers' && childCustomers.length === 0) {
      setCustomerProjectSection('projects')
    }
  }, [childCustomers.length, customerProjectSection])
  const sortedCustomers = useMemo(() => {
    const customers = [...db]
    customers.sort((a, b) => {
      const aIsChild = Boolean(a.parentCustomerId)
      const bIsChild = Boolean(b.parentCustomerId)
      if (aIsChild !== bIsChild) {
        return aIsChild ? 1 : -1
      }
      if (aIsChild && bIsChild && a.parentCustomerId && b.parentCustomerId) {
        if (a.parentCustomerId !== b.parentCustomerId) {
          const parentA = customerLookup.get(a.parentCustomerId)
          const parentB = customerLookup.get(b.parentCustomerId)
          if (parentA && parentB) {
            const parentComparison = parentA.name.localeCompare(parentB.name)
            if (parentComparison !== 0) {
              return parentComparison
            }
          }
        }
      }
      return a.name.localeCompare(b.name)
    })
    return customers
  }, [customerLookup, db])
  const hasCustomers = sortedCustomers.length > 0
  const canEdit = true
  const openNewProjectModal = useCallback(
    (options: { customerId?: string; siteId?: string } = {}) => {
      if (!canEdit) {
        return
      }
      if (!hasCustomers) {
        setNewProjectError('Add a customer before creating a project.')
        return
      }

      const preferredCustomerId =
        options.customerId && sortedCustomers.some(customer => customer.id === options.customerId)
          ? options.customerId
          : sortedCustomers[0]?.id ?? ''

      if (!preferredCustomerId) {
        setNewProjectError('Select a customer for this project.')
        return
      }

      const defaults = computeProjectDateDefaults(businessSettings)

      setNewProjectNumber('')
      setNewProjectError(null)
      setNewProjectCustomerId(preferredCustomerId)
      const resolvedCustomer = db.find(customer => customer.id === preferredCustomerId) ?? null
      const resolvedSiteId =
        options.siteId && resolvedCustomer?.sites.some(site => site.id === options.siteId)
          ? options.siteId
          : ''
      setNewProjectSiteId(resolvedSiteId)
      setNewProjectLinkedSubCustomerId('')
      setNewProjectLinkedSubCustomerSiteId('')
      setNewProjectInfoDraft(createProjectInfoDraft(undefined, users, defaults))
      setNewProjectTaskSelections(createDefaultTaskSelectionMap())
      setIsCreatingProject(false)
      setShowNewProject(true)
    },
    [canEdit, hasCustomers, sortedCustomers, businessSettings, db, users],
  )
  const newProjectCustomer = useMemo(() => {
    if (!hasCustomers) {
      return null
    }
    return (
      sortedCustomers.find(customer => customer.id === newProjectCustomerId) ?? sortedCustomers[0] ?? null
    )
  }, [sortedCustomers, newProjectCustomerId, hasCustomers])
  const newProjectSubCustomers = useMemo(() => {
    if (!newProjectCustomer) {
      return [] as Customer[]
    }
    return sortedCustomers.filter(customer => customer.parentCustomerId === newProjectCustomer.id)
  }, [newProjectCustomer, sortedCustomers])
  const selectedLinkedSubCustomer = useMemo(() => {
    if (!newProjectLinkedSubCustomerId) {
      return null
    }
    return newProjectSubCustomers.find(customer => customer.id === newProjectLinkedSubCustomerId) ?? null
  }, [newProjectLinkedSubCustomerId, newProjectSubCustomers])
  const currentUser = useMemo<User>(() => {
    if (users.length === 0) {
      return LOCAL_WORKSPACE_USER
    }
    return users[0]
  }, [users])
  const currentUserName = currentUser.name || FALLBACK_CURRENT_USER_NAME
  const currentUserEmail = currentUser.email?.trim() ? currentUser.email : null


  useEffect(() => {
    setShowNewContactForm(false)
    setNewContact({ name: '', position: '', phone: '', email: '', siteId: '' })
    setContactError(null)
    setShowCustomerEditor(false)
    setCustomerEditorDraft(createCustomerEditorDraftState(selectedCustomer))
    setCustomerEditorError(null)
    setIsSavingCustomerEditor(false)
    closeContactEditor()
    setMachineEditor(null)
    setMachineEditorError(null)
    setIsSavingMachineEditor(false)
    setCustomerSiteTab('')
    setCustomerProjectsTab('active')
  }, [selectedCustomer?.id, closeContactEditor])
  useEffect(() => {
    if (activePage !== 'customerDetail') {
      setMachineEditor(null)
      setMachineEditorError(null)
      setIsSavingMachineEditor(false)
    }
  }, [activePage])
  useEffect(() => {
    if (!newProjectCustomer) {
      setNewProjectSiteId('')
      setNewProjectLinkedSubCustomerId('')
      setNewProjectLinkedSubCustomerSiteId('')
      return
    }
    if (!newProjectCustomer.sites.some(site => site.id === newProjectSiteId)) {
      setNewProjectSiteId('')
    }
    if (!newProjectSubCustomers.some(child => child.id === newProjectLinkedSubCustomerId)) {
      setNewProjectLinkedSubCustomerId('')
      setNewProjectLinkedSubCustomerSiteId('')
    } else if (
      selectedLinkedSubCustomer &&
      !selectedLinkedSubCustomer.sites.some(site => site.id === newProjectLinkedSubCustomerSiteId)
    ) {
      setNewProjectLinkedSubCustomerSiteId('')
    }
  }, [
    newProjectCustomer,
    newProjectSiteId,
    newProjectSubCustomers,
    newProjectLinkedSubCustomerId,
    newProjectLinkedSubCustomerSiteId,
    selectedLinkedSubCustomer,
  ])

  useEffect(() => {
    if (!contactEditor) {
      return
    }
    const customer = db.find(c => c.id === contactEditor.customerId)
    if (!customer) {
      closeContactEditor()
      return
    }
    const exists = customer.contacts.some(c => c.id === contactEditor.contactId)
    if (!exists) {
      closeContactEditor()
    }
  }, [db, contactEditor, closeContactEditor])

  type GlobalSearchMatch =
    | {
        id: string
        kind: 'customer'
        title: string
        subtitle?: string
        customerId: string
      }
    | {
        id: string
        kind: 'project'
        title: string
        subtitle: string
        statusLabel: string
        customerId: string
        projectId: string
      }

  const globalMatches = useMemo<GlobalSearchMatch[]>(() => {
    if (!hasGlobalSearch) {
      return []
    }
    const normalized = trimmedGlobalSearch.toLowerCase()
    const matches: GlobalSearchMatch[] = []
    db.forEach(customer => {
      const customerName = customer.name.toLowerCase()
      const siteAddresses = customer.sites
        .map(site => site.address)
        .filter((address): address is string => typeof address === 'string')
      const customerAddresses = [...siteAddresses, customer.address]
      const primaryAddress = customerAddresses.find(address => (address ?? '').trim())?.trim() ?? ''
      const addressMatch = customerAddresses.some(address =>
        typeof address === 'string' ? address.toLowerCase().includes(normalized) : false,
      )
      if (customerName.includes(normalized) || addressMatch) {
        matches.push({
          id: `customer-${customer.id}`,
          kind: 'customer',
          title: customer.name,
          subtitle: primaryAddress || undefined,
          customerId: customer.id,
        })
      }
      customer.projects.forEach(project => {
        const numberMatch = project.number.toLowerCase().includes(normalized)
        const customerMatch = customerName.includes(normalized)
        if (numberMatch || customerMatch) {
          matches.push({
            id: `project-${project.id}`,
            kind: 'project',
            title: project.number,
            subtitle: customer.name,
            statusLabel: formatProjectStatus(project.status, project.activeSubStatus),
            customerId: customer.id,
            projectId: project.id,
          })
        }
      })
    })
    return matches.slice(0, 25)
  }, [db, hasGlobalSearch, trimmedGlobalSearch])

  const handleSelectGlobalMatch = useCallback(
    (match: GlobalSearchMatch) => {
      if (match.kind === 'customer') {
        setSelectedCustomerId(match.customerId)
        setSelectedProjectId(null)
        setActivePage('customerDetail')
      } else {
        setSelectedCustomerId(match.customerId)
        setSelectedProjectId(match.projectId)
        setActivePage('projectDetail')
      }
      setGlobalSearchQuery('')
    },
    [setActivePage, setGlobalSearchQuery, setSelectedCustomerId, setSelectedProjectId],
  )

  const handleGlobalSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && globalMatches.length > 0) {
        event.preventDefault()
        handleSelectGlobalMatch(globalMatches[0])
      } else if (event.key === 'Escape' && hasGlobalSearch) {
        handleClearGlobalSearch()
      }
    },
    [globalMatches, handleClearGlobalSearch, handleSelectGlobalMatch, hasGlobalSearch],
  )

  const projectLists = useMemo(() => {
    const active: Array<{
      customerId: string
      projectId: string
      projectNumber: string
      customerName: string
      statusLabel: string
      statusColor: string
    }> = []
    const completed: Array<{
      customerId: string
      projectId: string
      projectNumber: string
      customerName: string
      statusLabel: string
      statusColor: string
    }> = []

    db.forEach(customer => {
      customer.projects.forEach(project => {
        const statusBucket = resolveProjectStatusBucket(project)
        const statusMeta = PROJECT_STATUS_BUCKET_META[statusBucket]
        const entry = {
          customerId: customer.id,
          projectId: project.id,
          projectNumber: project.number,
          customerName: customer.name,
          statusLabel: formatProjectStatus(project.status, project.activeSubStatus),
          statusColor: statusMeta.color,
        }
        if (project.status === 'Active') {
          active.push(entry)
        } else {
          completed.push(entry)
        }
      })
    })

    const sorter = (a: { projectNumber: string }, b: { projectNumber: string }) =>
      a.projectNumber.localeCompare(b.projectNumber, undefined, { numeric: true, sensitivity: 'base' })

    active.sort(sorter)
    completed.sort(sorter)

    return { active, completed }
  }, [db])

  const customerCount = db.length

  const projectStatusBucketCounts = useMemo(() => {
    const counts: Record<ProjectStatusBucket, number> = {
      active_fds: 0,
      active_design: 0,
      active_build: 0,
      active_install: 0,
      active_install_snagging: 0,
      complete: 0,
    }
    db.forEach(customer => {
      customer.projects.forEach(project => {
        const bucket = resolveProjectStatusBucket(project)
        counts[bucket] += 1
      })
    })
    return counts
  }, [db])

  useEffect(() => {
    if (activePage === 'projects') {
      setIsCompletedProjectsCollapsed(true)
    }
  }, [activePage])

  const projectStatusData = useMemo(
    () =>
      PROJECT_STATUS_BUCKETS.map(bucket => ({
        key: bucket,
        count: projectStatusBucketCounts[bucket],
        ...PROJECT_STATUS_BUCKET_META[bucket],
      })),
    [projectStatusBucketCounts],
  )

  const totalProjects = useMemo(
    () => projectStatusData.reduce((sum, item) => sum + item.count, 0),
    [projectStatusData],
  )

  const activeProjectStatusData = useMemo(
    () => projectStatusData.filter(status => status.key !== 'complete'),
    [projectStatusData],
  )

  const totalActiveProjects = useMemo(
    () => activeProjectStatusData.reduce((sum, item) => sum + item.count, 0),
    [activeProjectStatusData],
  )

  const activeProjects = useMemo(
    () =>
      projectStatusBucketCounts.active_fds +
      projectStatusBucketCounts.active_design +
      projectStatusBucketCounts.active_build +
      projectStatusBucketCounts.active_install +
      projectStatusBucketCounts.active_install_snagging,
    [projectStatusBucketCounts],
  )

  const totalWorkOrders = useMemo(
    () =>
      db.reduce(
        (count, customer) =>
          count + customer.projects.reduce((projectCount, project) => projectCount + project.wos.length, 0),
        0,
      ),
    [db],
  )

  const handleExportData = useCallback(async () => {
    setSettingsError(null)
    setSettingsSuccess(null)
    setIsExportingData(true)
    try {
      const data = await exportDatabaseRecords()
      const timestamp = new Date().toISOString().replace(/[:]/g, '-')
      const fileName = `customer-project-db-${timestamp}.json`
      const payload = JSON.stringify(data, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      const customerTotal = data.customers.length
      const projectTotal = data.customers.reduce(
        (sum, customer) => sum + customer.projects.length,
        0,
      )
      const workOrderTotal = data.customers.reduce(
        (sum, customer) =>
          sum + customer.projects.reduce((projectSum, project) => projectSum + project.wos.length, 0),
        0,
      )

      setSettingsSuccess(
        `Saved ${fileName} with ${customerTotal} ${
          customerTotal === 1 ? 'customer' : 'customers'
        }, ${projectTotal} ${projectTotal === 1 ? 'project' : 'projects'}, and ${workOrderTotal} ${
          workOrderTotal === 1 ? 'work order' : 'work orders'
        }.`,
      )
    } catch (error) {
      console.error('Failed to export data', error)
      setSettingsError(toErrorMessage(error, 'Failed to export data.'))
    } finally {
      setIsExportingData(false)
    }
  }, [toErrorMessage])

  const handleImportData = useCallback(
    async (file: File) => {
      setSettingsError(null)
      setSettingsSuccess(null)
      setIsImportingData(true)
      try {
        const fileText = await file.text()
        let parsed: unknown
        try {
          parsed = JSON.parse(fileText) as unknown
        } catch {
          throw new Error('The selected file is not valid JSON.')
        }

        const { customers, users: importedUsers, businessSettings: importedSettings } =
          await importDatabaseRecords(parsed)
        setDb(customers)
        setUsers(importedUsers)
        setBusinessSettings(importedSettings)
        setBusinessSettingsDraft(cloneBusinessSettings(importedSettings))
        setBusinessSettingsMessage(null)
        setBusinessSettingsError(null)
        setNewProjectInfoDraft(
          createProjectInfoDraft(
            undefined,
            importedUsers,
            computeProjectDateDefaults(importedSettings),
          ),
        )
        setSelectedCustomerId(null)
        setSelectedProjectId(null)
        closeContactEditor()
        setLoadError(null)
        setActionError(null)
        setActivePage('settings')

        const projectTotal = customers.reduce(
          (sum, customer) => sum + customer.projects.length,
          0,
        )
        const workOrderTotal = customers.reduce(
          (sum, customer) =>
            sum + customer.projects.reduce((projectSum, project) => projectSum + project.wos.length, 0),
          0,
        )

        setSettingsSuccess(
          `Imported ${customers.length} ${
            customers.length === 1 ? 'customer' : 'customers'
          }, ${projectTotal} ${projectTotal === 1 ? 'project' : 'projects'}, and ${workOrderTotal} ${
            workOrderTotal === 1 ? 'work order' : 'work orders'
          }.`,
        )
      } catch (error) {
        console.error('Failed to import data', error)
        setSettingsError(toErrorMessage(error, 'Failed to import data.'))
      } finally {
        setIsImportingData(false)
      }
    },
    [
      closeContactEditor,
      importDatabaseRecords,
      setDb,
      setSelectedCustomerId,
      setSelectedProjectId,
      setActivePage,
      toErrorMessage,
      setLoadError,
      setActionError,
    ],
  )

  const handleImportChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      event.target.value = ''
      void handleImportData(file)
    },
    [handleImportData],
  )

  const triggerImportDialog = useCallback(() => {
    if (isImportingData) {
      return
    }
    importFileInputRef.current?.click()
  }, [isImportingData])

  async function handleCreateProject() {
    if (!hasCustomers) {
      setNewProjectError('Add a customer before creating a project.')
      return
    }

    const trimmedNumber = newProjectNumber.trim()
    if (!trimmedNumber) {
      setNewProjectError('Enter a project number.')
      return
    }

    const customerId = newProjectCustomerId || sortedCustomers[0]?.id
    if (!customerId) {
      setNewProjectError('Select a customer for this project.')
      return
    }

    if (customerId !== newProjectCustomerId) {
      setNewProjectCustomerId(customerId)
    }

    const projectCustomer = db.find(c => c.id === customerId) ?? null
    const validSiteId =
      newProjectSiteId && projectCustomer?.sites.some(site => site.id === newProjectSiteId)
        ? newProjectSiteId
        : ''
    const linkedSubCustomerId = newProjectLinkedSubCustomerId.trim()
    const associatedSubCustomer = linkedSubCustomerId
      ? newProjectSubCustomers.find(child => child.id === linkedSubCustomerId) ?? null
      : null
    const validLinkedSubCustomerId = associatedSubCustomer ? associatedSubCustomer.id : ''
    const validLinkedSubCustomerSiteId = associatedSubCustomer
      ? associatedSubCustomer.sites.some(site => site.id === newProjectLinkedSubCustomerSiteId)
        ? newProjectLinkedSubCustomerSiteId
        : ''
      : ''

    const { info, error: infoError } = parseProjectInfoDraft(newProjectInfoDraft, users)
    if (infoError) {
      setNewProjectError(infoError)
      return
    }

    const selectedTaskTemplates = DEFAULT_PROJECT_TASK_OPTIONS.filter(
      option => newProjectTaskSelections[option.id],
    )
    const initialTasks = selectedTaskTemplates.length
      ? selectedTaskTemplates.map(option => ({ name: option.name, status: 'Not started' as ProjectTaskStatus }))
      : undefined

    setIsCreatingProject(true)
    try {
      const result = await addProject(customerId, {
        number: trimmedNumber,
        info: info ?? null,
        tasks: initialTasks,
        siteId: validSiteId || undefined,
        linkedSubCustomerId: validLinkedSubCustomerId || undefined,
        linkedSubCustomerSiteId: validLinkedSubCustomerSiteId || undefined,
      })
      if (typeof result === 'string') {
        setNewProjectError(result)
        return
      }

      setShowNewProject(false)
      setNewProjectNumber('')
      setNewProjectSiteId('')
      setNewProjectLinkedSubCustomerId('')
      setNewProjectLinkedSubCustomerSiteId('')
      setNewProjectError(null)
      setNewProjectInfoDraft(createProjectInfoDraft(undefined, users, computeProjectDateDefaults(businessSettings)))
      setNewProjectTaskSelections(createDefaultTaskSelectionMap())
      setSelectedCustomerId(result.customerId)
      setSelectedProjectId(result.projectId)
      setActivePage('projectDetail')
    } finally {
      setIsCreatingProject(false)
    }
  }

  const openCustomerEditor = () => {
    if (!selectedCustomer) {
      return
    }
    setCustomerEditorDraft(createCustomerEditorDraftState(selectedCustomer))
    setCustomerEditorError(null)
    setIsSavingCustomerEditor(false)
    setShowCustomerEditor(true)
  }


  const renderCustomerListCard = () => {
    const activeCustomers = sortedCustomers.filter(customer =>
      customer.projects.some(project => project.status === 'Active'),
    )
    const inactiveCustomers = sortedCustomers.filter(
      customer => !customer.projects.some(project => project.status === 'Active'),
    )

    const navigateToCustomer = (customerId: string) => {
      setSelectedCustomerId(customerId)
      setSelectedProjectId(null)
      setActivePage('customerDetail')
    }

    const renderCustomerSection = (
      title: string,
      customers: Customer[],
      options: { showActiveProjectCount: boolean },
    ) => {
      if (customers.length === 0) {
        return (
          <div className='rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/60 p-4 text-sm text-slate-500'>
            {title === 'Active customers'
              ? 'No customers currently have active projects.'
              : 'No inactive customers to display.'}
          </div>
        )
      }

      return (
        <div className='overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200 bg-white text-sm text-slate-700'>
              <thead className='bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500'>
                <tr>
                  <th scope='col' className='px-4 py-3 text-left font-semibold'>Customer</th>
                  <th scope='col' className='px-4 py-3 text-left font-semibold'>Total projects</th>
                  {options.showActiveProjectCount ? (
                    <th scope='col' className='px-4 py-3 text-left font-semibold'>Active projects</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {customers.map(customer => {
                  const isSelected = selectedCustomerId === customer.id && activePage === 'customerDetail'
                  const totalProjects = customer.projects.length
                  const activeProjects = customer.projects.filter(project => project.status === 'Active').length
                  const parent = customer.parentCustomerId
                    ? customerLookup.get(customer.parentCustomerId) ?? null
                    : null
                  const displayName = parent ? `${parent.name} > ${customer.name}` : customer.name
                  const address =
                    customer.sites.find(site => site.address?.trim())?.address ??
                    customer.address ??
                    'No address on file.'
                  return (
                    <tr
                      key={customer.id}
                      role='button'
                      tabIndex={0}
                      onClick={() => navigateToCustomer(customer.id)}
                      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          navigateToCustomer(customer.id)
                        }
                      }}
                      className={`${
                        isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'
                      } cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500`}
                    >
                      <td className='px-4 py-3'>
                        <div className='flex flex-col gap-1'>
                          <span className='text-sm font-semibold text-slate-900'>{displayName}</span>
                          <span className='text-xs text-slate-500'>{address}</span>
                        </div>
                      </td>
                      <td className='whitespace-nowrap px-4 py-3 text-sm text-slate-600'>{totalProjects}</td>
                      {options.showActiveProjectCount ? (
                        <td className='whitespace-nowrap px-4 py-3 text-sm text-slate-600'>{activeProjects}</td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return (
      <Card className='panel h-fit'>
        <CardHeader className='flex-col gap-1'>
          <div className='text-lg font-semibold text-slate-900'>Customers</div>
          <div className='text-sm text-slate-500'>
            {customerCount === 1 ? '1 customer listed' : `${customerCount} customers listed`}
          </div>
        </CardHeader>
        <CardContent>
          {sortedCustomers.length === 0 ? (
            <p className='text-sm text-slate-500'>Add a customer to see it listed here.</p>
          ) : (
            <div className='space-y-6'>
              <div className='space-y-3'>
                <div className='text-sm font-semibold uppercase tracking-wide text-slate-500'>Active customers</div>
                {renderCustomerSection('Active customers', activeCustomers, { showActiveProjectCount: true })}
              </div>
              <div className='space-y-3'>
                <div className='text-sm font-semibold uppercase tracking-wide text-slate-500'>Inactive customers</div>
                {renderCustomerSection('Inactive customers', inactiveCustomers, { showActiveProjectCount: false })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderCustomersIndex = () => <div className='space-y-6'>{renderCustomerListCard()}</div>

  const renderCustomerDetailPage = () => {
    if (!selectedCustomer) {
      return (
        <Card className='panel'>
          <CardHeader>
            <div className='text-lg font-semibold text-slate-900'>Customer not found</div>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-slate-600'>We couldn't find that customer. It may have been removed.</p>
            <div className='mt-4'>
              <Button onClick={() => setActivePage('customers')}>Return to list</Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    const contactsForActiveTab = activeSiteTab ? contactsBySiteTab[customerSiteTab] ?? [] : []
    const storedActiveContactId = activeContactIdsByTab[customerSiteTab] ?? null
    const activeContactId =
      storedActiveContactId && contactsForActiveTab.some(contact => contact.id === storedActiveContactId)
        ? storedActiveContactId
        : contactsForActiveTab[0]?.id ?? null
    const activeContact = contactsForActiveTab.find(contact => contact.id === activeContactId) ?? null
    const hasContacts = contactsForActiveTab.length > 0
    const projectsForCurrentSite = activeSiteTab ? projectsBySiteTab[customerSiteTab] ?? [] : []
    const activeProjects = projectsForCurrentSite.filter(project => project.status === 'Active')
    const completedProjects = projectsForCurrentSite.filter(project => project.status === 'Complete')
    const projectsForTab = customerProjectsTab === 'active' ? activeProjects : completedProjects
    const projectTabCopy: Record<'active' | 'complete', { label: string; empty: string; count: number }> = {
      active: {
        label: 'Active projects',
        empty: 'No active projects yet.',
        count: activeProjects.length,
      },
      complete: {
        label: 'Complete projects',
        empty: 'No completed projects yet.',
        count: completedProjects.length,
      },
    }
    if (!activeSiteTab) {
      const emptyMessage = 'Select a site to view projects.'
      projectTabCopy.active.empty = emptyMessage
      projectTabCopy.complete.empty = emptyMessage
    }
    const activeTabCopy = projectTabCopy[customerProjectsTab]
    const parentLineItems = activeSiteTab
      ? projectsForCurrentSite.flatMap(project => {
          const machines = project.info?.machines ?? []
          return machines.map((machine, index) => ({
            id: `${project.id}-${index}`,
            machineSerialNumber: machine.machineSerialNumber,
            lineReference: machine.lineReference ?? '',
            toolSerialNumbers: [...machine.toolSerialNumbers],
            project,
            machineIndex: index,
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            ownerType: 'selected' as const,
          }))
        })
      : []
    const childLineItems = childCustomers.flatMap(child =>
      child.projects.flatMap(project => {
        const machines = project.info?.machines ?? []
        return machines.map((machine, index) => ({
          id: `child-${child.id}-${project.id}-${index}`,
          machineSerialNumber: machine.machineSerialNumber,
          lineReference: machine.lineReference ?? '',
          toolSerialNumbers: [...machine.toolSerialNumbers],
          project,
          machineIndex: index,
          customerId: child.id,
          customerName: child.name,
          ownerType: 'child' as const,
        }))
      }),
    )
    const lineItems = [...parentLineItems, ...childLineItems]
    lineItems.sort((a, b) => {
      const customerCompare = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' })
      if (customerCompare !== 0) {
        return customerCompare
      }
      const machineCompare = a.machineSerialNumber.trim().localeCompare(b.machineSerialNumber.trim(), undefined, {
        sensitivity: 'base',
      })
      if (machineCompare !== 0) {
        return machineCompare
      }
      return a.project.number.localeCompare(b.project.number, undefined, { sensitivity: 'base' })
    })
    const childLineCountByCustomerId = new Map<string, number>()
    for (const item of childLineItems) {
      childLineCountByCustomerId.set(item.customerId, (childLineCountByCustomerId.get(item.customerId) ?? 0) + 1)
    }
    for (const parentItem of parentLineItems) {
      const linkedId = parentItem.project.linkedSubCustomerId
      if (!linkedId) {
        continue
      }
      childLineCountByCustomerId.set(linkedId, (childLineCountByCustomerId.get(linkedId) ?? 0) + 1)
    }
    const canViewLines = !!activeSiteTab || childLineItems.length > 0
    const customerSectionTabs: Array<{ value: 'subCustomers' | 'projects' | 'lines'; label: string; count: number }> = [
      ...(childCustomers.length > 0
        ? [{ value: 'subCustomers' as const, label: 'Sub-customers', count: childCustomers.length }]
        : []),
      { value: 'projects', label: 'Projects', count: projectsForCurrentSite.length },
      { value: 'lines', label: 'Lines', count: lineItems.length },
    ]

    return (
      <Card className='panel'>
        <CardHeader className='space-y-4'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <nav className='flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500'>
                <button
                  type='button'
                  onClick={() => setActivePage('customers')}
                  className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  title='Back to customers'
                >
                  Customers
                </button>
                <ChevronRight size={12} className='text-slate-400' aria-hidden />
                {parentCustomer ? (
                  <>
                    <button
                      type='button'
                      onClick={() => {
                        setSelectedCustomerId(parentCustomer.id)
                        setActivePage('customerDetail')
                      }}
                      className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                    >
                      {parentCustomer.name}
                    </button>
                    <ChevronRight size={12} className='text-slate-400' aria-hidden />
                    <span className='text-slate-800 font-semibold'>{selectedCustomer.name}</span>
                  </>
                ) : (
                  <span className='text-slate-800 font-semibold'>{selectedCustomer.name}</span>
                )}
              </nav>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  onClick={openCustomerEditor}
                  title={canEdit ? 'Edit customer details' : 'Read-only access'}
                  disabled={!canEdit}
                  className='rounded-full px-2 py-2'
                >
                  <Pencil size={16} />
                  <span className='sr-only'>Edit customer</span>
                </Button>
                <Button
                  variant='ghost'
                  className='rounded-full px-2 py-2 text-rose-600 hover:bg-rose-50'
                  onClick={() => {
                    if (!selectedCustomer) return
                    const confirmed = window.confirm(
                      'Delete this customer and all associated projects, purchase orders, and work orders?',
                    )
                    if (!confirmed) return
                    void deleteCustomer(selectedCustomer.id)
                  }}
                  title={canEdit ? 'Delete customer' : 'Read-only access'}
                  disabled={!canEdit}
                >
                  <Trash2 size={16} />
                  <span className='sr-only'>Delete customer</span>
                </Button>
              </div>
            </div>
            <div>
              <div className='text-3xl font-semibold tracking-tight text-slate-900'>{selectedCustomer.name}</div>
              {parentCustomer ? (
                <div className='mt-1 text-sm text-slate-500'>
                  Sub customer of{' '}
                  <button
                    type='button'
                    className='font-medium text-sky-600 hover:text-sky-700'
                    onClick={() => {
                      setSelectedCustomerId(parentCustomer.id)
                      setActivePage('customerDetail')
                    }}
                  >
                    {parentCustomer.name}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
            <div className='flex min-w-0 flex-col gap-4'>
              <div className='rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='text-sm font-semibold text-slate-700'>Site locations</div>
                  {(() => {
                    if (!activeSiteTab) {
                      return null
                    }
                    if (activeSiteTab.type === 'site') {
                      const address = activeSiteTab.site.address?.trim()
                      if (!address) {
                        return null
                      }
                      return (
                        <Button
                          variant='outline'
                          onClick={() => navigator.clipboard.writeText(address)}
                          className='rounded-full px-2 py-2'
                          title='Copy site address'
                        >
                          <Copy size={16} />
                          <span className='sr-only'>Copy site address</span>
                        </Button>
                      )
                    }
                    return null
                  })()}
                </div>
                {siteTabs.length > 1 && (
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {siteTabs.map(tab => {
                      const isActive = tab.key === customerSiteTab
                      return (
                        <button
                          key={tab.key}
                          type='button'
                          onClick={() => setCustomerSiteTab(tab.key)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            isActive
                              ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className='mt-3'>
                  {siteTabs.length === 0 ? (
                    <div className='rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-sm text-slate-500 shadow-sm'>
                      No site locations recorded.
                    </div>
                  ) : !activeSiteTab ? (
                    <div className='rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-sm text-slate-500 shadow-sm'>
                      Select a site to view details.
                    </div>
                ) : activeSiteTab.type === 'site' ? (
                  <div className='space-y-3'>
                    <div className='space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm'>
                      <div className='flex items-start justify-between gap-2'>
                        <div>
                          <div className='text-sm font-semibold text-slate-800'>
                            {activeCustomerSite?.name?.trim() || 'Selected site'}
                          </div>
                          {activeCustomerSite?.notes ? (
                            <div className='text-xs text-slate-500'>{activeCustomerSite.notes}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm'>
                        {activeCustomerSite?.address ? (
                          <span className='block whitespace-pre-wrap break-words text-slate-800'>
                            {activeCustomerSite.address}
                          </span>
                        ) : (
                          <span className='text-slate-400'>No address provided.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='space-y-3'>
                    <div className='space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm'>
                      <div className='text-sm font-semibold text-slate-800'>Unassigned items</div>
                      <div className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm'>
                        <span className='text-slate-500'>
                          Contacts and projects without a specific site are shown here.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
                {selectedCustomerAddressForMap ? (
                  <div className='mt-4 overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
                    <iframe
                      title={`Map preview for ${selectedCustomer.name}`}
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedCustomerAddressForMap)}&z=15&output=embed`}
                      loading='lazy'
                      className='h-40 w-full border-0'
                      referrerPolicy='no-referrer-when-downgrade'
                    />
                  </div>
                ) : null}
              </div>

            </div>
            <div className='flex min-w-0 flex-col gap-4'>
              <div className='w-full rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='text-sm font-semibold text-slate-700'>Contacts</div>
                  <Button
                    variant='outline'
                    onClick={() => {
                      if (!activeSiteTab) {
                        return
                      }
                      setShowNewContactForm(prev => {
                        const next = !prev
                        if (next) {
                          const defaultSiteId = activeSiteTab.type === 'site' ? activeSiteTab.site.id : ''
                          setNewContact({ name: '', position: '', phone: '', email: '', siteId: defaultSiteId })
                        } else {
                          setNewContact({ name: '', position: '', phone: '', email: '', siteId: '' })
                        }
                        return next
                      })
                      setContactError(null)
                    }}
                    title={
                      !canEdit
                        ? 'Read-only access'
                        : !activeSiteTab
                        ? 'Select a site to manage contacts'
                        : showNewContactForm
                        ? 'Cancel adding contact'
                        : 'Add contact'
                    }
                    disabled={!canEdit || !activeSiteTab}
                  >
                    {showNewContactForm ? (
                      <>
                        <X size={16} /> Cancel
                      </>
                    ) : (
                      <>
                        <Plus size={16} /> Add Contact
                      </>
                    )}
                  </Button>
                </div>
                {hasContacts ? (
                  <>
                    {contactsForActiveTab.length > 1 && (
                      <div className='mt-4 flex flex-wrap items-center gap-2'>
                        {contactsForActiveTab.map((contact, index) => {
                          const isActive = contact.id === activeContactId
                          return (
                            <button
                              key={contact.id}
                              type='button'
                              onClick={() =>
                                setActiveContactIdsByTab(prev => ({
                                  ...prev,
                                  [customerSiteTab]: contact.id,
                                }))
                              }
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                isActive
                                  ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              Contact {index + 1}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {activeContact && (
                      <div className='mt-4 space-y-4'>
                        <div className='flex items-start justify-between gap-2'>
                          <div>
                            <div className='text-sm font-semibold text-slate-800'>
                              {activeContact.name || 'Unnamed contact'}
                            </div>
                            <div className='text-xs text-slate-500'>
                              {activeContact.position || 'No position recorded.'}
                            </div>
                            <div className='text-xs text-slate-400'>
                              Site:{' '}
                              {activeContact.siteId
                                ? selectedCustomerSites.find(site => site.id === activeContact.siteId)?.name?.trim() ||
                                  selectedCustomerSites.find(site => site.id === activeContact.siteId)?.address?.trim() ||
                                  'Unnamed site'
                                : 'Unassigned'}
                            </div>
                          </div>
                          <div className='flex items-center gap-1'>
                            <Button
                              variant='ghost'
                              onClick={() =>
                                setContactEditor({
                                  customerId: selectedCustomer.id,
                                  contactId: activeContact.id,
                                  name: activeContact.name ?? '',
                                  position: activeContact.position ?? '',
                                  phone: activeContact.phone ?? '',
                                  email: activeContact.email ?? '',
                                  siteId: activeContact.siteId ?? '',
                                })
                              }
                              title={canEdit ? 'Edit contact' : 'Read-only access'}
                              disabled={!canEdit}
                            >
                              <Pencil size={16} />
                              <span className='sr-only'>Edit contact</span>
                            </Button>
                            <Button
                              variant='ghost'
                              className='text-rose-600 hover:bg-rose-50'
                              onClick={() => void removeContact(selectedCustomer, activeContact.id)}
                              title={canEdit ? 'Remove contact' : 'Read-only access'}
                              disabled={!canEdit}
                            >
                              <Trash2 size={16} />
                              <span className='sr-only'>Remove contact</span>
                            </Button>
                          </div>
                        </div>
                        <div className='mt-4 space-y-2'>
                          <ContactInfoField
                            label='Phone'
                            value={activeContact.phone}
                            placeholder='Not provided'
                            copyTitle='Copy phone number'
                            linkType='phone'
                          />
                          <ContactInfoField
                            label='Email'
                            value={activeContact.email}
                            placeholder='Not provided'
                            copyTitle='Copy email address'
                            linkType='email'
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  !showNewContactForm && (
                    <p className='mt-4 text-sm text-slate-500'>
                      {!activeSiteTab ? 'Select a site to view contacts.' : 'No contacts yet.'}
                    </p>
                  )
                )}
              </div>
              {showNewContactForm && (
                <div className='w-full rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm'>
                  <div className='text-sm font-semibold text-slate-700'>New Contact</div>
                  <div className='mt-3 grid gap-3 md:grid-cols-2'>
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={newContact.name}
                        onChange={(e) => setNewContact({ ...newContact, name: (e.target as HTMLInputElement).value })}
                        placeholder='Jane Doe'
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Position</Label>
                      <Input
                        value={newContact.position}
                        onChange={(e) => setNewContact({ ...newContact, position: (e.target as HTMLInputElement).value })}
                        placeholder='Project Manager'
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={newContact.phone}
                        onChange={(e) => setNewContact({ ...newContact, phone: (e.target as HTMLInputElement).value })}
                        placeholder='555-123-4567'
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: (e.target as HTMLInputElement).value })}
                        placeholder='name@example.com'
                        disabled={!canEdit}
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <Label>Site</Label>
                      <select
                        className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={newContact.siteId}
                        onChange={(e) =>
                          setNewContact({
                            ...newContact,
                            siteId: (e.target as HTMLSelectElement).value,
                          })
                        }
                        disabled={!canEdit}
                      >
                        <option value=''>Unassigned</option>
                        {selectedCustomerSites.map(site => (
                          <option key={site.id} value={site.id}>
                            {site.name?.trim() || site.address?.trim() || 'Unnamed site'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                    <Button
                      onClick={async () => {
                        if (!selectedCustomer) return
                        const result = await addContact(selectedCustomer, newContact)
                        if (result) {
                          setContactError(result)
                        } else {
                          setNewContact({ name: '', position: '', phone: '', email: '', siteId: '' })
                          setContactError(null)
                          setShowNewContactForm(false)
                        }
                      }}
                      disabled={!canEdit}
                      title={canEdit ? 'Save contact' : 'Read-only access'}
                    >
                      <Save size={16} /> Save Contact
                    </Button>
                    <Button
                      variant='ghost'
                      onClick={() => {
                        setShowNewContactForm(false)
                        setNewContact({ name: '', position: '', phone: '', email: '', siteId: '' })
                        setContactError(null)
                      }}
                    >
                      <X size={16} /> Cancel
                    </Button>
                    {contactError && (
                      <p className='text-sm text-rose-600'>{contactError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className='mt-8 space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                {customerSectionTabs.map(tab => {
                  const isActive = customerProjectSection === tab.value
                  return (
                    <button
                      key={tab.value}
                      type='button'
                      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      onClick={() => setCustomerProjectSection(tab.value)}
                    >
                      <span>{tab.label}</span>
                      <span className='ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold'>
                        {tab.count}
                      </span>
                    </button>
                  )
                })}
              </div>
              {customerProjectSection === 'projects' ? (
                <Button
                  variant='outline'
                  onClick={() => {
                    if (!activeSiteTab || !selectedCustomer) {
                      return
                    }
                    const preferredSiteId =
                      activeSiteTab.type === 'site' ? activeSiteTab.site.id : undefined
                    openNewProjectModal({ customerId: selectedCustomer.id, siteId: preferredSiteId })
                  }}
                  title={
                    !canEdit
                      ? 'Read-only access'
                      : !activeSiteTab
                      ? 'Select a site to manage projects'
                      : 'Add project'
                  }
                  disabled={!canEdit || !activeSiteTab || !selectedCustomer}
                >
                  <Plus size={16} /> Add Project
                </Button>
              ) : (
                <Button
                  variant='outline'
                  onClick={() => {
                    if (!activeSiteTab || !selectedCustomer) {
                      return
                    }
                    if (projectsForCurrentSite.length === 0) {
                      return
                    }
                    const defaultProject = projectsForCurrentSite[0]
                    setMachineEditor({
                      mode: 'create',
                      customerId: selectedCustomer.id,
                      siteTabKey: activeSiteTab.key,
                      projectId: defaultProject.id,
                      machineSerialNumber: '',
                      lineReference: '',
                      toolSerialNumbers: [],
                    })
                    setMachineEditorError(null)
                  }}
                  title={
                    !canEdit
                      ? 'Read-only access'
                      : !activeSiteTab
                      ? 'Select a site to record machines'
                      : projectsForCurrentSite.length === 0
                      ? 'Create a project before adding machines'
                      : 'Add machine'
                  }
                  disabled={
                    !canEdit ||
                    !activeSiteTab ||
                    !selectedCustomer ||
                    projectsForCurrentSite.length === 0
                  }
                >
                  <Plus size={16} /> Add Machine
                </Button>
              )}
            </div>

            {customerProjectSection === 'subCustomers' ? (
              <div className='space-y-3'>
                {childCustomers.length === 0 ? (
                  <div className='text-sm text-slate-500'>No sub-customers recorded.</div>
                ) : (
                  childCustomers.map(child => {
                    const address = resolveCustomerPrimaryAddress(child)
                    const machineCount = childLineCountByCustomerId.get(child.id) ?? 0
                    return (
                      <Card key={child.id} className='panel'>
                        <CardHeader className='flex flex-col gap-3 border-b-0 sm:flex-row sm:items-center sm:justify-between'>
                          <div>
                            <div className='text-lg font-semibold text-slate-800'>{child.name}</div>
                            {address ? (
                              <p className='text-sm text-slate-500'>{address.split('\n')[0]}</p>
                            ) : (
                              <p className='text-sm text-slate-500'>No primary address recorded.</p>
                            )}
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <div className='flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                              <span>Projects:</span>
                              <span className='font-semibold text-slate-900'>{child.projects.length}</span>
                            </div>
                            <div className='flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                              <span>Lines:</span>
                              <span className='font-semibold text-slate-900'>{machineCount}</span>
                            </div>
                            <Button
                              variant='outline'
                              onClick={() => {
                                setSelectedCustomerId(child.id)
                                setActivePage('customerDetail')
                              }}
                            >
                              <ChevronRight size={16} /> View customer
                            </Button>
                          </div>
                        </CardHeader>
                        {address ? (
                          <CardContent>
                            <div className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm'>
                              <span className='block whitespace-pre-wrap break-words text-slate-800'>{address}</span>
                            </div>
                          </CardContent>
                        ) : null}
                      </Card>
                    )
                  })
                )}
              </div>
            ) : customerProjectSection === 'projects' ? (
              <>
                <div className='flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2'>
                  {([
                    { value: 'active' as const, label: 'Active' },
                    { value: 'complete' as const, label: 'Complete' },
                  ]).map(tab => {
                    const isActive = customerProjectsTab === tab.value
                    const copy = projectTabCopy[tab.value]
                    return (
                      <button
                        key={tab.value}
                        type='button'
                        className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                          isActive
                            ? 'bg-slate-900 text-white shadow'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                        onClick={() => setCustomerProjectsTab(tab.value)}
                      >
                        <span>{tab.label}</span>
                        <span className='ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold'>
                          {copy.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className='space-y-3'>
                  {projectsForTab.length === 0 ? (
                    <div className='text-sm text-slate-500'>{activeTabCopy.empty}</div>
                  ) : (
                    projectsForTab.map(project => {
                      const projectNote = project.note?.trim()
                      const statusBucket = resolveProjectStatusBucket(project)
                      const statusMeta = PROJECT_STATUS_BUCKET_META[statusBucket]
                      const statusLabel = formatProjectStatus(project.status, project.activeSubStatus)
                      const linkedSubCustomer = project.linkedSubCustomerId
                        ? customerLookup.get(project.linkedSubCustomerId) ?? null
                        : null
                      const linkedSubCustomerSite = linkedSubCustomer
                        ? linkedSubCustomer.sites.find(site => site.id === project.linkedSubCustomerSiteId)
                        : null
                      return (
                        <Card key={project.id} className='panel'>
                          <CardHeader className='flex-col items-start gap-4 border-b-0 sm:flex-row sm:items-center sm:gap-3'>
                            <div className='flex flex-col gap-2'>
                              <div className='flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-800'>
                                <span>Project: {project.number}</span>
                                <span
                                  className='rounded-full border px-3 py-1 text-xs font-semibold'
                                  style={{
                                    color: statusMeta.color,
                                    backgroundColor: `${statusMeta.color}1a`,
                                    borderColor: `${statusMeta.color}33`,
                                  }}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              {projectNote ? <p className='text-sm text-slate-500'>{projectNote}</p> : null}
                              {linkedSubCustomer ? (
                                <p className='text-xs text-slate-500'>
                                  Associated with {linkedSubCustomer.name}
                                  {linkedSubCustomerSite
                                    ? ` — ${
                                        linkedSubCustomerSite.name?.trim() ||
                                        linkedSubCustomerSite.address?.trim() ||
                                        'Site'
                                      }`
                                    : ''}
                                </p>
                              ) : null}
                            </div>
                            <div className='flex flex-wrap items-center gap-2 sm:ml-auto'>
                              <Button
                                onClick={() => {
                                  setSelectedCustomerId(selectedCustomer.id)
                                  setSelectedProjectId(project.id)
                                  setActivePage('projectDetail')
                                }}
                              >
                                <ChevronRight size={16} /> View project
                              </Button>
                              <Button
                                variant='ghost'
                                className='text-rose-600 hover:bg-rose-50'
                                onClick={() => {
                                  const confirmed = window.confirm('Delete this project and all associated records?')
                                  if (!confirmed) return
                                  void deleteProject(selectedCustomer.id, project.id)
                                }}
                                title={canEdit ? 'Delete project' : 'Read-only access'}
                                disabled={!canEdit}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </CardHeader>
                        </Card>
                      )
                    })
                  )}
                </div>
              </>
            ) : (
              <div className='space-y-3'>
                {!canViewLines ? (
                  <div className='text-sm text-slate-500'>
                    {!activeSiteTab
                      ? 'Select a site to view machines.'
                      : 'No machines available for this site yet.'}
                  </div>
                ) : lineItems.length === 0 ? (
                  <div className='text-sm text-slate-500'>No machines recorded yet.</div>
                ) : (
                    <div className='overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
                      <div className='overflow-x-auto'>
                        <table className='min-w-full divide-y divide-slate-200 bg-white text-sm text-slate-700'>
                          <thead className='bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500'>
                            <tr>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Customer</th>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Machine Serial</th>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Line No/Name</th>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Tool Serials</th>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Project</th>
                              <th scope='col' className='px-4 py-3 text-left font-semibold'>Actions</th>
                            </tr>
                          </thead>
                          <tbody className='divide-y divide-slate-100'>
                            {lineItems.map(item => {
                              const statusBucket = resolveProjectStatusBucket(item.project)
                              const statusMeta = PROJECT_STATUS_BUCKET_META[statusBucket]
                              const statusLabel = formatProjectStatus(item.project.status, item.project.activeSubStatus)
                              const machineLabel = item.machineSerialNumber.trim() || 'Not specified'
                              const lineLabel = item.lineReference?.trim() || '—'
                              const isChildOwner = item.ownerType === 'child'
                              const linkedOwner = item.project.linkedSubCustomerId
                                ? customerLookup.get(item.project.linkedSubCustomerId) ?? null
                                : null
                              const linkedOwnerSite = linkedOwner
                                ? linkedOwner.sites.find(site => site.id === item.project.linkedSubCustomerSiteId)
                                : null
                              return (
                                <tr key={item.id} className='hover:bg-slate-50/70'>
                                  <td className='whitespace-nowrap px-4 py-3 text-slate-800'>{item.customerName}</td>
                                  <td className='whitespace-nowrap px-4 py-3 font-medium text-slate-800'>
                                    {machineLabel}
                                  </td>
                                  <td className='px-4 py-3'>{lineLabel}</td>
                                  <td className='px-4 py-3'>
                                    {item.toolSerialNumbers.length > 0 ? (
                                      <div className='flex flex-wrap gap-1'>
                                        {item.toolSerialNumbers.map((tool, index) => (
                                          <span
                                            key={`${item.id}-tool-${index}`}
                                            className='inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
                                          >
                                            {tool}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className='text-xs text-slate-400'>No tools recorded</span>
                                    )}
                                  </td>
                                  <td className='px-4 py-3'>
                                    <div className='flex flex-col gap-1'>
                                      <span className='font-semibold text-slate-800'>Project: {item.project.number}</span>
                                      <span
                                        className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold'
                                      style={{
                                        color: statusMeta.color,
                                        backgroundColor: `${statusMeta.color}1a`,
                                        borderColor: `${statusMeta.color}33`,
                                      }}
                                    >
                                      {statusLabel}
                                    </span>
                                    <div>
                                      <Button
                                        size='sm'
                                        variant='outline'
                                        onClick={() => {
                                          setSelectedCustomerId(item.customerId)
                                          setSelectedProjectId(item.project.id)
                                          setActivePage('projectDetail')
                                        }}
                                      >
                                        <ChevronRight size={16} /> View project
                                      </Button>
                                    </div>
                                    {linkedOwner ? (
                                      <span className='text-xs text-slate-500'>
                                        Associated with {linkedOwner.name}
                                        {linkedOwnerSite
                                          ? ` — ${
                                              linkedOwnerSite.name?.trim() ||
                                              linkedOwnerSite.address?.trim() ||
                                              'Site'
                                            }`
                                          : ''}
                                      </span>
                                    ) : null}
                                  </div>
                                  </td>
                                  <td className='px-4 py-3'>
                                    {isChildOwner ? (
                                      <Button
                                        size='sm'
                                        variant='outline'
                                        onClick={() => {
                                          setSelectedCustomerId(item.customerId)
                                          setActivePage('customerDetail')
                                        }}
                                      >
                                        <ChevronRight size={16} /> View customer
                                      </Button>
                                    ) : (
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={() => {
                                          if (!selectedCustomer) {
                                            return
                                          }
                                          setMachineEditor({
                                            mode: 'edit',
                                            customerId: selectedCustomer.id,
                                            siteTabKey: customerSiteTab,
                                            projectId: item.project.id,
                                            machineIndex: item.machineIndex,
                                            machineSerialNumber: item.machineSerialNumber,
                                            lineReference: item.lineReference ?? '',
                                            toolSerialNumbers: [...item.toolSerialNumbers],
                                          })
                                          setMachineEditorError(null)
                                        }}
                                        disabled={!canEdit}
                                        title={canEdit ? 'Edit machine' : 'Read-only access'}
                                      >
                                        <Pencil size={16} />
                                        <span className='sr-only'>Edit machine</span>
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderProjectsIndex = () => {
    const { active: activeProjects, completed: completedProjects } = projectLists
    const totalProjectsCount = activeProjects.length + completedProjects.length

    const renderProjectRows = (projects: typeof activeProjects) =>
      projects.map(project => {
        const isSelected = selectedProjectId === project.projectId && activePage === 'projectDetail'
        const statusStyle: CSSProperties = {
          color: project.statusColor,
          backgroundColor: `${project.statusColor}1a`,
          borderColor: `${project.statusColor}33`,
        }

        return (
          <tr
            key={project.projectId}
            className={`${isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'} transition-colors`}
          >
            <td className='px-4 py-3'>
              <span className='font-semibold text-slate-900'>{project.projectNumber}</span>
            </td>
            <td className='px-4 py-3 text-sm text-slate-600'>{project.customerName}</td>
            <td className='px-4 py-3'>
              <span
                className='inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium'
                style={statusStyle}
              >
                {project.statusLabel}
              </span>
            </td>
            <td className='px-4 py-3'>
              <div className='flex justify-end gap-2'>
                <Button
                  variant='outline'
                  onClick={() => {
                    setSelectedCustomerId(project.customerId)
                    setSelectedProjectId(project.projectId)
                    setActivePage('projectDetail')
                  }}
                >
                  View
                </Button>
                <Button
                  variant='ghost'
                  className='text-rose-600 hover:bg-rose-50'
                  onClick={() => {
                    if (!canEdit) {
                      return
                    }
                    const confirmed = window.confirm('Delete this project and all associated records?')
                    if (!confirmed) return
                    void deleteProject(project.customerId, project.projectId)
                  }}
                  title={canEdit ? 'Delete project' : 'Read-only access'}
                  disabled={!canEdit}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </td>
          </tr>
        )
      })

    const renderProjectsTableContent = (projects: typeof activeProjects, emptyMessage: string) => {
      if (projects.length === 0) {
        return <p className='text-sm text-slate-500'>{emptyMessage}</p>
      }
      return (
        <div className='overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200 bg-white text-sm text-slate-700'>
              <thead className='bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500'>
                <tr>
                  <th scope='col' className='px-4 py-3 text-left font-semibold'>Project</th>
                  <th scope='col' className='px-4 py-3 text-left font-semibold'>Customer</th>
                  <th scope='col' className='px-4 py-3 text-left font-semibold'>Status</th>
                  <th scope='col' className='px-4 py-3 text-right font-semibold'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>{renderProjectRows(projects)}</tbody>
            </table>
          </div>
        </div>
      )
    }

    return (
      <div className='space-y-6'>
        <Card className='panel h-fit'>
          <CardHeader className='flex-col gap-1'>
            <div className='text-lg font-semibold text-slate-900'>Projects</div>
            <div className='text-sm text-slate-500'>
              {totalProjectsCount === 1 ? '1 project listed' : `${totalProjectsCount} projects listed`}
            </div>
          </CardHeader>
          <CardContent>
            {renderProjectsTableContent(activeProjects, 'Active projects will appear here once created.')}
          </CardContent>
        </Card>

        <Card className='panel h-fit'>
          <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <div className='text-lg font-semibold text-slate-900'>Completed projects</div>
              <div className='text-xs text-slate-500'>
                {completedProjects.length === 1
                  ? '1 project complete'
                  : `${completedProjects.length} projects complete`}
              </div>
            </div>
            <Button
              variant='ghost'
              onClick={() => setIsCompletedProjectsCollapsed(prev => !prev)}
              className='inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900'
              title={
                isCompletedProjectsCollapsed ? 'Show completed projects' : 'Hide completed projects'
              }
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${isCompletedProjectsCollapsed ? '' : 'rotate-180'}`}
              />
              <span>{isCompletedProjectsCollapsed ? 'Show' : 'Hide'}</span>
            </Button>
          </CardHeader>
          {!isCompletedProjectsCollapsed && (
            <CardContent>
              {renderProjectsTableContent(completedProjects, 'Completed projects will appear here.')}
            </CardContent>
          )}
        </Card>

      </div>
    )
  }

  const renderMyTasksPage = () => {
    const hasTasks = filteredTasks.length > 0

    return (
      <div className='space-y-6'>
        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-2'>
            <div className='text-lg font-semibold text-slate-900'>Task summary</div>
            <p className='text-sm text-slate-500'>Monitor progress across the work assigned to you.</p>
          </CardHeader>
          <CardContent>
            {!hasTasks ? (
              <p className='text-sm text-slate-500'>Tasks assigned to you will appear here.</p>
            ) : (
              <div className='grid gap-3 sm:grid-cols-3'>
                {PROJECT_TASK_STATUSES.map(status => (
                  <div
                    key={status}
                    className='rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm'
                  >
                    <div className='flex items-center justify-between text-sm font-medium text-slate-700'>
                      <span className='flex items-center gap-2'>
                        <span className={`h-2.5 w-2.5 rounded-full ${TASK_STATUS_META[status].swatchClass}`} aria-hidden />
                        {status}
                      </span>
                      <span className='text-base font-semibold text-slate-900'>{taskCounts[status]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='panel'>
          <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-1'>
              <div className='text-lg font-semibold text-slate-900'>Assigned tasks</div>
              <p className='text-sm text-slate-500'>Review and filter project work in a familiar table layout.</p>
            </div>
            <div className='flex flex-wrap gap-2 text-xs font-medium text-slate-500'>
              <span className='rounded-full bg-slate-900 px-3 py-1 text-white shadow'>
                {filteredTasks.length === 1 ? '1 task shown' : `${filteredTasks.length} tasks shown`}
              </span>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div className='flex flex-wrap items-center gap-2 text-sm text-slate-500'>
                <span className='font-medium text-slate-600'>Status</span>
                <select
                  value={taskStatusFilter}
                  onChange={event => setTaskStatusFilter(event.target.value as typeof taskStatusFilter)}
                  className='rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                >
                  <option value='all'>All statuses</option>
                  {PROJECT_TASK_STATUSES.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <span className='font-medium text-slate-600'>Assignee</span>
                <select
                  value={taskAssigneeFilter}
                  onChange={event => setTaskAssigneeFilter(event.target.value)}
                  className='rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                >
                  <option value='current'>Assigned to me</option>
                  <option value='all'>All assignees</option>
                  <option value='unassigned'>Unassigned</option>
                  {taskAssigneeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!hasTasks ? (
              <p className='text-sm text-slate-500'>No tasks meet the selected filters.</p>
            ) : (
              <div className='overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
                <div className='overflow-x-auto'>
                  <table className='min-w-full divide-y divide-slate-200 bg-white text-sm text-slate-700'>
                    <thead className='bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500'>
                      <tr>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Status</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Task</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Project</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Schedule</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Assignee</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100'>
                      {filteredTasks.map(entry => {
                        const statusMeta = TASK_STATUS_META[entry.task.status]
                        const projectStatusStyle: CSSProperties = {
                          color: entry.projectStatusColor,
                          backgroundColor: `${entry.projectStatusColor}1a`,
                          borderColor: `${entry.projectStatusColor}33`,
                        }
                        return (
                          <tr key={entry.id} className='hover:bg-slate-50/70'>
                            <td className='whitespace-nowrap px-4 py-3'>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusMeta.badgeClass}`}
                              >
                                <span className={`h-2 w-2 rounded-full ${statusMeta.swatchClass}`} aria-hidden />
                                {entry.task.status}
                              </span>
                            </td>
                            <td className='min-w-[200px] px-4 py-3'>
                              <div className='flex flex-col gap-1'>
                                <span className='font-semibold text-slate-900'>{entry.task.name}</span>
                                <span className='text-xs text-slate-500'>
                                  <span
                                    className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium'
                                    style={projectStatusStyle}
                                  >
                                    {entry.projectStatusLabel}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className='min-w-[220px] px-4 py-3'>
                              <div className='flex flex-col gap-1'>
                                <span className='font-medium text-slate-800'>{entry.projectNumber}</span>
                                <span className='text-xs text-slate-500'>{entry.customerName}</span>
                              </div>
                            </td>
                            <td className='min-w-[220px] px-4 py-3 text-xs text-slate-600'>
                              {entry.task.start && entry.task.end
                                ? formatTaskRange(entry.task)
                                : 'No schedule recorded'}
                            </td>
                            <td className='min-w-[160px] px-4 py-3 text-xs text-slate-600'>
                              {entry.task.assigneeName || 'Unassigned'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderProjectDetailPage = () => {
    if (!selectedProjectId) {
      return (
        <Card className='panel'>
          <CardHeader>
            <div className='text-lg font-semibold text-slate-900'>Project not selected</div>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-slate-600'>Return to the index to choose a project.</p>
            <div className='mt-4'>
              <Button onClick={() => setActivePage('projects')}>Back to projects</Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (!selectedProjectData) {
      return (
        <Card className='panel'>
          <CardHeader>
            <div className='text-lg font-semibold'>Project not found</div>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-slate-600'>We couldn't find that project. It may have been deleted.</p>
            <div className='mt-4'>
              <Button
                onClick={() => {
                  setSelectedProjectId(null)
                  setActivePage('projects')
                }}
              >
                Return to index
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <ProjectPage
        customer={selectedProjectData.customer}
        project={selectedProjectData.project}
        canEdit={canEdit}
        currentUserName={currentUserName}
        currentUserId={currentUser?.id ?? null}
        users={users}
        onUpdateProjectNote={(note) =>
          updateProjectNote(selectedProjectData.customer.id, selectedProjectData.project.id, note)
        }
        onUpdateProjectStatus={(status, activeSubStatus, context) =>
          updateProjectStatus(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            status,
            activeSubStatus,
            context,
          )
        }
        onUpdateProjectInfo={(info) =>
          updateProjectInfo(selectedProjectData.customer.id, selectedProjectData.project.id, info)
        }
        onUpdateProjectSite={(siteId) =>
          updateProjectSite(selectedProjectData.customer.id, selectedProjectData.project.id, siteId)
        }
        onAddWO={(data) => addWO(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
        onDeleteWO={(woId) => deleteWO(selectedProjectData.customer.id, selectedProjectData.project.id, woId)}
        onUploadDocument={(category, file) =>
          uploadProjectDocument(selectedProjectData.customer.id, selectedProjectData.project.id, category, file)
        }
        onRemoveDocument={(category, fileId) =>
          removeProjectDocument(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            category,
            fileId,
          )
        }
        onUploadCustomerSignOff={(file) =>
          uploadCustomerSignOff(selectedProjectData.customer.id, selectedProjectData.project.id, file)
        }
        onGenerateCustomerSignOff={(submission) =>
          generateCustomerSignOff(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            submission,
          )
        }
        onRemoveCustomerSignOff={() =>
          removeCustomerSignOff(selectedProjectData.customer.id, selectedProjectData.project.id)
        }
        onCreateOnsiteReport={(submission) =>
          createOnsiteReport(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            submission,
          )
        }
        onDeleteOnsiteReport={(reportId) =>
          deleteOnsiteReport(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            reportId,
          )
        }
        onDeleteProject={() => {
          void deleteProject(selectedProjectData.customer.id, selectedProjectData.project.id)
          setActivePage('projects')
        }}
        onNavigateToCustomer={() => {
          setActivePage('customerDetail')
          setSelectedProjectId(null)
          setSelectedCustomerId(selectedProjectData.customer.id)
        }}
        onReturnToIndex={() => {
          setSelectedProjectId(null)
          setActivePage('projects')
        }}
        onNavigateToCustomers={() => {
          setSelectedProjectId(null)
          setActivePage('customers')
        }}
        onCreateTask={(task) =>
          addTask(selectedProjectData.customer.id, selectedProjectData.project.id, task)
        }
        onUpdateTask={(taskId, updates) =>
          updateTask(selectedProjectData.customer.id, selectedProjectData.project.id, taskId, updates)
        }
        onDeleteTask={(taskId) =>
          deleteTask(selectedProjectData.customer.id, selectedProjectData.project.id, taskId)
        }
        taskScheduleDefaults={computeTaskScheduleDefaults(businessSettings)}
      />
    )
  }
  const renderCustomersSidebar = () => null

  const renderProjectsSidebar = () => null


  const renderMyTasksSidebar = () => (
    <Card className='panel'>
      <CardHeader className='flex-col items-start gap-3'>
        <div>
          <div className='text-lg font-semibold text-slate-900'>Your tasks</div>
          <p className='text-sm text-slate-500'>Quick overview of work assigned to you.</p>
        </div>
        {filteredTasks.length > 0 ? (
          <span className='rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow'>
            {filteredTasks.length === 1 ? '1 task' : `${filteredTasks.length} tasks`}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {filteredTasks.length === 0 ? (
          <p className='text-sm text-slate-500'>Tasks assigned to you will appear here.</p>
        ) : (
          <div className='space-y-4'>
            <div className='space-y-2'>
              {PROJECT_TASK_STATUSES.map(status => (
                <div key={status} className='flex items-center justify-between text-sm text-slate-600'>
                  <span className='flex items-center gap-2'>
                    <span className={`h-2.5 w-2.5 rounded-full ${TASK_STATUS_META[status].swatchClass}`} aria-hidden />
                    {status}
                  </span>
                  <span className='text-sm font-semibold text-slate-900'>{taskCounts[status]}</span>
                </div>
              ))}
            </div>
            {nextScheduledTask ? (
              <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Next scheduled</div>
                <div className='mt-1 text-sm font-semibold text-slate-900'>{nextScheduledTask.task.name}</div>
                <div className='mt-1 text-xs text-slate-500'>{formatTaskRange(nextScheduledTask.task)}</div>
                <div className='mt-2 text-xs text-slate-500'>
                  {nextScheduledTask.customerName} • Project {nextScheduledTask.projectNumber}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const renderHomeSidebar = () => (
    <div className='space-y-4'>
      <Card className='panel'>
        <CardHeader>
          <div className='text-lg font-semibold text-slate-900'>Quick stats</div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[
              { label: 'Customers', value: customerCount },
              { label: 'Projects', value: totalProjects },
              { label: 'Work Orders', value: totalWorkOrders },
            ].map(item => (
              <div key={item.label} className='rounded-xl border border-slate-200 bg-white/70 p-3'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{item.label}</div>
                <div className='mt-1 text-lg font-semibold text-slate-900'>{item.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className='panel'>
        <CardHeader>
          <div className='text-sm font-semibold text-slate-700'>Status distribution</div>
        </CardHeader>
        <CardContent>
          {totalProjects === 0 ? (
            <p className='text-sm text-slate-500'>Add a project to see status information.</p>
          ) : (
            <div className='space-y-2'>
              {projectStatusData.map(status => (
                <div
                  key={status.key}
                  className='flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2'
                >
                  <span className='flex items-center gap-2 text-sm text-slate-600'>
                    <span className={`h-2.5 w-2.5 rounded-full ${status.colorClass}`} aria-hidden />
                    {status.label}
                  </span>
                  <span className='text-sm font-semibold text-slate-900'>{status.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderSettingsSidebar = () => (
    <div className='space-y-4'>
      <Card className='panel'>
        <CardHeader>
          <div className='text-lg font-semibold text-slate-900'>Current totals</div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[
              { label: 'Customers', value: customerCount },
              { label: 'Projects', value: totalProjects },
              { label: 'Work Orders', value: totalWorkOrders },
            ].map(item => (
              <div key={item.label} className='rounded-xl border border-slate-200 bg-white/70 p-3'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{item.label}</div>
                <div className='mt-1 text-lg font-semibold text-slate-900'>{item.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className='panel'>
        <CardHeader>
          <div className='text-sm font-semibold text-slate-700'>Before you import</div>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-slate-600'>
            Export a copy of your data before importing a new file. Imports replace everything stored in this browser.
          </p>
          <div className='mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700'>
            <AlertCircle size={14} className='mt-0.5 flex-shrink-0' />
            <span>Only JSON exports generated by CustomerProjectDB are supported.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderDashboardView = () => {
    const averageWorkOrders = totalProjects > 0 ? totalWorkOrders / totalProjects : 0
    const pieChartData = activeProjectStatusData.map(status => ({ value: status.count, color: status.color }))
    const pieAriaLabel = activeProjectStatusData
      .map(status => `${status.label}: ${status.count} ${status.count === 1 ? 'project' : 'projects'}`)
      .join('; ')

    return (
      <div className='space-y-6'>
        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-3 sm:flex-row sm:items-center'>
            <div>
              <div className='text-lg font-semibold text-slate-900'>Overview</div>
              <p className='text-sm text-slate-500'>High-level metrics for the projects stored in this workspace.</p>
            </div>
            <div className='flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row'>
              <Button className='w-full sm:w-auto' variant='outline' onClick={() => setActivePage('customers')}>
                View customers
              </Button>
              <Button
                className='w-full sm:w-auto'
                variant='outline'
                onClick={() => {
                  setSelectedProjectId(null)
                  setActivePage('projects')
                }}
              >
                View projects
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 sm:grid-cols-3'>
              <div className='rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Projects</div>
                <div className='mt-1 text-3xl font-semibold text-slate-900'>{totalProjects}</div>
                <p className='mt-2 text-sm text-slate-500'>
                  {activeProjects} active across {customerCount} {customerCount === 1 ? 'customer' : 'customers'}.
                </p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Work Orders</div>
                <div className='mt-1 text-3xl font-semibold text-slate-900'>{totalWorkOrders}</div>
                <p className='mt-2 text-sm text-slate-500'>Average of {averageWorkOrders.toFixed(1)} per project.</p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Customers</div>
                <div className='mt-1 text-3xl font-semibold text-slate-900'>{customerCount}</div>
                <p className='mt-2 text-sm text-slate-500'>Customer records currently in the database.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-2'>
            <div className='text-lg font-semibold text-slate-900'>Project status overview</div>
            <p className='text-sm text-slate-500'>Track each project's lifecycle stage, from FDS through install and completion.</p>
          </CardHeader>
          <CardContent>
            {totalProjects === 0 ? (
              <p className='text-sm text-slate-500'>Add a project to see status details.</p>
            ) : totalActiveProjects === 0 ? (
              <p className='text-sm text-slate-500'>All projects are marked complete. Active lifecycle data will appear here once projects resume.</p>
            ) : (
              <div className='flex flex-col gap-6 lg:flex-row lg:items-center'>
                <div className='flex justify-center lg:flex-1'>
                  <PieChart
                    data={pieChartData}
                    size={240}
                    thickness={80}
                    ariaLabel={`Active project status distribution. ${pieAriaLabel}`}
                    centerContent={
                      <div className='px-4 text-center'>
                        <div className='text-2xl font-semibold text-slate-900'>{totalActiveProjects}</div>
                        <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>Active Projects</div>
                      </div>
                    }
                  />
                </div>
                <div className='flex-1 space-y-3'>
                  {activeProjectStatusData.map(status => {
                    const percentage = totalActiveProjects > 0 ? Math.round((status.count / totalActiveProjects) * 100) : 0
                    return (
                      <div
                        key={status.key}
                        className='rounded-xl border border-slate-200 bg-white/70 px-3 py-3 shadow-sm'
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div>
                            <div className='flex items-center gap-2 text-sm font-semibold text-slate-800'>
                              <span className={`h-2.5 w-2.5 rounded-full ${status.colorClass}`} aria-hidden />
                              {status.label}
                            </div>
                            <p className='mt-1 text-xs text-slate-500'>{status.description}</p>
                          </div>
                          <div className='text-right'>
                            <div className='text-sm font-semibold text-slate-900'>{status.count}</div>
                            <div className='text-xs text-slate-500'>{percentage}%</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const settingsTabs: Array<{
    id: 'users' | 'business' | 'data'
    label: string
    description: string
  }> = [
    {
      id: 'users',
      label: 'User management',
      description: 'Create accounts, assign roles, and configure authentication.',
    },
    {
      id: 'business',
      label: 'Business settings',
      description: 'Set the operating name and working hours for scheduling defaults.',
    },
    {
      id: 'data',
      label: 'Import & export',
      description: 'Back up or restore workspace data from JSON files.',
    },
  ]

  const activeSettingsTab = settingsTabs.find(tab => tab.id === settingsSection) ?? settingsTabs[0]

  const renderUserManagementSection = () => {
    const newUserStrength = getPasswordStrengthMeta(newUserDraft.password)
    const editPasswordStrength = getPasswordStrengthMeta(userEditDraft.password)

    return (
      <Card className='panel'>
        <CardHeader className='flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='text-lg font-semibold text-slate-900'>Manage users</div>
            <p className='mt-1 text-sm text-slate-600'>Create accounts, assign roles, and configure two-factor authentication.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]'>
            <div className='rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm'>
              <div className='mb-3 text-sm font-semibold text-slate-800'>Add user</div>
              <div className='space-y-3'>
                <div>
                  <Label htmlFor='new-user-name'>Name</Label>
                  <Input
                    id='new-user-name'
                    value={newUserDraft.name}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, name: (event.target as HTMLInputElement).value }))
                    }
                    placeholder='e.g. Jamie Lee'
                    disabled={isSavingUser || !canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor='new-user-email'>Email</Label>
                  <Input
                    id='new-user-email'
                    type='email'
                    autoComplete='email'
                    value={newUserDraft.email}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, email: (event.target as HTMLInputElement).value }))
                    }
                    placeholder='name@example.com'
                    disabled={isSavingUser || !canEdit}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor='new-user-password'>Password</Label>
                  <Input
                    id='new-user-password'
                    type='password'
                    autoComplete='new-password'
                    value={newUserDraft.password}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, password: (event.target as HTMLInputElement).value }))
                    }
                    placeholder='Create a password'
                    disabled={isSavingUser || !canEdit}
                    required
                  />
                  {newUserDraft.password && (
                    <div className='mt-2'>
                      <div className='h-1.5 w-full rounded-full bg-slate-200'>
                        <div
                          className={`h-full rounded-full ${newUserStrength.className}`}
                          style={{ width: newUserStrength.width }}
                        />
                      </div>
                      <p className='mt-1 text-xs font-medium text-slate-500'>Strength: {newUserStrength.label}</p>
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor='new-user-confirm'>Confirm password</Label>
                  <Input
                    id='new-user-confirm'
                    type='password'
                    autoComplete='new-password'
                    value={newUserDraft.confirmPassword}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, confirmPassword: (event.target as HTMLInputElement).value }))
                    }
                    placeholder='Re-enter the password'
                    disabled={isSavingUser || !canEdit}
                    required
                  />
                </div>
                <p className='text-xs text-slate-500'>Passwords must be at least 8 characters with a symbol, number, and uppercase letter.</p>
                <div>
                  <Label htmlFor='new-user-role'>Role</Label>
                  <select
                    id='new-user-role'
                    className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                    value={newUserDraft.role}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, role: event.target.value as AppRole }))
                    }
                    disabled={isSavingUser || !canEdit}
                  >
                    <option value='viewer'>Viewer</option>
                    <option value='editor'>Editor</option>
                    <option value='admin'>Admin</option>
                  </select>
                </div>
                <div className='flex items-center gap-2'>
                  <input
                    id='new-user-2fa'
                    type='checkbox'
                    className='h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed'
                    checked={newUserDraft.twoFactorEnabled}
                    onChange={event =>
                      setNewUserDraft(prev => ({ ...prev, twoFactorEnabled: event.target.checked }))
                    }
                    disabled={isSavingUser || !canEdit}
                  />
                  <label htmlFor='new-user-2fa' className='text-sm text-slate-700'>Require two-factor authentication</label>
                </div>
                {newUserDraft.twoFactorEnabled && (
                  <div>
                    <Label htmlFor='new-user-2fa-method'>Two-factor method</Label>
                    <select
                      id='new-user-2fa-method'
                      className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                      value={newUserDraft.twoFactorMethod}
                      onChange={event =>
                        setNewUserDraft(prev => ({
                          ...prev,
                          twoFactorMethod: event.target.value as TwoFactorMethod,
                        }))
                      }
                      disabled={isSavingUser || !canEdit}
                    >
                      <option value='authenticator'>Authenticator app</option>
                      <option value='sms'>SMS</option>
                    </select>
                  </div>
                )}
                {userFormError && (
                  <p className='flex items-center gap-1 text-sm text-rose-600'>
                    <AlertCircle size={14} /> {userFormError}
                  </p>
                )}
                <Button onClick={() => void handleCreateUser()} disabled={isSavingUser || !canEdit}>
                  {isSavingUser ? 'Saving…' : 'Create user'}
                </Button>
              </div>
            </div>
            <div className='space-y-3'>
              <div className='text-sm font-semibold text-slate-800'>Existing users</div>
              {users.length === 0 ? (
                <p className='text-sm text-slate-500'>Add a user to begin assigning tasks and sales ownership.</p>
              ) : (
                <div className='space-y-3'>
                  {[...users].sort((a, b) => a.name.localeCompare(b.name)).map(user => {
                    const isEditing = editingUserId === user.id
                    const twoFactorLabel = user.twoFactorEnabled
                      ? `Enabled (${user.twoFactorMethod === 'sms' ? 'SMS' : 'Authenticator'})`
                      : 'Disabled'
                    return (
                      <div key={user.id} className='rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm'>
                        {!isEditing ? (
                          <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div>
                              <div className='text-sm font-semibold text-slate-900'>{user.name}</div>
                              <div className='text-xs text-slate-500'>{user.email}</div>
                              <div className='mt-1 text-xs text-slate-500'>Role: <span className='font-medium text-slate-700 capitalize'>{user.role}</span></div>
                              <div className='text-xs text-slate-500'>Two-factor: {twoFactorLabel}</div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <Button
                                variant='outline'
                                onClick={() => beginEditingUser(user)}
                                disabled={!canEdit || isSavingUserEdit}
                              >
                                Edit
                              </Button>
                              <Button
                                variant='ghost'
                                className='text-rose-600 hover:bg-rose-50'
                                onClick={() => {
                                  if (!canEdit) {
                                    setUserFormError('Not authorized to manage users.')
                                    return
                                  }
                                  const confirmed = window.confirm('Remove this user?')
                                  if (!confirmed) {
                                    return
                                  }
                                  void handleDeleteUser(user.id)
                                }}
                                disabled={!canEdit || deletingUserId === user.id}
                              >
                                {deletingUserId === user.id ? 'Removing…' : 'Remove'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className='space-y-3'>
                            <div className='grid gap-3 md:grid-cols-2'>
                              <div>
                                <Label>Name</Label>
                                <Input
                                  value={userEditDraft.name}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({ ...prev, name: (event.target as HTMLInputElement).value }))
                                  }
                                  disabled={!canEdit || isSavingUserEdit}
                                />
                              </div>
                              <div>
                                <Label>Email</Label>
                                <Input
                                  type='email'
                                  value={userEditDraft.email}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({ ...prev, email: (event.target as HTMLInputElement).value }))
                                  }
                                  disabled={!canEdit || isSavingUserEdit}
                                />
                              </div>
                              <div>
                                <Label>New password</Label>
                                <Input
                                  type='password'
                                  autoComplete='new-password'
                                  value={userEditDraft.password}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({ ...prev, password: (event.target as HTMLInputElement).value }))
                                  }
                                  placeholder='Leave blank to keep current password'
                                  disabled={!canEdit || isSavingUserEdit}
                                />
                                {userEditDraft.password && (
                                  <div className='mt-2'>
                                    <div className='h-1.5 w-full rounded-full bg-slate-200'>
                                      <div
                                        className={`h-full rounded-full ${editPasswordStrength.className}`}
                                        style={{ width: editPasswordStrength.width }}
                                      />
                                    </div>
                                    <p className='mt-1 text-xs font-medium text-slate-500'>Strength: {editPasswordStrength.label}</p>
                                  </div>
                                )}
                              </div>
                              <div>
                                <Label>Confirm password</Label>
                                <Input
                                  type='password'
                                  autoComplete='new-password'
                                  value={userEditDraft.confirmPassword}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({
                                      ...prev,
                                      confirmPassword: (event.target as HTMLInputElement).value,
                                    }))
                                  }
                                  placeholder='Re-enter new password'
                                  disabled={!canEdit || isSavingUserEdit}
                                />
                                <p className='mt-1 text-xs text-slate-500'>Leave blank to retain the current password.</p>
                              </div>
                              <div>
                                <Label>Role</Label>
                                <select
                                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                  value={userEditDraft.role}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({ ...prev, role: event.target.value as AppRole }))
                                  }
                                  disabled={!canEdit || isSavingUserEdit}
                                >
                                  <option value='viewer'>Viewer</option>
                                  <option value='editor'>Editor</option>
                                  <option value='admin'>Admin</option>
                                </select>
                              </div>
                              <div className='flex items-center gap-2'>
                                <input
                                  id={`edit-user-2fa-${user.id}`}
                                  type='checkbox'
                                  className='h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed'
                                  checked={userEditDraft.twoFactorEnabled}
                                  onChange={event =>
                                    setUserEditDraft(prev => ({ ...prev, twoFactorEnabled: event.target.checked }))
                                  }
                                  disabled={!canEdit || isSavingUserEdit}
                                />
                                <label htmlFor={`edit-user-2fa-${user.id}`} className='text-sm text-slate-700'>Require two-factor authentication</label>
                              </div>
                              {userEditDraft.twoFactorEnabled && (
                                <div>
                                  <Label>Two-factor method</Label>
                                  <select
                                    className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                    value={userEditDraft.twoFactorMethod}
                                    onChange={event =>
                                      setUserEditDraft(prev => ({
                                        ...prev,
                                        twoFactorMethod: event.target.value as TwoFactorMethod,
                                      }))
                                    }
                                    disabled={!canEdit || isSavingUserEdit}
                                  >
                                    <option value='authenticator'>Authenticator app</option>
                                    <option value='sms'>SMS</option>
                                  </select>
                                </div>
                              )}
                            </div>
                            {userEditError && (
                              <p className='flex items-center gap-1 text-sm text-rose-600'>
                                <AlertCircle size={14} /> {userEditError}
                              </p>
                            )}
                            <div className='flex justify-end gap-2'>
                              <Button variant='ghost' onClick={cancelUserEdit} disabled={isSavingUserEdit}>
                                Cancel
                              </Button>
                              <Button onClick={() => void handleSaveUserEdit()} disabled={isSavingUserEdit || !canEdit}>
                                {isSavingUserEdit ? 'Saving…' : 'Save changes'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderDataSection = () => (
    <div className='space-y-6'>
      {settingsError ? (
        <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
          <div className='flex items-start gap-2'>
            <AlertCircle size={16} className='mt-0.5 flex-shrink-0' />
            <span>{settingsError}</span>
          </div>
        </div>
      ) : null}
      {settingsSuccess ? (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'>
          {settingsSuccess}
        </div>
      ) : null}

      <Card className='panel'>
        <CardHeader className='flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='text-lg font-semibold text-slate-900'>Export workspace data</div>
            <p className='mt-1 text-sm text-slate-600'>Download every customer, project, work order, document, and sign-off.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Button onClick={handleExportData} disabled={isExportingData} className='w-full sm:w-auto'>
              {isExportingData ? (
                <>
                  <span
                    className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white'
                    aria-hidden
                  />
                  <span>Preparing export…</span>
                </>
              ) : (
                <>
                  <Download size={16} /> Export data
                </>
              )}
            </Button>
            <p className='text-sm text-slate-500'>A JSON file will be saved to your device.</p>
          </div>
        </CardContent>
      </Card>

      <Card className='panel'>
        <CardHeader className='flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='text-lg font-semibold text-slate-900'>Import workspace data</div>
            <p className='mt-1 text-sm text-slate-600'>Replace the current data with a JSON export you previously downloaded.</p>
          </div>
        </CardHeader>
        <CardContent>
          <input
            ref={importFileInputRef}
            type='file'
            accept='application/json,.json'
            className='hidden'
            onChange={handleImportChange}
          />
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Button onClick={triggerImportDialog} disabled={isImportingData} className='w-full sm:w-auto'>
              {isImportingData ? (
                <>
                  <span
                    className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white'
                    aria-hidden
                  />
                  <span>Importing…</span>
                </>
              ) : (
                <>
                  <Upload size={16} /> Import data
                </>
              )}
            </Button>
            <p className='text-sm text-slate-500'>Imports immediately overwrite the current workspace.</p>
          </div>
          <div className='mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700'>
            <AlertCircle size={16} className='mt-0.5 flex-shrink-0' />
            <span>Only use files exported from CustomerProjectDB. Existing data will be replaced.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderBusinessSettingsSection = () => {
    const invalidHours = BUSINESS_DAY_ORDER.filter(day => {
      const hours = businessSettingsDraft.hours[day.key]
      if (!hours?.enabled) {
        return false
      }
      if (!hours.start || !hours.end) {
        return true
      }
      return hours.start >= hours.end
    })
    const validationMessage =
      invalidHours.length > 0
        ? `Set valid start and end times for ${invalidHours.map(day => day.label).join(', ')}.`
        : null
    const trimmedBusinessName = businessSettingsDraft.businessName.trim()
    const isDirty = !businessSettingsEqual(businessSettingsDraft, businessSettings)
    const businessLogo = businessSettingsDraft.logo

    const handleToggleDay = (dayKey: BusinessDay) => {
      setBusinessSettingsDraft(prev => {
        const current = prev.hours[dayKey] ?? DEFAULT_BUSINESS_SETTINGS.hours[dayKey]
        return {
          ...prev,
          hours: {
            ...prev.hours,
            [dayKey]: { ...current, enabled: !current.enabled },
          },
        }
      })
      setBusinessSettingsMessage(null)
      setBusinessSettingsError(null)
    }

    const handleTimeChange = (dayKey: BusinessDay, field: 'start' | 'end', value: string) => {
      setBusinessSettingsDraft(prev => {
        const current = prev.hours[dayKey] ?? DEFAULT_BUSINESS_SETTINGS.hours[dayKey]
        return {
          ...prev,
          hours: {
            ...prev.hours,
            [dayKey]: { ...current, [field]: value },
          },
        }
      })
      setBusinessSettingsMessage(null)
      setBusinessSettingsError(null)
    }

    const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) {
        return
      }
      setIsProcessingLogo(true)
      try {
        const logo = await createBusinessLogoFromFile(file)
        setBusinessSettingsDraft(prev => ({ ...prev, logo }))
        setBusinessSettingsMessage(null)
        setBusinessSettingsError(null)
      } catch (error) {
        console.error('Failed to process company logo', error)
        setBusinessSettingsError(toErrorMessage(error, 'Failed to process the company logo.'))
      } finally {
        setIsProcessingLogo(false)
        if (businessLogoInputRef.current) {
          businessLogoInputRef.current.value = ''
        }
      }
    }

    const handleClearLogo = () => {
      setBusinessSettingsDraft(prev => ({ ...prev, logo: null }))
      setBusinessSettingsMessage(null)
      setBusinessSettingsError(null)
      if (businessLogoInputRef.current) {
        businessLogoInputRef.current.value = ''
      }
    }

    const handleReset = () => {
      setBusinessSettingsDraft(cloneBusinessSettings(businessSettings))
      setBusinessSettingsMessage(null)
      setBusinessSettingsError(null)
      if (businessLogoInputRef.current) {
        businessLogoInputRef.current.value = ''
      }
    }

    const handleSave = async () => {
      if (!isDirty) {
        return
      }
      if (!trimmedBusinessName) {
        setBusinessSettingsError('Enter a business name.')
        return
      }
      if (validationMessage) {
        setBusinessSettingsError(validationMessage)
        return
      }

      setIsSavingBusinessSettings(true)
      try {
        const payload = cloneBusinessSettings(businessSettingsDraft)
        payload.businessName = trimmedBusinessName
        const saved = await updateBusinessSettingsRecord(payload)
        setBusinessSettings(saved)
        setBusinessSettingsDraft(cloneBusinessSettings(saved))
        setBusinessSettingsMessage('Business settings updated.')
        setBusinessSettingsError(null)
        if (businessLogoInputRef.current) {
          businessLogoInputRef.current.value = ''
        }
      } catch (error) {
        console.error('Failed to update business settings', error)
        setBusinessSettingsError(toErrorMessage(error, 'Failed to save business settings.'))
      } finally {
        setIsSavingBusinessSettings(false)
      }
    }

    const disableSave =
      isSavingBusinessSettings || isProcessingLogo || !isDirty || !!validationMessage || !trimmedBusinessName

    return (
      <div className='space-y-6'>
        {businessSettingsError ? (
          <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
            <div className='flex items-start gap-2'>
              <AlertCircle size={16} className='mt-0.5 flex-shrink-0' />
              <span>{businessSettingsError}</span>
            </div>
          </div>
        ) : null}
        {businessSettingsMessage ? (
          <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'>
            {businessSettingsMessage}
          </div>
        ) : null}

        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <div className='text-lg font-semibold text-slate-900'>Business profile</div>
              <p className='mt-1 text-sm text-slate-600'>Configure the workspace name and working hours used for scheduling defaults.</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={handleReset} disabled={isSavingBusinessSettings || !isDirty}>
                Reset changes
              </Button>
              <Button onClick={() => void handleSave()} disabled={disableSave}>
                {isSavingBusinessSettings ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div>
              <Label htmlFor='business-name'>Business name</Label>
              <Input
                id='business-name'
                value={businessSettingsDraft.businessName}
                onChange={event => {
                  setBusinessSettingsDraft(prev => ({
                    ...prev,
                    businessName: (event.target as HTMLInputElement).value,
                  }))
                  setBusinessSettingsMessage(null)
                  setBusinessSettingsError(null)
                }}
                placeholder='e.g. Cobalt Systems'
                disabled={isSavingBusinessSettings}
              />
            </div>

            <div>
              <Label className='text-sm font-semibold text-slate-700'>Company logo</Label>
              <p className='mt-1 text-xs text-slate-500'>Displayed under the navigation title and on generated documents. Images are resized up to 240×120 pixels.</p>
              <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-center gap-4'>
                  {businessLogo ? (
                    <div className='flex items-center gap-3'>
                      <div className='flex h-20 w-36 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white/80 p-2 shadow-sm'>
                        <img
                          src={businessLogo.dataUrl}
                          alt='Company logo preview'
                          className='max-h-16 max-w-full object-contain'
                        />
                      </div>
                      <span className='text-xs text-slate-500'>
                        {Math.round(businessLogo.width)}×{Math.round(businessLogo.height)} px
                      </span>
                    </div>
                  ) : (
                    <div className='flex h-20 w-36 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400'>
                      No logo uploaded
                    </div>
                  )}
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => businessLogoInputRef.current?.click()}
                    disabled={isSavingBusinessSettings || isProcessingLogo}
                  >
                    {isProcessingLogo ? 'Processing…' : 'Upload logo'}
                  </Button>
                  {businessLogo ? (
                    <Button
                      type='button'
                      variant='ghost'
                      onClick={handleClearLogo}
                      disabled={isSavingBusinessSettings || isProcessingLogo}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <input
                ref={businessLogoInputRef}
                type='file'
                accept='image/*'
                className='hidden'
                onChange={handleLogoFileChange}
              />
            </div>

            <div>
              <div className='mb-2 text-sm font-semibold text-slate-700'>Operating hours</div>
              {validationMessage ? (
                <div className='mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700'>
                  {validationMessage}
                </div>
              ) : null}
              <div className='overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'>
                <div className='overflow-x-auto'>
                  <table className='min-w-full divide-y divide-slate-200 bg-white text-sm text-slate-700'>
                    <thead className='bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500'>
                      <tr>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Day</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Open</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>Start</th>
                        <th scope='col' className='px-4 py-3 text-left font-semibold'>End</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100'>
                      {BUSINESS_DAY_ORDER.map(day => {
                        const hours = businessSettingsDraft.hours[day.key] ?? DEFAULT_BUSINESS_SETTINGS.hours[day.key]
                        const isDisabled = !hours.enabled
                        return (
                          <tr key={day.key} className='hover:bg-slate-50/70'>
                            <td className='whitespace-nowrap px-4 py-3 font-medium text-slate-800'>{day.label}</td>
                            <td className='px-4 py-3'>
                              <label className='inline-flex items-center gap-2 text-xs font-medium text-slate-600'>
                                <input
                                  type='checkbox'
                                  className='h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed'
                                  checked={hours.enabled}
                                  onChange={() => handleToggleDay(day.key)}
                                  disabled={isSavingBusinessSettings}
                                />
                                {hours.enabled ? 'Open' : 'Closed'}
                              </label>
                            </td>
                            <td className='px-4 py-3'>
                              <input
                                type='time'
                                className='w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                value={hours.start}
                                onChange={event =>
                                  handleTimeChange(day.key, 'start', (event.target as HTMLInputElement).value)
                                }
                                disabled={isSavingBusinessSettings || isDisabled}
                              />
                            </td>
                            <td className='px-4 py-3'>
                              <input
                                type='time'
                                className='w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                value={hours.end}
                                onChange={event =>
                                  handleTimeChange(day.key, 'end', (event.target as HTMLInputElement).value)
                                }
                                disabled={isSavingBusinessSettings || isDisabled}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderSettingsPage = () => (
    <div className='space-y-6'>
      <div className='rounded-3xl border border-slate-200/70 bg-white/80 p-4 shadow-sm'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <div className='text-sm font-semibold text-slate-700'>Settings</div>
            <p className='text-xs text-slate-500'>{activeSettingsTab.description}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {settingsTabs.map(tab => {
              const isActive = tab.id === settingsSection
              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => setSettingsSection(tab.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                    isActive
                      ? 'bg-sky-600 text-white shadow'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {settingsSection === 'users'
        ? renderUserManagementSection()
        : settingsSection === 'business'
        ? renderBusinessSettingsSection()
        : renderDataSection()}
    </div>
  )


  const selectedProjectData = useMemo(() => {
    if (!selectedProjectId) return null
    for (const customer of db) {
      const project = customer.projects.find(p => p.id === selectedProjectId)
      if (project) {
        return { customer, project }
      }
    }
    return null
  }, [db, selectedProjectId])

  type AssignedTaskEntry = {
    id: string
    task: ProjectTask
    customerId: string
    projectId: string
    customerName: string
    projectNumber: string
    projectStatusLabel: string
    projectStatusColor: string
    assigneeId?: string
    assigneeName?: string
  }

  const allAssignedTasks = useMemo<AssignedTaskEntry[]>(() => {
    const tasks: AssignedTaskEntry[] = []
    for (const customer of db) {
      for (const project of customer.projects) {
        const projectTasks = project.tasks ?? []
        for (const task of projectTasks) {
          const statusBucket = resolveProjectStatusBucket(project)
          const statusMeta = PROJECT_STATUS_BUCKET_META[statusBucket]
          tasks.push({
            id: `${project.id}:${task.id}`,
            task,
            customerId: customer.id,
            projectId: project.id,
            customerName: customer.name,
            projectNumber: project.number,
            projectStatusLabel: formatProjectStatus(project.status, project.activeSubStatus),
            projectStatusColor: statusMeta.color,
            assigneeId: task.assigneeId,
            assigneeName: task.assigneeName,
          })
        }
      }
    }

    return tasks.sort((a, b) => compareTasksBySchedule(a.task, b.task))
  }, [db])

  const normalizedCurrentUserName = useMemo(
    () => currentUserName.trim().toLowerCase(),
    [currentUserName],
  )
  const currentUserId = currentUser?.id ?? null

  const matchesCurrentAssignee = useCallback(
    (entry: AssignedTaskEntry) => {
      if (currentUserId && entry.task.assigneeId === currentUserId) {
        return true
      }
      if (!normalizedCurrentUserName) {
        return false
      }
      const candidate = (entry.task.assigneeName ?? entry.assigneeName ?? '').trim().toLowerCase()
      return candidate === normalizedCurrentUserName
    },
    [currentUserId, normalizedCurrentUserName],
  )
  const taskAssigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) {
      map.set(user.id, user.name)
    }
    for (const entry of allAssignedTasks) {
      const id = entry.task.assigneeId ?? entry.assigneeId ?? null
      const name = (entry.task.assigneeName ?? entry.assigneeName ?? '').trim()
      if (id) {
        if (!map.has(id)) {
          map.set(id, name || id)
        }
      } else if (name) {
        const key = `name:${name.toLowerCase()}`
        if (!map.has(key)) {
          map.set(key, name)
        }
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allAssignedTasks, users])

  const filteredTasks = useMemo(() => {
    let tasks = allAssignedTasks
    if (taskAssigneeFilter === 'current') {
      tasks = tasks.filter(matchesCurrentAssignee)
    } else if (taskAssigneeFilter === 'all') {
      tasks = tasks
    } else if (taskAssigneeFilter === 'unassigned') {
      tasks = tasks.filter(entry => {
        const name = (entry.task.assigneeName ?? entry.assigneeName ?? '').trim()
        return !entry.task.assigneeId && !name
      })
    } else if (taskAssigneeFilter.startsWith('name:')) {
      const nameKey = taskAssigneeFilter.slice(5)
      tasks = tasks.filter(entry => {
        const name = (entry.task.assigneeName ?? entry.assigneeName ?? '').trim().toLowerCase()
        return name === nameKey
      })
    } else {
      tasks = tasks.filter(entry => entry.task.assigneeId === taskAssigneeFilter)
    }

    if (taskStatusFilter !== 'all') {
      tasks = tasks.filter(entry => entry.task.status === taskStatusFilter)
    }

    return tasks
  }, [allAssignedTasks, matchesCurrentAssignee, taskAssigneeFilter, taskStatusFilter])

  const taskCounts = useMemo(() => {
    const counts: Record<ProjectTaskStatus, number> = {
      'Not started': 0,
      Started: 0,
      Complete: 0,
    }
    for (const entry of filteredTasks) {
      counts[entry.task.status] += 1
    }
    return counts
  }, [filteredTasks])

  const nextScheduledTask = useMemo(() => {
    for (const entry of filteredTasks) {
      const startValue = entry.task.start
      const endValue = entry.task.end
      if (!startValue || !endValue) continue
      const parsedStart = Date.parse(startValue)
      const parsedEnd = Date.parse(endValue)
      if (!Number.isNaN(parsedStart) && !Number.isNaN(parsedEnd)) {
        return { ...entry, startDate: new Date(parsedStart), endDate: new Date(parsedEnd) }
      }
    }
    return null
  }, [filteredTasks])

  // Helpers
  const customerNameExists = (name: string, excludeId?: string) =>
    db.some(c => c.id !== excludeId && c.name.trim().toLowerCase() === name.trim().toLowerCase())
  const projectNumberExists = (number: string, excludeProjectId?: string) => {
    const norm = number.trim().toLowerCase()
    return db.some(c => c.projects.some(p => p.id !== excludeProjectId && p.number.trim().toLowerCase() === norm))
  }
  const woNumberExists = (number: string, excludeWoId?: string) => {
    const norm = number.trim().toLowerCase()
    return db.some(c => c.projects.some(p => p.wos.some(w => w.id !== excludeWoId && w.number.trim().toLowerCase() === norm)))
  }
  const sortTasksForUi = (tasks: ProjectTask[]): ProjectTask[] => [...tasks].sort(compareTasksBySchedule)
  const hasProjectInfoValues = (info?: ProjectInfo): boolean => {
    if (!info) {
      return false
    }
    return Object.values(info).some(value => {
      if (Array.isArray(value)) {
        return value.length > 0
      }
      return value !== undefined
    })
  }

  function applyUserChangeToProjects(userId: string, action: 'rename' | 'remove', name?: string) {
    setDb(prev =>
      prev.map(customer => {
        let projectsChanged = false
        const projects = customer.projects.map(project => {
          let updatedProject = project
          let infoChanged = false

          if (project.info?.salespersonId === userId) {
            if (action === 'rename' && name) {
              updatedProject = {
                ...updatedProject,
                info: { ...project.info, salespersonName: name },
              }
              infoChanged = true
            } else if (action === 'remove') {
              const { salespersonId: _omitId, salespersonName: _omitName, ...rest } = project.info
              const restInfo: ProjectInfo = { ...rest }
              const cleanedInfo = hasProjectInfoValues(restInfo) ? restInfo : undefined
              updatedProject = { ...updatedProject, info: cleanedInfo }
              infoChanged = true
            }
          }

          let tasksChanged = false
          if (project.tasks && project.tasks.length > 0) {
            const nextTasks = project.tasks.map(task => {
              if (task.assigneeId !== userId) {
                return task
              }
              tasksChanged = true
              if (action === 'rename' && name) {
                return { ...task, assigneeName: name }
              }
              if (action === 'remove') {
                return { ...task, assigneeId: undefined, assigneeName: undefined }
              }
              return task
            })
            if (tasksChanged) {
              updatedProject = { ...updatedProject, tasks: nextTasks }
            }
          }

          if (infoChanged || tasksChanged) {
            projectsChanged = true
          }

          return updatedProject
        })
        return projectsChanged ? { ...customer, projects } : customer
      }),
    )
  }

  // Mutators
  async function handleCreateUser() {
    if (!canEdit) {
      setUserFormError('Not authorized to manage users.')
      return
    }

    const name = newUserDraft.name.trim()
    if (!name) {
      setUserFormError('Enter a user name.')
      return
    }

    const email = newUserDraft.email.trim().toLowerCase()
    if (!email) {
      setUserFormError('Enter an email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUserFormError('Enter a valid email address.')
      return
    }

    const password = newUserDraft.password
    if (!passwordMeetsRequirements(password)) {
      setUserFormError('Password must be at least 8 characters with a symbol, number, and uppercase letter.')
      return
    }
    if (password !== newUserDraft.confirmPassword) {
      setUserFormError('Passwords do not match.')
      return
    }

    const payload = {
      name,
      email,
      password,
      role: newUserDraft.role,
      twoFactorEnabled: newUserDraft.twoFactorEnabled,
      twoFactorMethod: newUserDraft.twoFactorEnabled ? newUserDraft.twoFactorMethod : undefined,
    }

    setIsSavingUser(true)
    try {
      const user = await createUserRecord(payload)
      setUsers(prev => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)))
      resetNewUserDraft()
      setUserFormError(null)
    } catch (error) {
      console.error('Failed to create user', error)
      setUserFormError(toErrorMessage(error, 'Failed to create user.'))
    } finally {
      setIsSavingUser(false)
    }
  }

  const beginEditingUser = (user: User) => {
    setEditingUserId(user.id)
    setUserEditDraft({
      name: user.name,
      email: user.email ?? '',
      password: '',
      confirmPassword: '',
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod ?? 'authenticator',
    })
    setUserEditError(null)
  }

  const cancelUserEdit = () => {
    setEditingUserId(null)
    setUserEditError(null)
    setIsSavingUserEdit(false)
  }

  async function handleSaveUserEdit() {
    if (!editingUserId) {
      return
    }
    if (!canEdit) {
      setUserEditError('Not authorized to manage users.')
      return
    }

    const name = userEditDraft.name.trim()
    if (!name) {
      setUserEditError('Enter a user name.')
      return
    }

    const email = userEditDraft.email.trim().toLowerCase()
    if (!email) {
      setUserEditError('Enter an email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUserEditError('Enter a valid email address.')
      return
    }

    const password = userEditDraft.password
    if (password) {
      if (password !== userEditDraft.confirmPassword) {
        setUserEditError('Passwords do not match.')
        return
      }
      if (!passwordMeetsRequirements(password)) {
        setUserEditError('New passwords must be at least 8 characters with a symbol, number, and uppercase letter.')
        return
      }
    }

    const payload = {
      name,
      email,
      password: password ? password : undefined,
      role: userEditDraft.role,
      twoFactorEnabled: userEditDraft.twoFactorEnabled,
      twoFactorMethod: userEditDraft.twoFactorEnabled ? userEditDraft.twoFactorMethod : undefined,
    }

    setIsSavingUserEdit(true)
    try {
      const updated = await updateUserRecord(editingUserId, payload)
      setUsers(prev =>
        [...prev.filter(user => user.id !== updated.id), updated].sort((a, b) => a.name.localeCompare(b.name)),
      )
      applyUserChangeToProjects(updated.id, 'rename', updated.name)
      setUserEditError(null)
      setEditingUserId(null)
    } catch (error) {
      console.error('Failed to update user', error)
      setUserEditError(toErrorMessage(error, 'Failed to update user.'))
    } finally {
      setIsSavingUserEdit(false)
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!canEdit) {
      setUserFormError('Not authorized to manage users.')
      return
    }

    setDeletingUserId(userId)
    try {
      await deleteUserRecord(userId)
      setUsers(prev => prev.filter(user => user.id !== userId))
      applyUserChangeToProjects(userId, 'remove')
      setUserFormError(null)
    } catch (error) {
      console.error('Failed to delete user', error)
      setUserFormError(toErrorMessage(error, 'Failed to delete user.'))
    } finally {
      setDeletingUserId(null)
      if (editingUserId === userId) {
        cancelUserEdit()
      }
    }
  }

  async function saveCustomerDetails(
    customerId: string,
    updates: {
      name?: string
      contacts?: Array<{ id?: string; name?: string; position?: string; phone?: string; email?: string; siteId?: string }> | null
      sites?: Array<{ id?: string; name?: string; address?: string; notes?: string }> | null
      parentCustomerId?: string | null
    },
    errorMessage = 'Failed to update customer.',
  ) {
    try {
      const saved = await updateCustomerRecord(customerId, updates)
      setDb(prev => prev.map(c => (c.id === saved.id ? saved : c)))
      setActionError(null)
      return saved
    } catch (error) {
      console.error(errorMessage, error)
      const message = toErrorMessage(error, errorMessage)
      setActionError(message)
      throw new Error(message)
    }
  }

  async function deleteCustomer(customerId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete customers.')
      return
    }
    const shouldClearProject = selectedProjectId
      ? db.some(c => c.id === customerId && c.projects.some(p => p.id === selectedProjectId))
      : false
    try {
      await deleteCustomerRecord(customerId)
      setDb(prev => prev.filter(c => c.id !== customerId))
      if (shouldClearProject) setSelectedProjectId(null)
      if (selectedCustomerId === customerId) setSelectedCustomerId(null)
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete customer', error)
      const message = toErrorMessage(error, 'Failed to delete customer.')
      setActionError(message)
    }
  }

  async function deleteProject(customerId: string, projectId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete projects.')
      return
    }
    try {
      await deleteProjectRecord(projectId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId ? c : { ...c, projects: c.projects.filter(p => p.id !== projectId) },
        ),
      )
      setSelectedProjectId(prev => (prev === projectId ? null : prev))
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete project', error)
      const message = toErrorMessage(error, 'Failed to delete project.')
      setActionError(message)
    }
  }

  async function deleteWO(customerId: string, projectId: string, woId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete work orders.')
      return
    }
    try {
      await deleteWORecord(woId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, wos: p.wos.filter(w => w.id !== woId) },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete work order', error)
      const message = toErrorMessage(error, 'Failed to delete work order.')
      setActionError(message)
    }
  }

  async function uploadProjectDocument(
    customerId: string,
    projectId: string,
    category: ProjectFileCategory,
    file: File,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to upload project documents.'
      setActionError(message)
      return message
    }
    if (!isAllowedProjectFile(file)) {
      return 'Upload a PDF, Word, or image file.'
    }
    if (file.size === 0) {
      return 'The selected file is empty.'
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const payload: ProjectFile = {
        id: createId(),
        name: file.name,
        type: file.type || guessMimeTypeFromName(file.name),
        dataUrl,
        uploadedAt: new Date().toISOString(),
      }

      const existingProject = db
        .find(customer => customer.id === customerId)
        ?.projects.find(project => project.id === projectId)
      if (!existingProject) {
        const message = 'Project not found.'
        setActionError(message)
        return message
      }

      const existingDocuments = existingProject.documents ?? {}
      const updatedFiles = [...(existingDocuments[category] ?? []), payload]

      await updateProjectRecord(projectId, { documents: { [category]: updatedFiles } })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p => {
                  if (p.id !== projectId) {
                    return p
                  }
                  const nextDocuments = { ...(p.documents ?? {}) }
                  nextDocuments[category] = updatedFiles
                  return { ...p, documents: nextDocuments }
                }),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to upload project document', error)
      const message = toErrorMessage(error, 'Failed to upload project document.')
      setActionError(message)
      return message
    }
  }

  async function removeProjectDocument(
    customerId: string,
    projectId: string,
    category: ProjectFileCategory,
    fileId: string,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to remove project documents.'
      setActionError(message)
      return message
    }

    try {
      const existingProject = db
        .find(customer => customer.id === customerId)
        ?.projects.find(project => project.id === projectId)
      if (!existingProject) {
        const message = 'Project not found.'
        setActionError(message)
        return message
      }

      const existingDocuments = existingProject.documents ?? {}
      const currentFiles = existingDocuments[category] ?? []
      if (!currentFiles.some(file => file.id === fileId)) {
        return 'File not found.'
      }

      const updatedFiles = currentFiles.filter(file => file.id !== fileId)
      await updateProjectRecord(projectId, {
        documents: { [category]: updatedFiles.length > 0 ? updatedFiles : null },
      })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p => {
                  if (p.id !== projectId) {
                    return p
                  }
                  const nextDocuments = { ...(p.documents ?? {}) }
                  const nextFiles = (nextDocuments[category] ?? []).filter(file => file.id !== fileId)
                  if (nextFiles.length > 0) {
                    nextDocuments[category] = nextFiles
                  } else {
                    delete nextDocuments[category]
                  }
                  const hasRemaining = PROJECT_FILE_CATEGORIES.some(key =>
                    (nextDocuments[key]?.length ?? 0) > 0,
                  )
                  return { ...p, documents: hasRemaining ? nextDocuments : undefined }
                }),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to remove project document', error)
      const message = toErrorMessage(error, 'Failed to remove project document.')
      setActionError(message)
      return message
    }
  }

  async function saveCustomerSignOff(
    customerId: string,
    projectId: string,
    signOffInput: ProjectCustomerSignOff,
    options: {
      nextStatus?: { status: ProjectStatus; activeSubStatus?: ProjectActiveSubStatus }
      changedBy?: string
    } = {},
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to record customer sign offs.'
      setActionError(message)
      return message
    }

    const customer = db.find(entry => entry.id === customerId)
    const existingProject = customer?.projects.find(project => project.id === projectId)

    if (!customer || !existingProject) {
      const message = 'Project not found.'
      setActionError(message)
      return message
    }

    const desiredStatus = options.nextStatus
    let statusUpdate: ReturnType<typeof buildStatusUpdate> | null = null

    const infoSnapshot = existingProject.info
      ? {
          ...existingProject.info,
          machines: existingProject.info.machines
            ? existingProject.info.machines.map(machine => ({
                machineSerialNumber: machine.machineSerialNumber,
                ...(machine.lineReference ? { lineReference: machine.lineReference } : {}),
                toolSerialNumbers: [...machine.toolSerialNumbers],
              }))
            : undefined,
        }
      : undefined

    const signOff: ProjectCustomerSignOff = {
      ...signOffInput,
      projectInfo: infoSnapshot,
    }

    if (desiredStatus) {
      const currentStatus = existingProject.status
      const currentStage =
        currentStatus === 'Active'
          ? existingProject.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
          : undefined
      const targetStatus = desiredStatus.status
      const targetStage =
        targetStatus === 'Active'
          ? desiredStatus.activeSubStatus ?? currentStage ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
          : undefined
      const isSameStatus = currentStatus === targetStatus
      const isSameStage = targetStatus === 'Active' ? currentStage === targetStage : true

      if (!isSameStatus || !isSameStage) {
        statusUpdate = buildStatusUpdate(
          existingProject,
          targetStatus,
          desiredStatus.activeSubStatus,
          options.changedBy,
        )
      }
    }

    setDb(prev =>
      prev.map(entry =>
        entry.id !== customerId
          ? entry
          : {
              ...entry,
              projects: entry.projects.map(project => {
                if (project.id !== projectId) {
                  return project
                }
                const base: Project = { ...project, customerSignOff: signOff }
                if (statusUpdate) {
                  return {
                    ...base,
                    status: statusUpdate.status,
                    activeSubStatus: statusUpdate.activeSubStatus,
                    statusHistory: statusUpdate.statusHistory,
                  }
                }
                return base
              }),
            },
      ),
    )

    const payload: Parameters<typeof updateProjectRecord>[1] = {
      customerSignOff: signOff,
    }
    if (statusUpdate) {
      payload.status = statusUpdate.status
      payload.activeSubStatus =
        statusUpdate.status === 'Active'
          ? statusUpdate.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
          : null
      payload.statusHistory = statusUpdate.statusHistory
    }

    try {
      await updateProjectRecord(projectId, payload)
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to save customer sign off', error)
      const message = toErrorMessage(error, 'Failed to save customer sign off.')
      setActionError(message)
      return message
    }
  }

  async function uploadCustomerSignOff(
    customerId: string,
    projectId: string,
    file: File,
  ): Promise<string | null> {
    if (!isAllowedProjectFile(file)) {
      return 'Upload a PDF, Word document, or image file.'
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const completedAt = new Date().toISOString()
      const filePayload: ProjectFile = {
        id: createId(),
        name: file.name,
        type: file.type || guessMimeTypeFromName(file.name),
        dataUrl,
        uploadedAt: completedAt,
      }
      const signOffPayload: ProjectCustomerSignOff = {
        id: createId(),
        type: 'upload',
        completedAt,
        file: filePayload,
      }
      return await saveCustomerSignOff(customerId, projectId, signOffPayload, {
        nextStatus: { status: 'Complete' },
      })
    } catch (error) {
      console.error('Failed to upload customer sign off', error)
      const message = toErrorMessage(error, 'Failed to upload customer sign off.')
      setActionError(message)
      return message
    }
  }

  async function generateCustomerSignOff(
    customerId: string,
    projectId: string,
    submission: CustomerSignOffSubmission,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to record customer sign offs.'
      setActionError(message)
      return message
    }

    const customer = db.find(entry => entry.id === customerId)
    const project = customer?.projects.find(entry => entry.id === projectId)
    if (!customer || !project) {
      const message = 'Project not found.'
      setActionError(message)
      return message
    }

    const completedAt = new Date().toISOString()

    try {
      const info = project.info
      const pdfDataUrl = await generateCustomerSignOffPdf({
        businessName: businessTitle,
        businessLogo: cloneBusinessLogo(businessSettings.logo),
        projectNumber: project.number,
        customerName: customer.name,
        machines: info?.machines,
        cobaltOrderNumber: info?.cobaltOrderNumber,
        customerOrderNumber: info?.customerOrderNumber,
        salespersonName: info?.salespersonName,
        startDate: info?.startDate,
        proposedCompletionDate: info?.proposedCompletionDate,
        signedByName: submission.name,
        signedByPosition: submission.position,
        decision: submission.decision,
        snags: submission.snags,
        signaturePaths: submission.signaturePaths,
        signatureDimensions: submission.signatureDimensions,
        completedAt,
      })

      const sanitizedNumber = stripPrefix(project.number, /^P[-\s]?(.+)$/i)
      const filePayload: ProjectFile = {
        id: createId(),
        name: `Customer-SignOff-${sanitizedNumber || project.number}.pdf`,
        type: 'application/pdf',
        dataUrl: pdfDataUrl,
        uploadedAt: completedAt,
      }

      const signOffPayload: ProjectCustomerSignOff = {
        id: createId(),
        type: 'generated',
        completedAt,
        file: filePayload,
        signedByName: submission.name,
        signedByPosition: submission.position,
        decision: submission.decision,
        snags: submission.snags.length > 0 ? submission.snags : undefined,
        signatureDataUrl: submission.signatureDataUrl,
      }

      const nextStatus =
        submission.decision === 'option1'
          ? { status: 'Complete' as ProjectStatus }
          : { status: 'Active' as ProjectStatus, activeSubStatus: 'Install (Snagging)' as ProjectActiveSubStatus }

      return await saveCustomerSignOff(customerId, projectId, signOffPayload, {
        nextStatus,
      })
    } catch (error) {
      console.error('Failed to generate customer sign off', error)
      const message = toErrorMessage(error, 'Failed to generate customer sign off.')
      setActionError(message)
      return message
    }
  }

  async function createOnsiteReport(
    customerId: string,
    projectId: string,
    submission: OnsiteReportSubmission,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create onsite reports.'
      setActionError(message)
      return message
    }

    const customer = db.find(entry => entry.id === customerId)
    const project = customer?.projects.find(entry => entry.id === projectId)
    if (!customer || !project) {
      const message = 'Project not found.'
      setActionError(message)
      return message
    }

    const reportDate = submission.reportDate?.trim()
    if (!reportDate) {
      return 'Select the report date.'
    }

    const engineerName = submission.engineerName.trim()
    if (!engineerName) {
      return 'Enter the engineer name.'
    }

    const workSummary = submission.workSummary.trim()
    if (!workSummary) {
      return 'Enter the work summary.'
    }

    const signedByName = submission.signedByName.trim()
    if (!signedByName) {
      return 'Enter the customer name.'
    }

    if (submission.signaturePaths.length === 0) {
      return 'Capture a signature to continue.'
    }

    const createdAt = new Date().toISOString()

    try {
      const pdfDataUrl = await generateOnsiteReportPdf({
        businessName: businessTitle,
        businessLogo: cloneBusinessLogo(businessSettings.logo),
        projectNumber: project.number,
        customerName: customer.name,
        siteAddress: submission.siteAddress,
        reportDate,
        arrivalTime: submission.arrivalTime,
        departureTime: submission.departureTime,
        engineerName,
        customerContact: submission.customerContact,
        workSummary,
        materialsUsed: submission.materialsUsed,
        additionalNotes: submission.additionalNotes,
        signedByName,
        signedByPosition: submission.signedByPosition,
        signaturePaths: submission.signaturePaths,
        signatureDimensions: submission.signatureDimensions,
        createdAt,
      })

      const report: ProjectOnsiteReport = {
        id: createId(),
        reportDate,
        arrivalTime: submission.arrivalTime?.trim() || undefined,
        departureTime: submission.departureTime?.trim() || undefined,
        engineerName,
        customerContact: submission.customerContact?.trim() || undefined,
        siteAddress: submission.siteAddress?.trim() || undefined,
        workSummary,
        materialsUsed: submission.materialsUsed?.trim() || undefined,
        additionalNotes: submission.additionalNotes?.trim() || undefined,
        signedByName,
        signedByPosition: submission.signedByPosition?.trim() || undefined,
        signatureDataUrl: submission.signatureDataUrl,
        pdfDataUrl,
        createdAt,
      }

      const existingReports = project.onsiteReports ?? []
      const nextReports = [...existingReports, report]

      setDb(prev =>
        prev.map(entry =>
          entry.id !== customerId
            ? entry
            : {
                ...entry,
                projects: entry.projects.map(projectEntry =>
                  projectEntry.id !== projectId
                    ? projectEntry
                    : {
                        ...projectEntry,
                        onsiteReports: nextReports,
                      },
                ),
              },
        ),
      )

      try {
        await updateProjectRecord(projectId, { onsiteReports: nextReports })
        setActionError(null)
        return null
      } catch (error) {
        console.error('Failed to save onsite report', error)
        const message = toErrorMessage(error, 'Failed to save onsite report.')
        setActionError(message)
        return message
      }
    } catch (error) {
      console.error('Failed to generate onsite report', error)
      const message = toErrorMessage(error, 'Failed to generate onsite report.')
      setActionError(message)
      return message
    }
  }

  async function deleteOnsiteReport(
    customerId: string,
    projectId: string,
    reportId: string,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to remove onsite reports.'
      setActionError(message)
      return message
    }

    const customer = db.find(entry => entry.id === customerId)
    const project = customer?.projects.find(entry => entry.id === projectId)
    if (!customer || !project) {
      const message = 'Project not found.'
      setActionError(message)
      return message
    }

    const existingReports = project.onsiteReports ?? []
    if (!existingReports.some(report => report.id === reportId)) {
      return 'Onsite report not found.'
    }

    const nextReports = existingReports.filter(report => report.id !== reportId)

    setDb(prev =>
      prev.map(entry =>
        entry.id !== customerId
          ? entry
          : {
              ...entry,
              projects: entry.projects.map(projectEntry =>
                projectEntry.id !== projectId
                  ? projectEntry
                  : {
                      ...projectEntry,
                      onsiteReports: nextReports,
                    },
              ),
            },
      ),
    )

    try {
      await updateProjectRecord(projectId, { onsiteReports: nextReports })
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to remove onsite report', error)
      const message = toErrorMessage(error, 'Failed to remove onsite report.')
      setActionError(message)
      return message
    }
  }

  async function removeCustomerSignOff(
    customerId: string,
    projectId: string,
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to remove customer sign offs.'
      setActionError(message)
      return message
    }

    const existingProject = db
      .find(customer => customer.id === customerId)
      ?.projects.find(project => project.id === projectId)

    if (!existingProject) {
      const message = 'Project not found.'
      setActionError(message)
      return message
    }

    if (!existingProject.customerSignOff) {
      return 'Customer sign off not found.'
    }

    try {
      await updateProjectRecord(projectId, { customerSignOff: null })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, customerSignOff: undefined },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to remove customer sign off', error)
      const message = toErrorMessage(error, 'Failed to remove customer sign off.')
      setActionError(message)
      return message
    }
  }

  async function addContact(
    customer: Customer,
    data: { name: string; position: string; phone: string; email: string; siteId: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to update contacts.'
      setActionError(message)
      return message
    }
    const name = data.name.trim()
    const position = data.position.trim()
    const phone = data.phone.trim()
    const email = data.email.trim()
    const siteId = data.siteId.trim()
    const validSiteId =
      siteId && customer.sites.some(site => site.id === siteId)
        ? siteId
        : ''
    if (!name && !position && !phone && !email) {
      return 'Enter at least one detail for the contact.'
    }

    const payload = [
      ...customer.contacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
        siteId: contact.siteId,
      })),
      {
        name: name || undefined,
        position: position || undefined,
        phone: phone || undefined,
        email: email || undefined,
        siteId: validSiteId || undefined,
      },
    ]

    try {
      const saved = await saveCustomerDetails(customer.id, { contacts: payload }, 'Failed to add contact.')
      const createdContact = saved.contacts.find(contact => !customer.contacts.some(existing => existing.id === contact.id))
      const nextActive = createdContact ?? saved.contacts[0]
      if (nextActive) {
        const targetKeys: CustomerSiteTabKey[] = []
        if (nextActive.siteId) {
          targetKeys.push(nextActive.siteId)
        } else {
          targetKeys.push(UNASSIGNED_SITE_TAB_KEY)
        }
        setActiveContactIdsByTab(prev => {
          const next = { ...prev }
          for (const key of targetKeys) {
            next[key] = nextActive.id
          }
          return next
        })
      }
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to add contact.'
    }
  }

  async function updateContactDetails(
    customer: Customer,
    contactId: string,
    details: { name: string; position: string; phone: string; email: string; siteId: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to update contacts.'
      setActionError(message)
      return message
    }

    const name = details.name.trim()
    const position = details.position.trim()
    const phone = details.phone.trim()
    const email = details.email.trim()
    const siteId = details.siteId.trim()
    const validSiteId =
      siteId && customer.sites.some(site => site.id === siteId)
        ? siteId
        : ''

    if (!name && !position && !phone && !email) {
      return 'Enter at least one detail for the contact.'
    }

    const payload = customer.contacts.map(contact =>
      contact.id !== contactId
        ? {
            id: contact.id,
            name: contact.name,
            position: contact.position,
            phone: contact.phone,
            email: contact.email,
            siteId: contact.siteId,
          }
        : {
            id: contact.id,
            name: name || undefined,
            position: position || undefined,
            phone: phone || undefined,
            email: email || undefined,
            siteId: validSiteId || undefined,
          },
    )

    try {
      await saveCustomerDetails(customer.id, { contacts: payload }, 'Failed to update contact.')
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to update contact.'
    }
  }

  async function removeContact(customer: Customer, contactId: string) {
    if (!canEdit) {
      setActionError('Not authorized to update contacts.')
      return
    }

    const payload = customer.contacts
      .filter(contact => contact.id !== contactId)
      .map(contact => ({
        id: contact.id,
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
        siteId: contact.siteId,
      }))

    try {
      await saveCustomerDetails(customer.id, { contacts: payload }, 'Failed to remove contact.')
      if (contactEditor?.customerId === customer.id && contactEditor.contactId === contactId) {
        closeContactEditor()
      }
    } catch {
      // error handled in saveCustomerDetails
    }
  }

  function closeMachineEditor() {
    setMachineEditor(null)
    setMachineEditorError(null)
    setIsSavingMachineEditor(false)
  }

  async function handleSaveMachineEditor() {
    if (!machineEditor) {
      return
    }
    const customer = db.find(entry => entry.id === machineEditor.customerId)
    if (!customer) {
      setMachineEditorError('Selected customer no longer exists.')
      return
    }
    const project = customer.projects.find(entry => entry.id === machineEditor.projectId)
    if (!project) {
      setMachineEditorError('Selected project no longer exists.')
      return
    }

    const serial = machineEditor.machineSerialNumber.trim()
    if (!serial) {
      setMachineEditorError('Enter a machine serial number.')
      return
    }

    const normalizedSerial = serial.toLowerCase()
    const existingMachines = project.info?.machines ?? []
    const hasConflict = existingMachines.some((machine, index) => {
      if (machineEditor.mode === 'edit' && index === machineEditor.machineIndex) {
        return false
      }
      return machine.machineSerialNumber.trim().toLowerCase() === normalizedSerial
    })
    if (hasConflict) {
      setMachineEditorError('Machine serial numbers must be unique within the project.')
      return
    }

    const normalizedTools: string[] = []
    const seenTools = new Set<string>()
    for (const tool of machineEditor.toolSerialNumbers) {
      const trimmed = tool.trim()
      if (!trimmed) {
        continue
      }
      const normalizedTool = trimmed.toLowerCase()
      if (seenTools.has(normalizedTool)) {
        continue
      }
      seenTools.add(normalizedTool)
      normalizedTools.push(trimmed)
    }

    const clonedMachines = existingMachines.map(machine => ({
      machineSerialNumber: machine.machineSerialNumber,
      ...(machine.lineReference ? { lineReference: machine.lineReference } : {}),
      toolSerialNumbers: [...machine.toolSerialNumbers],
    }))

    if (machineEditor.mode === 'edit') {
      const index = machineEditor.machineIndex ?? -1
      if (index < 0 || index >= clonedMachines.length) {
        setMachineEditorError('Selected machine no longer exists.')
        return
      }
      clonedMachines[index] = {
        machineSerialNumber: serial,
        ...(machineEditor.lineReference.trim()
          ? { lineReference: machineEditor.lineReference.trim() }
          : {}),
        toolSerialNumbers: normalizedTools,
      }
    } else {
      clonedMachines.push({
        machineSerialNumber: serial,
        ...(machineEditor.lineReference.trim()
          ? { lineReference: machineEditor.lineReference.trim() }
          : {}),
        toolSerialNumbers: normalizedTools,
      })
    }

    const existingInfo = project.info ?? undefined
    const info: ProjectInfo = existingInfo ? { ...existingInfo } : {}
    info.machines = clonedMachines

    setIsSavingMachineEditor(true)
    try {
      updateProjectInfo(customer.id, project.id, info)
      setMachineEditor(null)
      setMachineEditorError(null)
    } finally {
      setIsSavingMachineEditor(false)
    }
  }

  async function handleSaveCustomerEditor() {
    if (!selectedCustomer) {
      return
    }
    if (!canEdit) {
      setCustomerEditorError('You have read-only access.')
      return
    }
    const trimmedName = customerEditorDraft.name.trim()
    if (!trimmedName) {
      setCustomerEditorError('Customer name is required.')
      return
    }
    if (customerNameExists(trimmedName, selectedCustomer.id)) {
      setCustomerEditorError('A customer with this name already exists.')
      return
    }

    const sitePayload = customerEditorDraft.sites
      .map(site => {
        const name = site.name.trim()
        const address = site.address.trim()
        const notes = site.notes.trim()
        if (!name && !address && !notes) {
          return null
        }
        return {
          id: site.id,
          name: name || undefined,
          address: address || undefined,
          notes: notes || undefined,
        }
      })
      .filter((site): site is NonNullable<typeof site> => site !== null)

    if (sitePayload.length === 0) {
      setCustomerEditorError('Add at least one site before saving.')
      return
    }
    const hasAddress = sitePayload.some(site => typeof site.address === 'string' && site.address.trim())
    if (!hasAddress) {
      setCustomerEditorError('Enter an address for at least one site.')
      return
    }

    const parentCustomerId = customerEditorDraft.parentCustomerId.trim()

    setIsSavingCustomerEditor(true)
    setCustomerEditorError(null)
    try {
      await saveCustomerDetails(selectedCustomer.id, {
        name: trimmedName,
        sites: sitePayload,
        parentCustomerId: parentCustomerId && parentCustomerId !== selectedCustomer.id
          ? parentCustomerId
          : null,
      })
      setShowCustomerEditor(false)
    } catch (error) {
      setCustomerEditorError(error instanceof Error ? error.message : 'Failed to update customer.')
    } finally {
      setIsSavingCustomerEditor(false)
    }
  }

  async function handleSaveContactEdit() {
    if (!contactEditor) {
      return
    }

    const { customerId, contactId, name, position, phone, email, siteId } = contactEditor
    const customer = db.find(c => c.id === customerId)
    if (!customer) {
      setContactEditorError('Selected contact no longer exists.')
      return
    }

    setIsSavingContactEdit(true)
    setContactEditorError(null)
    try {
      const result = await updateContactDetails(customer, contactId, {
        name,
        position,
        phone,
        email,
        siteId,
      })
      if (result) {
        setContactEditorError(result)
        return
      }
      closeContactEditor()
    } finally {
      setIsSavingContactEdit(false)
    }
  }

  function updateProjectNote(customerId: string, projectId: string, note: string) {
    if (!canEdit) {
      setActionError('Not authorized to update project notes.')
      return
    }
    const trimmed = note.trim()
    setDb(prev =>
      prev.map(c =>
        c.id !== customerId
          ? c
          : {
              ...c,
              projects: c.projects.map(p =>
                p.id !== projectId ? p : { ...p, note: trimmed ? note : undefined },
              ),
            },
      ),
    )
    void (async () => {
      try {
        await updateProjectRecord(projectId, { note: trimmed ? note : null })
        setActionError(null)
      } catch (error) {
        console.error('Failed to update project note', error)
        const message = toErrorMessage(error, 'Failed to update project note.')
        setActionError(message)
      }
    })()
  }

  function updateProjectInfo(customerId: string, projectId: string, info: ProjectInfo | null) {
    if (!canEdit) {
      setActionError('Not authorized to update project information.')
      return
    }

    setDb(prev =>
      prev.map(c =>
        c.id !== customerId
          ? c
          : {
              ...c,
              projects: c.projects.map(p =>
                p.id !== projectId ? p : { ...p, info: info ?? undefined },
              ),
            },
      ),
    )

    void (async () => {
      try {
        await updateProjectRecord(projectId, { info })
        setActionError(null)
      } catch (error) {
        console.error('Failed to update project information', error)
        const message = toErrorMessage(error, 'Failed to update project information.')
        setActionError(message)
      }
    })()
  }

  function updateProjectSite(customerId: string, projectId: string, siteId: string | null) {
    if (!canEdit) {
      setActionError('Not authorized to update project information.')
      return
    }

    setDb(prev =>
      prev.map(c =>
        c.id !== customerId
          ? c
          : {
              ...c,
              projects: c.projects.map(p =>
                p.id !== projectId ? p : { ...p, siteId: siteId ?? undefined },
              ),
            },
      ),
    )

    void (async () => {
      try {
        await updateProjectRecord(projectId, { siteId: siteId ?? null })
        setActionError(null)
      } catch (error) {
        console.error('Failed to update project site', error)
        const message = toErrorMessage(error, 'Failed to update project site.')
        setActionError(message)
      }
    })()
  }

  function buildStatusUpdate(
    project: Project,
    status: ProjectStatus,
    activeSubStatus?: ProjectActiveSubStatus,
    changedBy?: string,
  ) {
    const normalizedActiveSubStatus =
      status === 'Active'
        ? activeSubStatus ?? project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        : undefined

    const entry: ProjectStatusLogEntry = {
      id: createId(),
      status,
      activeSubStatus: status === 'Active' ? normalizedActiveSubStatus : undefined,
      changedAt: new Date().toISOString(),
      changedBy: changedBy?.trim() || currentUserName,
    }

    const history = [...(project.statusHistory ?? []), entry]

    return {
      status,
      activeSubStatus: entry.activeSubStatus,
      statusHistory: history,
    }
  }

  function updateProjectStatus(
    customerId: string,
    projectId: string,
    status: ProjectStatus,
    activeSubStatus?: ProjectActiveSubStatus,
    context?: { changedBy?: string },
  ) {
    if (!canEdit) {
      setActionError('Not authorized to update project status.')
      return
    }

    const existingProject = db
      .find(customer => customer.id === customerId)
      ?.projects.find(project => project.id === projectId)

    if (!existingProject) {
      setActionError('Project not found.')
      return
    }

    const statusUpdate = buildStatusUpdate(existingProject, status, activeSubStatus, context?.changedBy)

    setDb(prev =>
      prev.map(c =>
        c.id !== customerId
          ? c
          : {
              ...c,
              projects: c.projects.map(p =>
                p.id !== projectId
                  ? p
                  : {
                      ...p,
                      status: statusUpdate.status,
                      activeSubStatus: statusUpdate.activeSubStatus,
                      statusHistory: statusUpdate.statusHistory,
                    },
              ),
            },
      ),
    )

    void (async () => {
      try {
        await updateProjectRecord(projectId, {
          status: statusUpdate.status,
          activeSubStatus:
            statusUpdate.status === 'Active'
              ? statusUpdate.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
              : null,
          statusHistory: statusUpdate.statusHistory,
        })
        setActionError(null)
      } catch (error) {
        console.error('Failed to update project status', error)
        const message = toErrorMessage(error, 'Failed to update project status.')
        setActionError(message)
      }
    })()
  }

  async function addTask(
    customerId: string,
    projectId: string,
    data: { name: string; start: string; end: string; assigneeId?: string; status: ProjectTaskStatus },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create tasks.'
      setActionError(message)
      return message
    }
    const trimmedName = data.name.trim()
    if (!trimmedName) {
      return 'Enter a task name.'
    }
    const startMs = Date.parse(data.start)
    if (Number.isNaN(startMs)) {
      return 'Enter a valid start date and time.'
    }
    const endMs = Date.parse(data.end)
    if (Number.isNaN(endMs)) {
      return 'Enter a valid end date and time.'
    }
    if (endMs < startMs) {
      return 'The end time must be after the start time.'
    }

    const assigneeId = data.assigneeId?.trim()
    let assigneeName: string | undefined
    if (assigneeId) {
      const user = users.find(entry => entry.id === assigneeId)
      if (!user) {
        return 'Select a valid assignee.'
      }
      assigneeName = user.name
    }

    try {
      const createdTask = await createTaskRecord(projectId, {
        name: trimmedName,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        assigneeId: assigneeId || undefined,
        assigneeName,
        status: data.status,
      })

      setDb(prev =>
        prev.map(customer =>
          customer.id !== customerId
            ? customer
            : {
                ...customer,
                projects: customer.projects.map(project =>
                  project.id !== projectId
                    ? project
                    : {
                        ...project,
                        tasks: sortTasksForUi([...(project.tasks ?? []), createdTask]),
                      },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to create task', error)
      const message = toErrorMessage(error, 'Failed to create task.')
      setActionError(message)
      return message
    }
  }

  async function updateTask(
    customerId: string,
    projectId: string,
    taskId: string,
    updates: {
      name?: string
      start?: string
      end?: string
      assigneeId?: string
      assigneeName?: string
      status?: ProjectTaskStatus
    },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to update tasks.'
      setActionError(message)
      return message
    }

    const customer = db.find(entry => entry.id === customerId)
    const project = customer?.projects.find(entry => entry.id === projectId)
    const existingTask = project?.tasks?.find(entry => entry.id === taskId)

    if (!customer || !project || !existingTask) {
      const message = 'Task not found.'
      setActionError(message)
      return message
    }

    const nextName = updates.name !== undefined ? updates.name.trim() : existingTask.name
    if (!nextName) {
      return 'Enter a task name.'
    }

    const nextStartSource = updates.start ?? existingTask.start
    const nextEndSource = updates.end ?? existingTask.end
    if (!nextStartSource) {
      return 'Enter a start date and time.'
    }
    if (!nextEndSource) {
      return 'Enter an end date and time.'
    }

    const startMs = Date.parse(nextStartSource)
    if (Number.isNaN(startMs)) {
      return 'Enter a valid start date and time.'
    }
    const endMs = Date.parse(nextEndSource)
    if (Number.isNaN(endMs)) {
      return 'Enter a valid end date and time.'
    }
    if (endMs < startMs) {
      return 'The end time must be after the start time.'
    }

    let nextAssigneeId = existingTask.assigneeId
    let nextAssigneeName = existingTask.assigneeName

    if (updates.assigneeId !== undefined) {
      const trimmedId = updates.assigneeId?.trim()
      if (trimmedId) {
        const user = users.find(entry => entry.id === trimmedId)
        if (!user) {
          return 'Select a valid assignee.'
        }
        nextAssigneeId = trimmedId
        nextAssigneeName = user.name
      } else {
        nextAssigneeId = undefined
        nextAssigneeName = undefined
      }
    } else if (updates.assigneeName !== undefined) {
      const trimmedName = updates.assigneeName?.trim()
      if (!trimmedName) {
        nextAssigneeId = undefined
        nextAssigneeName = undefined
      } else {
        const user = users.find(
          entry => entry.name.trim().toLowerCase() === trimmedName.toLowerCase(),
        )
        if (!user) {
          return 'Select a valid assignee.'
        }
        nextAssigneeId = user.id
        nextAssigneeName = user.name
      }
    }

    const nextStatus = updates.status ?? existingTask.status

    try {
      const updatedTask = await updateTaskRecord(projectId, taskId, {
        name: nextName,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        assigneeId: nextAssigneeId ?? null,
        assigneeName: nextAssigneeName ?? null,
        status: nextStatus,
      })

      setDb(prev =>
        prev.map(entry =>
          entry.id !== customerId
            ? entry
            : {
                ...entry,
                projects: entry.projects.map(projectEntry =>
                  projectEntry.id !== projectId
                    ? projectEntry
                    : {
                        ...projectEntry,
                        tasks: sortTasksForUi(
                          (projectEntry.tasks ?? []).map(task => (task.id === taskId ? updatedTask : task)),
                        ),
                      },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to update task', error)
      const message = toErrorMessage(error, 'Failed to update task.')
      setActionError(message)
      return message
    }
  }

  async function deleteTask(customerId: string, projectId: string, taskId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete tasks.')
      return
    }

    try {
      await deleteTaskRecord(projectId, taskId)
      setDb(prev =>
        prev.map(entry =>
          entry.id !== customerId
            ? entry
            : {
                ...entry,
                projects: entry.projects.map(projectEntry =>
                  projectEntry.id !== projectId
                    ? projectEntry
                    : {
                        ...projectEntry,
                        tasks: sortTasksForUi((projectEntry.tasks ?? []).filter(task => task.id !== taskId)),
                      },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete task', error)
      const message = toErrorMessage(error, 'Failed to delete task.')
      setActionError(message)
    }
  }

  async function addWO(
    customerId: string,
    projectId: string,
    data: { number: string; type: WOType; note?: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create work orders.'
      setActionError(message)
      return message
    }
    const trimmed = data.number.trim()
    if (!trimmed) return 'Enter a work order number.'
    const normalized = trimmed.toUpperCase()
    const finalNumber = normalized.startsWith('WO') ? normalized : `WO${normalized}`
    if (woNumberExists(finalNumber)) return 'A work order with this number already exists.'
    const note = data.note?.trim()
    try {
      const newWO = await createWORecord(projectId, { number: finalNumber, type: data.type, note })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, wos: [...p.wos, newWO] },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to create work order', error)
      const message = toErrorMessage(error, 'Failed to create work order.')
      setActionError(message)
      return message
    }
  }

  async function addProject(
    customerId: string,
    data: {
      number: string
      info?: ProjectInfo | null
      tasks?: Array<{ name: string; status?: ProjectTaskStatus; assigneeId?: string }>
      siteId?: string | undefined
      linkedSubCustomerId?: string | undefined
      linkedSubCustomerSiteId?: string | undefined
    },
  ): Promise<{ projectId: string; customerId: string } | string> {
    if (!canEdit) {
      const message = 'Not authorized to create projects.'
      setActionError(message)
      return message
    }
    const trimmed = data.number.trim()
    if (!trimmed) return 'Enter a project number.'
    const normalized = trimmed.toUpperCase()
    const finalNumber = normalized.startsWith('P') ? normalized : `P${normalized}`
    if (projectNumberExists(finalNumber)) return 'A project with this number already exists.'
    const projectCustomer = db.find(c => c.id === customerId) ?? null
    const validSiteId =
      data.siteId && projectCustomer?.sites.some(site => site.id === data.siteId)
        ? data.siteId
        : undefined
    let validLinkedSubCustomerId: string | undefined
    let validLinkedSubCustomerSiteId: string | undefined
    if (data.linkedSubCustomerId) {
      const candidate = data.linkedSubCustomerId.trim()
      if (candidate) {
        const subCustomer = db.find(customer => customer.id === candidate && customer.parentCustomerId === customerId)
        if (subCustomer) {
          validLinkedSubCustomerId = subCustomer.id
          if (data.linkedSubCustomerSiteId) {
            const siteCandidate = data.linkedSubCustomerSiteId.trim()
            if (siteCandidate && subCustomer.sites.some(site => site.id === siteCandidate)) {
              validLinkedSubCustomerSiteId = siteCandidate
            }
          }
        }
      }
    }
    try {
      const project = await createProjectRecord(customerId, {
        number: finalNumber,
        info: data.info ?? null,
        tasks: data.tasks,
        siteId: validSiteId ?? null,
        linkedSubCustomerId: validLinkedSubCustomerId ?? null,
        linkedSubCustomerSiteId: validLinkedSubCustomerSiteId ?? null,
      })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId ? c : { ...c, projects: [...c.projects, project] },
        ),
      )
      setActionError(null)
      return { projectId: project.id, customerId }
    } catch (error) {
      console.error('Failed to create project', error)
      const message = toErrorMessage(error, 'Failed to create project.')
      setActionError(message)
      return message
    }
  }

  async function createCustomer(
    data: {
      name: string
      contacts?: Array<{ name?: string; position?: string; phone?: string; email?: string; siteId?: string }>
      sites?: Array<{ id: string; name?: string; address?: string; notes?: string }>
      parentCustomerId?: string
    },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create customers.'
      setActionError(message)
      return message
    }
    const trimmedName = data.name.trim()
    if (!trimmedName) return 'Customer name is required.'
    if (customerNameExists(trimmedName)) return 'A customer with this name already exists.'
    const contactsPayload = (data.contacts ?? [])
      .map(contact => ({
        name: contact.name?.trim() || undefined,
        position: contact.position?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
        email: contact.email?.trim() || undefined,
        siteId: contact.siteId?.trim() || undefined,
      }))
      .filter(contact => contact.name || contact.position || contact.phone || contact.email)
    const payload = {
      name: trimmedName,
      contacts: contactsPayload,
      sites: data.sites,
      parentCustomerId: data.parentCustomerId?.trim() || undefined,
    }
    try {
      const customer = await createCustomerRecord(payload)
      setDb(prev => [customer, ...prev])
      setSelectedCustomerId(customer.id)
      setActivePage('customerDetail')
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to create customer', error)
      const message = toErrorMessage(error, 'Failed to create customer.')
      setActionError(message)
      return message
    }
  }

  function ContactInfoField({
    label,
    value,
    placeholder = 'Not provided',
    copyTitle,
    linkType,
  }: {
    label: string
    value?: string
    placeholder?: string
    copyTitle: string
    linkType?: 'phone' | 'email'
  }) {
    const display = value?.trim()
    const hasValue = !!display
    let linkHref: string | null = null
    if (hasValue && display) {
      if (linkType === 'phone') {
        const cleaned = display.replace(/[\s()-]/g, '')
        if (cleaned) {
          linkHref = `tel:${cleaned}`
        }
      } else if (linkType === 'email') {
        linkHref = `mailto:${encodeURIComponent(display)}`
      }
    }
    return (
      <div className='rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm'>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{label}</span>
          <span
            className={`flex-1 text-sm ${
              hasValue ? (linkHref ? '' : 'text-slate-800') : 'text-slate-400'
            }`}
          >
            {hasValue ? (
              linkHref ? (
                <a href={linkHref} className='text-sky-600 hover:underline'>
                  {display}
                </a>
              ) : (
                display
              )
            ) : (
              placeholder
            )}
          </span>
          {hasValue ? (
            <Button
              variant='outline'
              onClick={() => value && navigator.clipboard.writeText(value)}
              title={copyTitle}
            >
              <Copy size={16} />
              <span className='sr-only'>{copyTitle}</span>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
        <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center text-slate-600'>
          <span className='h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500' aria-hidden />
          <p className='text-sm font-medium text-slate-500'>Loading customers…</p>
        </div>
      </div>
    )
  }

  const resolvedPage: 'home' | 'myTasks' | 'customers' | 'projects' | 'settings' =
    activePage === 'customerDetail'
      ? 'customers'
      : activePage === 'projectDetail'
      ? 'projects'
      : activePage

  const sidebarContent =
    resolvedPage === 'home'
      ? renderHomeSidebar()
      : resolvedPage === 'myTasks'
      ? renderMyTasksSidebar()
      : resolvedPage === 'customers'
      ? renderCustomersSidebar()
      : resolvedPage === 'projects'
      ? renderProjectsSidebar()
      : renderSettingsSidebar()

  const handleNavigate = (page: 'home' | 'myTasks' | 'customers' | 'projects' | 'settings') => {
    setIsSidebarOpen(false)
    if (page === 'projects') {
      setSelectedProjectId(null)
      setActivePage('projects')
    } else if (page === 'customers') {
      setActivePage('customers')
    } else if (page === 'settings') {
      setActivePage('settings')
    } else if (page === 'myTasks') {
      setSelectedProjectId(null)
      setActivePage('myTasks')
    } else {
      setActivePage(page)
    }
    if (page !== 'projects') {
      setShowNewProject(false)
      setNewProjectNumber('')
      setNewProjectError(null)
      setIsCreatingProject(false)
      setNewProjectInfoDraft(createProjectInfoDraft(undefined, users, computeProjectDateDefaults(businessSettings)))
      setNewProjectTaskSelections(createDefaultTaskSelectionMap())
    }
    if (page !== 'customers') {
      setShowNewCustomer(false)
      setNewCustomerError(null)
      setIsCreatingCustomer(false)
    }
  }

  const businessTitle = businessSettings.businessName.trim() || 'CustomerProjectDB'

  const pageHeading =
    activePage === 'home'
      ? 'Workspace Overview'
      : activePage === 'myTasks'
      ? 'My Tasks'
      : activePage === 'customers'
      ? 'Customer Records'
      : activePage === 'customerDetail'
      ? 'Customer Details'
      : activePage === 'projects'
      ? 'Projects'
      : activePage === 'settings'
      ? 'Workspace Settings'
      : 'Project Overview'

  const pageDescription =
    activePage === 'home'
      ? 'High-level metrics for your customers and projects.'
      : activePage === 'myTasks'
      ? 'Track and review tasks assigned to you across active projects.'
      : activePage === 'customers'
      ? 'Select a customer from the index to review their details and contacts.'
      : activePage === 'customerDetail'
      ? 'Review contacts, addresses, and linked projects for the selected customer.'
      : activePage === 'projects'
      ? 'Choose a project from the index to manage its lifecycle and documents.'
      : activePage === 'settings'
      ? 'Export a backup or import data into this workspace.'
      : 'Manage documents, work orders, and final acceptance for this project.'

  const navigationItems: Array<{ page: 'home' | 'myTasks' | 'customers' | 'projects' | 'settings'; label: string }> = [
    { page: 'home', label: 'Home' },
    { page: 'myTasks', label: 'My Tasks' },
    { page: 'customers', label: 'Customers' },
    { page: 'projects', label: 'Projects' },
    { page: 'settings', label: 'Settings' },
  ]

  const sidebarPanels = (
    <>
      <Card className='panel'>
        <CardHeader>
          <div className='flex flex-col items-center text-center'>
            {businessSettings.logo ? (
              <div className='mb-3 flex justify-center'>
                <img
                  src={businessSettings.logo.dataUrl}
                  alt={`${businessTitle} logo`}
                  className='mx-auto max-h-20 w-auto max-w-[200px] object-contain'
                />
              </div>
            ) : null}
            <h1 className='text-2xl font-semibold tracking-tight text-slate-900'>{businessTitle}</h1>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='relative'>
              <Label htmlFor='global-search' className='sr-only'>Search</Label>
              <Search size={16} className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
              <Input
                id='global-search'
                value={globalSearchQuery}
                onChange={(event) => setGlobalSearchQuery((event.target as HTMLInputElement).value)}
                onKeyDown={handleGlobalSearchKeyDown}
                placeholder='Search…'
                autoComplete='off'
                className='pl-9 pr-10'
              />
              {hasGlobalSearch && (
                <button
                  type='button'
                  onClick={handleClearGlobalSearch}
                  className='absolute inset-y-0 right-2 flex items-center rounded-full p-1 text-slate-400 transition hover:text-slate-600'
                >
                  <X size={14} />
                  <span className='sr-only'>Clear search</span>
                </button>
              )}
              {hasGlobalSearch && (
                <div className='absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 text-sm shadow-xl backdrop-blur'>
                  {globalMatches.length === 0 ? (
                    <div className='px-2 py-4 text-slate-500'>No matches found.</div>
                  ) : (
                    <ul className='space-y-1'>
                      {globalMatches.map(match => (
                        <li key={match.id}>
                          <button
                            type='button'
                            onClick={() => handleSelectGlobalMatch(match)}
                            className='flex w-full flex-col items-start gap-1 rounded-xl px-3 py-2 text-left transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'
                          >
                            <div className='flex w-full items-center justify-between gap-2'>
                              <span className='text-sm font-semibold text-slate-800'>{match.title}</span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  match.kind === 'customer'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {match.kind === 'customer' ? 'Customer' : 'Project'}
                              </span>
                            </div>
                            {match.kind === 'project' ? (
                              <>
                                <span className='text-xs text-slate-500'>{match.subtitle}</span>
                                <span className='text-xs font-medium text-slate-500'>{match.statusLabel}</span>
                              </>
                            ) : match.subtitle ? (
                              <span className='text-xs text-slate-500'>{match.subtitle}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <nav className='flex flex-col gap-1'>
              {navigationItems.map(item => {
                const isActive = resolvedPage === item.page
                return (
                  <button
                    key={item.page}
                    type='button'
                    onClick={() => handleNavigate(item.page)}
                    className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-900 text-white shadow'
                        : 'text-slate-600 hover:bg-white hover:text-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive ? <ChevronRight size={16} className='text-white/80' /> : null}
                  </button>
                )
              })}
            </nav>
          </div>
        </CardContent>
      </Card>
      {sidebarContent}
    </>
  )

  return (
    <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
      <div className='flex w-full gap-6'>
        <div className='hidden w-72 shrink-0 md:block'>
          <div className='sticky top-6 flex flex-col gap-6'>{sidebarPanels}</div>
        </div>

        <main className='min-w-0 flex-1'>
          <div className='mb-4 flex items-center md:hidden'>
            <Button
              variant='outline'
              onClick={() => setIsSidebarOpen(true)}
              className='gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm'
              title='Open navigation menu'
            >
              <Menu size={18} />
              <span>Menu</span>
            </Button>
          </div>

          {loadError && (
            <div className='mb-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
              <span>{loadError}</span>
              <Button variant='outline' onClick={() => void refreshCustomers()} disabled={isSyncing}>
                Retry
              </Button>
            </div>
          )}

          <div className='mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div>
              <h2 className='text-2xl font-semibold tracking-tight text-slate-900'>{pageHeading}</h2>
              <p className='mt-1 text-sm text-slate-500'>{pageDescription}</p>
            </div>
            <div className='flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto'>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${storageBadgeClass}`}
                title={storageTitle}
              >
                Storage: {storageLabel}
              </span>
              {isSyncing && (
                <span className='flex items-center gap-2 text-xs font-medium text-slate-500'>
                  <span className='h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500' aria-hidden />
                  Syncing…
                </span>
              )}
              <div className='flex flex-col items-end text-[11px] text-slate-500 sm:text-xs'>
                <span className='font-semibold text-slate-700'>Workspace user: {currentUserName}</span>
                {currentUserEmail && <span className='truncate text-slate-500'>{currentUserEmail}</span>}
              </div>
              {resolvedPage === 'customers' && (
                <Button
                  onClick={() => {
                    setShowNewCustomer(true)
                    setNewCustomerError(null)
                  }}
                  title='Create new customer'
                  disabled={!canEdit}
                >
                  <Plus size={16} /> New Customer
                </Button>
              )}
              {resolvedPage === 'projects' && (
                <Button
                  onClick={() => {
                    const preferredCustomerId =
                      selectedCustomerId && db.some(customer => customer.id === selectedCustomerId)
                        ? selectedCustomerId
                        : undefined
                    openNewProjectModal({ customerId: preferredCustomerId })
                  }}
                  title={hasCustomers ? 'Create new project' : 'Add a customer before creating projects'}
                  disabled={!canEdit || !hasCustomers}
                >
                  <Plus size={16} /> New Project
                </Button>
              )}
            </div>
          </div>

          {storageNotice && (
            <div className='mb-6 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700'>
              {storageNotice}
            </div>
          )}

          {actionError && (
            <div className='mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
              {actionError}
            </div>
          )}

          {activePage === 'home'
            ? renderDashboardView()
            : activePage === 'myTasks'
            ? renderMyTasksPage()
            : activePage === 'customers'
            ? renderCustomersIndex()
            : activePage === 'customerDetail'
            ? renderCustomerDetailPage()
            : activePage === 'projects'
            ? renderProjectsIndex()
            : activePage === 'settings'
            ? renderSettingsPage()
            : renderProjectDetailPage()}
        </main>
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.button
              type='button'
              className='fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden'
              onClick={() => setIsSidebarOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className='fixed inset-y-0 left-0 z-50 w-72 md:hidden'
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className='flex h-full flex-col gap-4 overflow-y-auto bg-gradient-to-b from-white/95 to-[#f3f6ff]/95 p-4 shadow-xl'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Navigation</span>
                  <Button
                    variant='ghost'
                    onClick={() => setIsSidebarOpen(false)}
                    className='-mr-2 rounded-full px-2 py-2'
                    title='Close menu'
                  >
                    <X size={16} />
                    <span className='sr-only'>Close menu</span>
                  </Button>
                </div>
                {sidebarPanels}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* New Customer Modal */}
      <AnimatePresence>
        {showNewCustomer && (
          <motion.div
            className='fixed inset-0 z-20 overflow-y-auto bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className='flex min-h-full items-center justify-center'>
              <Card className='panel flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden'>
                <CardHeader className='flex items-center justify-between gap-3 border-b border-slate-200/60 bg-slate-50/60'>
                  <div className='flex items-center gap-2'>
                    <Plus size={18} /> <span className='font-medium'>Create New Customer</span>
                  </div>
                  <Button
                    variant='ghost'
                    onClick={() => {
                      setShowNewCustomer(false)
                      setNewCustomerError(null)
                      setIsCreatingCustomer(false)
                      setNewCust(createNewCustomerDraftState())
                    }}
                    title='Close'
                  >
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent className='max-h-full overflow-y-auto pr-1'>
                  <div className='space-y-6'>
                    <div className='grid gap-3 md:grid-cols-2'>
                      <div>
                        <Label>Customer Name</Label>
                        <Input
                          value={newCust.name}
                          onChange={(e) => {
                            setNewCust({ ...newCust, name: (e.target as HTMLInputElement).value })
                            if (newCustomerError) setNewCustomerError(null)
                          }}
                          placeholder='e.g. Globex Ltd'
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={newCust.contactName}
                          onChange={(e) => setNewCust({ ...newCust, contactName: (e.target as HTMLInputElement).value })}
                          placeholder='e.g. Alex Doe'
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <Label>Contact Position</Label>
                        <Input
                          value={newCust.contactPosition}
                          onChange={(e) =>
                            setNewCust({ ...newCust, contactPosition: (e.target as HTMLInputElement).value })
                          }
                          placeholder='e.g. Project Manager'
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <Label>Contact Phone</Label>
                        <Input
                          value={newCust.contactPhone}
                          onChange={(e) => setNewCust({ ...newCust, contactPhone: (e.target as HTMLInputElement).value })}
                          placeholder='e.g. +44 20 7946 0000'
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <Label>Contact Email</Label>
                        <Input
                          value={newCust.contactEmail}
                          onChange={(e) =>
                            setNewCust({ ...newCust, contactEmail: (e.target as HTMLInputElement).value })
                          }
                          placeholder='e.g. alex@globex.co.uk'
                          disabled={!canEdit}
                        />
                      </div>
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label className='text-sm font-semibold text-slate-700'>Site Locations</Label>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={addNewCustomerSite}
                          disabled={!canEdit}
                        >
                          <Plus size={16} /> Add site
                        </Button>
                      </div>
                      {newCust.sites.length === 0 ? (
                        <p className='text-sm text-slate-500'>No site locations added. Use the button above to add one.</p>
                      ) : (
                        <div className='space-y-3'>
                          {newCust.sites.map((site, index) => (
                            <div
                              key={site.id}
                              className='space-y-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm'
                            >
                              <div className='flex items-center justify-between gap-2'>
                                <div className='text-sm font-semibold text-slate-700'>Site {index + 1}</div>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  className='rounded-full px-2 py-1 text-slate-500 hover:text-rose-600'
                                  onClick={() => removeNewCustomerSite(site.id)}
                                  disabled={!canEdit || newCust.sites.length <= 1}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                              <div className='grid gap-3 md:grid-cols-2'>
                                <div>
                                  <Label className='text-xs font-medium text-slate-500'>Site name</Label>
                                  <Input
                                    value={site.name}
                                    onChange={(event) =>
                                      updateNewCustomerSite(site.id, {
                                        name: (event.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder='e.g. Site A'
                                    disabled={!canEdit}
                                  />
                                </div>
                                <div>
                                  <Label className='text-xs font-medium text-slate-500'>Notes</Label>
                                  <Input
                                    value={site.notes}
                                    onChange={(event) =>
                                      updateNewCustomerSite(site.id, {
                                        notes: (event.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder='Optional notes'
                                    disabled={!canEdit}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className='text-xs font-medium text-slate-500'>Address</Label>
                                <textarea
                                  value={site.address}
                                  onChange={(event) =>
                                    updateNewCustomerSite(site.id, {
                                      address: (event.target as HTMLTextAreaElement).value,
                                    })
                                  }
                                  placeholder='Enter site address'
                                  rows={3}
                                  className='w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                  disabled={!canEdit}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-2'>
                      <Label className='text-sm font-semibold text-slate-700'>Parent customer</Label>
                      <select
                        className='w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={newCust.parentCustomerId}
                        onChange={event =>
                          setNewCust(prev => ({ ...prev, parentCustomerId: event.target.value }))
                        }
                        disabled={!canEdit || sortedCustomers.length === 0}
                      >
                        <option value=''>No parent (top-level customer)</option>
                        {sortedCustomers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      <p className='text-xs text-slate-500'>
                        Choose an existing customer to nest this record underneath.
                      </p>
                    </div>

                  </div>
                  {newCustomerError && (
                    <p className='mt-2 flex items-center gap-1 text-sm text-rose-600'>
                      <AlertCircle size={14} /> {newCustomerError}
                    </p>
                  )}
                  <div className='mt-3 flex justify-end gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => {
                        setShowNewCustomer(false)
                        setNewCustomerError(null)
                        setIsCreatingCustomer(false)
                        setNewCust(createNewCustomerDraftState())
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size='lg'
                      disabled={isCreatingCustomer || !canEdit}
                      onClick={async () => {
                        setIsCreatingCustomer(true)
                        setNewCustomerError(null)
                        try {
                          const sitePayload = newCust.sites
                            .map(site => {
                              const name = site.name.trim()
                              const address = site.address.trim()
                              const notes = site.notes.trim()
                              if (!name && !address && !notes) {
                                return null
                              }
                              return {
                                id: site.id,
                                name: name || undefined,
                                address: address || undefined,
                                notes: notes || undefined,
                              }
                            })
                            .filter((site): site is NonNullable<typeof site> => site !== null)

                          if (sitePayload.length === 0) {
                            setNewCustomerError('Add at least one site before saving.')
                            return
                          }
                          const hasAddress = sitePayload.some(
                            site => typeof site.address === 'string' && site.address.trim(),
                          )
                          if (!hasAddress) {
                            setNewCustomerError('Enter an address for at least one site.')
                            return
                          }

                          const parentCustomerId = newCust.parentCustomerId.trim()
                          const result = await createCustomer({
                            name: newCust.name,
                            contacts: [
                              {
                                name: newCust.contactName,
                                position: newCust.contactPosition,
                                phone: newCust.contactPhone,
                                email: newCust.contactEmail,
                              },
                            ],
                            sites: sitePayload,
                            parentCustomerId: parentCustomerId || undefined,
                          })
                          if (result) {
                            setNewCustomerError(result)
                            return
                          }
                          setNewCust(createNewCustomerDraftState())
                          setShowNewCustomer(false)
                          setNewCustomerError(null)
                        } finally {
                          setIsCreatingCustomer(false)
                        }
                      }}
                      title={canEdit ? 'Create customer' : 'Read-only access'}
                    >
                      <Plus size={18} /> Create Customer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Customer Modal */}
      <AnimatePresence>
        {showCustomerEditor && selectedCustomer && (
          <motion.div
            className='fixed inset-0 z-30 overflow-y-auto bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className='flex min-h-full items-center justify-center'>
              <Card className='panel flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden'>
                <CardHeader className='flex items-center justify-between gap-3 border-b border-slate-200/60 bg-slate-50/60'>
                  <div className='flex items-center gap-2'>
                    <Pencil size={18} /> <span className='font-medium'>Edit Customer</span>
                  </div>
                  <Button
                    variant='ghost'
                    onClick={() => {
                      setShowCustomerEditor(false)
                      setCustomerEditorError(null)
                      setIsSavingCustomerEditor(false)
                    }}
                    title='Close'
                  >
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent className='max-h-full overflow-y-auto pr-1'>
                  <div className='space-y-6'>
                    <div className='space-y-3'>
                      <div>
                        <Label htmlFor='edit-customer-name'>Customer Name</Label>
                        <Input
                          id='edit-customer-name'
                          value={customerEditorDraft.name}
                          onChange={(e) =>
                            setCustomerEditorDraft(prev => ({ ...prev, name: (e.target as HTMLInputElement).value }))
                          }
                          placeholder='Enter customer name'
                          disabled={!canEdit || isSavingCustomerEditor}
                        />
                      </div>
                      <div>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label className='text-sm font-semibold text-slate-700'>Site Locations</Label>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={addEditorSite}
                          disabled={!canEdit || isSavingCustomerEditor}
                        >
                          <Plus size={16} /> Add site
                        </Button>
                      </div>
                      {customerEditorDraft.sites.length === 0 ? (
                        <p className='text-sm text-slate-500'>No site locations recorded.</p>
                      ) : (
                        <div className='space-y-3'>
                          {customerEditorDraft.sites.map((site, index) => (
                            <div
                              key={site.id}
                              className='space-y-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm'
                            >
                              <div className='flex items-center justify-between gap-2'>
                                <div className='text-sm font-semibold text-slate-700'>Site {index + 1}</div>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  className='rounded-full px-2 py-1 text-slate-500 hover:text-rose-600'
                                  onClick={() => removeEditorSite(site.id)}
                                  disabled={!canEdit || isSavingCustomerEditor || customerEditorDraft.sites.length <= 1}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                              <div className='grid gap-3 md:grid-cols-2'>
                                <div>
                                  <Label className='text-xs font-medium text-slate-500'>Site name</Label>
                                  <Input
                                    value={site.name}
                                    onChange={(event) =>
                                      updateEditorSite(site.id, {
                                        name: (event.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder='e.g. Site A'
                                    disabled={!canEdit || isSavingCustomerEditor}
                                  />
                                </div>
                                <div>
                                  <Label className='text-xs font-medium text-slate-500'>Notes</Label>
                                  <Input
                                    value={site.notes ?? ''}
                                    onChange={(event) =>
                                      updateEditorSite(site.id, {
                                        notes: (event.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder='Optional notes'
                                    disabled={!canEdit || isSavingCustomerEditor}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className='text-xs font-medium text-slate-500'>Address</Label>
                                <textarea
                                  value={site.address ?? ''}
                                  onChange={(event) =>
                                    updateEditorSite(site.id, {
                                      address: (event.target as HTMLTextAreaElement).value,
                                    })
                                  }
                                  placeholder='Enter site address'
                                  rows={3}
                                  className='w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                  disabled={!canEdit || isSavingCustomerEditor}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-2'>
                      <Label className='text-sm font-semibold text-slate-700'>Parent customer</Label>
                      <select
                        className='w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={customerEditorDraft.parentCustomerId}
                        onChange={event =>
                          setCustomerEditorDraft(prev => ({ ...prev, parentCustomerId: event.target.value }))
                        }
                        disabled={!canEdit || isSavingCustomerEditor}
                      >
                        <option value=''>No parent (top-level customer)</option>
                        {sortedCustomers
                          .filter(customer => customer.id !== selectedCustomer?.id)
                          .map(customer => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                      </select>
                      <p className='text-xs text-slate-500'>
                        Link this customer under a main customer to show a Dematic &gt; Aldi-style hierarchy.
                      </p>
                    </div>

                  </div>
                  {customerEditorError && (
                    <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
                      <AlertCircle size={14} /> {customerEditorError}
                    </p>
                  )}
                  <div className='mt-4 flex justify-end gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => {
                        setShowCustomerEditor(false)
                        setCustomerEditorError(null)
                        setIsSavingCustomerEditor(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleSaveCustomerEditor()}
                      disabled={isSavingCustomerEditor || !canEdit}
                      title={canEdit ? 'Save changes' : 'Read-only access'}
                    >
                      <Save size={16} /> Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Project Modal */}
      <AnimatePresence>
        {showNewProject && (
          <motion.div
            className='fixed inset-0 z-30 overflow-y-auto bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className='flex min-h-full items-center justify-center'>
              <Card className='panel flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden'>
                <CardHeader className='flex items-center justify-between gap-3 border-b border-slate-200/60 bg-slate-50/60'>
                  <div className='flex items-center gap-2'>
                    <Plus size={18} /> <span className='font-medium'>Create New Project</span>
                  </div>
                  <Button
                    variant='ghost'
                    onClick={() => {
                      setShowNewProject(false)
                      setNewProjectError(null)
                      setNewProjectNumber('')
                      setNewProjectSiteId('')
                      setNewProjectLinkedSubCustomerId('')
                      setNewProjectLinkedSubCustomerSiteId('')
                      setIsCreatingProject(false)
                      setNewProjectInfoDraft(createProjectInfoDraft(undefined, users, computeProjectDateDefaults(businessSettings)))
                      setNewProjectTaskSelections(createDefaultTaskSelectionMap())
                    }}
                    title='Close'
                  >
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent className='max-h-full overflow-y-auto pr-1'>
                  {hasCustomers ? (
                    <div className='space-y-4'>
                      <div>
                        <Label htmlFor='new-project-customer'>Customer</Label>
                        <select
                          id='new-project-customer'
                          className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2'
                          value={newProjectCustomerId}
                          onChange={(e) => {
                            setNewProjectCustomerId((e.target as HTMLSelectElement).value)
                            if (newProjectError) setNewProjectError(null)
                          }}
                          disabled={isCreatingProject || !canEdit}
                        >
                          {sortedCustomers.map(customer => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor='new-project-number'>Project Number</Label>
                        <div className='mt-1 flex'>
                          <span className='flex items-center rounded-l-2xl border border-r-0 border-slate-200/80 bg-slate-100/70 px-3 py-2 text-sm font-semibold text-slate-500'>P</span>
                          <Input
                            id='new-project-number'
                            className='rounded-l-none border-l-0'
                            value={newProjectNumber}
                            onChange={(e) => {
                              setNewProjectNumber((e.target as HTMLInputElement).value)
                              if (newProjectError) setNewProjectError(null)
                            }}
                            placeholder='e.g. 2040'
                            disabled={isCreatingProject || !canEdit}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor='new-project-site'>Site</Label>
                        <select
                          id='new-project-site'
                          className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                          value={newProjectSiteId}
                          onChange={(e) => setNewProjectSiteId((e.target as HTMLSelectElement).value)}
                          disabled={isCreatingProject || !canEdit}
                        >
                          <option value=''>Unassigned</option>
                          {newProjectCustomer?.sites.map(site => (
                            <option key={site.id} value={site.id}>
                              {site.name?.trim() || site.address?.trim() || 'Unnamed site'}
                            </option>
                          ))}
                        </select>
                      </div>
                      {newProjectSubCustomers.length > 0 && (
                        <div className='grid gap-3 md:grid-cols-2'>
                          <div>
                            <Label htmlFor='new-project-linked-sub-customer'>Associated Sub-customer</Label>
                            <select
                              id='new-project-linked-sub-customer'
                              className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={newProjectLinkedSubCustomerId}
                              onChange={event => {
                                setNewProjectLinkedSubCustomerId((event.target as HTMLSelectElement).value)
                                setNewProjectLinkedSubCustomerSiteId('')
                              }}
                              disabled={isCreatingProject || !canEdit}
                            >
                              <option value=''>None</option>
                              {newProjectSubCustomers.map(child => (
                                <option key={child.id} value={child.id}>
                                  {child.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label htmlFor='new-project-linked-sub-site'>Sub-customer Site</Label>
                            <select
                              id='new-project-linked-sub-site'
                              className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={newProjectLinkedSubCustomerSiteId}
                              onChange={event =>
                                setNewProjectLinkedSubCustomerSiteId((event.target as HTMLSelectElement).value)
                              }
                              disabled={isCreatingProject || !canEdit || !selectedLinkedSubCustomer}
                            >
                              <option value=''>Unspecified</option>
                              {selectedLinkedSubCustomer?.sites.map(site => (
                                <option key={site.id} value={site.id}>
                                  {site.name?.trim() || site.address?.trim() || 'Unnamed site'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                      <div className='grid gap-3 md:grid-cols-2'>
                        <div>
                          <Label htmlFor='new-project-salesperson'>Salesperson</Label>
                          <select
                            id='new-project-salesperson'
                            className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={newProjectInfoDraft.salespersonId}
                            onChange={event =>
                              updateNewProjectInfoField('salespersonId', (event.target as HTMLSelectElement).value)
                            }
                            disabled={isCreatingProject || !canEdit}
                          >
                            <option value=''>Unassigned</option>
                            {users
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(user => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <MachineToolListInput
                          id='new-project-machines'
                          machines={newProjectInfoDraft.machines}
                          onChange={machines => updateNewProjectInfoField('machines', machines)}
                          disabled={isCreatingProject || !canEdit}
                          className='md:col-span-2'
                        />
                        <div>
                          <Label htmlFor='new-project-cobalt-order'>Cobalt Order Number</Label>
                          <Input
                            id='new-project-cobalt-order'
                            value={newProjectInfoDraft.cobaltOrderNumber}
                            onChange={event =>
                              updateNewProjectInfoField('cobaltOrderNumber', (event.target as HTMLInputElement).value)
                            }
                            placeholder='e.g. CO-12345'
                            disabled={isCreatingProject || !canEdit}
                          />
                        </div>
                        <div>
                          <Label htmlFor='new-project-customer-order'>Customer Order Number</Label>
                          <Input
                            id='new-project-customer-order'
                            value={newProjectInfoDraft.customerOrderNumber}
                            onChange={event =>
                              updateNewProjectInfoField('customerOrderNumber', (event.target as HTMLInputElement).value)
                            }
                            placeholder='e.g. PO-90876'
                            disabled={isCreatingProject || !canEdit}
                          />
                        </div>
                        <div>
                          <Label htmlFor='new-project-start-date'>Project Start Date</Label>
                          <input
                            id='new-project-start-date'
                            type='date'
                            className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={newProjectInfoDraft.startDate}
                            onChange={event =>
                              updateNewProjectInfoField('startDate', (event.target as HTMLInputElement).value)
                            }
                            disabled={isCreatingProject || !canEdit}
                          />
                        </div>
                        <div>
                          <Label htmlFor='new-project-proposed-completion'>Proposed Completion Date</Label>
                          <input
                            id='new-project-proposed-completion'
                            type='date'
                            className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={newProjectInfoDraft.proposedCompletionDate}
                            onChange={event =>
                              updateNewProjectInfoField(
                                'proposedCompletionDate',
                                (event.target as HTMLInputElement).value,
                              )
                            }
                            disabled={isCreatingProject || !canEdit}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Default Tasks</Label>
                        <p className='mt-1 text-xs text-slate-500'>Select preset tasks to add when the project is created.</p>
                        <div className='mt-2 space-y-2'>
                          {DEFAULT_PROJECT_TASK_OPTIONS.map(option => (
                            <label key={option.id} className='flex items-center gap-2 text-sm text-slate-700'>
                              <input
                                type='checkbox'
                                className='h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed'
                                checked={Boolean(newProjectTaskSelections[option.id])}
                                onChange={() => toggleNewProjectTaskSelection(option.id)}
                                disabled={isCreatingProject || !canEdit}
                              />
                              <span>{option.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {newProjectError && (
                        <p className='flex items-center gap-1 text-sm text-rose-600'>
                          <AlertCircle size={14} /> {newProjectError}
                        </p>
                      )}
                      <div className='flex justify-end gap-2'>
                        <Button
                          variant='outline'
                          onClick={() => {
                            setShowNewProject(false)
                            setNewProjectError(null)
                            setNewProjectNumber('')
                            setIsCreatingProject(false)
                            setNewProjectInfoDraft(createProjectInfoDraft(undefined, users, computeProjectDateDefaults(businessSettings)))
                            setNewProjectTaskSelections(createDefaultTaskSelectionMap())
                            setNewProjectLinkedSubCustomerId('')
                            setNewProjectLinkedSubCustomerSiteId('')
                          }}
                          disabled={isCreatingProject}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            void handleCreateProject()
                          }}
                          disabled={isCreatingProject || !canEdit}
                          title={canEdit ? 'Create project' : 'Read-only access'}
                        >
                          <Plus size={16} /> Create Project
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className='text-sm text-slate-600'>Add a customer before creating a project.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Machine Editor Modal */}
      <AnimatePresence>
        {machineEditor && (
          <motion.div
            className='fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeMachineEditor}
          >
            <motion.div
              className='w-full max-w-xl'
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={event => event.stopPropagation()}
            >
              <Card className='panel'>
                <CardHeader className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    {machineEditor.mode === 'create' ? (
                      <>
                        <Plus size={18} /> <span className='font-medium'>Add Machine</span>
                      </>
                    ) : (
                      <>
                        <Pencil size={18} /> <span className='font-medium'>Edit Machine</span>
                      </>
                    )}
                  </div>
                  <Button variant='ghost' onClick={closeMachineEditor} title='Close'>
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const availableProjects =
                      projectsBySiteTab[machineEditor.siteTabKey] ?? []
                    const selectedProject =
                      availableProjects.find(project => project.id === machineEditor.projectId) ?? null
                    const siteTabMeta = siteTabs.find(tab => tab.key === machineEditor.siteTabKey)
                    const siteLabel = siteTabMeta
                      ? siteTabMeta.label
                      : machineEditor.siteTabKey === UNASSIGNED_SITE_TAB_KEY
                      ? 'Unassigned'
                      : 'Selected site'
                    const canSelectProject =
                      machineEditor.mode === 'edit' ? Boolean(selectedProject) : availableProjects.length > 0
                    return (
                      <div className='space-y-4'>
                        <div className='text-xs font-medium uppercase tracking-wide text-slate-500'>
                          {`Context: ${siteLabel}`}
                        </div>
                        {machineEditor.mode === 'create' ? (
                          <div>
                            <Label htmlFor='machine-editor-project'>Project</Label>
                            {availableProjects.length > 0 ? (
                              <select
                                id='machine-editor-project'
                                className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                                value={machineEditor.projectId}
                                onChange={event => {
                                  const value = (event.target as HTMLSelectElement).value
                                  setMachineEditor(prev => (prev ? { ...prev, projectId: value } : prev))
                                  setMachineEditorError(null)
                                }}
                                disabled={isSavingMachineEditor}
                              >
                                {availableProjects.map(project => (
                                  <option key={project.id} value={project.id}>
                                    {`Project ${project.number}`}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <p className='mt-1 text-sm text-slate-500'>
                                No projects available for this site.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <Label>Project</Label>
                            <p className='mt-1 text-sm font-medium text-slate-800'>
                              {selectedProject ? `Project ${selectedProject.number}` : 'Project removed'}
                            </p>
                          </div>
                        )}
                        <div>
                          <Label htmlFor='machine-editor-serial'>Machine Serial</Label>
                          <Input
                            id='machine-editor-serial'
                            value={machineEditor.machineSerialNumber}
                            onChange={event => {
                              const value = (event.target as HTMLInputElement).value
                              setMachineEditor(prev => (prev ? { ...prev, machineSerialNumber: value } : prev))
                              setMachineEditorError(null)
                            }}
                            placeholder='e.g. SN-001234'
                            disabled={isSavingMachineEditor}
                          />
                        </div>
                        <div>
                          <Label htmlFor='machine-editor-line'>Line No/Name (optional)</Label>
                          <Input
                            id='machine-editor-line'
                            value={machineEditor.lineReference}
                            onChange={event => {
                              const value = (event.target as HTMLInputElement).value
                              setMachineEditor(prev => (prev ? { ...prev, lineReference: value } : prev))
                              setMachineEditorError(null)
                            }}
                            placeholder='e.g. Line 2 — Packing'
                            disabled={isSavingMachineEditor}
                          />
                        </div>
                        <SerialNumberListInput
                          id='machine-editor-tools'
                          label='Tool Serial Numbers'
                          values={machineEditor.toolSerialNumbers}
                          onChange={values => {
                            setMachineEditor(prev => (prev ? { ...prev, toolSerialNumbers: values } : prev))
                            setMachineEditorError(null)
                          }}
                          placeholder='e.g. TOOL-045'
                          disabled={isSavingMachineEditor}
                          validateAdd={() =>
                            machineEditor.machineSerialNumber.trim()
                              ? null
                              : 'Enter the machine serial number before adding tools.'
                          }
                        />
                        {machineEditorError && (
                          <p className='flex items-center gap-1 text-sm text-rose-600'>
                            <AlertCircle size={14} /> {machineEditorError}
                          </p>
                        )}
                        <div className='flex justify-end gap-2'>
                          <Button
                            variant='outline'
                            onClick={closeMachineEditor}
                            disabled={isSavingMachineEditor}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              void handleSaveMachineEditor()
                            }}
                            disabled={
                              isSavingMachineEditor ||
                              !canSelectProject
                            }
                            title='Save machine details'
                          >
                            {isSavingMachineEditor ? 'Saving…' : 'Save Machine'}
                          </Button>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Contact Modal */}
      <AnimatePresence>
        {contactEditor && (
          <motion.div
            className='fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className='w-full max-w-xl panel'>
              <CardHeader>
                <div className='flex items-center gap-2'><Pencil size={18} /> <span className='font-medium'>Edit Contact</span></div>
                <Button variant='ghost' onClick={closeContactEditor} title='Close'>
                  <X size={16} />
                </Button>
              </CardHeader>
              <CardContent>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={contactEditor.name}
                      onChange={(e) => {
                        const value = (e.target as HTMLInputElement).value
                        setContactEditor(prev => (prev ? { ...prev, name: value } : prev))
                        if (contactEditorError) setContactEditorError(null)
                      }}
                      placeholder='Jane Doe'
                      disabled={!canEdit || isSavingContactEdit}
                    />
                  </div>
                  <div>
                    <Label>Position</Label>
                    <Input
                      value={contactEditor.position}
                      onChange={(e) => {
                        const value = (e.target as HTMLInputElement).value
                        setContactEditor(prev => (prev ? { ...prev, position: value } : prev))
                        if (contactEditorError) setContactEditorError(null)
                      }}
                      placeholder='Project Manager'
                      disabled={!canEdit || isSavingContactEdit}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={contactEditor.phone}
                      onChange={(e) => {
                        const value = (e.target as HTMLInputElement).value
                        setContactEditor(prev => (prev ? { ...prev, phone: value } : prev))
                        if (contactEditorError) setContactEditorError(null)
                      }}
                      placeholder='555-123-4567'
                      disabled={!canEdit || isSavingContactEdit}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={contactEditor.email}
                      onChange={(e) => {
                        const value = (e.target as HTMLInputElement).value
                        setContactEditor(prev => (prev ? { ...prev, email: value } : prev))
                        if (contactEditorError) setContactEditorError(null)
                      }}
                      placeholder='name@example.com'
                      disabled={!canEdit || isSavingContactEdit}
                    />
                  </div>
                  <div className='md:col-span-2'>
                    <Label>Site</Label>
                    <select
                      className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                      value={contactEditor.siteId}
                      onChange={(e) => {
                        const value = (e.target as HTMLSelectElement).value
                        setContactEditor(prev => (prev ? { ...prev, siteId: value } : prev))
                        if (contactEditorError) setContactEditorError(null)
                      }}
                      disabled={!canEdit || isSavingContactEdit}
                    >
                      <option value=''>Unassigned</option>
                      {selectedCustomerSites.map(site => (
                        <option key={site.id} value={site.id}>
                          {site.name?.trim() || site.address?.trim() || 'Unnamed site'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {contactEditorError && (
                  <p className='mt-2 flex items-center gap-1 text-sm text-rose-600'>
                    <AlertCircle size={14} /> {contactEditorError}
                  </p>
                )}
                <div className='mt-3 flex justify-end gap-2'>
                  <Button variant='outline' onClick={closeContactEditor} disabled={isSavingContactEdit}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      void handleSaveContactEdit()
                    }}
                    disabled={isSavingContactEdit || !canEdit}
                    title={canEdit ? 'Save contact' : 'Read-only access'}
                  >
                    <Save size={16} /> Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  return <AppContent />
}
