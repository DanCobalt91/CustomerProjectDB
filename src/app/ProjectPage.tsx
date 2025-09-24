import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  List,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type {
  Customer,
  Project,
  ProjectActiveSubStatus,
  ProjectFile,
  ProjectFileCategory,
  ProjectStatus,
  WOType,
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
  onAddSignOff: (data: { category: ProjectFileCategory; signedBy: string; note?: string }) => Promise<string | null>
  onRemoveSignOff: (signOffId: string) => Promise<string | null>
  onDeleteProject: () => void
  onNavigateBack: () => void
  onReturnToIndex: () => void
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
  onAddSignOff,
  onRemoveSignOff,
  onDeleteProject,
  onNavigateBack,
  onReturnToIndex,
}: ProjectPageProps) {
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>(project.status)
  const [activeSubStatusDraft, setActiveSubStatusDraft] = useState<ProjectActiveSubStatus>(
    project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  )
  const [noteDraft, setNoteDraft] = useState(project.note ?? '')
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
  const [signOffForm, setSignOffForm] = useState({
    category: PROJECT_FILE_CATEGORIES[0],
    signedBy: currentUser,
    note: '',
  })
  const [isSavingSignOff, setIsSavingSignOff] = useState(false)
  const [signOffError, setSignOffError] = useState<string | null>(null)
  const [removingSignOffId, setRemovingSignOffId] = useState<string | null>(null)
  const [showStatusHistory, setShowStatusHistory] = useState(false)
  const fileInputRefs = useRef<Record<ProjectFileCategory, HTMLInputElement | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
  })

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
  const signOffs = project.signOffs ?? []

  useEffect(() => {
    setStatusDraft(project.status)
    setActiveSubStatusDraft(project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    setNoteDraft(project.note ?? '')
    setWoForm({ number: '', type: 'Build', note: '' })
    setWoError(null)
    setFileErrors({ fds: null, electrical: null, mechanical: null })
    setUploadingCategory(null)
    setRemovingFile(null)
    setExpandedPreviews(new Set())
    setActiveTab('files')
    setSignOffForm({ category: PROJECT_FILE_CATEGORIES[0], signedBy: currentUser, note: '' })
    setIsSavingSignOff(false)
    setSignOffError(null)
    setRemovingSignOffId(null)
    setShowStatusHistory(false)
  }, [project.id, currentUser])

  useEffect(() => {
    setNoteDraft(prev => {
      const next = project.note ?? ''
      return prev === next ? prev : next
    })
  }, [project.note])

  useEffect(() => {
    setStatusDraft(project.status)
  }, [project.status])

  useEffect(() => {
    if (project.status === 'Active') {
      setActiveSubStatusDraft(project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    }
  }, [project.status, project.activeSubStatus])

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

  const handleStatusChange = (nextStatus: ProjectStatus) => {
    setStatusDraft(nextStatus)
    if (!canEdit) {
      return
    }
    if (nextStatus === project.status) {
      if (nextStatus === 'Active') {
        const currentStage = project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        if (currentStage === activeSubStatusDraft) {
          return
        }
      } else {
        return
      }
    }

    if (nextStatus === 'Active') {
      onUpdateProjectStatus('Active', activeSubStatusDraft, { changedBy: currentUser })
    } else {
      onUpdateProjectStatus('Complete', undefined, { changedBy: currentUser })
    }
  }

  const handleActiveSubStatusChange = (nextStage: ProjectActiveSubStatus) => {
    setActiveSubStatusDraft(nextStage)
    if (!canEdit) {
      return
    }
    const currentStage = project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
    if (project.status === 'Active' && currentStage === nextStage) {
      return
    }
    onUpdateProjectStatus('Active', nextStage, { changedBy: currentUser })
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

  const handleAddSignOff = async () => {
    if (!canEdit) {
      setSignOffError('You have read-only access.')
      return
    }
    const signedBy = signOffForm.signedBy.trim()
    if (!signedBy) {
      setSignOffError('Enter a name for the sign off.')
      return
    }
    setIsSavingSignOff(true)
    setSignOffError(null)
    try {
      const note = signOffForm.note.trim()
      const result = await onAddSignOff({
        category: signOffForm.category,
        signedBy,
        note: note ? note : undefined,
      })
      if (result) {
        setSignOffError(result)
      } else {
        setSignOffForm(prev => ({ category: prev.category, signedBy: currentUser, note: '' }))
      }
    } catch (error) {
      console.error('Failed to add project sign off', error)
      setSignOffError('Failed to add sign off.')
    } finally {
      setIsSavingSignOff(false)
    }
  }

  const handleRemoveSignOff = async (signOffId: string) => {
    if (!canEdit) {
      setSignOffError('You have read-only access.')
      return
    }
    setRemovingSignOffId(signOffId)
    setSignOffError(null)
    try {
      const result = await onRemoveSignOff(signOffId)
      if (result) {
        setSignOffError(result)
      }
    } catch (error) {
      console.error('Failed to remove project sign off', error)
      setSignOffError('Failed to remove sign off.')
    } finally {
      setRemovingSignOffId(null)
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
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='text-sm font-semibold text-slate-800'>Sign Off</div>
            <p className='text-xs text-slate-500'>Record approvals for each project area.</p>
          </div>
        </div>

        <div className='mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]'>
          <div>
            <Label>Area</Label>
            <select
              className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
              value={signOffForm.category}
              onChange={(event) =>
                setSignOffForm(prev => ({
                  ...prev,
                  category: event.target.value as ProjectFileCategory,
                }))
              }
              disabled={isSavingSignOff || !canEdit}
            >
              {PROJECT_FILE_CATEGORIES.map(option => (
                <option key={option} value={option}>
                  {PROJECT_FILE_METADATA[option].label}
                </option>
              ))}
            </select>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            <div>
              <Label>Signed By</Label>
              <Input
                value={signOffForm.signedBy}
                onChange={(event) =>
                  setSignOffForm(prev => ({ ...prev, signedBy: event.target.value }))
                }
                disabled={isSavingSignOff || !canEdit}
                placeholder='e.g. Jane Smith'
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <textarea
                className='h-full min-h-[38px] w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                rows={2}
                value={signOffForm.note}
                onChange={(event) =>
                  setSignOffForm(prev => ({ ...prev, note: event.target.value }))
                }
                disabled={isSavingSignOff || !canEdit}
                placeholder='Add context for this approval'
              />
            </div>
          </div>
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <Button
            onClick={() => void handleAddSignOff()}
            disabled={isSavingSignOff || !canEdit}
            title={canEdit ? 'Add sign off' : 'Read-only access'}
          >
            <CheckCircle2 size={16} /> Add Sign Off
          </Button>
          {isSavingSignOff && <span className='text-xs text-slate-500'>Saving…</span>}
          {signOffError && (
            <span className='flex items-center gap-1 text-sm text-rose-600'>
              <AlertCircle size={14} /> {signOffError}
            </span>
          )}
        </div>

        <div className='mt-4 space-y-3'>
          {signOffs.length === 0 ? (
            <div className='text-sm text-slate-500'>No sign offs recorded yet.</div>
          ) : (
            signOffs.map(entry => {
              const signedAt = formatTimestamp(entry.signedAt)
              return (
                <div
                  key={entry.id}
                  className='flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 p-4'
                >
                  <div>
                    <div className='flex items-center gap-2 text-sm font-semibold text-slate-800'>
                      <CheckCircle2 size={16} className='text-emerald-500' />
                      <span>{PROJECT_FILE_METADATA[entry.category].label}</span>
                    </div>
                    <div className='mt-1 text-xs text-slate-500'>
                      Signed by {entry.signedBy}
                      {signedAt ? ` on ${signedAt}` : ''}
                    </div>
                    {entry.note && <div className='mt-1 text-xs text-slate-500'>{entry.note}</div>}
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='ghost'
                      className='text-rose-600 hover:bg-rose-50'
                      onClick={() => void handleRemoveSignOff(entry.id)}
                      disabled={!canEdit || removingSignOffId === entry.id}
                      title={canEdit ? 'Remove sign off' : 'Read-only access'}
                    >
                      <Trash2 size={16} />
                    </Button>
                    {removingSignOffId === entry.id && (
                      <span className='text-xs text-slate-500'>Removing…</span>
                    )}
                  </div>
                </div>
              )
            })
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
    <Card className='panel'>
      <CardHeader className='space-y-5'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button variant='outline' onClick={onNavigateBack}>
              <ArrowLeft size={16} /> Back to {customer.name}
            </Button>
            <Button variant='outline' onClick={onReturnToIndex} title='Return to project index'>
              <List size={16} /> Return to index
            </Button>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='flex flex-col items-stretch gap-2 text-right'>
              <Label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Status</Label>
              <div className='flex flex-wrap items-center justify-end gap-2'>
                <select
                  className='rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={statusDraft}
                  onChange={(event) => handleStatusChange(event.target.value as ProjectStatus)}
                  disabled={!canEdit}
                >
                  <option value='Active'>Active</option>
                  <option value='Complete'>Complete</option>
                </select>
                {statusDraft === 'Active' && (
                  <select
                    className='rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                    value={activeSubStatusDraft}
                    onChange={(event) =>
                      handleActiveSubStatusChange(event.target.value as ProjectActiveSubStatus)
                    }
                    disabled={!canEdit}
                  >
                    {PROJECT_ACTIVE_SUB_STATUS_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {latestStatusEntry && (
                <div className='flex items-center justify-end gap-1 text-xs text-slate-500'>
                  <Clock size={12} />
                  <span>
                    Updated {formatTimestamp(latestStatusEntry.changedAt) ?? 'recently'} by{' '}
                    {latestStatusEntry.changedBy}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant='outline'
              onClick={() => navigator.clipboard.writeText(stripPrefix(project.number, /^P[-\s]?(.+)$/i))}
              title='Copy project number'
            >
              <Copy size={16} />
              <span className='sr-only'>Copy project number</span>
            </Button>
            <Button
              variant='ghost'
              className='text-rose-600 hover:bg-rose-50'
              onClick={() => {
                const confirmed = window.confirm('Delete this project and all associated records?')
                if (!confirmed) return
                onDeleteProject()
              }}
              title={canEdit ? 'Delete project' : 'Read-only access'}
              disabled={!canEdit}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        <div className='space-y-3'>
          <div className='text-lg font-semibold text-slate-800'>Project: {project.number}</div>
          <div>
            <Label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Project Note</Label>
            <textarea
              className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
              rows={3}
              value={noteDraft}
              placeholder='Add a note about this project (optional)…'
              onChange={(event) => {
                const next = event.target.value
                setNoteDraft(next)
                onUpdateProjectNote(next)
              }}
              disabled={!canEdit}
            />
          </div>
          {statusHistory.length > 1 && (
            <div>
              <button
                type='button'
                className='flex items-center gap-2 text-xs font-medium text-slate-600 transition hover:text-slate-800'
                onClick={() => setShowStatusHistory(prev => !prev)}
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showStatusHistory ? 'rotate-180' : ''}`}
                />
                <span>View status history</span>
              </button>
              {showStatusHistory && (
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
              )}
            </div>
          )}
        </div>
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
  )
}
