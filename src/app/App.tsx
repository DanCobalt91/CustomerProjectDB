import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Copy, Save, Pencil, X, Search, ChevronRight, ChevronDown, MapPin, AlertCircle, LogOut } from 'lucide-react'
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
  getStorageProvider,
  subscribeToStorageProviderChange,
  type StorageProvider,
} from '../lib/storage'
import { useSupabaseAuth } from '../lib/useSupabaseAuth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'

export default function App() {
  const [db, setDb] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [editingInfo, setEditingInfo] = useState<Record<string, boolean>>({})
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [authFormError, setAuthFormError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [activeStorageProvider, setActiveStorageProvider] = useState<StorageProvider>(() => getStorageProvider())
  const [storageNotice, setStorageNotice] = useState<string | null>(null)

  const usingSupabase = activeStorageProvider === 'supabase'
  const storageLabel = usingSupabase ? 'Supabase' : 'Browser'
  const storageTitle = usingSupabase
    ? 'Data is stored securely in Supabase for your account.'
    : storageNotice ?? 'Data is stored in this browser only.'
  const storageBadgeClass = usingSupabase
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700'
  const { status: authStatus, user: authUser, error: authErrorMessage, signIn, signUp, signOut } = useSupabaseAuth(usingSupabase)

  // Search
  const [customerQuery, setCustomerQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [woQuery, setWoQuery] = useState('')

  // Create customer (modal)
  const [newCust, setNewCust] = useState({ name: '', address: '', contactName: '', contactPhone: '', contactEmail: '' })
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToStorageProviderChange(change => {
      setActiveStorageProvider(change.provider)

      if (change.provider === 'browser') {
        if (change.reason === 'supabase-unavailable') {
          if (change.error) {
            console.warn('Supabase connection lost; continuing with browser storage.', change.error)
          }
          setStorageNotice(
            'Lost connection to Supabase. Data will stay in this browser until the connection is restored and will not sync to Supabase.',
          )
        } else {
          setStorageNotice(null)
        }
      } else {
        setStorageNotice(null)
      }
    })

    return unsubscribe
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
        const message = error instanceof Error ? error.message : ''
        if (message === 'You must be signed in to access the database.') {
          setDb([])
          setLoadError(null)
        } else {
          setLoadError('Unable to load customers right now. Please try again.')
        }
      } finally {
        if (initial) {
          setIsLoading(false)
        } else {
          setIsSyncing(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!usingSupabase) {
      void refreshCustomers(true)
      return
    }

    if (authStatus === 'signed-in') {
      void refreshCustomers(true)
    } else if (authStatus === 'signed-out' || authStatus === 'error') {
      setDb([])
      setSelectedCustomerId(null)
      setIsLoading(false)
      setIsSyncing(false)
      setLoadError(null)
    }
  }, [usingSupabase, authStatus, refreshCustomers])

  useEffect(() => {
    if (authStatus === 'signed-in') {
      setAuthFormError(null)
      setAuthNotice(null)
      setAuthPassword('')
    }
    if (authStatus === 'signed-out') {
      setAuthMode('sign-in')
    }
  }, [authStatus])

  const selectedCustomer = useMemo(() => db.find(c => c.id === selectedCustomerId) || null, [db, selectedCustomerId])
  const selectedCustomerAddressForMap = selectedCustomer?.address?.trim() || null
  const customerOptions = useMemo(() => db.map(c => c.name).sort(), [db])
  const authUserLabel = useMemo(() => {
    if (!authUser) return null
    if (authUser.email) return authUser.email
    return `User ${authUser.id.slice(0, 8)}`
  }, [authUser])
  const resolvedAuthError = authErrorMessage ?? (authStatus === 'error' ? 'Unable to verify your session. Please sign in again.' : null)

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

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthFormError(null)
    setAuthNotice(null)

    const email = authEmail.trim().toLowerCase()
    const password = authPassword

    if (!email || !password) {
      setAuthFormError('Email and password are required.')
      return
    }

    setAuthEmail(email)
    setIsAuthSubmitting(true)

    try {
      if (authMode === 'sign-in') {
        const result = await signIn(email, password)
        if (result.error) {
          setAuthFormError(result.error)
        }
      } else {
        const result = await signUp(email, password)
        if (result.error) {
          setAuthFormError(result.error)
        } else {
          setAuthMode('sign-in')
          setAuthNotice(
            result.confirmationRequired
              ? 'Check your email to confirm your account, then sign in.'
              : 'Account created. Sign in to continue.',
          )
          if (!result.confirmationRequired) {
            setAuthEmail('')
            setAuthPassword('')
          }
        }
      }
    } catch (error) {
      setAuthFormError(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleAuthModeToggle = useCallback(() => {
    setAuthMode(prev => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))
    setAuthFormError(null)
    setAuthNotice(null)
  }, [])

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true)
    try {
      const { error } = await signOut()
      if (error) {
        console.error('Failed to sign out', error)
        setLoadError('Unable to sign out right now. Please try again.')
      }
    } finally {
      setIsSigningOut(false)
    }
  }, [signOut])

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
    } catch (error) {
      console.error('Failed to update customer', error)
      throw error instanceof Error ? error : new Error('Failed to update customer.')
    }
  }

  async function deleteCustomer(customerId: string) {
    const target = db.find(c => c.id === customerId)
    try {
      await deleteCustomerRecord(customerId)
      setDb(prev => prev.filter(c => c.id !== customerId))
      setOpenProjects(prev => {
        if (!target) return prev
        const next = { ...prev }
        target.projects.forEach(p => {
          delete next[p.id]
        })
        return next
      })
      setEditingInfo(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(key => {
          if (key.endsWith(customerId)) delete next[key]
        })
        return next
      })
      if (selectedCustomerId === customerId) setSelectedCustomerId(null)
    } catch (error) {
      console.error('Failed to delete customer', error)
    }
  }

  async function deleteProject(customerId: string, projectId: string) {
    try {
      await deleteProjectRecord(projectId)
      setDb(prev =>
        prev.map(c =>
          c.id !== customerId ? c : { ...c, projects: c.projects.filter(p => p.id !== projectId) },
        ),
      )
      setOpenProjects(prev => {
        if (!prev[projectId]) return prev
        const next = { ...prev }
        delete next[projectId]
        return next
      })
    } catch (error) {
      console.error('Failed to delete project', error)
    }
  }

  async function deleteWO(customerId: string, projectId: string, woId: string) {
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
    } catch (error) {
      console.error('Failed to delete work order', error)
    }
  }

  async function deletePO(customerId: string, projectId: string, poId: string) {
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
    } catch (error) {
      console.error('Failed to delete purchase order', error)
    }
  }

  function updateProjectNote(customerId: string, projectId: string, note: string) {
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
      } catch (error) {
        console.error('Failed to update project note', error)
      }
    })()
  }

  async function addWO(
    customerId: string,
    projectId: string,
    data: { number: string; type: WOType; note?: string },
  ): Promise<string | null> {
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
      return null
    } catch (error) {
      console.error('Failed to create work order', error)
      return 'Failed to create work order.'
    }
  }

  async function addPO(
    customerId: string,
    projectId: string,
    data: { number: string; note?: string },
  ): Promise<string | null> {
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
      return null
    } catch (error) {
      console.error('Failed to create purchase order', error)
      return 'Failed to create purchase order.'
    }
  }

  async function addProject(customerId: string, projectNumber: string): Promise<string | null> {
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
      return null
    } catch (error) {
      console.error('Failed to create project', error)
      return 'Failed to create project.'
    }
  }

  async function createCustomer(data: Omit<Customer, 'id' | 'projects'>): Promise<string | null> {
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
      return null
    } catch (error) {
      console.error('Failed to create customer', error)
      return 'Failed to create customer.'
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
              <Button variant='outline' onClick={() => setEditingInfo(s => ({ ...s, [fieldKey]: true }))} title='Edit'>
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

  // Collapsible project row
  function ProjectRow({ project, customer }: { project: Project; customer: Customer }) {
    const isOpen = !!openProjects[project.id]
    const [noteDraft, setNoteDraft] = useState(project.note ?? '')
    const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
    const [poForm, setPoForm] = useState({ number: '', note: '' })
    const [woError, setWoError] = useState<string | null>(null)
    const [poError, setPoError] = useState<string | null>(null)
    const [isAddingWo, setIsAddingWo] = useState(false)
    const [isAddingPo, setIsAddingPo] = useState(false)

    useEffect(() => {
      setNoteDraft(project.note ?? '')
      setWoError(null)
      setPoError(null)
    }, [project.id])

    useEffect(() => {
      setNoteDraft(prev => {
        const next = project.note ?? ''
        return prev === next ? prev : next
      })
    }, [project.note])

    return (
      <Card className='mb-3 panel'>
        <CardHeader>
          <div className='flex items-center gap-3'>
            <Button
              variant='ghost'
              onClick={() => setOpenProjects(s => ({ ...s, [project.id]: !isOpen }))}
              className='p-1'
              title={isOpen ? 'Collapse' : 'Expand'}
            >
              <ChevronDown
                size={18}
                className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
              />
            </Button>

            <div className='flex items-center gap-3 font-semibold text-slate-800'>
              <span>Project: {project.number}</span>
              {!isOpen && project.note && (
                <span
                  className='max-w-[28ch] truncate text-xs font-medium text-slate-500 italic'
                  title={project.note}
                >
                  • {project.note}
                </span>
              )}
            </div>

            <Button variant='outline' onClick={() => navigator.clipboard.writeText(project.number)} title='Copy project number'>
              <Copy size={16} /> Copy
            </Button>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              className='text-rose-600 hover:bg-rose-50'
              onClick={() => void deleteProject(customer.id, project.id)}
              title='Delete project'
            >
              <Trash2 size={18} />
            </Button>
          </div>
        </CardHeader>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <CardContent className='grid gap-6 md:grid-cols-2'>
                {/* Project note */}
                <div className='md:col-span-2'>
                  <div className='rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm'>
                    <div className='mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500'>Project Note</div>
                    <textarea
                      className='w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                      rows={2}
                      placeholder='Add a note about this project (optional)…'
                      value={noteDraft}
                      onChange={(e) => {
                        const v = (e.target as HTMLTextAreaElement).value
                        setNoteDraft(v)
                        updateProjectNote(customer.id, project.id, v)
                      }}
                    />
                  </div>
                </div>

                {/* Work Orders */}
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
                          <Button variant='outline' onClick={() => navigator.clipboard.writeText(wo.number)} title='Copy WO'>
                            <Copy size={16} />
                          </Button>
                          <Button
                            variant='ghost'
                            className='text-rose-600 hover:bg-rose-50'
                            onClick={() => void deleteWO(customer.id, project.id, wo.id)}
                            title='Delete WO'
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className='mt-3 rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm'>
                    <div className='mb-2 text-sm font-semibold text-slate-700'>Add WO</div>
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
                        >
                          <option>Build</option>
                          <option>Onsite</option>
                        </select>
                      </div>
                      <div className='md:col-span-2'>
                        <Label>Optional note</Label>
                        <Input value={woForm.note} onChange={(e) => setWoForm({ ...woForm, note: (e.target as HTMLInputElement).value })} placeholder='e.g. Line 2 SAT' />
                      </div>
                    </div>
                    <div className='mt-2 space-y-2'>
                      <Button
                        disabled={isAddingWo}
                        onClick={async () => {
                          const raw = woForm.number.trim()
                          if (!raw) {
                            setWoError('Enter a work order number.')
                            return
                          }
                          setIsAddingWo(true)
                          try {
                            const result = await addWO(customer.id, project.id, { number: raw, type: woForm.type, note: woForm.note })
                            if (result) {
                              setWoError(result)
                              return
                            }
                            setWoForm({ number: '', type: 'Build', note: '' })
                            setWoError(null)
                          } finally {
                            setIsAddingWo(false)
                          }
                        }}
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

                {/* Purchase Orders */}
                <div>
                  <div className='mb-2 text-sm font-semibold text-slate-700'>Purchase Orders</div>
                  <div className='space-y-2'>
                    {project.pos.length === 0 && <div className='text-sm text-slate-500'>None yet</div>}
                    {project.pos.map(po => (
                      <div key={po.id} className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm'>
                        <div>
                          <div className='font-semibold text-slate-800'>{po.number}</div>
                          {po.note && <div className='text-xs text-slate-500'>{po.note}</div>}
                        </div>
                        <div className='flex items-center gap-1'>
                          <Button variant='outline' onClick={() => navigator.clipboard.writeText(po.number)} title='Copy PO'>
                            <Copy size={16} />
                          </Button>
                          <Button
                            variant='ghost'
                            className='text-rose-600 hover:bg-rose-50'
                            onClick={() => void deletePO(customer.id, project.id, po.id)}
                            title='Delete PO'
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className='mt-3 rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm'>
                    <div className='mb-2 text-sm font-semibold text-slate-700'>Add PO</div>
                    <div className='grid gap-2 md:grid-cols-5'>
                      <div className='md:col-span-3'>
                        <Label>PO Number</Label>
                        <Input
                          value={poForm.number}
                          onChange={(e) => {
                            setPoForm({ ...poForm, number: (e.target as HTMLInputElement).value })
                            if (poError) setPoError(null)
                          }}
                          placeholder='PO-90001'
                        />
                      </div>
                      <div className='md:col-span-2'>
                        <Label>Optional note</Label>
                        <Input value={poForm.note} onChange={(e) => setPoForm({ ...poForm, note: (e.target as HTMLInputElement).value })} placeholder='e.g. deposit' />
                      </div>
                    </div>
                    <div className='mt-2 space-y-2'>
                      <Button
                        disabled={isAddingPo}
                        onClick={async () => {
                          const raw = poForm.number.trim()
                          if (!raw) {
                            setPoError('Enter a purchase order number.')
                            return
                          }
                          setIsAddingPo(true)
                          try {
                            const result = await addPO(customer.id, project.id, { number: raw, note: poForm.note })
                            if (result) {
                              setPoError(result)
                              return
                            }
                            setPoForm({ number: '', note: '' })
                            setPoError(null)
                          } finally {
                            setIsAddingPo(false)
                          }
                        }}
                      >
                        <Plus size={16} /> Add PO
                      </Button>
                      {poError && (
                        <p className='flex items-center gap-1 text-sm text-rose-600'>
                          <AlertCircle size={14} /> {poError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    )
  }

  if (usingSupabase && authStatus === 'loading') {
    return (
      <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
        <div className='mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center gap-4 text-center text-slate-600'>
          <span className='h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500' aria-hidden />
          <p className='text-sm font-medium text-slate-500'>Checking your session…</p>
        </div>
      </div>
    )
  }

  if (usingSupabase && authStatus !== 'signed-in') {
    return (
      <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
        <div className='mx-auto flex min-h-[60vh] max-w-md flex-col justify-center'>
          <Card className='panel'>
            <CardHeader>
              <div className='flex flex-col gap-1'>
                <h1 className='text-xl font-semibold text-slate-800'>Sign in to continue</h1>
                <p className='text-sm text-slate-500'>Use your Supabase credentials to access CustomerProjectDB.</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className='mb-4 flex justify-between'>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${storageBadgeClass}`} title={storageTitle}>
                  Storage: {storageLabel}
                </span>
              </div>
              {resolvedAuthError && (
                <div className='mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
                  {resolvedAuthError}
                </div>
              )}
              {authFormError && (
                <div className='mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
                  {authFormError}
                </div>
              )}
              {authNotice && (
                <div className='mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
                  {authNotice}
                </div>
              )}
              <form onSubmit={handleAuthSubmit} className='grid gap-4'>
                <div>
                  <Label htmlFor='auth-email'>Email</Label>
                  <Input
                    id='auth-email'
                    type='email'
                    autoComplete='email'
                    value={authEmail}
                    onChange={event => setAuthEmail((event.target as HTMLInputElement).value)}
                    disabled={isAuthSubmitting}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor='auth-password'>Password</Label>
                  <Input
                    id='auth-password'
                    type='password'
                    autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={event => setAuthPassword((event.target as HTMLInputElement).value)}
                    disabled={isAuthSubmitting}
                    required
                  />
                </div>
                <Button type='submit' size='lg' disabled={isAuthSubmitting}>
                  {isAuthSubmitting ? 'Working…' : authMode === 'sign-in' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>
              <div className='mt-4 text-center text-sm text-slate-500'>
                {authMode === 'sign-in' ? (
                  <button
                    type='button'
                    className='font-semibold text-sky-600 hover:underline'
                    onClick={handleAuthModeToggle}
                    disabled={isAuthSubmitting}
                  >
                    Need an account? Create one
                  </button>
                ) : (
                  <button
                    type='button'
                    className='font-semibold text-sky-600 hover:underline'
                    onClick={handleAuthModeToggle}
                    disabled={isAuthSubmitting}
                  >
                    Already have an account? Sign in
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
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
            {usingSupabase && authUserLabel && (
              <span className='max-w-[220px] truncate text-xs font-medium text-slate-500' title={authUserLabel}>
                Signed in as {authUserLabel}
              </span>
            )}
            {isSyncing && (
              <span className='flex items-center gap-2 text-xs font-medium text-slate-500'>
                <span className='h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500' aria-hidden />
                Syncing…
              </span>
            )}
            {usingSupabase && (
              <Button
                variant='ghost'
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                title='Sign out of Supabase'
              >
                <LogOut size={16} /> {isSigningOut ? 'Signing Out…' : 'Sign Out'}
              </Button>
            )}
            <Button
              onClick={() => {
                setShowNewCustomer(true)
                setNewCustomerError(null)
              }}
              title='Create new customer'
            >
              <Plus size={16} /> New Customer
            </Button>
          </div>
        </div>

        {!usingSupabase && (
          <div className='mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
            {storageNotice ??
              'Supabase is not configured — data stays in this browser only. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync with Supabase.'}
          </div>
        )}

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
                      onClick={() => setSelectedCustomerId(m.customerId)}
                      className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
                      title={
                        m.kind === 'customer'
                          ? 'Open customer'
                          : m.kind === 'project'
                          ? 'Open customer at project'
                          : 'Open customer at work order'
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
              <div className='flex items-center gap-2'>
                <Button variant='outline' onClick={() => setSelectedCustomerId(null)}>Back to Index</Button>
                <Button
                  variant='ghost'
                  className='text-rose-600 hover:bg-rose-50'
                  onClick={() => {
                    if (!selectedCustomer) return
                    const confirmed = window.confirm('Delete this customer and all associated projects, purchase orders, and work orders?')
                    if (!confirmed) return
                    void deleteCustomer(selectedCustomer.id)
                  }}
                  title='Delete customer'
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
                      className='inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700'
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCustomerAddressForMap)}`}
                      target='_blank'
                      rel='noreferrer'
                      title='View address on Google Maps'
                    >
                      <MapPin size={14} /> View on Google Maps
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
                <AddProjectForm onAdd={(num) => addProject(selectedCustomer.id, num)} />
              </div>

              <div className='mt-6'>
                <div className='mb-2 text-sm font-semibold text-slate-700'>Projects</div>
                {selectedCustomer.projects.length === 0 && <div className='text-sm text-slate-500'>No projects yet.</div>}
                {selectedCustomer.projects.map(p => (<ProjectRow key={p.id} project={p} customer={selectedCustomer} />))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className='h-8' />
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
                    />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={newCust.contactName} onChange={(e) => setNewCust({ ...newCust, contactName: (e.target as HTMLInputElement).value })} placeholder='e.g. Alex Doe' />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input value={newCust.contactPhone} onChange={(e) => setNewCust({ ...newCust, contactPhone: (e.target as HTMLInputElement).value })} placeholder='e.g. +44 20 7946 0000' />
                  </div>
                  <div>
                    <Label>Contact Email</Label>
                    <Input value={newCust.contactEmail} onChange={(e) => setNewCust({ ...newCust, contactEmail: (e.target as HTMLInputElement).value })} placeholder='e.g. alex@globex.co.uk' />
                  </div>
                  <div className='md:col-span-2'>
                    <Label>Address</Label>
                    <Input value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: (e.target as HTMLInputElement).value })} placeholder='e.g. 10 High Street, London' />
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
                    disabled={isCreatingCustomer}
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

function AddProjectForm({ onAdd }: { onAdd: (num: string) => Promise<string | null> }) {
  const [val, setVal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = async () => {
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
            />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={isSaving}>
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
