import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Pencil,
  X,
  Search,
  ChevronRight,
  MapPin,
  AlertCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  PROJECT_FILE_CATEGORIES,
  formatProjectStatus,
} from '../types'
import {
  listCustomers,
  createCustomer as createCustomerRecord,
  updateCustomer as updateCustomerRecord,
  deleteCustomer as deleteCustomerRecord,
  createProject as createProjectRecord,
  deleteProject as deleteProjectRecord,
  createWO as createWORecord,
  deleteWO as deleteWORecord,
  updateProject as updateProjectRecord,
} from '../lib/storage'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import ProjectPage from './ProjectPage'

const PROJECT_FILE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
}

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

function stripPrefix(value: string, pattern: RegExp): string {
  const trimmed = value.trim()
  const match = trimmed.match(pattern)
  return match ? match[1].trim() : trimmed
}

type ProjectStatusBucket =
  | 'active_fds'
  | 'active_design'
  | 'active_build'
  | 'active_install'
  | 'complete'

const PROJECT_STATUS_BUCKETS: ProjectStatusBucket[] = [
  'active_fds',
  'active_design',
  'active_build',
  'active_install',
  'complete',
]

const PROJECT_STATUS_BUCKET_META: Record<
  ProjectStatusBucket,
  { label: string; description: string; colorClass: string }
> = {
  active_fds: {
    label: 'Active — FDS',
    description: 'Projects currently in the front-end design stage.',
    colorClass: 'bg-indigo-500',
  },
  active_design: {
    label: 'Active — Design',
    description: 'Projects progressing through design activities.',
    colorClass: 'bg-sky-500',
  },
  active_build: {
    label: 'Active — Build',
    description: 'Projects moving through build execution.',
    colorClass: 'bg-emerald-500',
  },
  active_install: {
    label: 'Active — Install',
    description: 'Projects carrying out installation work.',
    colorClass: 'bg-amber-500',
  },
  complete: {
    label: 'Complete',
    description: 'Projects that have been marked as complete.',
    colorClass: 'bg-slate-400',
  },
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
    default:
      return 'active_fds'
  }
}

