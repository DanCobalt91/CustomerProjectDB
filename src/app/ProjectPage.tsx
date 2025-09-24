import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertCircle, ArrowLeft, ChevronDown, Copy, Download, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
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
  onUpdateProjectNote: (note: string) => void
  onUpdateProjectStatus: (status: ProjectStatus, activeSubStatus?: ProjectActiveSubStatus) => void
  onAddWO: (data: { number: string; type: WOType; note?: string }) => Promise<string | null>
  onDeleteWO: (woId: string) => void
  onUploadDocument: (category: ProjectFileCategory, file: File) => Promise<string | null>
  onRemoveDocument: (category: ProjectFileCategory) => Promise<string | null>
  onDeleteProject: () => void
  onNavigateBack: () => void
}

const PROJECT_FILE_METADATA: Record<ProjectFileCategory, { label: string; description: string }> = {
  fds: {
    label: 'FDS Document',
    description: 'Upload a PDF or Word document to keep it with this project.',
  },
  electrical: {
    label: 'Electrical Drawing',
    description: 'Upload an electrical drawing (PDF or image).',
  },
  mechanical: {
    label: 'Mechanical Drawing',
    description: 'Upload a mechanical drawing (PDF or image).',
  },
}

const PROJECT_FILE_ACCEPT =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.svg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/svg+xml'

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

function formatUploadedTimestamp(file?: ProjectFile): string | null {
  if (!file?.uploadedAt) {
    return null
  }
  const parsed = Date.parse(file.uploadedAt)
  if (Number.isNaN(parsed)) {
    return null
  }
  return new Date(parsed).toLocaleString()
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm'>
      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{label}</div>
      <div className='text-lg font-semibold text-slate-800'>{value}</div>
    </div>
  )
}

