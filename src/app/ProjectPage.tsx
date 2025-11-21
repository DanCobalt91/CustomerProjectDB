import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
  User as UserIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  BusinessSettings,
  Customer,
  Project,
  ProjectActiveSubStatus,
  ProjectCustomerSignOff,
  ProjectFile,
  ProjectFileCategory,
  ProjectInfo,
  ProjectOnsiteReport,
  ProjectStatus,
  WOType,
  CustomerSignOffDecision,
  CustomerSignOffSubmission,
  ProjectTask,
  ProjectTaskStatus,
  User,
} from '../types'
import {
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  PROJECT_ACTIVE_SUB_STATUS_OPTIONS,
  PROJECT_FILE_CATEGORIES,
  PROJECT_TASK_STATUSES,
  formatProjectStatus,
} from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import MachineToolListInput from '../components/ui/MachineToolListInput'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { CUSTOMER_SIGN_OFF_OPTIONS, CUSTOMER_SIGN_OFF_OPTION_COPY } from '../lib/signOff'
import TaskGanttChart from '../components/ui/TaskGanttChart'
import {
  createProjectInfoDraft,
  parseProjectInfoDraft,
  type ProjectInfoDraft,
} from '../lib/projectInfo'
import type { OnsiteReportSubmission } from '../lib/onsiteReport'
import { getBusinessEndTimeForDate, getBusinessStartTimeForDate } from '../lib/businessHours'
import { createId } from '../lib/id'

export type ProjectPageProps = {
  customer: Customer
  project: Project
  canEdit: boolean
  currentUserName: string
  currentUserId: string | null
  users: User[]
  onUpdateProjectNote: (note: string) => void
  onUpdateProjectStatus: (
    status: ProjectStatus,
    activeSubStatus?: ProjectActiveSubStatus,
    context?: { changedBy: string },
  ) => void
  onUpdateProjectInfo: (info: ProjectInfo | null) => void
  onUpdateProjectSite: (siteId: string | null) => void
  onAddWO: (data: { number: string; type: WOType; note?: string }) => Promise<string | null>
  onDeleteWO: (woId: string) => void
  onUploadDocument: (category: ProjectFileCategory, file: File) => Promise<string | null>
  onRemoveDocument: (category: ProjectFileCategory, fileId: string) => Promise<string | null>
  onUploadCustomerSignOff: (file: File) => Promise<string | null>
  onGenerateCustomerSignOff: (submission: CustomerSignOffSubmission) => Promise<string | null>
  onRemoveCustomerSignOff: () => Promise<string | null>
  onCreateOnsiteReport: (submission: OnsiteReportSubmission) => Promise<string | null>
  onDeleteOnsiteReport: (reportId: string) => Promise<string | null>
  onDeleteProject: () => void
  onNavigateToCustomer: () => void
  onReturnToIndex: () => void
  onNavigateToCustomers: () => void
  onCreateTask: (data: {
    name: string
    start: string
    end: string
    assigneeId?: string
    status: ProjectTaskStatus
  }) => Promise<string | null>
  onUpdateTask: (
    taskId: string,
    updates: {
      name?: string
      start?: string
      end?: string
      assigneeId?: string
      assigneeName?: string
      status?: ProjectTaskStatus
    },
  ) => Promise<string | null>
  onDeleteTask: (taskId: string) => void
  businessSettings: BusinessSettings
  taskScheduleDefaults: { start: string; end: string }
}

const PROJECT_FILE_METADATA: Record<ProjectFileCategory, { label: string; description: string }> = {
  fds: {
    label: 'FDS Documents',
    description: 'Upload FDS documents to keep design references with the project record.',
  },
  electrical: {
    label: 'Electrical Schematics',
    description: 'Attach electrical schematics and supporting documentation.',
  },
  mechanical: {
    label: 'Mechanical Schematics',
    description: 'Upload mechanical schematics and related drawings.',
  },
  installation: {
    label: 'Installation Pack',
    description: 'Store installation packs and site-ready documentation.',
  },
}

const FINAL_ACCEPTANCE_UPLOAD_DESCRIPTION =
  'Upload a signed final acceptance document provided by the customer.'

const UPLOAD_OPTIONS: Array<{ value: UploadCategory; label: string }> = [
  { value: 'fds', label: 'FDS' },
  { value: 'mechanical', label: 'Mechanical Schematics' },
  { value: 'electrical', label: 'Electrical Schematics' },
  { value: 'installation', label: 'Installation Pack' },
  { value: 'finalAcceptance', label: 'Final Acceptance' },
]

const PROJECT_FILE_ACCEPT =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.svg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/svg+xml'

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

const PROJECT_TABS = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'info', label: 'Project Info' },
  { value: 'files', label: 'Project Files' },
  { value: 'workOrders', label: 'Work Orders' },
] as const

type ProjectTab = (typeof PROJECT_TABS)[number]['value']
type UploadCategory = ProjectFileCategory | 'finalAcceptance'
type TaskFormState = {
  name: string
  start: string
  end: string
  assigneeId: string
  status: ProjectTaskStatus
}

type OnsiteReportDraft = {
  reportDate: string
  arrivalTime: string
  departureTime: string
  engineerName: string
  customerContact: string
  siteAddress: string
  workSummary: string
  materialsUsed: string
  additionalNotes: string
  signedByName: string
  signedByPosition: string
  machineId: string
  serviceInformation: string
  firmwareVersion: string
}

type ProjectFileTab =
  | 'all'
  | ProjectFileCategory
  | 'onsiteReports'
  | 'finalAcceptance'

const PROJECT_FILE_TAB_OPTIONS: Array<{ value: ProjectFileTab; label: string }> = [
  { value: 'all', label: 'All files' },
  { value: 'fds', label: 'FDS' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'installation', label: 'Installation' },
  { value: 'finalAcceptance', label: 'Final acceptance' },
]

function isProjectFileCategoryTab(value: ProjectFileTab): value is ProjectFileCategory {
  return PROJECT_FILE_CATEGORIES.includes(value as ProjectFileCategory)
}

function stripPrefix(value: string, pattern: RegExp): string {
  const trimmed = value.trim()
  const match = trimmed.match(pattern)
  return match ? match[1].trim() : trimmed
}

function sortTasksForDisplay(tasks: ProjectTask[]): ProjectTask[] {
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
    if (aValid) return -1
    if (bValid) return 1
    return a.name.localeCompare(b.name)
  })
}

function toDateTimeLocal(value?: string): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return new Date(parsed).toISOString()
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

const ACTIVE_STATUS_STYLES: Record<
  ProjectActiveSubStatus,
  { selectClass: string; indicatorClass: string }
> = {
  FDS: {
    selectClass: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    indicatorClass: 'bg-indigo-500',
  },
  Design: {
    selectClass: 'bg-sky-50 text-sky-900 border-sky-200',
    indicatorClass: 'bg-sky-500',
  },
  Build: {
    selectClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    indicatorClass: 'bg-emerald-500',
  },
  Install: {
    selectClass: 'bg-amber-50 text-amber-900 border-amber-200',
    indicatorClass: 'bg-amber-500',
  },
  'Install (Snagging)': {
    selectClass: 'bg-orange-50 text-orange-900 border-orange-200',
    indicatorClass: 'bg-orange-500',
  },
}

const STATUS_SELECTIONS: Array<{
  key: string
  status: ProjectStatus
  activeSubStatus?: ProjectActiveSubStatus
  label: string
  selectClass: string
  indicatorClass: string
}> = [
  ...PROJECT_ACTIVE_SUB_STATUS_OPTIONS.map(stage => ({
    key: `Active:${stage}`,
    status: 'Active' as ProjectStatus,
    activeSubStatus: stage,
    label: stage,
    selectClass: ACTIVE_STATUS_STYLES[stage].selectClass,
    indicatorClass: ACTIVE_STATUS_STYLES[stage].indicatorClass,
  })),
  {
    key: 'Complete',
    status: 'Complete' as ProjectStatus,
    label: 'Complete',
    selectClass: 'bg-slate-200 text-slate-800 border-slate-300',
    indicatorClass: 'bg-slate-500',
  },
]

function isPdfDocument(file?: ProjectFile): boolean {
  if (!file) {
    return false
  }
  const type = file.type?.toLowerCase() ?? ''
  if (type.includes('pdf')) {
    return true
  }
  const name = file.name?.toLowerCase() ?? ''
  return name.endsWith('.pdf')
}

function isImageDocument(file?: ProjectFile): boolean {
  if (!file) {
    return false
  }
  const type = file.type?.toLowerCase() ?? ''
  if (type.startsWith('image/')) {
    return true
  }
  const name = file.name?.toLowerCase() ?? ''
  return ['.png', '.jpg', '.jpeg', '.svg'].some(ext => name.endsWith(ext))
}

function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return new Date(parsed).toLocaleString()
}

