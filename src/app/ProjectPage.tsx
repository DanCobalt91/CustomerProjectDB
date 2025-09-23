import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, Copy, Plus, Trash2, X } from 'lucide-react'
import type { Customer, Project, WOType } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'

export type ProjectPageProps = {
  customer: Customer
  project: Project
  canEdit: boolean
  onUpdateProjectNote: (note: string) => void
  onAddWO: (data: { number: string; type: WOType; note?: string }) => Promise<string | null>
  onDeleteWO: (woId: string) => void
  onAddPO: (data: { number: string; note?: string }) => Promise<string | null>
  onDeletePO: (poId: string) => void
  onDeleteProject: () => void
  onNavigateBack: () => void
}

function SummaryTile({ label, value }: { label: string; value: number }) {
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
  onAddWO,
  onDeleteWO,
  onAddPO,
  onDeletePO,
  onDeleteProject,
  onNavigateBack,
}: ProjectPageProps) {
  const [noteDraft, setNoteDraft] = useState(project.note ?? '')
  const [woForm, setWoForm] = useState({ number: '', type: 'Build' as WOType, note: '' })
  const [poForm, setPoForm] = useState({ number: '', note: '' })
  const [woError, setWoError] = useState<string | null>(null)
  const [poError, setPoError] = useState<string | null>(null)
  const [isAddingWo, setIsAddingWo] = useState(false)
  const [isAddingPo, setIsAddingPo] = useState(false)

  useEffect(() => {
    setNoteDraft(project.note ?? '')
    setWoForm({ number: '', type: 'Build', note: '' })
    setPoForm({ number: '', note: '' })
    setWoError(null)
    setPoError(null)
  }, [project.id])

  useEffect(() => {
    setNoteDraft(prev => {
      const next = project.note ?? ''
      return prev === next ? prev : next
    })
  }, [project.note])

  const summary = [
    { label: 'Work Orders', value: project.wos.length },
    { label: 'Purchase Orders', value: project.pos.length },
  ]

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

  const handleAddPO = async () => {
    if (!canEdit) {
      setPoError('You have read-only access.')
      return
    }
    const raw = poForm.number.trim()
    if (!raw) {
      setPoError('Enter a purchase order number.')
      return
    }
    setIsAddingPo(true)
    try {
      const result = await onAddPO({ number: raw, note: poForm.note })
      if (result) {
        setPoError(result)
        return
      }
      setPoForm({ number: '', note: '' })
      setPoError(null)
    } finally {
      setIsAddingPo(false)
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
          <Button variant='outline' onClick={() => navigator.clipboard.writeText(project.number)} title='Copy project number'>
            <Copy size={16} />
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
                    <Button variant='outline' onClick={() => navigator.clipboard.writeText(wo.number)} title='Copy work order'>
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
                    <Button variant='outline' onClick={() => navigator.clipboard.writeText(po.number)} title='Copy purchase order'>
                      <Copy size={16} />
                    </Button>
                    <Button
                      variant='ghost'
                      className='text-rose-600 hover:bg-rose-50'
                      onClick={() => onDeletePO(po.id)}
                      title={canEdit ? 'Delete purchase order' : 'Read-only access'}
                      disabled={!canEdit}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className='mt-4 rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm'>
              <div className='mb-2 text-sm font-semibold text-slate-700'>Add Purchase Order</div>
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
                    disabled={!canEdit}
                  />
                </div>
                <div className='md:col-span-2'>
                  <Label>Optional note</Label>
                  <Input
                    value={poForm.note}
                    onChange={(e) => setPoForm({ ...poForm, note: (e.target as HTMLInputElement).value })}
                    placeholder='e.g. deposit'
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div className='mt-2 space-y-2'>
                <Button
                  disabled={isAddingPo || !canEdit}
                  onClick={() => void handleAddPO()}
                  title={canEdit ? 'Add purchase order' : 'Read-only access'}
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
        </section>
      </CardContent>
    </Card>
  )
}
