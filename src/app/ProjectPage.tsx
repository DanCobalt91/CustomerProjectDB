import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
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
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  Customer,
  Project,
  ProjectActiveSubStatus,
  ProjectCustomerSignOff,
  ProjectFile,
  ProjectFileCategory,
  ProjectStatus,
  WOType,
  CustomerSignOffDecision,
  CustomerSignOffSubmission,
} from '../types'
import {
  DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  PROJECT_ACTIVE_SUB_STATUS_OPTIONS,
  PROJECT_FILE_CATEGORIES,
  formatProjectStatus,
} from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { CUSTOMER_SIGN_OFF_OPTIONS, CUSTOMER_SIGN_OFF_OPTION_COPY } from '../lib/signOff'

export type ProjectPageProps = {
  customer: Customer
  project: Project
  canEdit: boolean
  currentUser: string
  onUpdateProjectNote: (note: string) => void
  onUpdateProjectStatus: (
    status: ProjectStatus,
    activeSubStatus?: ProjectActiveSubStatus,
    context?: { changedBy: string },
  ) => void
  onAddWO: (data: { number: string; type: WOType; note?: string }) => Promise<string | null>
  onDeleteWO: (woId: string) => void
  onUploadDocument: (category: ProjectFileCategory, file: File) => Promise<string | null>
  onRemoveDocument: (category: ProjectFileCategory, fileId: string) => Promise<string | null>
  onUploadCustomerSignOff: (file: File) => Promise<string | null>
  onGenerateCustomerSignOff: (submission: CustomerSignOffSubmission) => Promise<string | null>
  onRemoveCustomerSignOff: () => Promise<string | null>
  onDeleteProject: () => void
  onNavigateBack: () => void
  onReturnToIndex: () => void
  onNavigateToCustomers: () => void
}

const PROJECT_FILE_METADATA: Record<ProjectFileCategory, { label: string; description: string }> = {
  fds: {
    label: 'FDS Documents',
    description: 'Upload FDS documents to keep design references with the project record.',
  },
  electrical: {
    label: 'Electrical Files',
    description: 'Attach relevant electrical drawings or documentation.',
  },
  mechanical: {
    label: 'Mechanical Files',
    description: 'Upload mechanical drawings and supporting documents.',
  },
}

const PROJECT_FILE_ACCEPT =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.svg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/svg+xml'

const PROJECT_TABS = [
  { value: 'files', label: 'Project Files' },
  { value: 'workOrders', label: 'Work Orders' },
] as const

type ProjectTab = (typeof PROJECT_TABS)[number]['value']