export default function ProjectPage({
  customer,
  project,
  canEdit,
  currentUserName,
  currentUserId,
  users,
  onUpdateProjectNote,
  onUpdateProjectStatus,
  onUpdateProjectInfo,
  onUpdateProjectSite,
  onAddWO,
  onDeleteWO,
  onUploadDocument,
  onRemoveDocument,
  onUploadCustomerSignOff,
  onGenerateCustomerSignOff,
  onRemoveCustomerSignOff,
  onCreateOnsiteReport,
  onDeleteOnsiteReport,
  onDeleteProject,
  onNavigateToCustomer,
  onReturnToIndex,
  onNavigateToCustomers,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  businessSettings,
  taskScheduleDefaults,
}: ProjectPageProps) {
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>(project.status)
  const [activeSubStatusDraft, setActiveSubStatusDraft] = useState<ProjectActiveSubStatus>(
    project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  )
  const [noteDraft, setNoteDraft] = useState(project.note ?? '')
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ProjectTab>('tasks')
  const [infoDraft, setInfoDraft] = useState<ProjectInfoDraft>(() =>
    createProjectInfoDraft(project.info, users),
  )
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoStatus, setInfoStatus] = useState<string | null>(null)
  const [isSavingInfo, setIsSavingInfo] = useState(false)
  const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
  const [woError, setWoError] = useState<string | null>(null)
  const [isAddingWo, setIsAddingWo] = useState(false)
  const [fileErrors, setFileErrors] = useState<Record<ProjectFileCategory, string | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
    installation: null,
  })
  const [removingFile, setRemovingFile] = useState<{ category: ProjectFileCategory; fileId: string } | null>(null)
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(() => new Set())
  const [isUploadingSignOff, setIsUploadingSignOff] = useState(false)
  const [isRemovingSignOff, setIsRemovingSignOff] = useState(false)
  const [isGeneratingSignOff, setIsGeneratingSignOff] = useState(false)
  const [isCompletingSignOff, setIsCompletingSignOff] = useState(false)
  const [signOffError, setSignOffError] = useState<string | null>(null)
  const [signOffDraft, setSignOffDraft] = useState<{
    name: string
    position: string
    decision: CustomerSignOffDecision
    snagsText: string
  }>({
    name: '',
    position: '',
    decision: 'option1',
    snagsText: '',
  })
  const [hasSignature, setHasSignature] = useState(false)
  const [showStatusHistory, setShowStatusHistory] = useState(false)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadDialogCategory, setUploadDialogCategory] = useState<UploadCategory>('fds')
  const [activeFileTab, setActiveFileTab] = useState<ProjectFileTab>('all')
  const [uploadDialogFile, setUploadDialogFile] = useState<File | null>(null)
  const [uploadDialogError, setUploadDialogError] = useState<string | null>(null)
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const signatureDrawingRef = useRef(false)
  const signatureStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const activeSignatureStrokeRef = useRef<number | null>(null)
  const tasks = useMemo(() => sortTasksForDisplay(project.tasks ?? []), [project.tasks])
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    name: '',
    start: taskScheduleDefaults.start,
    end: taskScheduleDefaults.end,
    assigneeId: '',
    status: PROJECT_TASK_STATUSES[0],
  })
  const [taskError, setTaskError] = useState<string | null>(null)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskEditDraft, setTaskEditDraft] = useState<TaskFormState>({
    name: '',
    start: '',
    end: '',
    assigneeId: '',
    status: PROJECT_TASK_STATUSES[0],
  })
  const lastTaskScheduleDefaultsRef = useRef(taskScheduleDefaults)
  const [taskEditError, setTaskEditError] = useState<string | null>(null)
  const [isSavingTaskEdit, setIsSavingTaskEdit] = useState(false)

  const resetTaskForm = useCallback(() => {
    setTaskForm({
      name: '',
      start: taskScheduleDefaults.start,
      end: taskScheduleDefaults.end,
      assigneeId: '',
      status: PROJECT_TASK_STATUSES[0],
    })
    setTaskError(null)
  }, [taskScheduleDefaults])

  const openTaskModal = useCallback(() => {
    resetTaskForm()
    setIsTaskModalOpen(true)
  }, [resetTaskForm])

  const closeTaskModal = useCallback(() => {
    if (isSavingTask) {
      return
    }
    setIsTaskModalOpen(false)
    setTaskError(null)
  }, [isSavingTask])

  useEffect(() => {
    const previous = lastTaskScheduleDefaultsRef.current
    if (
      previous.start !== taskScheduleDefaults.start ||
      previous.end !== taskScheduleDefaults.end
    ) {
      setTaskForm(prev => ({
        ...prev,
        start:
          !prev.start || prev.start === previous.start
            ? taskScheduleDefaults.start
            : prev.start,
        end:
          !prev.end || prev.end === previous.end
            ? taskScheduleDefaults.end
            : prev.end,
      }))
      lastTaskScheduleDefaultsRef.current = taskScheduleDefaults
    }
  }, [taskScheduleDefaults])

  const currentUser = useMemo(
    () => (currentUserId ? users.find(user => user.id === currentUserId) ?? null : null),
    [currentUserId, users],
  )
  const currentUserDisplayName = currentUser?.name ?? currentUserName
  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users])

  const buildDefaultOnsiteReportDraft = useCallback((): OnsiteReportDraft => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    const reportDate = local.toISOString().slice(0, 10)
    const defaultArrival = getBusinessStartTimeForDate(businessSettings, reportDate)
    const defaultDeparture = getBusinessEndTimeForDate(businessSettings, reportDate)
    const projectSite = project.siteId ? customer.sites.find(site => site.id === project.siteId) ?? null : null
    const fallbackSite = customer.sites.find(site => site.address?.trim()) ?? null
    const preferredAddress =
      projectSite?.address?.trim() || fallbackSite?.address?.trim() || customer.address || ''
    const associatedMachines = customer.machines.filter(machine => {
      if (machine.projectId === project.id) {
        return true
      }
      if (project.siteId && machine.siteId === project.siteId) {
        return true
      }
      return false
    })
    const defaultMachineId =
      associatedMachines.find(machine => machine.projectId === project.id)?.id ??
      associatedMachines[0]?.id ??
      ''

    return {
      reportDate,
      arrivalTime: defaultArrival,
      departureTime: defaultDeparture,
      engineerName: currentUserDisplayName,
      customerContact: customer.contacts[0]?.name ?? '',
      siteAddress: preferredAddress,
      workSummary: '',
      materialsUsed: '',
      additionalNotes: '',
      signedByName: '',
      signedByPosition: '',
      machineId: defaultMachineId,
      serviceInformation: '',
      firmwareVersion: '',
    }
  }, [
    businessSettings,
    currentUserDisplayName,
    customer.address,
    customer.contacts,
    customer.sites,
    customer.machines,
    project.id,
    project.siteId,
  ])

  const [onsiteReportDraft, setOnsiteReportDraft] = useState<OnsiteReportDraft>(() =>
    buildDefaultOnsiteReportDraft(),
  )
  const [isCreatingOnsiteReport, setIsCreatingOnsiteReport] = useState(false)
  const [isSavingOnsiteReport, setIsSavingOnsiteReport] = useState(false)
  const [onsiteReportError, setOnsiteReportError] = useState<string | null>(null)
  const [onsiteHasSignature, setOnsiteHasSignature] = useState(false)
  const [removingOnsiteReportId, setRemovingOnsiteReportId] = useState<string | null>(null)
  const onsiteSignatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const onsiteSignatureDrawingRef = useRef(false)
  const onsiteSignatureStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const onsiteActiveSignatureStrokeRef = useRef<number | null>(null)

  const documents = project.documents ?? {}
  const documentsCount = useMemo(() => {
    const projectFilesCount = PROJECT_FILE_CATEGORIES.reduce(
      (count, category) => count + (project.documents?.[category]?.length ?? 0),
      0,
    )
    const onsiteCount = project.onsiteReports?.length ?? 0
    return projectFilesCount + (project.customerSignOff ? 1 : 0) + onsiteCount
  }, [project.customerSignOff, project.documents, project.onsiteReports])
  const machineOptions = useMemo(() => {
    const options = customer.machines.map(machine => {
      const serial = machine.machineSerialNumber.trim() || 'Machine'
      const line = machine.lineReference?.trim()
      const parts = [serial]
      if (line) {
        parts.push(`(${line})`)
      }
      const priority = machine.projectId === project.id ? 0 : project.siteId && machine.siteId === project.siteId ? 1 : 2
      return {
        id: machine.id,
        label: parts.join(' '),
        priority,
      }
    })
    return options.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
  }, [customer.machines, project.id, project.siteId])
  const hasProjectInfo = useMemo(() => {
    const info = project.info
    if (!info) {
      return false
    }
    return Object.values(info).some(value => {
      if (Array.isArray(value)) {
        return value.length > 0
      }
      return value !== undefined
    })
  }, [project.info])
  const statusHistory = useMemo(() => {
    const history = project.statusHistory ?? []
    return [...history].sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )
  }, [project.statusHistory])
  const latestStatusEntry = statusHistory[0] ?? null
  const customerSignOff = project.customerSignOff ?? null
  const statusSelectionValue =
    statusDraft === 'Active' ? `Active:${activeSubStatusDraft}` : 'Complete'
  const statusSelectionOption = STATUS_SELECTIONS.find(option => option.key === statusSelectionValue)

  const resetSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    signatureDrawingRef.current = false
    activeSignatureStrokeRef.current = null
    signatureStrokesRef.current = []
    setHasSignature(false)
  }, [])

  const resetOnsiteSignature = useCallback(() => {
    const canvas = onsiteSignatureCanvasRef.current
    const context = canvas?.getContext('2d') ?? null
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    onsiteSignatureDrawingRef.current = false
    onsiteActiveSignatureStrokeRef.current = null
    onsiteSignatureStrokesRef.current = []
    setOnsiteHasSignature(false)
  }, [])

  useEffect(() => {
    setTaskForm({ name: '', start: '', end: '', assigneeId: '', status: PROJECT_TASK_STATUSES[0] })
    setTaskError(null)
    setEditingTaskId(null)
    setTaskEditDraft({ name: '', start: '', end: '', assigneeId: '', status: PROJECT_TASK_STATUSES[0] })
    setTaskEditError(null)
    setIsSavingTask(false)
    setIsSavingTaskEdit(false)
  }, [project.id])

  const openNoteDialog = () => {
    if (!canEdit) {
      return
    }
    setNoteDraft(project.note ?? '')
    setInfoDraft(createProjectInfoDraft(project.info, users))
    setInfoError(null)
    setIsNoteDialogOpen(true)
  }

  const closeNoteDialog = () => {
    setIsNoteDialogOpen(false)
  }

  useEffect(() => {
    setStatusDraft(project.status)
    setActiveSubStatusDraft(project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    setNoteDraft(project.note ?? '')
    setIsNoteDialogOpen(false)
    setWoForm({ number: '', type: 'Build', note: '' })
    setWoError(null)
    setFileErrors({ fds: null, electrical: null, mechanical: null, installation: null })
    setRemovingFile(null)
    setExpandedPreviews(new Set())
    setActiveTab('tasks')
    setActiveFileTab('all')
    setIsUploadingSignOff(false)
    setIsRemovingSignOff(false)
    setIsGeneratingSignOff(false)
    setIsCompletingSignOff(false)
    setSignOffError(null)
    setSignOffDraft({ name: '', position: '', decision: 'option1', snagsText: '' })
    resetSignature()
    setShowStatusHistory(false)
    setIsCreatingOnsiteReport(false)
    setIsSavingOnsiteReport(false)
    setOnsiteReportError(null)
    setOnsiteHasSignature(false)
    setRemovingOnsiteReportId(null)
    onsiteSignatureStrokesRef.current = []
    onsiteActiveSignatureStrokeRef.current = null
    setOnsiteReportDraft(buildDefaultOnsiteReportDraft())
    resetOnsiteSignature()
  }, [
    project.id,
    resetSignature,
    project.activeSubStatus,
    project.note,
    project.status,
    buildDefaultOnsiteReportDraft,
    resetOnsiteSignature,
  ])

  useEffect(() => {
    if (!isNoteDialogOpen) {
      setNoteDraft(project.note ?? '')
    }
  }, [project.note, isNoteDialogOpen])

  useEffect(() => {
    setStatusDraft(project.status)
  }, [project.status])

  useEffect(() => {
    if (project.status === 'Active') {
      setActiveSubStatusDraft(project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    }
  }, [project.status, project.activeSubStatus])

  useEffect(() => {
    setInfoDraft(createProjectInfoDraft(project.info, users))
    setInfoError(null)
  }, [project.info, users])

  useEffect(() => {
    if (!isGeneratingSignOff) {
      return
    }
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    context.scale(ratio, ratio)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = '#111827'
    signatureDrawingRef.current = false
    context.beginPath()
  }, [isGeneratingSignOff])

  useEffect(() => {
    if (!isCreatingOnsiteReport) {
      return
    }
    const canvas = onsiteSignatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.scale(ratio, ratio)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = '#111827'
    onsiteSignatureDrawingRef.current = false
    onsiteActiveSignatureStrokeRef.current = null
    onsiteSignatureStrokesRef.current = []
    context.beginPath()
  }, [isCreatingOnsiteReport])

  const updateFileError = (category: ProjectFileCategory, message: string | null) => {
    setFileErrors(prev => ({ ...prev, [category]: message }))
  }

  const openUploadDialog = () => {
    if (!canEdit) {
      setUploadDialogError('You have read-only access.')
      setIsUploadDialogOpen(true)
      return
    }
    let defaultCategory: UploadCategory = 'fds'
    if (activeFileTab === 'finalAcceptance') {
      defaultCategory = 'finalAcceptance'
    } else if (isProjectFileCategoryTab(activeFileTab)) {
      defaultCategory = activeFileTab
    }
    setUploadDialogCategory(defaultCategory)
    setUploadDialogFile(null)
    setUploadDialogError(null)
    setIsSubmittingUpload(false)
    setIsUploadDialogOpen(true)
  }

  const closeUploadDialog = () => {
    setIsUploadDialogOpen(false)
    setUploadDialogFile(null)
    setUploadDialogError(null)
    setIsSubmittingUpload(false)
  }

  const handleUploadDialogFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setUploadDialogFile(file)
    setUploadDialogError(null)
  }

  const handleUploadSubmit = async () => {
    if (!canEdit) {
      setUploadDialogError('You have read-only access.')
      return
    }
    const file = uploadDialogFile
    if (!file) {
      setUploadDialogError('Select a file to upload.')
      return
    }

    setIsSubmittingUpload(true)
    setUploadDialogError(null)

    try {
      let result: string | null = null
      if (uploadDialogCategory === 'finalAcceptance') {
        setIsUploadingSignOff(true)
        setSignOffError(null)
        try {
          result = await onUploadCustomerSignOff(file)
        } finally {
          setIsUploadingSignOff(false)
        }
        if (result) {
          setSignOffError(result)
        }
      } else {
        result = await onUploadDocument(uploadDialogCategory, file)
        if (result) {
          updateFileError(uploadDialogCategory, result)
        } else {
          updateFileError(uploadDialogCategory, null)
        }
      }

      if (result) {
        setUploadDialogError(result)
        return
      }

      setUploadDialogError(null)
      setUploadDialogFile(null)
      setIsUploadDialogOpen(false)
    } catch (error) {
      console.error('Failed to upload project document', error)
      setUploadDialogError('Failed to upload document.')
    } finally {
      setIsSubmittingUpload(false)
    }
  }

  const togglePreview = (fileId: string) => {
    setExpandedPreviews(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }

  const updateInfoField = <K extends keyof ProjectInfoDraft>(field: K, value: ProjectInfoDraft[K]) => {
    setInfoDraft(prev => ({ ...prev, [field]: value }))
    if (infoError) {
      setInfoError(null)
    }
    if (infoStatus) {
      setInfoStatus(null)
    }
  }

  const updateOnsiteReportField = <K extends keyof OnsiteReportDraft>(field: K, value: string) => {
    setOnsiteReportDraft(prev => {
      if (field === 'reportDate') {
        const nextDate = value
        const previousStart = getBusinessStartTimeForDate(businessSettings, prev.reportDate)
        const previousEnd = getBusinessEndTimeForDate(businessSettings, prev.reportDate)
        const nextStart = getBusinessStartTimeForDate(businessSettings, nextDate)
        const nextEnd = getBusinessEndTimeForDate(businessSettings, nextDate)
        const shouldUpdateArrival = !prev.arrivalTime || prev.arrivalTime === previousStart
        const shouldUpdateDeparture = !prev.departureTime || prev.departureTime === previousEnd
        return {
          ...prev,
          reportDate: nextDate,
          arrivalTime: shouldUpdateArrival ? nextStart : prev.arrivalTime,
          departureTime: shouldUpdateDeparture ? nextEnd : prev.departureTime,
        }
      }
      return { ...prev, [field]: value } as OnsiteReportDraft
    })
    if (onsiteReportError) {
      setOnsiteReportError(null)
    }
  }

  const handleSaveProjectDetails = () => {
    if (!canEdit) {
      setInfoError('You have read-only access.')
      return
    }
    const { info, error } = parseProjectInfoDraft(infoDraft, users)
    if (error) {
      setInfoError(error)
      setInfoStatus(null)
      return
    }
    setIsSavingInfo(true)
    try {
      onUpdateProjectNote(noteDraft)
      onUpdateProjectInfo(info)
      setInfoError(null)
      setInfoStatus(info ? 'Project information saved.' : 'Project information cleared.')
      setIsNoteDialogOpen(false)
    } finally {
      setIsSavingInfo(false)
    }
  }

  const handleClearProjectInfo = () => {
    if (!canEdit) {
      setInfoError('You have read-only access.')
      return
    }
    setIsSavingInfo(true)
    try {
      onUpdateProjectInfo(null)
      setInfoDraft(createProjectInfoDraft(undefined, users))
      setInfoError(null)
      setInfoStatus('Project information cleared.')
    } finally {
      setIsSavingInfo(false)
    }
  }

  const handleStatusSelectionChange = (value: string) => {
    const selection = STATUS_SELECTIONS.find(option => option.key === value)
    if (!selection) {
      return
    }

    setStatusDraft(selection.status)
    if (selection.status === 'Active') {
      setActiveSubStatusDraft(selection.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    }

    if (!canEdit) {
      return
    }

    if (selection.status === project.status) {
      if (selection.status === 'Active') {
        const currentStage = project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        if (currentStage === (selection.activeSubStatus ?? currentStage)) {
          return
        }
      } else {
        return
      }
    }

    onUpdateProjectStatus(
      selection.status,
      selection.status === 'Active'
        ? selection.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        : undefined,
      { changedBy: currentUserDisplayName },
    )
  }

  const startGeneratingSignOff = () => {
    if (!canEdit) {
      setSignOffError('You have read-only access.')
      return
    }
    setSignOffDraft({ name: '', position: '', decision: 'option1', snagsText: '' })
    resetSignature()
    setSignOffError(null)
    setIsGeneratingSignOff(true)
    setHasSignature(false)
  }

  const cancelGeneratingSignOff = () => {
    setIsGeneratingSignOff(false)
    setIsCompletingSignOff(false)
    setSignOffDraft({ name: '', position: '', decision: 'option1', snagsText: '' })
    resetSignature()
    setSignOffError(null)
  }

  const handleRemoveCustomerSignOff = async () => {
    if (!canEdit) {
      setSignOffError('You have read-only access.')
      return
    }
    const confirmed = window.confirm('Remove the existing final acceptance?')
    if (!confirmed) {
      return
    }
    setIsRemovingSignOff(true)
    setSignOffError(null)
    try {
      const result = await onRemoveCustomerSignOff()
      if (result) {
        setSignOffError(result)
      }
    } finally {
      setIsRemovingSignOff(false)
    }
  }

  const getSignaturePoint = (
    canvas: HTMLCanvasElement,
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = canvas.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    return { x, y }
  }

  const handleSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || !isGeneratingSignOff) {
      return
    }
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    event.preventDefault()
    const point = getSignaturePoint(canvas, event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    signatureDrawingRef.current = true
    const strokeIndex = signatureStrokesRef.current.length
    signatureStrokesRef.current.push([point])
    activeSignatureStrokeRef.current = strokeIndex
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawingRef.current) {
      return
    }
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    event.preventDefault()
    const point = getSignaturePoint(canvas, event)
    const activeIndex = activeSignatureStrokeRef.current
    if (activeIndex !== null && signatureStrokesRef.current[activeIndex]) {
      signatureStrokesRef.current[activeIndex].push(point)
    }
    context.lineTo(point.x, point.y)
    context.stroke()
    setHasSignature(true)
  }

  const finishSignatureStroke = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (signatureDrawingRef.current && event) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    signatureDrawingRef.current = false
    activeSignatureStrokeRef.current = null
    const canvas = signatureCanvasRef.current
    const context = canvas?.getContext('2d')
    context?.beginPath()
  }

  const handleSignaturePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    finishSignatureStroke(event)
  }

  const handleSignaturePointerLeave = () => {
    finishSignatureStroke()
  }

  const handleCompleteSignOff = async () => {
    if (!canEdit) {
      setSignOffError('You have read-only access.')
      return
    }
    const name = signOffDraft.name.trim()
    const position = signOffDraft.position.trim()
    if (!name) {
      setSignOffError('Enter the signee name.')
      return
    }
    if (!position) {
      setSignOffError('Enter the signee position.')
      return
    }
    if (!hasSignature) {
      setSignOffError('Capture a signature to continue.')
      return
    }
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      setSignOffError('Signature pad not ready.')
      return
    }
    const usableStrokes = signatureStrokesRef.current
      .map(stroke => stroke.map(point => ({ x: point.x, y: point.y })))
      .filter(stroke => stroke.length >= 2)
    if (usableStrokes.length === 0) {
      setSignOffError('Capture a signature to continue.')
      return
    }
    const snags = signOffDraft.snagsText
      .split(/\r?\n/)
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
    const rect = canvas.getBoundingClientRect()
    const signatureDataUrl = canvas.toDataURL('image/png')
    setIsCompletingSignOff(true)
    setSignOffError(null)
    try {
      const result = await onGenerateCustomerSignOff({
        name,
        position,
        decision: signOffDraft.decision,
        snags,
        signatureDataUrl,
        signaturePaths: usableStrokes,
        signatureDimensions: { width: rect.width, height: rect.height },
      })
      if (result) {
        setSignOffError(result)
      } else {
        setIsGeneratingSignOff(false)
        setSignOffDraft({ name: '', position: '', decision: 'option1', snagsText: '' })
        resetSignature()
        setHasSignature(false)
      }
    } finally {
      setIsCompletingSignOff(false)
    }
  }

  const startOnsiteReport = () => {
    if (!canEdit) {
      setOnsiteReportError('You have read-only access.')
      return
    }
    setOnsiteReportDraft(buildDefaultOnsiteReportDraft())
    setOnsiteReportError(null)
    setIsSavingOnsiteReport(false)
    setOnsiteHasSignature(false)
    onsiteSignatureStrokesRef.current = []
    onsiteActiveSignatureStrokeRef.current = null
    resetOnsiteSignature()
    setIsCreatingOnsiteReport(true)
  }

  const cancelOnsiteReport = () => {
    setIsCreatingOnsiteReport(false)
    setIsSavingOnsiteReport(false)
    setOnsiteReportError(null)
    setOnsiteHasSignature(false)
    onsiteSignatureStrokesRef.current = []
    onsiteActiveSignatureStrokeRef.current = null
    resetOnsiteSignature()
    setOnsiteReportDraft(buildDefaultOnsiteReportDraft())
  }

  const handleOnsiteSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || !isCreatingOnsiteReport) {
      return
    }
    const canvas = onsiteSignatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    event.preventDefault()
    const point = getSignaturePoint(canvas, event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    onsiteSignatureDrawingRef.current = true
    const strokeIndex = onsiteSignatureStrokesRef.current.length
    onsiteSignatureStrokesRef.current.push([point])
    onsiteActiveSignatureStrokeRef.current = strokeIndex
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleOnsiteSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onsiteSignatureDrawingRef.current) {
      return
    }
    const canvas = onsiteSignatureCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    event.preventDefault()
    const point = getSignaturePoint(canvas, event)
    const activeIndex = onsiteActiveSignatureStrokeRef.current
    if (activeIndex !== null && onsiteSignatureStrokesRef.current[activeIndex]) {
      onsiteSignatureStrokesRef.current[activeIndex].push(point)
    }
    context.lineTo(point.x, point.y)
    context.stroke()
    setOnsiteHasSignature(true)
  }

  const finishOnsiteSignatureStroke = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (onsiteSignatureDrawingRef.current && event) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onsiteSignatureDrawingRef.current = false
    onsiteActiveSignatureStrokeRef.current = null
    const canvas = onsiteSignatureCanvasRef.current
    const context = canvas?.getContext('2d')
    context?.beginPath()
  }

  const handleOnsiteSignaturePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    finishOnsiteSignatureStroke(event)
  }

  const handleOnsiteSignaturePointerLeave = () => {
    finishOnsiteSignatureStroke()
  }

  const handleSaveOnsiteReport = async () => {
    if (!canEdit) {
      setOnsiteReportError('You have read-only access.')
      return
    }
    const reportDate = onsiteReportDraft.reportDate.trim()
    if (!reportDate) {
      setOnsiteReportError('Select the report date.')
      return
    }
    const engineerName = onsiteReportDraft.engineerName.trim()
    if (!engineerName) {
      setOnsiteReportError('Enter the engineer name.')
      return
    }
    const workSummary = onsiteReportDraft.workSummary.trim()
    if (!workSummary) {
      setOnsiteReportError('Enter the work summary.')
      return
    }
    const signedByName = onsiteReportDraft.signedByName.trim()
    if (!signedByName) {
      setOnsiteReportError('Enter the customer name.')
      return
    }
    const canvas = onsiteSignatureCanvasRef.current
    if (!canvas) {
      setOnsiteReportError('Signature pad not ready.')
      return
    }
    const usableStrokes = onsiteSignatureStrokesRef.current
      .map(stroke => stroke.map(point => ({ x: point.x, y: point.y })))
      .filter(stroke => stroke.length >= 2)
    if (usableStrokes.length === 0) {
      setOnsiteReportError('Capture a signature to continue.')
      return
    }
    const rect = canvas.getBoundingClientRect()
    const signatureDataUrl = canvas.toDataURL('image/png')
    const arrivalTime = onsiteReportDraft.arrivalTime.trim()
    const departureTime = onsiteReportDraft.departureTime.trim()
    const customerContact = onsiteReportDraft.customerContact.trim()
    const siteAddress = onsiteReportDraft.siteAddress.trim()
    const materialsUsed = onsiteReportDraft.materialsUsed.trim()
    const additionalNotes = onsiteReportDraft.additionalNotes.trim()
    const signedByPosition = onsiteReportDraft.signedByPosition.trim()
    const machineId = onsiteReportDraft.machineId.trim()
    const serviceInformation = onsiteReportDraft.serviceInformation.trim()
    const firmwareVersion = onsiteReportDraft.firmwareVersion.trim()

    const serviceEntries = [
      {
        id: createId(),
        machineId: machineId || undefined,
        serviceInformation: serviceInformation || undefined,
        firmwareVersion: firmwareVersion || undefined,
      },
    ]

    setIsSavingOnsiteReport(true)
    setOnsiteReportError(null)
    try {
      const result = await onCreateOnsiteReport({
        reportDate,
        arrivalTime: arrivalTime || undefined,
        departureTime: departureTime || undefined,
        engineerName,
        customerContact: customerContact || undefined,
        siteAddress: siteAddress || undefined,
        workSummary,
        materialsUsed: materialsUsed || undefined,
        additionalNotes: additionalNotes || undefined,
        signedByName,
        signedByPosition: signedByPosition || undefined,
        signatureDataUrl,
        signaturePaths: usableStrokes,
        signatureDimensions: { width: rect.width, height: rect.height },
        machineId: machineId || undefined,
        serviceInformation: serviceInformation || undefined,
        firmwareVersion: firmwareVersion || undefined,
        serviceEntries,
      })
      if (result) {
        setOnsiteReportError(result)
        return
      }
      setIsCreatingOnsiteReport(false)
      setOnsiteReportDraft(buildDefaultOnsiteReportDraft())
      resetOnsiteSignature()
      setOnsiteHasSignature(false)
    } finally {
      setIsSavingOnsiteReport(false)
    }
  }

  const handleRemoveOnsiteReport = async (reportId: string) => {
    if (!canEdit) {
      setOnsiteReportError('You have read-only access.')
      return
    }
    const confirmed = window.confirm('Remove this onsite report?')
    if (!confirmed) {
      return
    }
    setRemovingOnsiteReportId(reportId)
    setOnsiteReportError(null)
    try {
      const result = await onDeleteOnsiteReport(reportId)
      if (result) {
        setOnsiteReportError(result)
      }
    } finally {
      setRemovingOnsiteReportId(null)
    }
  }

  const handleDownloadOnsiteReport = (report: ProjectOnsiteReport) => {
    if (!report.pdfDataUrl) {
      setOnsiteReportError('This onsite report is missing a PDF document.')
      return
    }
    const sanitizedNumber = stripPrefix(project.number, /^P[-\s]?(.+)$/i)
    const datePart = report.reportDate ? report.reportDate.replace(/-/g, '') : ''
    const link = document.createElement('a')
    link.href = report.pdfDataUrl
    link.download = `OnsiteReport-${sanitizedNumber || project.number}-${datePart || report.id}.pdf`
    link.click()
  }

  const handleDownloadSignOffFile = (file: ProjectFile) => {
    try {
      const link = document.createElement('a')
      link.href = file.dataUrl
      link.download = file.name || 'final-acceptance'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to download final acceptance', error)
      setSignOffError('Unable to download the final acceptance document.')
    }
  }

  const handleAddWO = async () => {
    if (!canEdit) {
      setWoError('You have read-only access.')
      return
    }
    const raw = woForm.number.trim()
    if (!raw) {
      setWoError('Enter a work order number.')
      return
    }
    setIsAddingWo(true)
    try {
      const result = await onAddWO({ number: raw, type: woForm.type, note: woForm.note })
      if (result) {
        setWoError(result)
        return
      }
      setWoForm({ number: '', type: 'Build', note: '' })
      setWoError(null)
    } finally {
      setIsAddingWo(false)
    }
  }

  const handleCreateTask = async () => {
    if (!canEdit) {
      setTaskError('You have read-only access.')
      return
    }
    const trimmedName = taskForm.name.trim()
    if (!trimmedName) {
      setTaskError('Enter a task name.')
      return
    }
    if (!taskForm.start) {
      setTaskError('Choose a start date and time.')
      return
    }
    if (!taskForm.end) {
      setTaskError('Choose an end date and time.')
      return
    }
    const startIso = fromDateTimeLocal(taskForm.start)
    if (!startIso) {
      setTaskError('Enter a valid start date and time.')
      return
    }
    const endIso = fromDateTimeLocal(taskForm.end)
    if (!endIso) {
      setTaskError('Enter a valid end date and time.')
      return
    }
    if (Date.parse(endIso) < Date.parse(startIso)) {
      setTaskError('The end time must be after the start time.')
      return
    }

    setIsSavingTask(true)
    try {
      const assigneeId = taskForm.assigneeId.trim()
      const error = await onCreateTask({
        name: trimmedName,
        start: startIso,
        end: endIso,
        assigneeId: assigneeId || undefined,
        status: taskForm.status,
      })
      if (error) {
        setTaskError(error)
        return
      }
      resetTaskForm()
      setIsTaskModalOpen(false)
    } finally {
      setIsSavingTask(false)
    }
  }

  const beginEditingTask = (task: ProjectTask) => {
    setEditingTaskId(task.id)
    setTaskEditDraft({
      name: task.name,
      start: toDateTimeLocal(task.start),
      end: toDateTimeLocal(task.end),
      assigneeId: task.assigneeId ?? '',
      status: task.status,
    })
    setTaskEditError(null)
  }

  const cancelTaskEdit = () => {
    setEditingTaskId(null)
    setTaskEditError(null)
    setIsSavingTaskEdit(false)
  }

  const handleSaveTaskEdit = async () => {
    if (!editingTaskId) {
      return
    }
    if (!canEdit) {
      setTaskEditError('You have read-only access.')
      return
    }
    const trimmedName = taskEditDraft.name.trim()
    if (!trimmedName) {
      setTaskEditError('Enter a task name.')
      return
    }
    if (!taskEditDraft.start) {
      setTaskEditError('Choose a start date and time.')
      return
    }
    if (!taskEditDraft.end) {
      setTaskEditError('Choose an end date and time.')
      return
    }
    const startIso = fromDateTimeLocal(taskEditDraft.start)
    if (!startIso) {
      setTaskEditError('Enter a valid start date and time.')
      return
    }
    const endIso = fromDateTimeLocal(taskEditDraft.end)
    if (!endIso) {
      setTaskEditError('Enter a valid end date and time.')
      return
    }
    if (Date.parse(endIso) < Date.parse(startIso)) {
      setTaskEditError('The end time must be after the start time.')
      return
    }

    setIsSavingTaskEdit(true)
    try {
      const assigneeId = taskEditDraft.assigneeId.trim()
      const error = await onUpdateTask(editingTaskId, {
        name: trimmedName,
        start: startIso,
        end: endIso,
        assigneeId: assigneeId || undefined,
        status: taskEditDraft.status,
      })
      if (error) {
        setTaskEditError(error)
        return
      }
      setEditingTaskId(null)
      setTaskEditError(null)
    } finally {
      setIsSavingTaskEdit(false)
    }
  }

  const handleDeleteTaskClick = (taskId: string) => {
    if (!canEdit) {
      setTaskEditError('You have read-only access.')
      return
    }
    const confirmed = window.confirm('Delete this task?')
    if (!confirmed) {
      return
    }
    void onDeleteTask(taskId)
    if (editingTaskId === taskId) {
      setEditingTaskId(null)
      setTaskEditError(null)
    }
  }

  const handleRemoveDocument = async (category: ProjectFileCategory, fileId: string) => {
    if (!canEdit) {
      updateFileError(category, 'You have read-only access.')
      return
    }
    setRemovingFile({ category, fileId })
    updateFileError(category, null)
    try {
      const result = await onRemoveDocument(category, fileId)
      if (result) {
        updateFileError(category, result)
      }
    } catch (error) {
      console.error('Failed to remove project document', error)
      updateFileError(category, 'Failed to remove document.')
    } finally {
      setRemovingFile(null)
    }
  }

  const handleDownloadDocument = (category: ProjectFileCategory, file: ProjectFile) => {
    try {
      const link = document.createElement('a')
      link.href = file.dataUrl
      link.download = file.name || `${category}-document`
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to download project document', error)
      updateFileError(category, 'Unable to download document.')
    }
  }

  const renderFilePreview = (file: ProjectFile) => {
    if (isPdfDocument(file)) {
      return <iframe src={file.dataUrl} title={`${file.name} preview`} className='h-60 w-full border-0' />
    }
    if (isImageDocument(file)) {
      return <img src={file.dataUrl} alt={file.name} className='h-60 w-full bg-white object-contain' />
    }
    return (
      <div className='flex h-48 flex-col items-center justify-center gap-2 text-xs text-slate-500'>
        <FileText size={24} className='text-slate-400' />
        <span>Preview not available for this file type.</span>
      </div>
    )
  }

  const renderCustomerSignOffSummary = () => {
    if (!customerSignOff) {
      return null
    }
    const completedAt = formatTimestamp(customerSignOff.completedAt)
    const optionCopy = customerSignOff.decision
      ? CUSTOMER_SIGN_OFF_OPTION_COPY[customerSignOff.decision]
      : null
    const snags = customerSignOff.snags ?? []
    const typeLabel =
      customerSignOff.type === 'generated' ? 'Generated final acceptance' : 'Uploaded final acceptance'

    return (
      <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-3'>
            <div>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Status</div>
              <div className='mt-1 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                {typeLabel}
              </div>
            </div>
            {completedAt && (
              <div className='text-xs text-slate-500'>Completed {completedAt}</div>
            )}
            {customerSignOff.signedByName && (
              <div className='text-xs text-slate-500'>
                Signed by {customerSignOff.signedByName}
                {customerSignOff.signedByPosition ? ` — ${customerSignOff.signedByPosition}` : ''}
              </div>
            )}
            <div className='text-xs text-slate-500'>File: {customerSignOff.file.name}</div>
            {optionCopy && (
              <div className='space-y-1'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Acceptance</div>
                <div className='text-sm font-semibold text-slate-800'>{optionCopy.title}</div>
                <p className='text-xs text-slate-500'>{optionCopy.description}</p>
              </div>
            )}
            {snags.length > 0 && (
              <div className='space-y-1'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Snag list</div>
                <ul className='list-disc space-y-1 pl-5 text-xs text-slate-600'>
                  {snags.map((item, index) => (
                    <li key={`${customerSignOff.id}-snag-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {customerSignOff.signatureDataUrl && (
              <div>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Signature</div>
                <div className='mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3'>
                  <img
                    src={customerSignOff.signatureDataUrl}
                    alt='Customer signature'
                    className='max-h-40 w-full object-contain'
                  />
                </div>
              </div>
            )}
          </div>
          <div className='flex flex-col items-stretch gap-2'>
            <Button variant='outline' onClick={() => handleDownloadSignOffFile(customerSignOff.file)}>
              <Download size={16} /> Download PDF
            </Button>
            {canEdit && (
              <Button
                variant='outline'
                onClick={startGeneratingSignOff}
                disabled={isRemovingSignOff || isUploadingSignOff}
              >
                <FileText size={16} /> New Final Acceptance
              </Button>
            )}
            {canEdit && (
              <Button
                variant='ghost'
                className='text-rose-600 hover:bg-rose-50'
                onClick={() => void handleRemoveCustomerSignOff()}
                disabled={isRemovingSignOff}
              >
                <Trash2 size={16} /> Remove
              </Button>
            )}
            {isRemovingSignOff && (
              <span className='text-center text-xs text-slate-500'>Removing…</span>
            )}
          </div>
        </div>
      </div>
    )
  }
  const renderProjectFiles = () => {
    const categoriesWithFiles = PROJECT_FILE_CATEGORIES.filter(
      category => (documents[category]?.length ?? 0) > 0,
    )
    const onsiteReports = project.onsiteReports ?? []
    const sortedOnsiteReports = [...onsiteReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    const renderCategorySection = (category: ProjectFileCategory, allowEmpty: boolean) => {
      const metadata = PROJECT_FILE_METADATA[category]
      const files = documents[category] ?? []
      const errorMessage = fileErrors[category]
      const hasFiles = files.length > 0
      if (!hasFiles && !allowEmpty) {
        return null
      }
      return (
        <div key={category} className='rounded-2xl border border-slate-200/70 bg-white/90'>
          <div className='border-b border-slate-200/70 px-5 py-4'>
            <div className='text-sm font-semibold text-slate-800'>{metadata.label}</div>
            <p className='mt-1 text-xs text-slate-500'>{metadata.description}</p>
          </div>
          {hasFiles ? (
            <div className='space-y-3 px-5 py-4'>
              {files.map(file => {
                const uploadedAt = formatTimestamp(file.uploadedAt)
                const isPreviewOpen = expandedPreviews.has(file.id)
                const isRemoving =
                  removingFile?.category === category && removingFile.fileId === file.id
                return (
                  <div key={file.id} className='rounded-xl border border-slate-200/70 bg-white/90'>
                    <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>{file.name}</div>
                        {uploadedAt && (
                          <div className='text-xs text-slate-500'>Uploaded {uploadedAt}</div>
                        )}
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button variant='outline' onClick={() => togglePreview(file.id)}>
                          {isPreviewOpen ? 'Hide Preview' : 'Preview'}
                        </Button>
                        <Button variant='outline' onClick={() => handleDownloadDocument(category, file)}>
                          <Download size={16} />
                        </Button>
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => void handleRemoveDocument(category, file.id)}
                          disabled={!canEdit || isRemoving}
                          title={canEdit ? 'Remove file' : 'Read-only access'}
                        >
                          <Trash2 size={16} />
                        </Button>
                        {isRemoving && <span className='text-xs text-slate-500'>Removing…</span>}
                      </div>
                    </div>
                    {isPreviewOpen && (
                      <div className='border-t border-slate-200/70 bg-slate-50 p-4'>
                        {renderFilePreview(file)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className='px-5 py-4 text-sm text-slate-500'>No files uploaded yet.</div>
          )}
          {errorMessage && (
            <p className='flex items-center gap-1 px-5 pb-4 text-sm text-rose-600'>
              <AlertCircle size={14} /> {errorMessage}
            </p>
          )}
        </div>
      )
    }

    const allCategorySections = PROJECT_FILE_CATEGORIES.map(category =>
      renderCategorySection(category, false),
    ).filter(Boolean) as JSX.Element[]

    const renderDocumentsView = () => {
      if (activeFileTab === 'all') {
        return categoriesWithFiles.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
            No project files uploaded yet.
          </div>
        ) : (
          <div className='space-y-4'>{allCategorySections}</div>
        )
      }
      if (isProjectFileCategoryTab(activeFileTab)) {
        const section = renderCategorySection(activeFileTab, true)
        return <div className='space-y-4'>{section}</div>
      }
      return null
    }

    const renderFinalAcceptanceView = () => (
      <div className='space-y-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <p className='text-xs text-slate-400'>
            Use the upload button above to attach a signed final acceptance document.
          </p>
          {!isGeneratingSignOff && (
            <Button
              variant='outline'
              onClick={startGeneratingSignOff}
              disabled={!canEdit}
              title={canEdit ? 'Generate final acceptance' : 'Read-only access'}
            >
              <FileText size={16} /> Generate Final Acceptance
            </Button>
          )}
        </div>
        {isUploadingSignOff && <p className='text-xs text-slate-500'>Uploading…</p>}
        {signOffError && !isGeneratingSignOff && (
          <p className='flex items-center gap-1 text-sm text-rose-600'>
            <AlertCircle size={14} /> {signOffError}
          </p>
        )}
        <div className='space-y-4'>
          {isGeneratingSignOff
            ? renderCustomerSignOffForm()
            : customerSignOff
            ? renderCustomerSignOffSummary()
            : (
                <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
                  No final acceptance recorded yet.
                </div>
              )}
        </div>
      </div>
    )

    const renderOnsiteReportsView = () => (
      <div className='space-y-4'>
        {onsiteReportError && !isCreatingOnsiteReport && (
          <p className='flex items-center gap-1 text-sm text-rose-600'>
            <AlertCircle size={14} /> {onsiteReportError}
          </p>
        )}
        {isCreatingOnsiteReport && (
          <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
            <div className='grid gap-3 md:grid-cols-2'>
              <div>
                <Label htmlFor='onsite-date'>Report date</Label>
                <input
                  id='onsite-date'
                  type='date'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.reportDate}
                  onChange={event => updateOnsiteReportField('reportDate', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-engineer'>Engineer</Label>
                <Input
                  id='onsite-engineer'
                  value={onsiteReportDraft.engineerName}
                  onChange={event => updateOnsiteReportField('engineerName', (event.target as HTMLInputElement).value)}
                  placeholder='Engineer name'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-arrival'>Arrival time</Label>
                <input
                  id='onsite-arrival'
                  type='time'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.arrivalTime}
                  step={1800}
                  onChange={event => updateOnsiteReportField('arrivalTime', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-departure'>Departure time</Label>
                <input
                  id='onsite-departure'
                  type='time'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.departureTime}
                  step={1800}
                  onChange={event => updateOnsiteReportField('departureTime', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-contact'>Customer contact</Label>
                <Input
                  id='onsite-contact'
                  value={onsiteReportDraft.customerContact}
                  onChange={event => updateOnsiteReportField('customerContact', (event.target as HTMLInputElement).value)}
                  placeholder='Customer representative'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-position'>Customer position</Label>
                <Input
                  id='onsite-position'
                  value={onsiteReportDraft.signedByPosition}
                  onChange={event => updateOnsiteReportField('signedByPosition', (event.target as HTMLInputElement).value)}
                  placeholder='e.g. Operations Manager'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-machine'>Machine serviced</Label>
                <select
                  id='onsite-machine'
                  className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.machineId}
                  onChange={event => updateOnsiteReportField('machineId', (event.target as HTMLSelectElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport || machineOptions.length === 0}
                >
                  <option value=''>Select machine</option>
                  {machineOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {machineOptions.length === 0 ? (
                  <p className='mt-1 text-xs text-slate-500'>Record machines for this customer to track service history.</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor='onsite-firmware'>Firmware version</Label>
                <Input
                  id='onsite-firmware'
                  value={onsiteReportDraft.firmwareVersion}
                  onChange={event => updateOnsiteReportField('firmwareVersion', (event.target as HTMLInputElement).value)}
                  placeholder='e.g. v2.3.1'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-site-address'>Site address</Label>
                <textarea
                  id='onsite-site-address'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={2}
                  value={onsiteReportDraft.siteAddress}
                  onChange={event => updateOnsiteReportField('siteAddress', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Where was the work completed?'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-service-info'>Service information</Label>
                <textarea
                  id='onsite-service-info'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={3}
                  value={onsiteReportDraft.serviceInformation}
                  onChange={event => updateOnsiteReportField('serviceInformation', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Document the service activities performed on the machine'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-work-summary'>Work summary</Label>
                <textarea
                  id='onsite-work-summary'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={4}
                  value={onsiteReportDraft.workSummary}
                  onChange={event => updateOnsiteReportField('workSummary', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Describe the work carried out onsite'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-materials'>Materials used</Label>
                <textarea
                  id='onsite-materials'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={3}
                  value={onsiteReportDraft.materialsUsed}
                  onChange={event => updateOnsiteReportField('materialsUsed', (event.target as HTMLTextAreaElement).value)}
                  placeholder='List any materials or parts used'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-notes'>Additional notes</Label>
                <textarea
                  id='onsite-notes'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={3}
                  value={onsiteReportDraft.additionalNotes}
                  onChange={event => updateOnsiteReportField('additionalNotes', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Any additional remarks'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-signee'>Customer name</Label>
                <Input
                  id='onsite-signee'
                  value={onsiteReportDraft.signedByName}
                  onChange={event => updateOnsiteReportField('signedByName', (event.target as HTMLInputElement).value)}
                  placeholder='Customer name'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
            </div>
            <div className='mt-4 space-y-2'>
              <Label>Signature</Label>
              <p className='text-xs text-slate-500'>Ask the customer to sign below.</p>
              <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                <canvas
                  ref={onsiteSignatureCanvasRef}
                  className='h-36 w-full'
                  style={{ touchAction: 'none' }}
                  onPointerDown={handleOnsiteSignaturePointerDown}
                  onPointerMove={handleOnsiteSignaturePointerMove}
                  onPointerUp={handleOnsiteSignaturePointerUp}
                  onPointerLeave={handleOnsiteSignaturePointerLeave}
                />
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Button variant='outline' onClick={resetOnsiteSignature} disabled={isSavingOnsiteReport || !canEdit}>
                  <X size={16} /> Clear signature
                </Button>
                <span className='text-xs text-slate-500'>
                  {onsiteHasSignature ? 'Signature captured.' : 'Use your cursor or finger to sign.'}
                </span>
              </div>
            </div>
            {onsiteReportError && (
              <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
                <AlertCircle size={14} /> {onsiteReportError}
              </p>
            )}
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <Button onClick={() => void handleSaveOnsiteReport()} disabled={isSavingOnsiteReport || !canEdit}>
                {isSavingOnsiteReport ? 'Saving…' : 'Save onsite report'}
              </Button>
              <Button variant='ghost' onClick={cancelOnsiteReport} disabled={isSavingOnsiteReport}>
                <X size={16} /> Cancel
              </Button>
            </div>
          </div>
        )}
        {sortedOnsiteReports.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
            No onsite reports recorded yet.
          </div>
        ) : (
          <div className='space-y-4'>
            {sortedOnsiteReports.map(report => {
              const createdDisplay = formatTimestamp(report.createdAt)
              return (
                <div key={report.id} className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <div className='text-sm font-semibold text-slate-800'>Report on {report.reportDate || '—'}</div>
                      <div className='text-xs text-slate-500'>Engineer: {report.engineerName || '—'}</div>
                      {(report.arrivalTime || report.departureTime) && (
                        <div className='text-xs text-slate-500'>
                          Arrival {report.arrivalTime || '—'} · Departure {report.departureTime || '—'}
                        </div>
                      )}
                      <div className='text-xs text-slate-500'>
                        Machine: {report.machineSerialNumber || 'Not specified'}
                      </div>
                      {createdDisplay && (
                        <div className='text-xs text-slate-400'>Created {createdDisplay}</div>
                      )}
                      {report.customerContact && (
                        <div className='text-xs text-slate-500'>Customer contact: {report.customerContact}</div>
                      )}
                      {report.siteAddress && (
                        <div className='text-xs text-slate-500 whitespace-pre-wrap'>Site address: {report.siteAddress}</div>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button variant='outline' onClick={() => handleDownloadOnsiteReport(report)}>
                        <Download size={16} /> Download PDF
                      </Button>
                      {canEdit && (
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => void handleRemoveOnsiteReport(report.id)}
                          disabled={removingOnsiteReportId === report.id}
                        >
                          <Trash2 size={16} /> Remove
                        </Button>
                      )}
                      {removingOnsiteReportId === report.id && (
                        <span className='text-xs text-slate-500'>Removing…</span>
                      )}
                    </div>
                  </div>
                  <div className='mt-4 grid gap-4 md:grid-cols-2'>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Service information</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.serviceInformation || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Firmware version</div>
                      <p className='mt-2 text-sm text-slate-700'>
                        {report.firmwareVersion || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Work summary</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.workSummary || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Materials used</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.materialsUsed || 'Not provided.'}
                      </p>
                    </div>
                    <div className='md:col-span-2'>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Additional notes</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.additionalNotes || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Customer name</div>
                      <p className='mt-2 text-sm text-slate-700'>
                        {report.signedByName || '—'}
                        {report.signedByPosition ? ` — ${report.signedByPosition}` : ''}
                      </p>
                    </div>
                  </div>
                  {report.signatureDataUrl && (
                    <div className='mt-4'>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Signature</div>
                      <div className='mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3'>
                        <img
                          src={report.signatureDataUrl}
                          alt={`Onsite report signature for ${report.signedByName ?? 'customer'}`}
                          className='max-h-32 w-full object-contain'
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )

    const isFinalAcceptanceView = activeFileTab === 'finalAcceptance'
    const isOnsiteReportsView = activeFileTab === 'onsiteReports'
    const headerTitle = isFinalAcceptanceView
      ? 'Final acceptance'
      : isOnsiteReportsView
      ? 'Onsite reports'
      : 'Project files'
    const headerDescription = isFinalAcceptanceView
      ? 'Generate or upload the signed final acceptance for this project.'
      : isOnsiteReportsView
      ? 'Capture onsite visit summaries and customer signatures.'
      : 'Upload design documentation and installation packs for this project.'
    let headerActions: JSX.Element | null = null
    if (isOnsiteReportsView) {
      headerActions =
        !isCreatingOnsiteReport ? (
          <Button
            variant='outline'
            onClick={startOnsiteReport}
            disabled={!canEdit}
            title={canEdit ? 'New onsite report' : 'Read-only access'}
          >
            <FileText size={16} /> New Onsite Report
          </Button>
        ) : null
    } else if (isFinalAcceptanceView) {
      headerActions = (
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            onClick={openUploadDialog}
            disabled={!canEdit || isUploadingSignOff}
            title={canEdit ? 'Upload final acceptance' : 'Read-only access'}
          >
            <Upload size={16} /> Upload
          </Button>
        </div>
      )
    } else {
      headerActions = (
        <Button
          variant='outline'
          onClick={openUploadDialog}
          disabled={!canEdit}
          className='rounded-full px-2 py-2'
          title={canEdit ? 'Upload file' : 'Read-only access'}
        >
          <Upload size={16} />
          <span className='sr-only'>Upload file</span>
        </Button>
      )
    }

    return (
      <div className='space-y-6'>
        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <div className='text-sm font-semibold text-slate-800'>{headerTitle}</div>
              <p className='text-xs text-slate-500'>{headerDescription}</p>
              {isFinalAcceptanceView ? (
                <p className='mt-2 text-xs text-slate-400'>
                  Use the upload button above to attach a signed final acceptance document.
                </p>
              ) : null}
            </div>
            {headerActions}
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            {PROJECT_FILE_TAB_OPTIONS.map(option => {
              const isActive = activeFileTab === option.value
              return (
                <button
                  key={option.value}
                  type='button'
                  onClick={() => setActiveFileTab(option.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <div className='mt-4 space-y-4'>
            {isOnsiteReportsView
              ? renderOnsiteReportsView()
              : isFinalAcceptanceView
              ? renderFinalAcceptanceView()
              : renderDocumentsView()}
          </div>
        </section>
      </div>
    )
  }


  const renderCustomerSignOffForm = () => (
    <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <Label>Signee name</Label>
          <Input
            value={signOffDraft.name}
            onChange={(event) =>
              setSignOffDraft(prev => ({ ...prev, name: (event.target as HTMLInputElement).value }))
            }
            placeholder='Customer name'
            disabled={isCompletingSignOff || !canEdit}
          />
        </div>
        <div>
          <Label>Position</Label>
          <Input
            value={signOffDraft.position}
            onChange={(event) =>
              setSignOffDraft(prev => ({ ...prev, position: (event.target as HTMLInputElement).value }))
            }
            placeholder='e.g. Operations Manager'
            disabled={isCompletingSignOff || !canEdit}
          />
        </div>
      </div>
      <div className='mt-4 space-y-2'>
        <Label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Acceptance</Label>
        <div className='space-y-2'>
          {CUSTOMER_SIGN_OFF_OPTIONS.map(option => {
            const isSelected = signOffDraft.decision === option.value
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                  isSelected
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type='radio'
                  className='mt-1'
                  checked={isSelected}
                  onChange={() =>
                    setSignOffDraft(prev => ({ ...prev, decision: option.value }))
                  }
                  disabled={isCompletingSignOff || !canEdit}
                />
                <div>
                  <div className='font-semibold text-slate-800'>{option.title}</div>
                  <p className='text-xs text-slate-500'>{option.description}</p>
                </div>
              </label>
            )
          })}
        </div>
      </div>
      {(signOffDraft.decision === 'option2' || signOffDraft.decision === 'option3') && (
        <div className='mt-4'>
          <Label>Snag list</Label>
          <textarea
            className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
            rows={3}
            value={signOffDraft.snagsText}
            onChange={(event) =>
              setSignOffDraft(prev => ({ ...prev, snagsText: (event.target as HTMLTextAreaElement).value }))
            }
            placeholder='Enter each outstanding item on a new line'
            disabled={isCompletingSignOff || !canEdit}
          />
        </div>
      )}
      <div className='mt-4 space-y-2'>
        <Label>Signature</Label>
        <p className='text-xs text-slate-500'>Ask the customer to sign below.</p>
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          <canvas
            ref={signatureCanvasRef}
            className='h-40 w-full'
            style={{ touchAction: 'none' }}
            onPointerDown={handleSignaturePointerDown}
            onPointerMove={handleSignaturePointerMove}
            onPointerUp={handleSignaturePointerUp}
            onPointerLeave={handleSignaturePointerLeave}
          />
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            onClick={() => {
              resetSignature()
            }}
            disabled={isCompletingSignOff || !canEdit}
          >
            <X size={16} /> Clear signature
          </Button>
          <span className='text-xs text-slate-500'>
            {hasSignature ? 'Signature captured.' : 'Use your cursor or finger to sign.'}
          </span>
        </div>
      </div>
      {signOffError && (
        <p className='mt-4 flex items-center gap-1 text-sm text-rose-600'>
          <AlertCircle size={14} /> {signOffError}
        </p>
      )}
      <div className='mt-4 flex flex-wrap items-center gap-2'>
        <Button onClick={() => void handleCompleteSignOff()} disabled={isCompletingSignOff || !canEdit}>
          {isCompletingSignOff ? 'Saving…' : 'Complete final acceptance'}
        </Button>
        <Button variant='ghost' onClick={cancelGeneratingSignOff} disabled={isCompletingSignOff}>
          <X size={16} /> Cancel
        </Button>
      </div>
    </div>
  )


  const renderProjectInfo = () => {
    const info = project.info
    const machines = info?.machines ?? []
    const salespersonName = info?.salespersonId
      ? users.find(user => user.id === info.salespersonId)?.name ?? info.salespersonName ?? null
      : info?.salespersonName ?? null

    return (
      <div className='space-y-6'>
        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-4 space-y-2'>
            <div className='text-sm font-semibold text-slate-800'>Recorded project info</div>
            <p className='text-xs text-slate-500'>This metadata is included when generating customer final acceptance PDFs.</p>
            <p className='text-xs text-slate-400'>Use the edit button above to update these details alongside the project note.</p>
            {infoStatus && (
              <p className='text-xs text-emerald-600'>{infoStatus}</p>
            )}
          </div>
          {hasProjectInfo ? (
            <div className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div>
                  <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>General</div>
                  <dl className='mt-2 space-y-1 text-sm text-slate-700'>
                    <div className='flex justify-between gap-3'>
                      <dt className='text-slate-500'>Cobalt Order #</dt>
                      <dd className='text-right font-medium text-slate-800'>
                        {info?.cobaltOrderNumber ?? '—'}
                      </dd>
                    </div>
                    <div className='flex justify-between gap-3'>
                      <dt className='text-slate-500'>Customer Order #</dt>
                      <dd className='text-right font-medium text-slate-800'>
                        {info?.customerOrderNumber ?? '—'}
                      </dd>
                    </div>
                    <div className='flex justify-between gap-3'>
                      <dt className='text-slate-500'>Salesperson</dt>
                      <dd className='text-right font-medium text-slate-800'>
                        {salespersonName ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Schedule</div>
                  <dl className='mt-2 space-y-1 text-sm text-slate-700'>
                    <div className='flex justify-between gap-3'>
                      <dt className='text-slate-500'>Start date</dt>
                      <dd className='text-right font-medium text-slate-800'>
                        {info?.startDate ?? '—'}
                      </dd>
                    </div>
                    <div className='flex justify-between gap-3'>
                      <dt className='text-slate-500'>Proposed completion</dt>
                      <dd className='text-right font-medium text-slate-800'>
                        {info?.proposedCompletionDate ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Machines &amp; tools</div>
                {machines.length > 0 ? (
                  <ul className='mt-2 space-y-3 text-xs text-slate-600'>
                    {machines.map((machine, index) => {
                      const label = machine.machineSerialNumber.trim() || 'Not specified'
                      return (
                        <li
                          key={`${machine.machineSerialNumber || 'machine'}-${index}`}
                          className='space-y-2 rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-sm'
                        >
                          <div className='flex items-center justify-between gap-2 text-sm font-semibold text-slate-700'>
                            <span>Machine: {label}</span>
                            <span className='text-xs font-medium text-slate-500'>
                              {machine.toolSerialNumbers.length}{' '}
                              {machine.toolSerialNumbers.length === 1 ? 'tool' : 'tools'}
                            </span>
                          </div>
                          {machine.lineReference?.trim() ? (
                            <div className='text-xs text-slate-500'>Line: {machine.lineReference}</div>
                          ) : null}
                          {machine.toolSerialNumbers.length > 0 ? (
                            <ul className='space-y-1'>
                              {machine.toolSerialNumbers.map((serial, toolIndex) => (
                                <li key={`${serial}-${toolIndex}`} className='flex items-center gap-2'>
                                  <span className='h-1.5 w-1.5 rounded-full bg-slate-400' aria-hidden />
                                  <span>{serial}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className='text-xs text-slate-400'>No tool serial numbers recorded.</p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className='mt-2 text-xs text-slate-400'>No machines recorded.</p>
                )}
              </div>
            </div>
          ) : (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
              No project information recorded yet.
            </div>
          )}
        </section>

      </div>
    )
  }


  const renderWorkOrders = () => {
    const buildWOs = project.wos.filter(wo => wo.type === 'Build')
    const onsiteWOs = project.wos.filter(wo => wo.type === 'Onsite')

    return (
      <div className='space-y-6'>
        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-2 text-sm font-semibold text-slate-800'>Add Work Order</div>
          <div className='grid gap-3 md:grid-cols-[minmax(0,200px)_minmax(0,160px)_minmax(0,1fr)]'>
            <div>
              <Label>WO Number</Label>
              <div className='flex'>
                <span className='flex items-center rounded-l-2xl border border-r-0 border-slate-200/80 bg-slate-100/70 px-3 py-2 text-sm font-semibold text-slate-500'>
                  WO
                </span>
                <Input
                  className='rounded-l-none border-l-0'
                  value={woForm.number}
                  onChange={(event) => {
                    setWoForm({ ...woForm, number: event.target.value })
                    if (woError) setWoError(null)
                  }}
                  placeholder='000000'
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <select
                className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                value={woForm.type}
                onChange={(event) => {
                  setWoForm({ ...woForm, type: event.target.value as WOType })
                  if (woError) setWoError(null)
                }}
                disabled={!canEdit}
              >
                <option value='Build'>Build</option>
                <option value='Onsite'>Onsite</option>
              </select>
            </div>
            <div>
              <Label>Optional note</Label>
              <Input
                value={woForm.note}
                onChange={(event) => setWoForm({ ...woForm, note: event.target.value })}
                placeholder='e.g. Line 2 SAT'
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className='mt-3 space-y-2'>
            <Button
              disabled={isAddingWo || !canEdit}
              onClick={() => void handleAddWO()}
              title={canEdit ? 'Add work order' : 'Read-only access'}
            >
              <Plus size={16} /> Add WO
            </Button>
            {woError && (
              <p className='flex items-center gap-1 text-sm text-rose-600'>
                <AlertCircle size={14} /> {woError}
              </p>
            )}
          </div>
        </section>

        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-3 text-sm font-semibold text-slate-800'>Existing Work Orders</div>
          <div className='grid gap-4 md:grid-cols-2'>
            <div>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Build</div>
              {buildWOs.length === 0 ? (
                <p className='mt-2 text-sm text-slate-500'>None yet.</p>
              ) : (
                <div className='mt-2 space-y-2'>
                  {buildWOs.map(wo => (
                    <div
                      key={wo.id}
                      className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm'
                    >
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>
                          {wo.number}
                          <span className='ml-2 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700'>
                            {wo.type}
                          </span>
                        </div>
                        {wo.note && <div className='text-xs text-slate-500'>{wo.note}</div>}
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          onClick={() => navigator.clipboard.writeText(stripPrefix(wo.number, /^WO[-\s]?(.+)$/i))}
                          title='Copy work order'
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => onDeleteWO(wo.id)}
                          title={canEdit ? 'Delete work order' : 'Read-only access'}
                          disabled={!canEdit}
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Onsite</div>
              {onsiteWOs.length === 0 ? (
                <p className='mt-2 text-sm text-slate-500'>None yet.</p>
              ) : (
                <div className='mt-2 space-y-2'>
                  {onsiteWOs.map(wo => (
                    <div
                      key={wo.id}
                      className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm'
                    >
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>
                          {wo.number}
                          <span className='ml-2 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700'>
                            {wo.type}
                          </span>
                        </div>
                        {wo.note && <div className='text-xs text-slate-500'>{wo.note}</div>}
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          onClick={() => navigator.clipboard.writeText(stripPrefix(wo.number, /^WO[-\s]?(.+)$/i))}
                          title='Copy work order'
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => onDeleteWO(wo.id)}
                          title={canEdit ? 'Delete work order' : 'Read-only access'}
                          disabled={!canEdit}
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderTasks = () => {
    const hasTasks = tasks.length > 0

    return (
      <div className='space-y-6'>
        <div className='flex justify-end'>
          <Button onClick={openTaskModal} disabled={!canEdit}>
            <Plus size={16} /> Add Task
          </Button>
        </div>
        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
            <div className='text-sm font-semibold text-slate-800'>Project timeline</div>
            <div className='flex flex-wrap items-center gap-3 text-xs text-slate-500'>
              {PROJECT_TASK_STATUSES.map(status => (
                <span key={status} className='inline-flex items-center gap-1'>
                  <span className={`h-2.5 w-2.5 rounded-full ${TASK_STATUS_META[status].swatchClass}`} aria-hidden />
                  {status}
                </span>
              ))}
            </div>
          </div>
          {hasTasks ? (
            <TaskGanttChart tasks={tasks} />
          ) : (
            <p className='text-sm text-slate-500'>Add a task with a start and end time to see it on the timeline.</p>
          )}
        </section>
        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <div className='text-sm font-semibold text-slate-800'>Existing tasks</div>
            <span className='text-xs text-slate-500'>
              {tasks.length === 1 ? '1 task scheduled' : `${tasks.length} tasks scheduled`}
            </span>
          </div>
          {!hasTasks ? (
            <p className='text-sm text-slate-500'>Use the “Add Task” button to schedule the first task for this project.</p>
          ) : (
            <div className='space-y-3'>
              {tasks.map(task => {
                const isEditing = editingTaskId === task.id
                const assigneeName = task.assigneeName ??
                  (task.assigneeId ? users.find(user => user.id === task.assigneeId)?.name ?? null : null)
                return (
                  <div
                    key={task.id}
                    className='rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm'
                  >
                    {!isEditing ? (
                      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                        <div className='space-y-1'>
                          <div className='text-sm font-semibold text-slate-900'>{task.name}</div>
                          <div className='text-xs text-slate-500'>{formatTaskRange(task)}</div>
                          {assigneeName ? (
                            <div className='flex items-center gap-1 text-xs text-slate-500'>
                              <UserIcon size={12} className='text-slate-400' />
                              <span>{assigneeName}</span>
                            </div>
                          ) : null}
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TASK_STATUS_META[task.status].badgeClass}`}
                          >
                            {task.status}
                          </span>
                          <Button
                            variant='outline'
                            onClick={() => beginEditingTask(task)}
                            disabled={!canEdit}
                            title={canEdit ? 'Edit task' : 'Read-only access'}
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button
                            variant='ghost'
                            className='text-rose-600 hover:bg-rose-50'
                            onClick={() => handleDeleteTaskClick(task.id)}
                            disabled={!canEdit}
                            title={canEdit ? 'Delete task' : 'Read-only access'}
                          >
                            <Trash2 size={14} /> Delete
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className='space-y-3'>
                        <div className='grid gap-3 md:grid-cols-2'>
                          <div>
                            <Label>Task name</Label>
                            <Input
                              value={taskEditDraft.name}
                              onChange={event => {
                                setTaskEditDraft(prev => ({ ...prev, name: event.target.value }))
                                if (taskEditError) setTaskEditError(null)
                              }}
                              disabled={!canEdit}
                            />
                          </div>
                          <div>
                            <Label>Assignee</Label>
                            <select
                              className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={taskEditDraft.assigneeId}
                              onChange={event => {
                                setTaskEditDraft(prev => ({
                                  ...prev,
                                  assigneeId: (event.target as HTMLSelectElement).value,
                                }))
                                if (taskEditError) setTaskEditError(null)
                              }}
                              disabled={!canEdit}
                            >
                              <option value=''>Unassigned</option>
                              {sortedUsers.map(user => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label>Start</Label>
                            <input
                              type='datetime-local'
                              className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={taskEditDraft.start}
                              step={1800}
                              onChange={event => {
                                setTaskEditDraft(prev => ({ ...prev, start: (event.target as HTMLInputElement).value }))
                                if (taskEditError) setTaskEditError(null)
                              }}
                              disabled={!canEdit}
                            />
                          </div>
                          <div>
                            <Label>End</Label>
                            <input
                              type='datetime-local'
                              className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={taskEditDraft.end}
                              step={1800}
                              onChange={event => {
                                setTaskEditDraft(prev => ({ ...prev, end: (event.target as HTMLInputElement).value }))
                                if (taskEditError) setTaskEditError(null)
                              }}
                              disabled={!canEdit}
                            />
                          </div>
                          <div>
                            <Label>Status</Label>
                            <select
                              className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                              value={taskEditDraft.status}
                              onChange={event => {
                                setTaskEditDraft(prev => ({ ...prev, status: event.target.value as ProjectTaskStatus }))
                                if (taskEditError) setTaskEditError(null)
                              }}
                              disabled={!canEdit}
                            >
                              {PROJECT_TASK_STATUSES.map(status => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {taskEditError && (
                          <p className='flex items-center gap-1 text-sm text-rose-600'>
                            <AlertCircle size={14} /> {taskEditError}
                          </p>
                        )}
                        <div className='flex flex-wrap justify-end gap-2'>
                          <Button variant='outline' onClick={cancelTaskEdit} disabled={isSavingTaskEdit}>
                            Cancel
                          </Button>
                          <Button onClick={() => void handleSaveTaskEdit()} disabled={isSavingTaskEdit || !canEdit}>
                            {isSavingTaskEdit ? 'Saving…' : 'Save task'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <>
      <Card className='panel'>
        <CardHeader className='space-y-5'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='flex flex-col gap-4 lg:max-w-2xl'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <nav className='flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500'>
                  <button
                    type='button'
                    onClick={onNavigateToCustomers}
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  >
                    Customers
                  </button>
                  <ChevronRight size={12} className='text-slate-400' aria-hidden />
                  <button
                    type='button'
                    onClick={onNavigateToCustomer}
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  >
                    {customer.name}
                  </button>
                  <ChevronRight size={12} className='text-slate-400' aria-hidden />
                  <button
                    type='button'
                    onClick={onReturnToIndex}
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  >
                    Projects
                  </button>
                  <ChevronRight size={12} className='text-slate-400' aria-hidden />
                  <span className='text-slate-800 font-semibold'>{project.number}</span>
                </nav>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    onClick={() => navigator.clipboard.writeText(stripPrefix(project.number, /^P[-\s]?(.+)$/i))}
                    className='rounded-full px-2 py-2'
                    title='Copy project number'
                  >
                    <Copy size={16} />
                    <span className='sr-only'>Copy project number</span>
                  </Button>
                  <Button
                    variant='outline'
                    onClick={openNoteDialog}
                    className='rounded-full px-2 py-2'
                    title={canEdit ? 'Edit project note' : 'Read-only access'}
                    disabled={!canEdit}
                  >
                    <Pencil size={16} />
                    <span className='sr-only'>Edit project note</span>
                  </Button>
                  <Button
                    variant='ghost'
                    className='rounded-full px-2 py-2 text-rose-600 hover:bg-rose-50'
                    onClick={() => {
                      const confirmed = window.confirm('Delete this project and all associated records?')
                      if (!confirmed) return
                      onDeleteProject()
                    }}
                    title={canEdit ? 'Delete project' : 'Read-only access'}
                    disabled={!canEdit}
                  >
                    <Trash2 size={16} />
                    <span className='sr-only'>Delete project</span>
                  </Button>
                </div>
              </div>
              <div className='space-y-2'>
                <div className='text-4xl font-semibold tracking-tight text-slate-900'>{project.number}</div>
                <div className='flex flex-wrap items-center gap-2 text-sm text-slate-500'>
                  <span className='text-base font-medium text-slate-600'>{customer.name}</span>
                  {project.note ? (
                    <>
                      <span className='text-slate-300'>•</span>
                      <span className='text-sm text-slate-500 whitespace-pre-wrap'>{project.note}</span>
                    </>
                  ) : (
                    <span className='italic text-slate-400'>No project note added.</span>
                  )}
                </div>
                <div className='flex flex-wrap items-center gap-2 text-xs text-slate-500'>
                  <span className='font-semibold uppercase tracking-wide text-slate-500'>Site</span>
                  <select
                    className='rounded-xl border border-slate-200 bg-white/80 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                    value={project.siteId ?? ''}
                    onChange={(event) =>
                      onUpdateProjectSite((event.target as HTMLSelectElement).value || null)
                    }
                    disabled={!canEdit}
                  >
                    <option value=''>Unassigned</option>
                    {customer.sites.map(site => (
                      <option key={site.id} value={site.id}>
                        {site.name?.trim() || site.address?.trim() || 'Unnamed site'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className='flex flex-col items-end gap-2 text-right'>
              <span className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Status</span>
              <div className='flex items-center gap-2'>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    statusSelectionOption?.indicatorClass ?? 'bg-slate-300'
                  }`}
                />
                <select
                  className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed ${
                    statusSelectionOption?.selectClass ?? 'border-slate-200 bg-white text-slate-800'
                  }`}
                  value={statusSelectionValue}
                  onChange={(event) => handleStatusSelectionChange(event.target.value)}
                  disabled={!canEdit}
                >
                  {STATUS_SELECTIONS.map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {latestStatusEntry && (
                <div className='inline-flex items-center gap-1 text-xs text-slate-500'>
                  <Clock size={12} className='text-slate-400' />
                  <span>
                    Updated {formatTimestamp(latestStatusEntry.changedAt) ?? 'recently'} by {latestStatusEntry.changedBy}
                  </span>
                </div>
              )}
              {statusHistory.length > 1 && (
                <button
                  type='button'
                  className='flex items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-800'
                  onClick={() => setShowStatusHistory(prev => !prev)}
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showStatusHistory ? 'rotate-180' : ''}`}
                  />
                  <span>{showStatusHistory ? 'Hide status history' : 'View status history'}</span>
                </button>
              )}
            </div>
          </div>
          {showStatusHistory && statusHistory.length > 1 && (
            <div className='rounded-2xl border border-slate-200 bg-white/80 p-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Status history</div>
              <ul className='mt-2 space-y-1 text-xs text-slate-500'>
                {statusHistory.map(entry => (
                  <li key={entry.id} className='flex items-start gap-2'>
                    <Clock size={12} className='mt-0.5 text-slate-400' />
                    <span>
                      {formatTimestamp(entry.changedAt) ?? 'Unknown time'} — {entry.changedBy} set to{' '}
                      {formatProjectStatus(entry.status, entry.activeSubStatus)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2'>
          {PROJECT_TABS.map(tab => {
            const isActive = activeTab === tab.value
            const count =
              tab.value === 'files'
                ? documentsCount
              : tab.value === 'workOrders'
                ? project.wos.length
                : tab.value === 'info'
                ? (hasProjectInfo ? 1 : 0)
                : tasks.length
            return (
              <button
                key={tab.value}
                type='button'
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                onClick={() => setActiveTab(tab.value)}
              >
                <span>{tab.label}</span>
                <span className='ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold'>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className='pt-2'>
          {activeTab === 'tasks'
            ? renderTasks()
            : activeTab === 'info'
            ? renderProjectInfo()
            : activeTab === 'files'
            ? renderProjectFiles()
            : renderWorkOrders()}
        </div>
      </CardContent>
      </Card>
      <AnimatePresence>
        {isTaskModalOpen && (
          <motion.div
            key='task-dialog'
            className='fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeTaskModal}
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
                    <Plus size={18} /> <span className='font-medium'>Add task</span>
                  </div>
                  <Button variant='ghost' onClick={closeTaskModal} title='Close' disabled={isSavingTask}>
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className='grid gap-3 md:grid-cols-2'>
                    <div>
                      <Label htmlFor='modal-task-name'>Task name</Label>
                      <Input
                        id='modal-task-name'
                        value={taskForm.name}
                        onChange={event => {
                          setTaskForm(prev => ({ ...prev, name: event.target.value }))
                          if (taskError) setTaskError(null)
                        }}
                        placeholder='e.g. Install conveyors'
                        disabled={!canEdit || isSavingTask}
                      />
                    </div>
                    <div>
                      <Label htmlFor='modal-task-assignee'>Assignee</Label>
                      <select
                        id='modal-task-assignee'
                        className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={taskForm.assigneeId}
                        onChange={event => {
                          setTaskForm(prev => ({ ...prev, assigneeId: (event.target as HTMLSelectElement).value }))
                          if (taskError) setTaskError(null)
                        }}
                        disabled={!canEdit || isSavingTask}
                      >
                        <option value=''>Unassigned</option>
                        {sortedUsers.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor='modal-task-start'>Start</Label>
                      <input
                        id='modal-task-start'
                        type='datetime-local'
                        className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={taskForm.start}
                        step={1800}
                        onChange={event => {
                          setTaskForm(prev => ({ ...prev, start: (event.target as HTMLInputElement).value }))
                          if (taskError) setTaskError(null)
                        }}
                        disabled={!canEdit || isSavingTask}
                      />
                    </div>
                    <div>
                      <Label htmlFor='modal-task-end'>End</Label>
                      <input
                        id='modal-task-end'
                        type='datetime-local'
                        className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={taskForm.end}
                        step={1800}
                        onChange={event => {
                          setTaskForm(prev => ({ ...prev, end: (event.target as HTMLInputElement).value }))
                          if (taskError) setTaskError(null)
                        }}
                        disabled={!canEdit || isSavingTask}
                      />
                    </div>
                    <div>
                      <Label htmlFor='modal-task-status'>Status</Label>
                      <select
                        id='modal-task-status'
                        className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        value={taskForm.status}
                        onChange={event => {
                          setTaskForm(prev => ({ ...prev, status: event.target.value as ProjectTaskStatus }))
                          if (taskError) setTaskError(null)
                        }}
                        disabled={!canEdit || isSavingTask}
                      >
                        {PROJECT_TASK_STATUSES.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {taskError && (
                    <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
                      <AlertCircle size={14} /> {taskError}
                    </p>
                  )}
                  <div className='mt-4 flex justify-end gap-2'>
                    <Button variant='outline' onClick={closeTaskModal} disabled={isSavingTask}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleCreateTask()}
                      disabled={isSavingTask || !canEdit}
                      title={canEdit ? 'Add task' : 'Read-only access'}
                    >
                      {isSavingTask ? 'Saving…' : 'Add Task'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isUploadDialogOpen && (
          <motion.div
            key='upload-dialog'
            className='fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeUploadDialog}
          >
            <motion.div
              className='w-full max-w-lg'
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <Card className='panel'>
                <CardHeader className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Upload size={18} />
                    <span className='font-medium'>Upload project file</span>
                  </div>
                  <Button variant='ghost' onClick={closeUploadDialog} title='Close'>
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className='space-y-4'>
                    <div>
                      <Label htmlFor='project-upload-category'>File type</Label>
                      <select
                        id='project-upload-category'
                        className='mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                        value={uploadDialogCategory}
                        onChange={(event) => {
                          setUploadDialogCategory(event.target.value as UploadCategory)
                          setUploadDialogFile(null)
                          setUploadDialogError(null)
                        }}
                        disabled={isSubmittingUpload || !canEdit}
                      >
                        {UPLOAD_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {uploadDialogCategory === 'finalAcceptance' ? (
                        <p className='mt-2 text-xs text-slate-500'>{FINAL_ACCEPTANCE_UPLOAD_DESCRIPTION}</p>
                      ) : (
                        <p className='mt-2 text-xs text-slate-500'>
                          {PROJECT_FILE_METADATA[uploadDialogCategory].description}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor='project-upload-file'>File</Label>
                      <input
                        id='project-upload-file'
                        type='file'
                        accept={PROJECT_FILE_ACCEPT}
                        className='mt-2 w-full rounded-xl border border-dashed border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                        onChange={handleUploadDialogFileChange}
                        disabled={isSubmittingUpload || !canEdit}
                      />
                      {uploadDialogFile && (
                        <p className='mt-2 text-xs text-slate-500'>Selected: {uploadDialogFile.name}</p>
                      )}
                    </div>
                    {uploadDialogError && (
                      <p className='flex items-center gap-1 text-sm text-rose-600'>
                        <AlertCircle size={14} /> {uploadDialogError}
                      </p>
                    )}
                    <div className='flex justify-end gap-2 pt-2'>
                      <Button variant='ghost' onClick={closeUploadDialog} disabled={isSubmittingUpload}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleUploadSubmit()}
                        disabled={isSubmittingUpload || !canEdit}
                      >
                        {isSubmittingUpload ? 'Uploading…' : 'Upload file'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
        {isNoteDialogOpen && (
          <motion.div
            key='note-dialog'
            className='fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeNoteDialog}
          >
            <motion.div
              className='w-full max-w-3xl'
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <Card className='panel flex max-h-[90vh] flex-col overflow-hidden'>
                <CardHeader className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Pencil size={18} />
                    <span className='font-medium'>Edit project note</span>
                  </div>
                  <Button variant='ghost' onClick={closeNoteDialog} title='Close'>
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent className='max-h-full overflow-y-auto pr-1'>
                  <div className='space-y-6'>
                    <div>
                      <Label>Project note</Label>
                      <textarea
                        className='mt-2 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                        rows={4}
                        value={noteDraft}
                        onChange={(event) => setNoteDraft((event.target as HTMLTextAreaElement).value)}
                        placeholder='Add a note about this project (optional)…'
                        disabled={!canEdit || isSavingInfo}
                      />
                    </div>
                    <div>
                      <div className='mb-4 space-y-1'>
                        <div className='text-sm font-semibold text-slate-800'>Project info</div>
                        <p className='text-xs text-slate-500'>Provide project metadata, serial numbers, and sales context.</p>
                      </div>
                      <div className='grid gap-3 md:grid-cols-2'>
                        <div>
                          <Label htmlFor='info-salesperson'>Salesperson</Label>
                          <select
                            id='info-salesperson'
                            className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={infoDraft.salespersonId}
                            onChange={event =>
                              updateInfoField('salespersonId', (event.target as HTMLSelectElement).value)
                            }
                            disabled={!canEdit || isSavingInfo}
                          >
                            <option value=''>Unassigned</option>
                            {sortedUsers.map(user => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <MachineToolListInput
                          id='info-machines'
                          machines={infoDraft.machines}
                          onChange={machines => updateInfoField('machines', machines)}
                          disabled={!canEdit || isSavingInfo}
                          className='md:col-span-2'
                        />
                        <div>
                          <Label htmlFor='info-cobalt-order'>Cobalt Order Number</Label>
                          <Input
                            id='info-cobalt-order'
                            value={infoDraft.cobaltOrderNumber}
                            onChange={event => updateInfoField('cobaltOrderNumber', (event.target as HTMLInputElement).value)}
                            placeholder='e.g. CO-12345'
                            disabled={!canEdit || isSavingInfo}
                          />
                        </div>
                        <div>
                          <Label htmlFor='info-customer-order'>Customer Order Number</Label>
                          <Input
                            id='info-customer-order'
                            value={infoDraft.customerOrderNumber}
                            onChange={event => updateInfoField('customerOrderNumber', (event.target as HTMLInputElement).value)}
                            placeholder='e.g. PO-90876'
                            disabled={!canEdit || isSavingInfo}
                          />
                        </div>
                        <div>
                          <Label htmlFor='info-start-date'>Project Start Date</Label>
                          <input
                            id='info-start-date'
                            type='date'
                            className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={infoDraft.startDate}
                            onChange={event => updateInfoField('startDate', (event.target as HTMLInputElement).value)}
                            disabled={!canEdit || isSavingInfo}
                          />
                        </div>
                        <div>
                          <Label htmlFor='info-proposed-completion'>Proposed Completion Date</Label>
                          <input
                            id='info-proposed-completion'
                            type='date'
                            className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                            value={infoDraft.proposedCompletionDate}
                            onChange={event =>
                              updateInfoField('proposedCompletionDate', (event.target as HTMLInputElement).value)
                            }
                            disabled={!canEdit || isSavingInfo}
                          />
                        </div>
                      </div>
                    </div>
                    {infoError && (
                      <p className='flex items-center gap-1 text-sm text-rose-600'>
                        <AlertCircle size={14} /> {infoError}
                      </p>
                    )}
                    <div className='flex flex-wrap justify-between gap-2'>
                      <Button variant='ghost' onClick={closeNoteDialog} disabled={isSavingInfo}>
                        Cancel
                      </Button>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          variant='ghost'
                          onClick={handleClearProjectInfo}
                          disabled={!canEdit || isSavingInfo}
                        >
                          Clear info
                        </Button>
                        <Button onClick={handleSaveProjectDetails} disabled={!canEdit || isSavingInfo}>
                          {isSavingInfo ? 'Saving…' : 'Save changes'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