export default function ProjectPage({
  customer,
  project,
  canEdit,
  onUpdateProjectNote,
  onUpdateProjectStatus,
  onAddWO,
  onDeleteWO,
  onUploadDocument,
  onRemoveDocument,
  onDeleteProject,
  onNavigateBack,
}: ProjectPageProps) {
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>(project.status)
  const [activeSubStatusDraft, setActiveSubStatusDraft] = useState<ProjectActiveSubStatus>(
    project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS,
  )
  const [noteDraft, setNoteDraft] = useState(project.note ?? '')
  const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
  const [woError, setWoError] = useState<string | null>(null)
  const [isAddingWo, setIsAddingWo] = useState(false)
  const [fileErrors, setFileErrors] = useState<Record<ProjectFileCategory, string | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
  })
  const [uploadingCategory, setUploadingCategory] = useState<ProjectFileCategory | null>(null)
  const [removingCategory, setRemovingCategory] = useState<ProjectFileCategory | null>(null)
  const [filesExpanded, setFilesExpanded] = useState(() =>
    PROJECT_FILE_CATEGORIES.some(category => !!project.documents?.[category]),
  )
  const fileInputRefs = useRef<Record<ProjectFileCategory, HTMLInputElement | null>>({
    fds: null,
    electrical: null,
    mechanical: null,
  })
  const documents = project.documents ?? {}
  const documentsCount = useMemo(
    () => PROJECT_FILE_CATEGORIES.reduce((count, category) => (project.documents?.[category] ? count + 1 : count), 0),
    [project.documents],
  )

  useEffect(() => {
    setStatusDraft(project.status)
    setActiveSubStatusDraft(project.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS)
    setNoteDraft(project.note ?? '')
    setWoForm({ number: '', type: 'Build', note: '' })
    setWoError(null)
    setFileErrors({ fds: null, electrical: null, mechanical: null })
    setUploadingCategory(null)
    setRemovingCategory(null)
    setFilesExpanded(PROJECT_FILE_CATEGORIES.some(category => !!project.documents?.[category]))
  }, [project.id])

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

  const summary = [
    { label: 'Status', value: formatProjectStatus(project.status, project.activeSubStatus) },
    { label: 'Work Orders', value: project.wos.length },
    { label: 'Project Files', value: documentsCount },
  ]

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
      onUpdateProjectStatus('Active', activeSubStatusDraft)
    } else {
      onUpdateProjectStatus('Complete')
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
    onUpdateProjectStatus('Active', nextStage)
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

  const updateFileError = (category: ProjectFileCategory, message: string | null) => {
    setFileErrors(prev => ({ ...prev, [category]: message }))
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

  const handleRemoveDocument = async (category: ProjectFileCategory) => {
    if (!documents[category]) {
      return
    }
    if (!canEdit) {
      updateFileError(category, 'You have read-only access.')
      return
    }

    setRemovingCategory(category)
    updateFileError(category, null)
    try {
      const result = await onRemoveDocument(category)
      if (result) {
        updateFileError(category, result)
      }
    } catch (error) {
      console.error('Failed to remove project document', error)
      updateFileError(category, 'Failed to remove document.')
    } finally {
      setRemovingCategory(null)
    }
  }

  const handleDownloadDocument = (category: ProjectFileCategory) => {
    const file = documents[category]
    if (!file) {
      return
    }
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

  return (
    <Card className='panel'>
      <CardHeader>
        <div className='flex flex-wrap items-center gap-3'>
          <Button variant='outline' onClick={onNavigateBack}>
            <ArrowLeft size={16} /> Back to {customer.name}
          </Button>
          <div className='text-lg font-semibold text-slate-800'>Project: {project.number}</div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
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
      </CardHeader>
      <CardContent className='space-y-8'>
        <section className='grid gap-3 sm:grid-cols-2'>
          {summary.map(item => (
            <SummaryTile key={item.label} label={item.label} value={item.value} />
          ))}
        </section>

        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-3 text-sm font-semibold text-slate-700'>Project Status</div>
          <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-3'>
            <div>
              <Label>Status</Label>
              <select
                className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                value={statusDraft}
                onChange={(event) => handleStatusChange(event.target.value as ProjectStatus)}
                disabled={!canEdit}
              >
                <option value='Active'>Active</option>
                <option value='Complete'>Complete</option>
              </select>
            </div>
            {statusDraft === 'Active' && (
              <div>
                <Label>Stage</Label>
                <select
                  className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
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
              </div>
            )}
          </div>
          <p className='mt-2 text-xs text-slate-500'>Updates here are reflected on the dashboard overview.</p>
        </section>

        <section className='rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm'>
          <div className='mb-2 text-sm font-semibold text-slate-700'>Project Note</div>
          <textarea
            className='w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
            rows={3}
            value={noteDraft}
            placeholder='Add a note about this project (optional)…'
            onChange={(e) => {
              const next = (e.target as HTMLTextAreaElement).value
              setNoteDraft(next)
              onUpdateProjectNote(next)
            }}
            disabled={!canEdit}
          />
        </section>

        <section className='grid gap-6 md:grid-cols-2'>
          <div>
            <div className='mb-2 text-sm font-semibold text-slate-700'>Work Orders</div>
            <div className='space-y-2'>
              {project.wos.length === 0 && <div className='text-sm text-slate-500'>None yet</div>}
              {project.wos.map(wo => (
                <div key={wo.id} className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm'>
                  <div>
                    <div className='font-semibold text-slate-800'>
                      {wo.number}
                      <span className='ml-2 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700'>{wo.type}</span>
                    </div>
                    {wo.note && <div className='text-xs text-slate-500'>{wo.note}</div>}
                  </div>
                  <div className='flex items-center gap-1'>
                    <Button
                      variant='outline'
                      onClick={() => navigator.clipboard.writeText(stripPrefix(wo.number, /^WO[-\s]?(.+)$/i))}
                      title='Copy work order'
                    >
                      <Copy size={16} />
                      <span className='sr-only'>Copy work order number</span>
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

            <div className='mt-4 rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm'>
              <div className='mb-2 text-sm font-semibold text-slate-700'>Add Work Order</div>
              <div className='grid gap-2 md:grid-cols-5'>
                <div className='md:col-span-2'>
                  <Label>WO Number</Label>
                  <div className='flex'>
                    <span className='flex items-center rounded-l-2xl border border-r-0 border-slate-200/80 bg-slate-100/70 px-3 py-2 text-sm font-semibold text-slate-500'>WO</span>
                    <Input
                      className='rounded-l-none border-l-0'
                      value={woForm.number}
                      onChange={(e) => {
                        setWoForm({ ...woForm, number: (e.target as HTMLInputElement).value })
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
                    className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                    value={woForm.type}
                    onChange={(e) => {
                      setWoForm({ ...woForm, type: e.target.value as WOType })
                      if (woError) setWoError(null)
                    }}
                    disabled={!canEdit}
                  >
                    <option>Build</option>
                    <option>Onsite</option>
                  </select>
                </div>
                <div className='md:col-span-2'>
                  <Label>Optional note</Label>
                  <Input
                    value={woForm.note}
                    onChange={(e) => setWoForm({ ...woForm, note: (e.target as HTMLInputElement).value })}
                    placeholder='e.g. Line 2 SAT'
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div className='mt-2 space-y-2'>
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
            </div>
          </div>

          <div>
            <button
              type='button'
              className='flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 text-left shadow-sm transition hover:bg-white'
              onClick={() => setFilesExpanded(prev => !prev)}
            >
              <span className='text-sm font-semibold text-slate-700'>Project Files</span>
              <span className='flex items-center gap-2 text-xs text-slate-500'>
                {documentsCount} uploaded
                <ChevronDown
                  size={16}
                  className={`transition-transform ${filesExpanded ? 'rotate-180' : ''}`}
                />
              </span>
            </button>
            {filesExpanded && (
              <div className='mt-3 space-y-4'>
                {PROJECT_FILE_CATEGORIES.map(category => {
                  const metadata = PROJECT_FILE_METADATA[category]
                  const file = documents[category]
                  const uploadedAt = formatUploadedTimestamp(file)
                  const isPdf = isPdfDocument(file)
                  const isImage = isImageDocument(file)
                  const isUploading = uploadingCategory === category
                  const isRemoving = removingCategory === category
                  const errorMessage = fileErrors[category]
                  return (
                    <div key={category} className='rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm'>
                      <div className='flex flex-col gap-3'>
                        <div>
                          <div className='font-semibold text-slate-800'>{metadata.label}</div>
                          {file ? (
                            <>
                              <div className='text-sm text-slate-500'>{file.name}</div>
                              {uploadedAt && <div className='text-xs text-slate-500'>Uploaded {uploadedAt}</div>}
                            </>
                          ) : (
                            <div className='text-xs text-slate-500'>{metadata.description}</div>
                          )}
                        </div>
                        <div className='overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50'>
                          {file ? (
                            isPdf ? (
                              <iframe src={file.dataUrl} title={`${metadata.label} preview`} className='h-52 w-full border-0' />
                            ) : isImage ? (
                              <img src={file.dataUrl} alt={metadata.label} className='h-52 w-full bg-white object-contain' />
                            ) : (
                              <div className='flex h-52 flex-col items-center justify-center gap-2 text-xs text-slate-500'>
                                <FileText size={24} className='text-slate-400' />
                                <span>Preview not available for this file type.</span>
                              </div>
                            )
                          ) : (
                            <div className='flex h-32 flex-col items-center justify-center gap-2 text-xs text-slate-500'>
                              <FileText size={24} className='text-slate-400' />
                              <span>No file uploaded.</span>
                            </div>
                          )}
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Button
                            onClick={() => fileInputRefs.current[category]?.click()}
                            disabled={!canEdit || isUploading}
                            title={canEdit ? (file ? 'Replace file' : 'Upload file') : 'Read-only access'}
                          >
                            <Upload size={16} /> {file ? 'Replace File' : 'Upload File'}
                          </Button>
                          {file && (
                            <>
                              <Button variant='outline' onClick={() => handleDownloadDocument(category)} title='Download file'>
                                <Download size={16} /> Download
                              </Button>
                              <Button
                                variant='ghost'
                                className='text-rose-600 hover:bg-rose-50'
                                onClick={() => void handleRemoveDocument(category)}
                                title={canEdit ? 'Remove file' : 'Read-only access'}
                                disabled={!canEdit || isRemoving}
                              >
                                <Trash2 size={16} /> Remove
                              </Button>
                              {isRemoving && <span className='text-xs text-slate-500'>Removing…</span>}
                            </>
                          )}
                          {isUploading && <span className='text-xs text-slate-500'>Uploading…</span>}
                        </div>
                        {errorMessage && (
                          <p className='flex items-center gap-1 text-sm text-rose-600'>
                            <AlertCircle size={14} /> {errorMessage}
                          </p>
                        )}
                        <input
                          ref={node => {
                            fileInputRefs.current[category] = node
                          }}
                          type='file'
                          accept={PROJECT_FILE_ACCEPT}
                          className='hidden'
                          onChange={(event) => void handleFileChange(category, event)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