function AppContent() {
  const [db, setDb] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<'home' | 'customers' | 'projects'>('home')
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
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
  const [customerQuery, setCustomerQuery] = useState('')
  const [projectSearchQuery, setProjectSearchQuery] = useState('')

  // Create customer (modal)
  const [newCust, setNewCust] = useState({
    name: '',
    address: '',
    contactName: '',
    contactPosition: '',
    contactPhone: '',
    contactEmail: '',
  })
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [showNewContactForm, setShowNewContactForm] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', position: '', phone: '', email: '' })
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactEditor, setContactEditor] = useState<{
    customerId: string
    contactId: string
    name: string
    position: string
    phone: string
    email: string
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
        const customers = await listCustomers()
        setDb(customers)
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


  const selectedCustomer = useMemo(() => db.find(c => c.id === selectedCustomerId) || null, [db, selectedCustomerId])
  const selectedCustomerAddressForMap = selectedCustomer?.address?.trim() || null
  const sortedCustomers = useMemo(() => [...db].sort((a, b) => a.name.localeCompare(b.name)), [db])
  const canEdit = true


  useEffect(() => {
    setShowNewContactForm(false)
    setNewContact({ name: '', position: '', phone: '', email: '' })
    setContactError(null)
    closeContactEditor()
  }, [selectedCustomer?.id, closeContactEditor])

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



  const customerMatches = useMemo(() => {
    const query = customerQuery.trim().toLowerCase()
    if (!query) {
      return []
    }
    const matches: Array<{ id: string; name: string; address?: string | null }> = []
    db.forEach(customer => {
      const nameMatch = customer.name.toLowerCase().includes(query)
      const addressMatch = customer.address ? customer.address.toLowerCase().includes(query) : false
      if (nameMatch || addressMatch) {
        matches.push({ id: customer.id, name: customer.name, address: customer.address })
      }
    })
    return matches.slice(0, 25)
  }, [db, customerQuery])

  const projectMatches = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase()
    if (!query) {
      return []
    }
    const matches: Array<{
      customerId: string
      projectId: string
      projectNumber: string
      customerName: string
      statusLabel: string
    }> = []
    db.forEach(customer => {
      customer.projects.forEach(project => {
        const normalizedNumber = project.number.toLowerCase()
        const normalizedCustomer = customer.name.toLowerCase()
        if (normalizedNumber.includes(query) || normalizedCustomer.includes(query)) {
          matches.push({
            customerId: customer.id,
            projectId: project.id,
            projectNumber: project.number,
            customerName: customer.name,
            statusLabel: formatProjectStatus(project.status, project.activeSubStatus),
          })
        }
      })
    })
    return matches.slice(0, 25)
  }, [db, projectSearchQuery])

  const projectLists = useMemo(() => {
    const active: Array<{
      customerId: string
      projectId: string
      projectNumber: string
      customerName: string
      statusLabel: string
    }> = []
    const completed: Array<{
      customerId: string
      projectId: string
      projectNumber: string
      customerName: string
      statusLabel: string
    }> = []

    db.forEach(customer => {
      customer.projects.forEach(project => {
        const entry = {
          customerId: customer.id,
          projectId: project.id,
          projectNumber: project.number,
          customerName: customer.name,
          statusLabel: formatProjectStatus(project.status, project.activeSubStatus),
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

  const activeProjects = useMemo(
    () =>
      projectStatusBucketCounts.active_fds +
      projectStatusBucketCounts.active_design +
      projectStatusBucketCounts.active_build +
      projectStatusBucketCounts.active_install,
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

  const hasCustomerSearch = customerQuery.trim().length > 0

  const handleClearCustomerSearch = useCallback(() => {
    setCustomerQuery('')
    setSelectedCustomerId(null)
    setSelectedProjectId(null)
  }, [setCustomerQuery, setSelectedCustomerId, setSelectedProjectId])

  const canClearCustomerSearch = hasCustomerSearch || selectedCustomerId !== null || selectedProjectId !== null

  const hasProjectSearch = projectSearchQuery.trim().length > 0

  const handleClearProjectSearch = useCallback(() => {
    setProjectSearchQuery('')
    setSelectedProjectId(null)
    setSelectedCustomerId(null)
  }, [setProjectSearchQuery, setSelectedCustomerId, setSelectedProjectId])

  const canClearProjectSearch = hasProjectSearch || selectedProjectId !== null || selectedCustomerId !== null

  const renderCustomersPage = () => {
    if (!selectedCustomer) {
      return (
        <Card className='panel'>
          <CardHeader>
            <div className='text-lg font-semibold text-slate-900'>Customer details</div>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-slate-600'>Select a customer from the sidebar to view their information.</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className='space-y-6'>
        <Card className='panel'>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <div className='text-lg font-semibold'>Customer: {selectedCustomer.name}</div>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setSelectedCustomerId(null)
                  setSelectedProjectId(null)
                }}
              >
                Back to Index
              </Button>
              <Button
                variant='ghost'
                className='text-rose-600 hover:bg-rose-50'
                onClick={() => {
                  if (!selectedCustomer) return
                  const confirmed = window.confirm('Delete this customer and all associated projects, purchase orders, and work orders?')
                  if (!confirmed) return
                  void deleteCustomer(selectedCustomer.id)
                }}
                title={canEdit ? 'Delete customer' : 'Read-only access'}
                disabled={!canEdit}
              >
                <Trash2 size={16} /> Delete Customer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='md:col-span-2 space-y-2'>
                <EditableField
                  label='Address'
                  value={selectedCustomer.address}
                  placeholder='Add address'
                  copyable
                  copyTitle='Copy address'
                  onSave={async (value) => {
                    const trimmed = value.trim()
                    await saveCustomerDetails(selectedCustomer.id, { address: trimmed ? trimmed : null })
                  }}
                />
                {selectedCustomerAddressForMap ? (
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(selectedCustomerAddressForMap)}`}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-500'
                  >
                    <MapPin size={16} /> Open in Google Maps
                  </a>
                ) : null}
              </div>
            </div>

            <div className='mt-6 space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-sm font-semibold text-slate-700'>Contacts</div>
                <Button
                  variant='outline'
                  onClick={() => {
                    setShowNewContactForm(prev => !prev)
                    setContactError(null)
                  }}
                  title={canEdit ? (showNewContactForm ? 'Cancel adding contact' : 'Add contact') : 'Read-only access'}
                  disabled={!canEdit}
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

              {selectedCustomer.contacts.length === 0 && !showNewContactForm && (
                <div className='text-sm text-slate-500'>No contacts yet.</div>
              )}

              {selectedCustomer.contacts.map((contact, index) => {
                return (
                  <div key={contact.id} className='rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>
                          {contact.name?.trim() || `Contact ${index + 1}`}
                        </div>
                        {contact.position ? (
                          <div className='text-xs text-slate-500'>{contact.position}</div>
                        ) : null}
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          variant='outline'
                          onClick={() => {
                            if (!selectedCustomer) return
                            setContactEditor({
                              customerId: selectedCustomer.id,
                              contactId: contact.id,
                              name: contact.name ?? '',
                              position: contact.position ?? '',
                              phone: contact.phone ?? '',
                              email: contact.email ?? '',
                            })
                            setContactEditorError(null)
                            setIsSavingContactEdit(false)
                          }}
                          title={canEdit ? 'Edit contact' : 'Read-only access'}
                          disabled={!canEdit}
                        >
                          <Pencil size={16} /> Edit Contact
                        </Button>
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => removeContact(selectedCustomer, contact.id)}
                          title={canEdit ? 'Remove contact' : 'Read-only access'}
                          disabled={!canEdit}
                        >
                          <Trash2 size={16} /> Remove
                        </Button>
                      </div>
                    </div>
                    <div className='mt-3 grid gap-3 md:grid-cols-2'>
                      <ContactInfoField
                        label='Name'
                        value={contact.name}
                        placeholder='Not provided'
                        copyTitle='Copy contact name'
                      />
                      <ContactInfoField
                        label='Position'
                        value={contact.position}
                        placeholder='Not provided'
                        copyTitle='Copy contact position'
                      />
                      <ContactInfoField
                        label='Phone'
                        value={contact.phone}
                        placeholder='Not provided'
                        copyTitle='Copy phone number'
                      />
                      <ContactInfoField
                        label='Email'
                        value={contact.email}
                        placeholder='Not provided'
                        copyTitle='Copy email address'
                      />
                    </div>
                  </div>
                )
              })}

              {showNewContactForm && (
                <div className='rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm'>
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
                  </div>
                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                    <Button
                      onClick={async () => {
                        if (!selectedCustomer) return
                        const result = await addContact(selectedCustomer, newContact)
                        if (result) {
                          setContactError(result)
                        } else {
                          setNewContact({ name: '', position: '', phone: '', email: '' })
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
                        setNewContact({ name: '', position: '', phone: '', email: '' })
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

            <div className='mt-6 rounded-3xl border border-slate-200/70 bg-white/75 p-5 shadow-sm'>
              <div className='mb-2 text-sm font-semibold text-slate-700'>Add Project</div>
              <AddProjectForm onAdd={(num) => addProject(selectedCustomer.id, num)} disabled={!canEdit} />
            </div>

            <div className='mt-6'>
              <div className='mb-2 text-sm font-semibold text-slate-700'>Projects</div>
              {selectedCustomer.projects.length === 0 && <div className='text-sm text-slate-500'>No projects yet.</div>}
              {selectedCustomer.projects.map(project => (
                <Card key={project.id} className='mb-3 panel'>
                  <CardHeader>
                    <div className='flex flex-wrap items-center gap-2'>
                      <div className='text-lg font-semibold text-slate-800'>Project: {project.number}</div>
                      {project.note && (
                        <span className='rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700'>Note</span>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button
                        variant='outline'
                        onClick={() => navigator.clipboard.writeText(stripPrefix(project.number, /^P[-\s]?(.+)$/i))}
                        title='Copy project number'
                      >
                        <Copy size={16} />
                      </Button>
                      <Button
                        onClick={() => {
                          setSelectedCustomerId(selectedCustomer.id)
                          setSelectedProjectId(project.id)
                          setActivePage('projects')
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
                  <CardContent>
                    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                      {[
                        {
                          label: 'Status',
                          value: formatProjectStatus(project.status, project.activeSubStatus),
                        },
                        { label: 'Work Orders', value: project.wos.length },
                        {
                          label: 'Project Files',
                          value: PROJECT_FILE_CATEGORIES.reduce(
                            (count, category) => (project.documents?.[category] ? count + 1 : count),
                            0,
                          ),
                        },
                      ].map(item => (
                        <div key={item.label} className='rounded-xl border border-slate-200 bg-white/80 p-3'>
                          <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{item.label}</div>
                          <div className='text-lg font-semibold text-slate-800'>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    {project.note && (
                      <div className='mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700'>
                        <span className='font-semibold text-slate-900'>Note:</span> {project.note}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderProjectsPage = () => {
    if (!selectedProjectId) {
      return (
        <Card className='panel'>
          <CardHeader>
            <div className='text-lg font-semibold text-slate-900'>Project details</div>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-slate-600'>Select a project from the sidebar to review its documents and work orders.</p>
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
              <Button onClick={() => setSelectedProjectId(null)}>Back to index</Button>
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
        onUpdateProjectNote={(note) =>
          updateProjectNote(selectedProjectData.customer.id, selectedProjectData.project.id, note)
        }
        onUpdateProjectStatus={(status, activeSubStatus) =>
          updateProjectStatus(
            selectedProjectData.customer.id,
            selectedProjectData.project.id,
            status,
            activeSubStatus,
          )
        }
        onAddWO={(data) => addWO(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
        onDeleteWO={(woId) => deleteWO(selectedProjectData.customer.id, selectedProjectData.project.id, woId)}
        onUploadDocument={(category, file) =>
          uploadProjectDocument(selectedProjectData.customer.id, selectedProjectData.project.id, category, file)
        }
        onRemoveDocument={(category) =>
          removeProjectDocument(selectedProjectData.customer.id, selectedProjectData.project.id, category)
        }
        onDeleteProject={() => deleteProject(selectedProjectData.customer.id, selectedProjectData.project.id)}
        onNavigateBack={() => setSelectedProjectId(null)}
      />
    )
  }

  const renderCustomersSidebar = () => (
    <div className='space-y-4'>
      <Card className='panel'>
        <CardHeader className='flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-2'>
            <Search size={18} />
            <div className='font-medium'>Customer Search</div>
          </div>
          <Button
            variant='ghost'
            onClick={handleClearCustomerSearch}
            disabled={!canClearCustomerSearch}
            className='w-full text-slate-600 hover:text-slate-800 disabled:text-slate-400 sm:w-auto'
          >
            <X size={16} /> Clear
          </Button>
        </CardHeader>
        <CardContent>
          <Label htmlFor='customer-search'>Customer</Label>
          <Input
            id='customer-search'
            value={customerQuery}
            onChange={(e) => setCustomerQuery((e.target as HTMLInputElement).value)}
            placeholder='Search by customer name or address…'
            autoComplete='off'
          />

          <div className='mt-4'>
            <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Matches</div>
            <div className='mt-2 space-y-2'>
              {!hasCustomerSearch ? (
                <div className='text-sm text-slate-500'>Start typing above to find a customer.</div>
              ) : customerMatches.length === 0 ? (
                <div className='text-sm text-slate-500'>No customers found.</div>
              ) : (
                customerMatches.map(match => (
                  <button
                    key={match.id}
                    onClick={() => {
                      setSelectedCustomerId(match.id)
                      setSelectedProjectId(null)
                    }}
                    className='flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
                    title='Open customer'
                  >
                    <div>
                      <div className='text-sm font-semibold text-slate-800'>{match.name}</div>
                      {match.address ? <div className='text-xs text-slate-500'>{match.address}</div> : null}
                    </div>
                    <ChevronRight size={18} />
                  </button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className='panel'>
        <CardHeader className='flex-col items-start gap-2'>
          <div className='text-lg font-semibold text-slate-900'>Customers</div>
          <div className='text-sm text-slate-500'>
            {customerCount === 1 ? '1 customer listed' : `${customerCount} customers listed`}
          </div>
        </CardHeader>
        <CardContent>
          {sortedCustomers.length === 0 ? (
            <p className='text-sm text-slate-500'>Add a customer to see it listed here.</p>
          ) : (
            <div className='space-y-2'>
              {sortedCustomers.map(customer => {
                const isSelected = selectedCustomerId === customer.id
                const baseClasses =
                  'flex w-full flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'
                const selectionClasses = isSelected
                  ? 'border-indigo-500 bg-indigo-50/80 shadow-md'
                  : 'hover:-translate-y-0.5 hover:shadow-lg'

                return (
                  <button
                    type='button'
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id)
                      setSelectedProjectId(null)
                    }}
                    className={`${baseClasses} ${selectionClasses}`}
                    aria-pressed={isSelected}
                    title='View customer details'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <div className='text-base font-semibold text-slate-900'>{customer.name}</div>
                        <div className='mt-1 text-sm text-slate-500'>
                          {customer.address ? customer.address : 'No address on file.'}
                        </div>
                      </div>
                      <ChevronRight size={18} className='text-slate-400' aria-hidden />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderProjectsSidebar = () => {
    const { active: activeProjects, completed: completedProjects } = projectLists

    return (
      <div className='space-y-4'>
        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-2'>
              <Search size={18} />
              <div className='font-medium'>Project Search</div>
            </div>
            <Button
              variant='ghost'
              onClick={handleClearProjectSearch}
              disabled={!canClearProjectSearch}
              className='w-full text-slate-600 hover:text-slate-800 disabled:text-slate-400 sm:w-auto'
            >
              <X size={16} /> Clear
            </Button>
          </CardHeader>
          <CardContent>
            <Label htmlFor='project-search'>Project</Label>
            <Input
              id='project-search'
              value={projectSearchQuery}
              onChange={(e) => setProjectSearchQuery((e.target as HTMLInputElement).value)}
              placeholder='Search by project number or customer…'
              autoComplete='off'
            />

            <div className='mt-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Matches</div>
              <div className='mt-2 space-y-2'>
                {!hasProjectSearch ? (
                  <div className='text-sm text-slate-500'>Start typing above to find a project.</div>
                ) : projectMatches.length === 0 ? (
                  <div className='text-sm text-slate-500'>No projects found.</div>
                ) : (
                  projectMatches.map(match => (
                    <button
                      key={match.projectId}
                      onClick={() => {
                        setSelectedCustomerId(match.customerId)
                        setSelectedProjectId(match.projectId)
                        setActivePage('projects')
                      }}
                      className='flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
                      title='Open project details'
                    >
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>{match.projectNumber}</div>
                        <div className='text-xs text-slate-500'>{match.customerName}</div>
                        <div className='text-xs text-slate-500'>{match.statusLabel}</div>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-2'>
            <div className='text-lg font-semibold text-slate-900'>Active Projects</div>
            <div className='text-sm text-slate-500'>
              {activeProjects.length === 1 ? '1 active project' : `${activeProjects.length} active projects`}
            </div>
          </CardHeader>
          <CardContent>
            {activeProjects.length === 0 ? (
              <p className='text-sm text-slate-500'>Add a project to see it listed here.</p>
            ) : (
              <div className='space-y-2'>
                {activeProjects.map(project => {
                  const isSelected = selectedProjectId === project.projectId
                  const baseClasses =
                    'flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'
                  const selectionClasses = isSelected
                    ? 'border-indigo-500 bg-indigo-50/80 shadow-md'
                    : 'hover:-translate-y-0.5 hover:shadow-lg'

                  return (
                    <button
                      type='button'
                      key={project.projectId}
                      onClick={() => {
                        setSelectedCustomerId(project.customerId)
                        setSelectedProjectId(project.projectId)
                        setActivePage('projects')
                      }}
                      className={`${baseClasses} ${selectionClasses}`}
                      aria-pressed={isSelected}
                      title='View project details'
                    >
                      <div>
                        <div className='text-base font-semibold text-slate-900'>{project.projectNumber}</div>
                        <div className='mt-1 text-sm text-slate-600'>{project.customerName}</div>
                        <div className='mt-2 text-xs font-medium text-slate-500'>{project.statusLabel}</div>
                      </div>
                      <ChevronRight size={18} className='text-slate-400' aria-hidden />
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='panel'>
          <CardHeader className='flex-col items-start gap-2'>
            <div className='text-lg font-semibold text-slate-900'>Completed Projects</div>
            <div className='text-sm text-slate-500'>
              {completedProjects.length === 1
                ? '1 completed project'
                : `${completedProjects.length} completed projects`}
            </div>
          </CardHeader>
          <CardContent>
            {completedProjects.length === 0 ? (
              <p className='text-sm text-slate-500'>Completed projects will appear here.</p>
            ) : (
              <div className='space-y-2'>
                {completedProjects.map(project => {
                  const isSelected = selectedProjectId === project.projectId
                  const baseClasses =
                    'flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'
                  const selectionClasses = isSelected
                    ? 'border-slate-400 bg-slate-50/80 shadow-md'
                    : 'hover:-translate-y-0.5 hover:shadow-lg'

                  return (
                    <button
                      type='button'
                      key={project.projectId}
                      onClick={() => {
                        setSelectedCustomerId(project.customerId)
                        setSelectedProjectId(project.projectId)
                        setActivePage('projects')
                      }}
                      className={`${baseClasses} ${selectionClasses}`}
                      aria-pressed={isSelected}
                      title='View project details'
                    >
                      <div>
                        <div className='text-base font-semibold text-slate-900'>{project.projectNumber}</div>
                        <div className='mt-1 text-sm text-slate-600'>{project.customerName}</div>
                        <div className='mt-2 text-xs font-medium text-slate-500'>{project.statusLabel}</div>
                      </div>
                      <ChevronRight size={18} className='text-slate-400' aria-hidden />
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

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

  const renderDashboardView = () => {
    const averageWorkOrders = totalProjects > 0 ? totalWorkOrders / totalProjects : 0
    const maxStatusCount = projectStatusData.reduce((max, item) => (item.count > max ? item.count : max), 0)
    const barDenominator = maxStatusCount > 0 ? maxStatusCount : 1

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
              <Button className='w-full sm:w-auto' variant='outline' onClick={() => setActivePage('projects')}>
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
            ) : (
              <div className='space-y-4'>
                {projectStatusData.map(status => (
                  <div key={status.key}>
                    <div className='flex items-center gap-3'>
                      <div className={`h-2.5 w-2.5 rounded-full ${status.colorClass}`} aria-hidden />
                      <div className='flex-1 text-sm font-medium text-slate-700'>{status.label}</div>
                      <div className='text-sm font-semibold text-slate-900'>{status.count}</div>
                    </div>
                    <div className='mt-2 h-2 rounded-full bg-slate-200/80'>
                      <div
                        className={`h-full rounded-full ${status.colorClass}`}
                        style={{ width: `${(status.count / barDenominator) * 100}%` }}
                      />
                    </div>
                    <p className='mt-2 text-xs text-slate-500'>{status.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

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

  // Helpers
  const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36).slice(-4)}`
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

  // Mutators
  async function saveCustomerDetails(
    customerId: string,
    updates: {
      name?: string
      address?: string | null
      contacts?: Array<{ id?: string; name?: string; position?: string; phone?: string; email?: string }> | null
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
        name: file.name,
        type: file.type || guessMimeTypeFromName(file.name),
        dataUrl,
        uploadedAt: new Date().toISOString(),
      }

      await updateProjectRecord(projectId, { documents: { [category]: payload } })
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
                  nextDocuments[category] = payload
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
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to remove project documents.'
      setActionError(message)
      return message
    }

    try {
      await updateProjectRecord(projectId, { documents: { [category]: null } })
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
                  if (!p.documents) {
                    return p
                  }
                  const nextDocuments = { ...p.documents }
                  delete nextDocuments[category]
                  const hasRemaining = PROJECT_FILE_CATEGORIES.some(key => !!nextDocuments[key])
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

  async function addContact(
    customer: Customer,
    data: { name: string; position: string; phone: string; email: string },
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
      })),
      {
        name: name || undefined,
        position: position || undefined,
        phone: phone || undefined,
        email: email || undefined,
      },
    ]

    try {
      await saveCustomerDetails(customer.id, { contacts: payload }, 'Failed to add contact.')
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to add contact.'
    }
  }

  async function updateContactDetails(
    customer: Customer,
    contactId: string,
    details: { name: string; position: string; phone: string; email: string },
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
          }
        : {
            id: contact.id,
            name: name || undefined,
            position: position || undefined,
            phone: phone || undefined,
            email: email || undefined,
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

  async function handleSaveContactEdit() {
    if (!contactEditor) {
      return
    }

    const { customerId, contactId, name, position, phone, email } = contactEditor
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

  function updateProjectStatus(
    customerId: string,
    projectId: string,
    status: ProjectStatus,
    activeSubStatus?: ProjectActiveSubStatus,
  ) {
    if (!canEdit) {
      setActionError('Not authorized to update project status.')
      return
    }

    const existingProject = db
      .find(customer => customer.id === customerId)
      ?.projects.find(project => project.id === projectId)

    const normalizedActiveSubStatus =
      status === 'Active'
        ? activeSubStatus ?? existingProject?.activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        : undefined

    const nextActiveSubStatus =
      status === 'Active'
        ? normalizedActiveSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS
        : undefined

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
                      status,
                      activeSubStatus: nextActiveSubStatus,
                    },
              ),
            },
      ),
    )

    void (async () => {
      try {
        await updateProjectRecord(projectId, {
          status,
          activeSubStatus: status === 'Active' ? nextActiveSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS : null,
        })
        setActionError(null)
      } catch (error) {
        console.error('Failed to update project status', error)
        const message = toErrorMessage(error, 'Failed to update project status.')
        setActionError(message)
      }
    })()
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

  async function addProject(customerId: string, projectNumber: string): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create projects.'
      setActionError(message)
      return message
    }
    const trimmed = projectNumber.trim()
    if (!trimmed) return 'Enter a project number.'
    const normalized = trimmed.toUpperCase()
    const finalNumber = normalized.startsWith('P') ? normalized : `P${normalized}`
    if (projectNumberExists(finalNumber)) return 'A project with this number already exists.'
    try {
      const project = await createProjectRecord(customerId, finalNumber)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId ? c : { ...c, projects: [...c.projects, project] },
        ),
      )
      setActionError(null)
      return null
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
      address?: string
      contacts?: Array<{ name?: string; position?: string; phone?: string; email?: string }>
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
      }))
      .filter(contact => contact.name || contact.position || contact.phone || contact.email)
    const payload = {
      name: trimmedName,
      address: data.address?.trim() || undefined,
      contacts: contactsPayload,
    }
    try {
      const customer = await createCustomerRecord(payload)
      setDb(prev => [customer, ...prev])
      setSelectedCustomerId(customer.id)
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to create customer', error)
      const message = toErrorMessage(error, 'Failed to create customer.')
      setActionError(message)
      return message
    }
  }

  function EditableField({
    label,
    value,
    onSave,
    placeholder,
    copyable,
    copyTitle,
  }: {
    label: string
    value?: string | null
    onSave: (v: string) => Promise<void> | void
    placeholder?: string
    copyable?: boolean
    copyTitle?: string
  }) {
    const [val, setVal] = useState(value ?? '')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [fieldError, setFieldError] = useState<string | null>(null)

    useEffect(() => {
      if (!isEditing) {
        setVal(value ?? '')
      }
    }, [value, isEditing])

    useEffect(() => {
      if (!canEdit && isEditing) {
        setIsEditing(false)
        setFieldError(null)
        setVal(value ?? '')
      }
    }, [canEdit, isEditing, value])

    const hasValue = !!value && value.trim().length > 0

    const handleSave = async () => {
      const trimmed = val.trim()
      setIsSaving(true)
      setFieldError(null)
      try {
        await onSave(trimmed)
        setIsEditing(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save field.'
        setFieldError(message)
      } finally {
        setIsSaving(false)
      }
    }

    return (
      <div className='flex flex-col gap-1'>
        <Label>{label}</Label>
        <div className='flex items-center gap-2'>
          {isEditing ? (
            <>
              <Input
                value={val}
                onChange={(e) => {
                  setVal((e.target as HTMLInputElement).value)
                  if (fieldError) setFieldError(null)
                }}
                placeholder={placeholder}
                disabled={!canEdit}
              />
              <Button onClick={handleSave} title='Save' disabled={isSaving}>
                <Save size={16} /> Save
              </Button>
              <Button
                variant='ghost'
                onClick={() => {
                  setIsEditing(false)
                  setVal(value ?? '')
                  setFieldError(null)
                }}
                title='Cancel'
              >
                <X size={16} />
              </Button>
            </>
          ) : (
            <>
              <div className='min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm'>
                {hasValue ? (
                  <span className='text-slate-800'>{value}</span>
                ) : (
                  <span className='text-slate-400'>{placeholder || 'Not set'}</span>
                )}
              </div>
              {copyable && hasValue ? (
                <Button
                  variant='outline'
                  onClick={() => value && navigator.clipboard.writeText(value)}
                  title={copyTitle || `Copy ${label.toLowerCase()}`}
                >
                  <Copy size={16} /> Copy
                </Button>
              ) : null}
              <Button
                variant='outline'
                onClick={() => setIsEditing(true)}
                title={canEdit ? 'Edit' : 'Read-only access'}
                disabled={!canEdit}
              >
                <Pencil size={16} /> Edit
              </Button>
            </>
          )}
        </div>
        {fieldError && (
          <p className='flex items-center gap-1 text-xs text-rose-600'>
            <AlertCircle size={14} /> {fieldError}
          </p>
        )}
      </div>
    )
  }

  function ContactInfoField({
    label,
    value,
    placeholder = 'Not provided',
    copyTitle,
  }: {
    label: string
    value?: string
    placeholder?: string
    copyTitle: string
  }) {
    const display = value?.trim()
    const hasValue = !!display
    return (
      <div className='flex flex-col gap-1'>
        <Label>{label}</Label>
        <div className='flex items-center gap-2'>
          <div className='min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm'>
            {hasValue ? (
              <span className='block break-words whitespace-pre-wrap text-slate-800'>{value}</span>
            ) : (
              <span className='block text-slate-400'>{placeholder}</span>
            )}
          </div>
          {hasValue ? (
            <Button
              variant='outline'
              onClick={() => value && navigator.clipboard.writeText(value)}
              title={copyTitle}
            >
              <Copy size={16} /> Copy
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
        <div className='mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center gap-4 text-center text-slate-600'>
          <span className='h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500' aria-hidden />
          <p className='text-sm font-medium text-slate-500'>Loading customers…</p>
        </div>
      </div>
    )
  }

  const resolvedPage: 'home' | 'customers' | 'projects' = selectedProjectId ? 'projects' : activePage

  const sidebarContent =
    resolvedPage === 'home'
      ? renderHomeSidebar()
      : resolvedPage === 'customers'
      ? renderCustomersSidebar()
      : renderProjectsSidebar()

  const handleNavigate = (page: 'home' | 'customers' | 'projects') => {
    setActivePage(page)
    if (page !== 'projects') {
      setSelectedProjectId(null)
    }
    if (page !== 'customers') {
      setShowNewCustomer(false)
    }
  }

  const pageHeading =
    resolvedPage === 'home'
      ? 'Workspace Overview'
      : resolvedPage === 'customers'
      ? 'Customer Records'
      : 'Projects'

  const pageDescription =
    resolvedPage === 'home'
      ? 'High-level metrics for your customers and projects.'
      : resolvedPage === 'customers'
      ? 'Select a customer from the sidebar to review their details and contacts.'
      : 'Select a project from the sidebar to manage its lifecycle and documents.'

  return (
    <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
      <div className='mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row'>
        <aside className='w-full lg:w-80 lg:flex-shrink-0'>
          <div className='flex flex-col gap-6 lg:sticky lg:top-6'>
            <Card className='panel'>
              <CardHeader>
                <div>
                  <h1 className='text-2xl font-semibold tracking-tight text-slate-900'>CustomerProjectDB</h1>
                  <p className='mt-1 text-sm text-slate-500'>Keep track of customers, projects, and their work orders.</p>
                </div>
              </CardHeader>
              <CardContent>
                <nav className='flex flex-col gap-1'>
                  {(['home', 'customers', 'projects'] as const).map(page => {
                    const isActive = resolvedPage === page
                    const label = page === 'home' ? 'Home' : page === 'customers' ? 'Customers' : 'Projects'
                    return (
                      <button
                        key={page}
                        type='button'
                        onClick={() => handleNavigate(page)}
                        className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'bg-slate-900 text-white shadow'
                            : 'text-slate-600 hover:bg-white hover:text-slate-800'
                        }`}
                      >
                        <span>{label}</span>
                        {isActive ? <ChevronRight size={16} className='text-white/80' /> : null}
                      </button>
                    )
                  })}
                </nav>
              </CardContent>
            </Card>

            {sidebarContent}
          </div>
        </aside>

        <main className='flex-1'>
          {loadError && (
            <div className='mb-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
              <span>{loadError}</span>
              <Button variant='outline' onClick={() => void refreshCustomers()} disabled={isSyncing}>
                Retry
              </Button>
            </div>
          )}

          <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-semibold tracking-tight text-slate-900'>{pageHeading}</h2>
              <p className='mt-1 text-sm text-slate-500'>{pageDescription}</p>
            </div>
            <div className='flex flex-wrap items-center justify-end gap-3'>
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

          {resolvedPage === 'home'
            ? renderDashboardView()
            : resolvedPage === 'customers'
            ? renderCustomersPage()
            : renderProjectsPage()}
        </main>
      </div>

      {/* New Customer Modal */}
      <AnimatePresence>
        {showNewCustomer && (
          <motion.div
            className='fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className='w-full max-w-2xl panel'>
              <CardHeader>
                <div className='flex items-center gap-2'><Plus size={18} /> <span className='font-medium'>Create New Customer</span></div>
                <Button
                  variant='ghost'
                  onClick={() => {
                    setShowNewCustomer(false)
                    setNewCustomerError(null)
                    setIsCreatingCustomer(false)
                  }}
                  title='Close'
                >
                  <X size={16} />
                </Button>
              </CardHeader>
              <CardContent>
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
                      onChange={(e) => setNewCust({ ...newCust, contactPosition: (e.target as HTMLInputElement).value })}
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
                      onChange={(e) => setNewCust({ ...newCust, contactEmail: (e.target as HTMLInputElement).value })}
                      placeholder='e.g. alex@globex.co.uk'
                      disabled={!canEdit}
                    />
                  </div>
                  <div className='md:col-span-2'>
                    <Label>Address</Label>
                    <Input
                      value={newCust.address}
                      onChange={(e) => setNewCust({ ...newCust, address: (e.target as HTMLInputElement).value })}
                      placeholder='e.g. 10 High Street, London'
                      disabled={!canEdit}
                    />
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
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size='lg'
                    disabled={isCreatingCustomer || !canEdit}
                    onClick={async () => {
                      setIsCreatingCustomer(true)
                      try {
                        const result = await createCustomer({
                          name: newCust.name,
                          address: newCust.address,
                          contacts: [
                            {
                              name: newCust.contactName,
                              position: newCust.contactPosition,
                              phone: newCust.contactPhone,
                              email: newCust.contactEmail,
                            },
                          ],
                        })
                        if (result) {
                          setNewCustomerError(result)
                          return
                        }
                        setNewCust({
                          name: '',
                          address: '',
                          contactName: '',
                          contactPosition: '',
                          contactPhone: '',
                          contactEmail: '',
                        })
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

function AddProjectForm({ onAdd, disabled = false }: { onAdd: (num: string) => Promise<string | null>; disabled?: boolean }) {
  const [val, setVal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isDisabled = disabled

  const handleAdd = async () => {
    if (isDisabled) {
      setError('You have read-only access.')
      return
    }
    const trimmed = val.trim()
    if (!trimmed) {
      setError('Enter a project number.')
      return
    }
    setIsSaving(true)
    try {
      const result = await onAdd(trimmed)
      if (result) {
        setError(result)
        return
      }
      setVal('')
      setError(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label>Project Number</Label>
          <div className='flex'>
            <span className='flex items-center rounded-l-2xl border border-r-0 border-slate-200/80 bg-slate-100/70 px-3 py-2 text-sm font-semibold text-slate-500'>P</span>
            <Input
              className='rounded-l-none border-l-0'
              value={val}
              onChange={(e) => {
                setVal((e.target as HTMLInputElement).value)
                if (error) setError(null)
              }}
              placeholder='e.g. 1403'
              disabled={isDisabled}
            />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={isSaving || isDisabled} title={isDisabled ? 'Read-only access' : 'Add project'}>
          <Plus size={16} /> Add
        </Button>
      </div>
      {error && (
        <p className='flex items-center gap-1 text-sm text-rose-600'>
          <AlertCircle size={14} /> {error}
        </p>
      )}
    </div>
  )
}

export default function App() {
  return <AppContent />
}
