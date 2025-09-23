import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { Customer, Project, WOType } from '../types'
import {
  listCustomers,
  createCustomer as createCustomerRecord,
  updateCustomer as updateCustomerRecord,
  deleteCustomer as deleteCustomerRecord,
  createProject as createProjectRecord,
  deleteProject as deleteProjectRecord,
  createWO as createWORecord,
  deleteWO as deleteWORecord,
  createPO as createPORecord,
  deletePO as deletePORecord,
  updateProject as updateProjectRecord,
  createFdsFile as createFdsFileRecord,
  deleteFdsFile as deleteFdsFileRecord,
  createTechnicalDrawing as createTechnicalDrawingRecord,
  deleteTechnicalDrawing as deleteTechnicalDrawingRecord,
  createSignOff as createSignOffRecord,
  deleteSignOff as deleteSignOffRecord,
} from '../lib/storage'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import ProjectPage from './ProjectPage'

type HistoryUpdateMode = 'push' | 'replace'

function AppContent() {
  const [db, setDb] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => getProjectIdFromLocation())
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
  const [newCust, setNewCust] = useState({ name: '', address: '', contactName: '', contactPhone: '', contactEmail: '' })
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)

  const updateProjectLocation = useCallback((projectId: string | null, mode: HistoryUpdateMode = 'push') => {
    if (typeof window === 'undefined' || typeof window.history === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    if (projectId) {
      url.searchParams.set('project', projectId)
    } else {
      url.searchParams.delete('project')
    }

    const state = { ...(window.history.state ?? {}), projectId }
    if (mode === 'replace') {
      window.history.replaceState(state, '', url)
    } else {
      window.history.pushState(state, '', url)
    }
  }, [])

  const openProject = useCallback(
    (customerId: string, projectId: string, mode: HistoryUpdateMode = 'push') => {
      setSelectedCustomerId(customerId)
      setSelectedProjectId(projectId)

      const currentInUrl = getProjectIdFromLocation()
      if (currentInUrl !== projectId) {
        updateProjectLocation(projectId, mode)
      }
    },
    [updateProjectLocation],
  )

  const closeProject = useCallback(
    (mode: HistoryUpdateMode = 'push') => {
      const currentInUrl = getProjectIdFromLocation()
      if (currentInUrl || selectedProjectId) {
        updateProjectLocation(null, mode)
      }
      setSelectedProjectId(null)
    },
    [selectedProjectId, updateProjectLocation],
  )

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      setSelectedProjectId(getProjectIdFromLocation())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])


  const selectedCustomer = useMemo(() => db.find(c => c.id === selectedCustomerId) || null, [db, selectedCustomerId])
  const selectedCustomerAddressForMap = selectedCustomer?.address?.trim() || null
  const customerOptions = useMemo(() => db.map(c => c.name).sort(), [db])
  const canEdit = true


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

  const hasSearchInput = useMemo(
    () => !!(customerQuery.trim() || projectQuery.trim() || woQuery.trim()),
    [customerQuery, projectQuery, woQuery],
  )

  const HomeView = () => {
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
                        if (m.projectId) {
                          openProject(m.customerId, m.projectId)
                        } else {
                          setSelectedCustomerId(m.customerId)
                          closeProject()
                        }
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
                    closeProject()
                    setSelectedCustomerId(null)
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
                    onSave={(v) => upsertCustomer({ ...selectedCustomer, address: v ? v : undefined })}
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
                <EditableField
                  label='Contact Name'
                  value={selectedCustomer.contactName}
                  fieldKey={`cname_${selectedCustomer.id}`}
                  placeholder='Add contact'
                  copyable
                  copyTitle='Copy contact name'
                  onSave={(v) => upsertCustomer({ ...selectedCustomer, contactName: v ? v : undefined })}
                />
                <EditableField
                  label='Contact Phone'
                  value={selectedCustomer.contactPhone}
                  fieldKey={`cphone_${selectedCustomer.id}`}
                  placeholder='Add phone'
                  copyable
                  copyTitle='Copy phone number'
                  onSave={(v) => upsertCustomer({ ...selectedCustomer, contactPhone: v ? v : undefined })}
                />
                <EditableField
                  label='Contact Email'
                  value={selectedCustomer.contactEmail}
                  fieldKey={`cemail_${selectedCustomer.id}`}
                  placeholder='Add email'
                  copyable
                  copyTitle='Copy email address'
                  onSave={(v) => upsertCustomer({ ...selectedCustomer, contactEmail: v ? v : undefined })}
                />
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
                          onClick={() => navigator.clipboard.writeText(project.number)}
                          title='Copy project number'
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          onClick={() => {
                            openProject(selectedCustomer.id, project.id)
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
                          { label: 'Work Orders', value: project.wos.length },
                          { label: 'Purchase Orders', value: project.pos.length },
                          { label: 'FDS Files', value: project.fdsFiles.length },
                          { label: 'Technical Drawings', value: project.technicalDrawings.length },
                          { label: 'Sign Offs', value: project.signOffs.length },
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

  useEffect(() => {
    if (!selectedProjectData) {
      return
    }

    setSelectedCustomerId(prev => (prev === selectedProjectData.customer.id ? prev : selectedProjectData.customer.id))
  }, [selectedProjectData?.customer.id])

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
  const poNumberExists = (number: string, excludePoId?: string) => {
    const norm = number.trim().toLowerCase()
    return db.some(c => c.projects.some(p => p.pos.some(po => po.id !== excludePoId && po.number.trim().toLowerCase() === norm)))
  }

  // Mutators
  async function upsertCustomer(updated: Customer) {
    try {
      const saved = await updateCustomerRecord(updated.id, {
        name: updated.name,
        address: updated.address ?? null,
        contactName: updated.contactName ?? null,
        contactPhone: updated.contactPhone ?? null,
        contactEmail: updated.contactEmail ?? null,
      })
      setDb(prev =>
        prev.map(c =>
          c.id === saved.id
            ? {
                ...c,
                name: saved.name,
                address: saved.address,
                contactName: saved.contactName,
                contactPhone: saved.contactPhone,
                contactEmail: saved.contactEmail,
              }
            : c,
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to update customer', error)
      const message = toErrorMessage(error, 'Failed to update customer.')
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
      if (shouldClearProject) closeProject('replace')
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
      if (selectedProjectId === projectId) {
        closeProject('replace')
      }
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

  async function deletePO(customerId: string, projectId: string, poId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete purchase orders.')
      return
    }
    try {
      await deletePORecord(poId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, pos: p.pos.filter(po => po.id !== poId) },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete purchase order', error)
      const message = toErrorMessage(error, 'Failed to delete purchase order.')
      setActionError(message)
    }
  }

  async function deleteFdsFile(customerId: string, projectId: string, fileId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete FDS files.')
      return
    }
    try {
      await deleteFdsFileRecord(fileId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId
                    ? p
                    : { ...p, fdsFiles: p.fdsFiles.filter(file => file.id !== fileId) },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete FDS file', error)
      const message = toErrorMessage(error, 'Failed to delete FDS file.')
      setActionError(message)
    }
  }

  async function deleteTechnicalDrawing(customerId: string, projectId: string, fileId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete technical drawings.')
      return
    }
    try {
      await deleteTechnicalDrawingRecord(fileId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId
                    ? p
                    : { ...p, technicalDrawings: p.technicalDrawings.filter(file => file.id !== fileId) },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete technical drawing', error)
      const message = toErrorMessage(error, 'Failed to delete technical drawing.')
      setActionError(message)
    }
  }

  async function deleteSignOff(customerId: string, projectId: string, signOffId: string) {
    if (!canEdit) {
      setActionError('Not authorized to delete sign-offs.')
      return
    }
    try {
      await deleteSignOffRecord(signOffId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId
                    ? p
                    : { ...p, signOffs: p.signOffs.filter(item => item.id !== signOffId) },
                ),
              },
        ),
      )
      setActionError(null)
    } catch (error) {
      console.error('Failed to delete sign-off', error)
      const message = toErrorMessage(error, 'Failed to delete sign-off.')
      setActionError(message)
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

  async function addPO(
    customerId: string,
    projectId: string,
    data: { number: string; note?: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create purchase orders.'
      setActionError(message)
      return message
    }
    const trimmed = data.number.trim()
    if (!trimmed) return 'Enter a purchase order number.'
    if (poNumberExists(trimmed)) return 'A purchase order with this number already exists.'
    const note = data.note?.trim()
    try {
      const newPO = await createPORecord(projectId, { number: trimmed, note })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, pos: [...p.pos, newPO] },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to create purchase order', error)
      const message = toErrorMessage(error, 'Failed to create purchase order.')
      setActionError(message)
      return message
    }
  }

  async function addFdsFile(
    customerId: string,
    projectId: string,
    data: { name: string; url?: string; note?: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to add FDS files.'
      setActionError(message)
      return message
    }
    const trimmedName = data.name.trim()
    if (!trimmedName) return 'Enter a file name.'
    const url = data.url?.trim()
    const note = data.note?.trim()
    try {
      const file = await createFdsFileRecord(projectId, {
        name: trimmedName,
        url: url || undefined,
        note: note || undefined,
      })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, fdsFiles: [...p.fdsFiles, file] },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to add FDS file', error)
      const message = toErrorMessage(error, 'Failed to add FDS file.')
      setActionError(message)
      return message
    }
  }

  async function addTechnicalDrawing(
    customerId: string,
    projectId: string,
    data: { name: string; url?: string; note?: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to add technical drawings.'
      setActionError(message)
      return message
    }
    const trimmedName = data.name.trim()
    if (!trimmedName) return 'Enter a file name.'
    const url = data.url?.trim()
    const note = data.note?.trim()
    try {
      const file = await createTechnicalDrawingRecord(projectId, {
        name: trimmedName,
        url: url || undefined,
        note: note || undefined,
      })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, technicalDrawings: [...p.technicalDrawings, file] },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to add technical drawing', error)
      const message = toErrorMessage(error, 'Failed to add technical drawing.')
      setActionError(message)
      return message
    }
  }

  async function addSignOff(
    customerId: string,
    projectId: string,
    data: { title: string; signedBy?: string; date?: string; note?: string },
  ): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to add sign-offs.'
      setActionError(message)
      return message
    }
    const trimmedTitle = data.title.trim()
    if (!trimmedTitle) return 'Enter a sign-off title.'
    const signedBy = data.signedBy?.trim()
    const date = data.date?.trim()
    const note = data.note?.trim()
    try {
      const signOff = await createSignOffRecord(projectId, {
        title: trimmedTitle,
        signedBy: signedBy || undefined,
        date: date || undefined,
        note: note || undefined,
      })
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId
            ? c
            : {
                ...c,
                projects: c.projects.map(p =>
                  p.id !== projectId ? p : { ...p, signOffs: [...p.signOffs, signOff] },
                ),
              },
        ),
      )
      setActionError(null)
      return null
    } catch (error) {
      console.error('Failed to add sign-off', error)
      const message = toErrorMessage(error, 'Failed to add sign-off.')
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

  async function createCustomer(data: Omit<Customer, 'id' | 'projects'>): Promise<string | null> {
    if (!canEdit) {
      const message = 'Not authorized to create customers.'
      setActionError(message)
      return message
    }
    const trimmedName = data.name.trim()
    if (!trimmedName) return 'Customer name is required.'
    if (customerNameExists(trimmedName)) return 'A customer with this name already exists.'
    const payload = {
      name: trimmedName,
      address: data.address?.trim() || undefined,
      contactName: data.contactName?.trim() || undefined,
      contactPhone: data.contactPhone?.trim() || undefined,
      contactEmail: data.contactEmail?.trim() || undefined,
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
          <h1 className='text-2xl font-semibold tracking-tight'>CustomerProjectDB</h1>
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

        {selectedProjectId ? (
          selectedProjectData ? (
            <ProjectPage
              customer={selectedProjectData.customer}
              project={selectedProjectData.project}
              canEdit={canEdit}
              onUpdateProjectNote={(note) =>
                updateProjectNote(selectedProjectData.customer.id, selectedProjectData.project.id, note)
              }
              onAddWO={(data) => addWO(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
              onDeleteWO={(woId) => deleteWO(selectedProjectData.customer.id, selectedProjectData.project.id, woId)}
              onAddPO={(data) => addPO(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
              onDeletePO={(poId) => deletePO(selectedProjectData.customer.id, selectedProjectData.project.id, poId)}
              onAddFdsFile={(data) => addFdsFile(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
              onDeleteFdsFile={(fileId) => deleteFdsFile(selectedProjectData.customer.id, selectedProjectData.project.id, fileId)}
              onAddTechnicalDrawing={(data) =>
                addTechnicalDrawing(selectedProjectData.customer.id, selectedProjectData.project.id, data)
              }
              onDeleteTechnicalDrawing={(fileId) =>
                deleteTechnicalDrawing(selectedProjectData.customer.id, selectedProjectData.project.id, fileId)
              }
              onAddSignOff={(data) => addSignOff(selectedProjectData.customer.id, selectedProjectData.project.id, data)}
              onDeleteSignOff={(signOffId) =>
                deleteSignOff(selectedProjectData.customer.id, selectedProjectData.project.id, signOffId)
              }
              onDeleteProject={() => deleteProject(selectedProjectData.customer.id, selectedProjectData.project.id)}
              onNavigateBack={() => closeProject()}
            />
          ) : (
            <Card className='panel'>
              <CardHeader>
                <div className='text-lg font-semibold'>Project not found</div>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-slate-600'>We couldn't find that project. It may have been deleted.</p>
                <div className='mt-4'>
                  <Button onClick={() => closeProject('replace')}>Back to index</Button>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <HomeView />
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
                          contactName: newCust.contactName,
                          contactPhone: newCust.contactPhone,
                          contactEmail: newCust.contactEmail,
                        })
                        if (result) {
                          setNewCustomerError(result)
                          return
                        }
                        setNewCust({ name: '', address: '', contactName: '', contactPhone: '', contactEmail: '' })
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

function getProjectIdFromLocation(): string | null {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return null
  }

  try {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('project')
    return value && value.trim() ? value : null
  } catch {
    return null
  }
}