function stripPrefix(value: string, pattern: RegExp): string {
  const trimmed = value.trim()
  const match = trimmed.match(pattern)
  return match ? match[1].trim() : trimmed
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
  currentUser,
  onUpdateProjectNote,
  onUpdateProjectStatus,
  onAddWO,
  onDeleteWO,
  onUploadDocument,
  onRemoveDocument,
  onUploadCustomerSignOff,
  onGenerateCustomerSignOff,
  onRemoveCustomerSignOff,
  onDeleteProject,
  onNavigateBack,
  onReturnToIndex,
  onNavigateToCustomers,
}: ProjectPageProps) {
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>(project.status)
  const [activeSubStatusDraft, setActiveSubStatusDraft] = useState<ProjectActiveSubStatus>(
    project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  )
  const [noteDraft, setNoteDraft] = useState(project.note ?? '')
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ProjectTab>('files')
  const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
  const [woError, setWoError] = useState<string | null>(null)
  const [isAddingWo, setIsAddingWo] = useState(false)
  const [fileErrors, setFileErrors] = useState<Record<ProjectFileCategory, string | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
  })
  const [uploadingCategory, setUploadingCategory] = useState<ProjectFileCategory | null>(null)
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
  const fileInputRefs = useRef<Record<ProjectFileCategory, HTMLInputElement | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
  })
  const uploadSignOffInputRef = useRef<HTMLInputElement | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const signatureDrawingRef = useRef(false)
  const signatureStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const activeSignatureStrokeRef = useRef<number | null>(null)

  const documents = project.documents ?? {}
  const documentsCount = useMemo(
    () =>
      PROJECT_FILE_CATEGORIES.reduce(
        (count, category) => count + (project.documents?.[category]?.length ?? 0),
        0,
      ),
    [project.documents],
  )
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

  const openNoteDialog = () => {
    if (!canEdit) {
      return
    }
    setNoteDraft(project.note ?? '')
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
    setFileErrors({ fds: null, electrical: null, mechanical: null })
    setUploadingCategory(null)
    setRemovingFile(null)
    setExpandedPreviews(new Set())
    setActiveTab('files')
    setIsUploadingSignOff(false)
    setIsRemovingSignOff(false)
    setIsGeneratingSignOff(false)
    setIsCompletingSignOff(false)
    setSignOffError(null)
    setSignOffDraft({ name: '', position: '', decision: 'option1', snagsText: '' })
    resetSignature()
    setShowStatusHistory(false)
  }, [project.id, resetSignature])

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

  const updateFileError = (category: ProjectFileCategory, message: string | null) => {
    setFileErrors(prev => ({ ...prev, [category]: message }))
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
      { changedBy: currentUser },
    )
  }

  const handleSignOffFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setIsUploadingSignOff(true)
    setSignOffError(null)
    try {
      const result = await onUploadCustomerSignOff(file)
      if (result) {
        setSignOffError(result)
      }
    } finally {
      setIsUploadingSignOff(false)
    }
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
    const confirmed = window.confirm('Remove the existing customer sign off?')
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
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
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
        signatureDimensions: { width: canvas.width, height: canvas.height },
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

  const handleDownloadSignOffFile = (file: ProjectFile) => {
    try {
      const link = document.createElement('a')
      link.href = file.dataUrl
      link.download = file.name || 'customer-sign-off'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to download customer sign off', error)
      setSignOffError('Unable to download the sign off document.')
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

  const handleFileChange = async (category: ProjectFileCategory, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!canEdit) {
      updateFileError(category, 'You have read-only access.')
      event.target.value = ''
      return
    }

    setUploadingCategory(category)
    updateFileError(category, null)
    try {
      const result = await onUploadDocument(category, file)
      if (result) {
        updateFileError(category, result)
      }
    } catch (error) {
      console.error('Failed to upload project document', error)
      updateFileError(category, 'Failed to upload document.')
    } finally {
      setUploadingCategory(null)
      event.target.value = ''
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
      customerSignOff.type === 'generated' ? 'Generated sign off' : 'Uploaded sign off'

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
                <FileText size={16} /> New Sign Off
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
          {isCompletingSignOff ? 'Saving…' : 'Complete sign off'}
        </Button>
        <Button variant='ghost' onClick={cancelGeneratingSignOff} disabled={isCompletingSignOff}>
          <X size={16} /> Cancel
        </Button>
      </div>
    </div>
  )

  const renderProjectFiles = () => (
    <div className='space-y-6'>
      <div className='space-y-4'>
        {PROJECT_FILE_CATEGORIES.map(category => {
          const metadata = PROJECT_FILE_METADATA[category]
          const files = documents[category] ?? []
          const isUploading = uploadingCategory === category
          const errorMessage = fileErrors[category]
          return (
            <section key={category} className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <div className='text-sm font-semibold text-slate-800'>{metadata.label}</div>
                  <p className='text-xs text-slate-500'>{metadata.description}</p>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    onClick={() => fileInputRefs.current[category]?.click()}
                    disabled={!canEdit || isUploading}
                    title={canEdit ? 'Upload files' : 'Read-only access'}
                  >
                    <Upload size={16} /> Upload File
                  </Button>
                  {isUploading && <span className='text-xs text-slate-500'>Uploading…</span>}
                </div>
              </div>

              <input
                ref={node => {
                  fileInputRefs.current[category] = node
                }}
                type='file'
                accept={PROJECT_FILE_ACCEPT}
                className='hidden'
                onChange={(event) => void handleFileChange(category, event)}
              />

              <div className='mt-4 space-y-3'>
                {files.length === 0 ? (
                  <div className='text-sm text-slate-500'>No files uploaded yet.</div>
                ) : (
                  files.map(file => {
                    const uploadedAt = formatTimestamp(file.uploadedAt)
                    const isPreviewOpen = expandedPreviews.has(file.id)
                    const isRemoving =
                      removingFile?.category === category && removingFile.fileId === file.id
                    return (
                      <div
                        key={file.id}
                        className='rounded-xl border border-slate-200/70 bg-white/90'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
                          <div>
                            <div className='text-sm font-semibold text-slate-800'>{file.name}</div>
                            {uploadedAt && (
                              <div className='text-xs text-slate-500'>Uploaded {uploadedAt}</div>
                            )}
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Button
                              variant='outline'
                              onClick={() => togglePreview(file.id)}
                            >
                              {isPreviewOpen ? 'Hide Preview' : 'Preview'}
                            </Button>
                            <Button
                              variant='outline'
                              onClick={() => handleDownloadDocument(category, file)}
                            >
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
                  })
                )}
              </div>

              {errorMessage && (
                <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
                  <AlertCircle size={14} /> {errorMessage}
                </p>
              )}
            </section>
          )
        })}
      </div>

      <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <div className='text-sm font-semibold text-slate-800'>Customer Sign Off</div>
            <p className='text-xs text-slate-500'>Upload a signed approval or complete the sign off with your customer.</p>
          </div>
          {!isGeneratingSignOff && (
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                onClick={() => uploadSignOffInputRef.current?.click()}
                disabled={!canEdit || isUploadingSignOff}
                title={canEdit ? 'Upload customer sign off' : 'Read-only access'}
              >
                <Upload size={16} /> Upload File
              </Button>
              <Button
                variant='outline'
                onClick={startGeneratingSignOff}
                disabled={!canEdit}
                title={canEdit ? 'Generate customer sign off' : 'Read-only access'}
              >
                <FileText size={16} /> Generate Sign Off
              </Button>
            </div>
          )}
        </div>
        <input
          ref={uploadSignOffInputRef}
          type='file'
          accept={PROJECT_FILE_ACCEPT}
          className='hidden'
          onChange={handleSignOffFileChange}
        />
        {isUploadingSignOff && <p className='mt-3 text-xs text-slate-500'>Uploading…</p>}
        {signOffError && !isGeneratingSignOff && (
          <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
            <AlertCircle size={14} /> {signOffError}
          </p>
        )}
        <div className='mt-4 space-y-4'>
          {isGeneratingSignOff
            ? renderCustomerSignOffForm()
            : customerSignOff
            ? renderCustomerSignOffSummary()
            : (
                <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
                  No customer sign off recorded yet.
                </div>
              )}
        </div>
      </section>
    </div>
  )

  const renderWorkOrders = () => (
    <div className='space-y-6'>
      <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
        <div className='mb-2 text-sm font-semibold text-slate-800'>Existing Work Orders</div>
        <div className='space-y-2'>
          {project.wos.length === 0 && <div className='text-sm text-slate-500'>None yet.</div>}
          {project.wos.map(wo => (
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
      </section>

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
    </div>
  )

  return (
    <>
      <Card className='panel'>
        <CardHeader className='space-y-5'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='flex flex-col gap-4'>
              <div className='flex flex-wrap items-center gap-3'>
                <Button variant='outline' onClick={onNavigateBack}>
                  <ArrowLeft size={16} /> Back to {customer.name}
                </Button>
                <nav className='flex flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  <button
                    type='button'
                    onClick={onNavigateToCustomers}
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  >
                    Customers
                  </button>
                  <ChevronRight size={12} className='text-slate-400' />
                  <span className='text-slate-800'>{customer.name}</span>
                  <ChevronRight size={12} className='text-slate-400' />
                  <button
                    type='button'
                    onClick={onReturnToIndex}
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-600 transition hover:text-slate-900'
                  >
                    Projects
                  </button>
                  <ChevronRight size={12} className='text-slate-400' />
                  <span className='text-slate-800'>{project.number}</span>
                </nav>
              </div>
              <div>
                <div className='text-3xl font-semibold tracking-tight text-slate-900'>{project.number}</div>
                <div className='mt-1 text-base text-slate-500'>{customer.name}</div>
              </div>
            </div>
            <div className='flex flex-col items-end gap-3'>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  onClick={() => navigator.clipboard.writeText(stripPrefix(project.number, /^P[-\s]?(.+)$/i))}
                  title='Copy project number'
                  className='rounded-full px-2 py-2'
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
                  <div className='flex items-center gap-1 text-xs text-slate-500'>
                    <Clock size={12} />
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
          </div>

          <div className='space-y-3'>
            <div className='rounded-2xl border border-slate-200 bg-white/90 p-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Project note</div>
              <p
                className={`mt-2 ${
                  project.note ? 'whitespace-pre-wrap text-sm text-slate-700' : 'text-sm italic text-slate-400'
                }`}
              >
                {project.note ? project.note : 'No note added yet.'}
              </p>
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
              tab.value === 'files' ? documentsCount : project.wos.length
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

        <div className='pt-2'>{activeTab === 'files' ? renderProjectFiles() : renderWorkOrders()}</div>
      </CardContent>
      </Card>
      <AnimatePresence>
        {isNoteDialogOpen && (
          <motion.div
            className='fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeNoteDialog}
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
                    <Pencil size={18} />
                    <span className='font-medium'>Edit project note</span>
                  </div>
                  <Button variant='ghost' onClick={closeNoteDialog} title='Close'>
                    <X size={16} />
                  </Button>
                </CardHeader>
                <CardContent>
                  <Label>Project note</Label>
                  <textarea
                    className='mt-2 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                    rows={4}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft((event.target as HTMLTextAreaElement).value)}
                    placeholder='Add a note about this project (optional)…'
                    disabled={!canEdit}
                  />
                  <div className='mt-4 flex justify-end gap-2'>
                    <Button variant='ghost' onClick={closeNoteDialog}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        onUpdateProjectNote(noteDraft)
                        closeNoteDialog()
                      }}
                      disabled={!canEdit}
                    >
                      Save note
                    </Button>
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
