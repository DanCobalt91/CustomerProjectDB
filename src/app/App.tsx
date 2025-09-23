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
  CustomerContact,
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
  const [activePage, setActivePage] = useState<'home' | 'customers'>('home')
  const [editingInfo, setEditingInfo] = useState<Record<string, boolean>>({})
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
  const [projectQuery, setProjectQuery] = useState('')
  const [woQuery, setWoQuery] = useState('')

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
  const customerOptions = useMemo(() => db.map(c => c.name).sort(), [db])
  const canEdit = true


  useEffect(() => {
    setShowNewContactForm(false)
    setNewContact({ name: '', position: '', phone: '', email: '' })
    setContactError(null)
  }, [selectedCustomer?.id])



  const searchMatches = useMemo(() => {
    const matches: { kind: 'customer' | 'project' | 'wo'; label: string; customerId: string; projectId?: string }[] = []
    const cq = customerQuery.trim().toLowerCase()
    if (cq) {
      db.forEach(c => {
        if (c.name.toLowerCase().includes(cq)) matches.push({ kind: 'customer', label: `${c.name}`, customerId: c.id })
      })
    }
    const pq = projectQuery.trim().toLowerCase()
    if (pq) {
      db.forEach(c =>
        c.projects.forEach(p => {
          if (p.number.toLowerCase().includes(pq)) matches.push({ kind: 'project', label: `${p.number}  —  ${c.name}`, customerId: c.id, projectId: p.id })
        })
      )
    }
    const wq = woQuery.trim().toLowerCase()
    if (wq) {
      db.forEach(c =>
        c.projects.forEach(p =>
          p.wos.forEach(w => {
            if (w.number.toLowerCase().includes(wq)) matches.push({ kind: 'wo', label: `${w.number} (${w.type})  —  ${c.name}`, customerId: c.id, projectId: p.id })
          })
        )
      )
    }
    return matches.slice(0, 25)
  }, [db, customerQuery, projectQuery, woQuery])

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

  const hasSearchInput = useMemo(
    () => !!(customerQuery.trim() || projectQuery.trim() || woQuery.trim()),
    [customerQuery, projectQuery, woQuery],
  )

  const CustomersPage = () => {
    return (
      <>
        <Card className='mb-6 panel'>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <Search size={18} />
              <div className='font-medium'>Index Search</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 md:grid-cols-3'>
              <div>
                <Label>Customer</Label>
                <Input
                  list='customer-list'
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery((e.target as HTMLInputElement).value)}
                  placeholder='Start typing a name…'
                />
                <datalist id='customer-list'>
                  {customerOptions.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Project Number</Label>
                <Input value={projectQuery} onChange={(e) => setProjectQuery((e.target as HTMLInputElement).value)} placeholder='e.g. P1403' />
              </div>
              <div>
                <Label>Work Order Number</Label>
                <Input value={woQuery} onChange={(e) => setWoQuery((e.target as HTMLInputElement).value)} placeholder='e.g. WO804322' />
              </div>
            </div>

            <div className='mt-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Matches</div>
              <div className='mt-2 grid gap-2 md:grid-cols-2'>
                {!hasSearchInput ? (
                  <div className='text-sm text-slate-500'>Start typing above to find a customer, project, or work order.</div>
                ) : searchMatches.length === 0 ? (
                  <div className='text-sm text-slate-500'>No matches found.</div>
                ) : (
                  searchMatches.map(m => (
                    <button
                      key={`${m.kind}_${m.customerId}_${m.projectId ?? ''}_${m.label}`}
                      onClick={() => {
                        setSelectedCustomerId(m.customerId)
                        setSelectedProjectId(m.projectId ?? null)
                      }}
                      className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
                      title={
                        m.kind === 'customer'
                          ? 'Open customer'
                          : m.kind === 'project'
                          ? 'Open project details'
                          : 'Open work order in project'
                      }
                    >
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>{m.label}</div>
                        <div className='text-xs font-medium text-slate-500'>{m.kind.toUpperCase()}</div>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedCustomer ? (
          <Card className='mb-6 panel'>
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
                    fieldKey={`addr_${selectedCustomer.id}`}
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
                      <div className='mt-3 grid gap-3 md:grid-cols-2'>
                        <EditableField
                          label='Name'
                          value={contact.name}
                          fieldKey={`contact_${contact.id}_name`}
                          placeholder='Add name'
                          copyable
                          copyTitle='Copy contact name'
                          onSave={(value) => saveContactField(selectedCustomer, contact.id, 'name', value)}
                        />
                        <EditableField
                          label='Position'
                          value={contact.position}
                          fieldKey={`contact_${contact.id}_position`}
                          placeholder='Add position'
                          copyable
                          copyTitle='Copy contact position'
                          onSave={(value) => saveContactField(selectedCustomer, contact.id, 'position', value)}
                        />
                        <EditableField
                          label='Phone'
                          value={contact.phone}
                          fieldKey={`contact_${contact.id}_phone`}
                          placeholder='Add phone'
                          copyable
                          copyTitle='Copy phone number'
                          onSave={(value) => saveContactField(selectedCustomer, contact.id, 'phone', value)}
                        />
                        <EditableField
                          label='Email'
                          value={contact.email}
                          fieldKey={`contact_${contact.id}_email`}
                          placeholder='Add email'
                          copyable
                          copyTitle='Copy email address'
                          onSave={(value) => saveContactField(selectedCustomer, contact.id, 'email', value)}
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
        ) : null}

        <div className='h-8' />
      </>
    )
  }

  const DashboardView = () => {
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
            <Button
              className='w-full sm:ml-auto sm:w-auto'
              variant='outline'
              onClick={() => setActivePage('customers')}
            >
              View customers
            </Button>
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
      setEditingInfo(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(key => {
          if (key.endsWith(customerId)) delete next[key]
        })
        return next
      })
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

  async function saveContactField(
    customer: Customer,
    contactId: string,
    field: Exclude<keyof CustomerContact, 'id'>,
    value: string,
  ) {
    if (!canEdit) {
      setActionError('Not authorized to update contacts.')
      return
    }

    const payload = customer.contacts.map(contact => {
      if (contact.id !== contactId) {
        return {
          id: contact.id,
          name: contact.name,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
        }
      }
      return {
        id: contact.id,
        name: field === 'name' ? value : contact.name,
        position: field === 'position' ? value : contact.position,
        phone: field === 'phone' ? value : contact.phone,
        email: field === 'email' ? value : contact.email,
      }
    })

    try {
      await saveCustomerDetails(customer.id, { contacts: payload }, 'Failed to update contact.')
    } catch {
      // error handled in saveCustomerDetails
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
      setEditingInfo(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(key => {
          if (key.includes(contactId)) {
            delete next[key]
          }
        })
        return next
      })
    } catch {
      // error handled in saveCustomerDetails
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

  // Inline editable input
  function EditableField({
    label, value, onSave, fieldKey, placeholder, copyable, copyTitle,
  }: {
    label: string
    value?: string
    onSave: (v: string) => Promise<void> | void
    fieldKey: string
    placeholder?: string
    copyable?: boolean
    copyTitle?: string
  }) {
    const [val, setVal] = useState(value || '')
    const isEditing = !!editingInfo[fieldKey]
    const [isSaving, setIsSaving] = useState(false)
    const [fieldError, setFieldError] = useState<string | null>(null)

    useEffect(() => setVal(value || ''), [value])
    useEffect(() => {
      if (!canEdit && isEditing) {
        setEditingInfo(s => ({ ...s, [fieldKey]: false }))
        setFieldError(null)
        setVal(value || '')
      }
    }, [canEdit, isEditing, fieldKey, value])
    const hasValue = !!(value && value.trim())

    const saveValue = async () => {
      const trimmed = val.trim()
      setIsSaving(true)
      setFieldError(null)
      try {
        await onSave(trimmed)
        setEditingInfo(s => ({ ...s, [fieldKey]: false }))
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
              <Button onClick={saveValue} title='Save' disabled={isSaving}>
                <Save size={16} /> Save
              </Button>
              <Button
                variant='ghost'
                onClick={() => {
                  setEditingInfo(s => ({ ...s, [fieldKey]: false }))
                  setVal(value || '')
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
                {hasValue ? <span className='text-slate-800'>{value}</span> : <span className='text-slate-400'>{placeholder || 'Not set'}</span>}
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
                onClick={() => setEditingInfo(s => ({ ...s, [fieldKey]: true }))}
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

  return (
    <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
      <div className='mx-auto max-w-6xl'>
        {loadError && (
          <div className='mb-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
            <span>{loadError}</span>
            <Button variant='outline' onClick={() => void refreshCustomers()} disabled={isSyncing}>
              Retry
            </Button>
          </div>
        )}
        <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-3xl font-semibold tracking-tight text-slate-900'>CustomerProjectDB</h1>
            <p className='text-sm text-slate-500'>Keep track of customers, projects, and their work orders.</p>
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
            {!selectedProjectId && activePage === 'customers' && (
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

        {!selectedProjectId && (
          <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-1 shadow-sm'>
              {(['home', 'customers'] as const).map(page => {
                const isActive = activePage === page
                const label = page === 'home' ? 'Home' : 'Customers'
                return (
                  <button
                    key={page}
                    type='button'
                    onClick={() => setActivePage(page)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      isActive ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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

        {selectedProjectId ? (
          selectedProjectData ? (
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
          ) : (
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
        ) : activePage === 'home' ? (
          <DashboardView />
        ) : (
          <CustomersPage />
        )}
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
