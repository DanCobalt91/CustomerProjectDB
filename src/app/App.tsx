import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Copy, Save, Pencil, X, Search, ChevronRight, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Customer, Project, WOType } from '../types'
import { loadDb, saveDb } from '../lib/storage'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'

export default function App() {
  const [db, setDb] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [editingInfo, setEditingInfo] = useState<Record<string, boolean>>({})
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})

  // Search
  const [customerQuery, setCustomerQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [woQuery, setWoQuery] = useState('')

  // Create customer (modal)
  const [newCust, setNewCust] = useState({ name: '', address: '', contactName: '', contactPhone: '', contactEmail: '' })
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  useEffect(() => { setDb(loadDb()) }, [])
  useEffect(() => { saveDb(db) }, [db])

  const selectedCustomer = useMemo(() => db.find(c => c.id === selectedCustomerId) || null, [db, selectedCustomerId])
  const customerOptions = useMemo(() => db.map(c => c.name).sort(), [db])

  const searchMatches = useMemo(() => {
    const matches: { kind: 'customer' | 'project' | 'wo'; label: string; customerId: string; projectId?: string }[] = []
    const cq = customerQuery.trim().toLowerCase()
    db.forEach(c => {
      if (!cq || c.name.toLowerCase().includes(cq)) matches.push({ kind: 'customer', label: `${c.name}`, customerId: c.id })
    })
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

  // Helpers
  const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36).slice(-4)}`

  // Mutators
  function upsertCustomer(updated: Customer) {
    setDb(prev => prev.map(c => (c.id === updated.id ? updated : c)))
  }
  function deleteCustomer(customerId: string) {
    const target = db.find(c => c.id === customerId)
    setDb(prev => prev.filter(c => c.id !== customerId))
    setOpenProjects(prev => {
      if (!target) return prev
      const next = { ...prev }
      target.projects.forEach(p => { delete next[p.id] })
      return next
    })
    setEditingInfo(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => {
        if (key.includes(customerId)) delete next[key]
      })
      return next
    })
    if (selectedCustomerId === customerId) setSelectedCustomerId(null)
  }
  function deleteProject(customerId: string, projectId: string) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : { ...c, projects: c.projects.filter(p => p.id !== projectId) })))
    setOpenProjects(prev => {
      if (!prev[projectId]) return prev
      const next = { ...prev }
      delete next[projectId]
      return next
    })
  }
  function deleteWO(customerId: string, projectId: string, woId: string) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : {
      ...c, projects: c.projects.map(p => p.id !== projectId ? p : { ...p, wos: p.wos.filter(w => w.id !== woId) })
    })))
  }
  function deletePO(customerId: string, projectId: string, poId: string) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : {
      ...c, projects: c.projects.map(p => p.id !== projectId ? p : { ...p, pos: p.pos.filter(po => po.id !== poId) })
    })))
  }
  function addWO(customerId: string, projectId: string, data: { number: string; type: WOType; note?: string }) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : {
      ...c, projects: c.projects.map(p => p.id !== projectId ? p : { ...p, wos: [...p.wos, { id: uid('wo'), ...data }] })
    })))
  }
  function addPO(customerId: string, projectId: string, data: { number: string; note?: string }) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : {
      ...c, projects: c.projects.map(p => p.id !== projectId ? p : { ...p, pos: [...p.pos, { id: uid('po'), ...data }] })
    })))
  }
  function addProject(customerId: string, projectNumber: string) {
    setDb(prev => prev.map(c => (c.id !== customerId ? c : {
      ...c, projects: [...c.projects, { id: uid('proj'), number: projectNumber, wos: [], pos: [] }]
    })))
  }
  function createCustomer(data: Omit<Customer, 'id' | 'projects'>) {
    const c: Customer = { id: uid('cust'), ...data, projects: [] }
    setDb(prev => [c, ...prev])
    setSelectedCustomerId(c.id)
  }

  // Inline editable input
  function EditableField({
    label, value, onSave, fieldKey, placeholder,
  }: { label: string; value?: string; onSave: (v: string) => void; fieldKey: string; placeholder?: string }) {
    const [val, setVal] = useState(value || '')
    const isEditing = !!editingInfo[fieldKey]
    useEffect(() => setVal(value || ''), [value])
    return (
      <div className='flex flex-col gap-1'>
        <Label>{label}</Label>
        <div className='flex items-center gap-2'>
          {isEditing ? (
            <>
              <Input value={val} onChange={(e) => setVal((e.target as HTMLInputElement).value)} placeholder={placeholder} />
              <Button onClick={() => { onSave(val); setEditingInfo(s => ({ ...s, [fieldKey]: false })) }} title='Save'>
                <Save size={16} /> Save
              </Button>
              <Button variant='ghost' onClick={() => setEditingInfo(s => ({ ...s, [fieldKey]: false }))} title='Cancel'>
                <X size={16} />
              </Button>
            </>
          ) : (
            <>
              <div className='min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm'>
                {value ? <span className='text-slate-800'>{value}</span> : <span className='text-slate-400'>{placeholder || 'Not set'}</span>}
              </div>
              <Button variant='outline' onClick={() => setEditingInfo(s => ({ ...s, [fieldKey]: true }))} title='Edit'>
                <Pencil size={16} /> Edit
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Collapsible project row
  function ProjectRow({ project, customer }: { project: Project; customer: Customer }) {
    const isOpen = !!openProjects[project.id]
    const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
    const [poForm, setPoForm] = useState({ number: '', note: '' })

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
              <ChevronDown size={18} className={isOpen ? '' : 'rotate-90 transition'} />
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
            <Button variant='ghost' className='text-rose-600 hover:bg-rose-50' onClick={() => deleteProject(customer.id, project.id)} title='Delete project'>
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
                      value={project.note || ''}
                      onChange={(e) => {
                        const v = (e.target as HTMLTextAreaElement).value
                        setDb(prev => prev.map(c => c.id !== customer.id ? c : {
                          ...c,
                          projects: c.projects.map(p => p.id !== project.id ? p : { ...p, note: v })
                        }))
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
                          <Button variant='ghost' className='text-rose-600 hover:bg-rose-50' onClick={() => deleteWO(customer.id, project.id, wo.id)} title='Delete WO'>
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
                          <Input className='rounded-l-none border-l-0' value={woForm.number} onChange={(e) => setWoForm({ ...woForm, number: (e.target as HTMLInputElement).value })} placeholder='000000' />
                        </div>
                      </div>
                      <div>
                        <Label>Type</Label>
                        <select
                          className='w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                          value={woForm.type}
                          onChange={(e) => setWoForm({ ...woForm, type: e.target.value as WOType })}
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
                    <div className='mt-2'>
                      <Button onClick={() => {
                        const t = woForm.number.trim(); if (!t) return;
                        const num = t.startsWith('WO') ? t : `WO${t}`;
                        addWO(customer.id, project.id, { number: num, type: woForm.type, note: woForm.note?.trim() || undefined });
                        setWoForm({ number: '', type: 'Build', note: '' });
                      }}>
                        <Plus size={16} /> Add WO
                      </Button>
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
                          <Button variant='ghost' className='text-rose-600 hover:bg-rose-50' onClick={() => deletePO(customer.id, project.id, po.id)} title='Delete PO'>
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
                        <Input value={poForm.number} onChange={(e) => setPoForm({ ...poForm, number: (e.target as HTMLInputElement).value })} placeholder='PO-90001' />
                      </div>
                      <div className='md:col-span-2'>
                        <Label>Optional note</Label>
                        <Input value={poForm.note} onChange={(e) => setPoForm({ ...poForm, note: (e.target as HTMLInputElement).value })} placeholder='e.g. deposit' />
                      </div>
                    </div>
                    <div className='mt-2'>
                      <Button onClick={() => {
                        const t = poForm.number.trim(); if (!t) return;
                        addPO(customer.id, project.id, { number: t, note: poForm.note?.trim() || undefined });
                        setPoForm({ number: '', note: '' });
                      }}>
                        <Plus size={16} /> Add PO
                      </Button>
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

  return (
    <div className='min-h-screen bg-gradient-to-br from-white/70 via-[#f3f6ff]/80 to-[#dee9ff]/80 px-4 py-8 text-slate-900 md:px-10'>
      <div className='mx-auto max-w-6xl'>
        <div className='mb-6 flex items-center justify-between'>
          <h1 className='text-2xl font-semibold tracking-tight'>CustomerProjectDB</h1>
          <div className='flex items-center gap-2'>
            <Button onClick={() => setShowNewCustomer(true)} title='Create new customer'>
              <Plus size={16} /> New Customer
            </Button>
          </div>
        </div>

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
                {searchMatches.length === 0 && (<div className='text-sm text-slate-500'>No matches yet. Start typing above.</div>)}
                {searchMatches.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedCustomerId(m.customerId)}
                    className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg'
                    title={m.kind === 'customer' ? 'Open customer' : m.kind === 'project' ? 'Open customer at project' : 'Open customer at WO'}
                  >
                    <div>
                      <div className='text-sm font-semibold text-slate-800'>{m.label}</div>
                      <div className='text-xs font-medium text-slate-500'>{m.kind.toUpperCase()}</div>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedCustomer ? (
          <Card className='mb-6 panel'>
            <CardHeader>
              <div className='flex items-center gap-2'>
                <div className='text-lg font-semibold'>Customer: {selectedCustomer.name}</div>
                <Button variant='outline' onClick={() => navigator.clipboard.writeText(selectedCustomer.name)} title='Copy customer name'>
                  <Copy size={16} /> Copy
                </Button>
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
                    deleteCustomer(selectedCustomer.id)
                  }}
                  title='Delete customer'
                >
                  <Trash2 size={16} /> Delete Customer
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className='grid gap-4 md:grid-cols-2'>
                <EditableField label='Address' value={selectedCustomer.address} fieldKey={`addr_${selectedCustomer.id}`} placeholder='Add address' onSave={(v) => upsertCustomer({ ...selectedCustomer, address: v })} />
                <EditableField label='Contact Name' value={selectedCustomer.contactName} fieldKey={`cname_${selectedCustomer.id}`} placeholder='Add contact' onSave={(v) => upsertCustomer({ ...selectedCustomer, contactName: v })} />
                <EditableField label='Contact Phone' value={selectedCustomer.contactPhone} fieldKey={`cphone_${selectedCustomer.id}`} placeholder='Add phone' onSave={(v) => upsertCustomer({ ...selectedCustomer, contactPhone: v })} />
                <EditableField label='Contact Email' value={selectedCustomer.contactEmail} fieldKey={`cemail_${selectedCustomer.id}`} placeholder='Add email' onSave={(v) => upsertCustomer({ ...selectedCustomer, contactEmail: v })} />
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
                <Button variant='ghost' onClick={() => setShowNewCustomer(false)} title='Close'>
                  <X size={16} />
                </Button>
              </CardHeader>
              <CardContent>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div>
                    <Label>Customer Name</Label>
                    <Input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: (e.target as HTMLInputElement).value })} placeholder='e.g. Globex Ltd' />
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
                <div className='mt-3 flex justify-end gap-2'>
                  <Button variant='outline' onClick={() => setShowNewCustomer(false)}>Cancel</Button>
                  <Button
                    size='lg'
                    onClick={() => {
                      if (!newCust.name.trim()) return
                      createCustomer({
                        name: newCust.name.trim(),
                        address: newCust.address.trim() || undefined,
                        contactName: newCust.contactName.trim() || undefined,
                        contactPhone: newCust.contactPhone.trim() || undefined,
                        contactEmail: newCust.contactEmail.trim() || undefined,
                      })
                      setNewCust({ name: '', address: '', contactName: '', contactPhone: '', contactEmail: '' })
                      setShowNewCustomer(false)
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

function AddProjectForm({ onAdd }: { onAdd: (num: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className='flex items-end gap-2'>
      <div className='flex-1'>
        <Label>Project Number</Label>
        <div className='flex'>
          <span className='flex items-center rounded-l-2xl border border-r-0 border-slate-200/80 bg-slate-100/70 px-3 py-2 text-sm font-semibold text-slate-500'>P</span>
          <Input className='rounded-l-none border-l-0' value={val} onChange={(e) => setVal((e.target as HTMLInputElement).value)} placeholder='e.g. 1403' />
        </div>
      </div>
      <Button onClick={() => {
        const t = val.trim(); if (!t) return;
        const num = t.startsWith('P') ? t : `P${t}`;
        onAdd(num); setVal('');
      }}>
        <Plus size={16} /> Add
      </Button>
    </div>
  )
}
