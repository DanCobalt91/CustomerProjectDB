import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Plus, Search, Trash2 } from 'lucide-react'
import type { ProjectPart } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Label from '../components/ui/Label'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { createId } from '../lib/id'

type PartsDatabasePageProps = {
  partsCatalog: ProjectPart[]
  canEdit: boolean
  onSavePartsCatalog: (partsCatalog: ProjectPart[]) => Promise<ProjectPart[]>
}

const emptyPartForm = {
  partNumber: '',
  description: '',
  category: '',
  supplier: '',
  manufacturerNumber: '',
}

function partsCatalogEqual(a: ProjectPart[], b: ProjectPart[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((part, index) => {
    const other = b[index]
    return (
      part.id === other.id &&
      part.partNumber === other.partNumber &&
      part.description === other.description &&
      (part.category ?? '') === (other.category ?? '') &&
      part.supplier === other.supplier &&
      part.manufacturerNumber === other.manufacturerNumber
    )
  })
}

export default function PartsDatabasePage({
  partsCatalog,
  canEdit,
  onSavePartsCatalog,
}: PartsDatabasePageProps) {
  const [draftCatalog, setDraftCatalog] = useState<ProjectPart[]>(partsCatalog)
  const [partForm, setPartForm] = useState(emptyPartForm)
  const [partSearch, setPartSearch] = useState('')
  const [partsError, setPartsError] = useState<string | null>(null)
  const [partsStatus, setPartsStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setDraftCatalog(partsCatalog)
  }, [partsCatalog])

  const normalizedPartSearch = partSearch.trim().toLowerCase()
  const categoryOptions = useMemo(() => {
    const categories = new Set(
      draftCatalog.map(part => part.category?.trim()).filter((value): value is string => Boolean(value)),
    )
    return Array.from(categories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [draftCatalog])
  const filteredParts = useMemo(() => {
    const sorted = [...draftCatalog].sort((a, b) =>
      b.partNumber.localeCompare(a.partNumber, undefined, { sensitivity: 'base' }),
    )
    if (!normalizedPartSearch) {
      return sorted
    }
    return sorted.filter(part => {
      const haystack = [
        part.partNumber,
        part.description,
        part.category ?? '',
        part.supplier ?? '',
        part.manufacturerNumber ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedPartSearch)
    })
  }, [draftCatalog, normalizedPartSearch])

  const hasChanges = useMemo(
    () => !partsCatalogEqual(draftCatalog, partsCatalog),
    [draftCatalog, partsCatalog],
  )

  const clearPartsFeedback = () => {
    if (partsError) setPartsError(null)
    if (partsStatus) setPartsStatus(null)
  }

  const updatePartsCatalog = (nextCatalog: ProjectPart[]) => {
    setDraftCatalog(nextCatalog)
    clearPartsFeedback()
  }

  const handleAddPart = async () => {
    if (!canEdit) {
      setPartsError('You have read-only access.')
      return
    }
    clearPartsFeedback()
    const partNumber = partForm.partNumber.trim()
    const description = partForm.description.trim()
    const category = partForm.category.trim()
    const supplier = partForm.supplier.trim()
    const manufacturerNumber = partForm.manufacturerNumber.trim()
    if (!partNumber) {
      setPartsError('Enter a part number before adding a part.')
      return
    }
    const hasDuplicate = draftCatalog.some(
      part => part.partNumber.trim().toLowerCase() === partNumber.toLowerCase(),
    )
    if (hasDuplicate) {
      setPartsError('That part number already exists in the database.')
      return
    }
    const nextCatalog = [
      ...draftCatalog,
      {
        id: createId(),
        partNumber,
        description,
        category,
        supplier,
        manufacturerNumber,
      },
    ]
    updatePartsCatalog(nextCatalog)
    setPartForm(emptyPartForm)
    setIsSaving(true)
    try {
      const saved = await onSavePartsCatalog(nextCatalog)
      setDraftCatalog(saved)
      setPartsError(null)
      setPartsStatus('Part added and saved.')
    } catch (error) {
      console.error('Failed to save parts database', error)
      setPartsError('Failed to auto-save the part. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemovePart = (partId: string) => {
    if (!canEdit) {
      setPartsError('You have read-only access.')
      return
    }
    clearPartsFeedback()
    updatePartsCatalog(draftCatalog.filter(part => part.id !== partId))
  }

  const handleUpdatePart = (partId: string, updates: Partial<ProjectPart>) => {
    updatePartsCatalog(
      draftCatalog.map(part => (part.id === partId ? { ...part, ...updates } : part)),
    )
  }

  const handleSavePartsCatalog = async () => {
    if (!canEdit) {
      setPartsError('You have read-only access.')
      return
    }
    setIsSaving(true)
    try {
      const saved = await onSavePartsCatalog(draftCatalog)
      setDraftCatalog(saved)
      setPartsError(null)
      setPartsStatus('Parts database saved.')
    } catch (error) {
      console.error('Failed to save parts database', error)
      setPartsError('Failed to save parts database.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className='space-y-6'>
      <Card className='panel'>
        <CardHeader>
          <div className='space-y-1'>
            <div className='text-sm font-semibold text-slate-800'>Parts database</div>
            <p className='text-xs text-slate-500'>
              Manage stocked parts here, then select them when building project BOMs.
            </p>
            {partsStatus && <p className='text-xs text-emerald-600'>{partsStatus}</p>}
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
            <div className='space-y-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Stocked parts</div>
                <div className='relative w-full max-w-xs'>
                  <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                  <input
                    className='w-full rounded-xl border border-slate-200/80 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                    value={partSearch}
                    onChange={event => {
                      setPartSearch((event.target as HTMLInputElement).value)
                      clearPartsFeedback()
                    }}
                    placeholder='Search part no, description, category, supplier…'
                  />
                </div>
              </div>

              <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4'>
                <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Add new part</div>
                <div className='mt-3 grid gap-3 md:grid-cols-5'>
                  <div>
                    <Label htmlFor='part-number'>Part no.</Label>
                    <Input
                      id='part-number'
                      value={partForm.partNumber}
                      onChange={event =>
                        setPartForm(prev => ({
                          ...prev,
                          partNumber: (event.target as HTMLInputElement).value,
                        }))
                      }
                      placeholder='PRC0001'
                      disabled={!canEdit}
                    />
                  </div>
                  <div className='md:col-span-1'>
                    <Label htmlFor='part-description'>Description</Label>
                    <Input
                      id='part-description'
                      value={partForm.description}
                      onChange={event =>
                        setPartForm(prev => ({
                          ...prev,
                          description: (event.target as HTMLInputElement).value,
                        }))
                      }
                      placeholder='e.g. E-stop button'
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label htmlFor='part-category'>Category</Label>
                    <Input
                      id='part-category'
                      list='part-category-options'
                      value={partForm.category}
                      onChange={event =>
                        setPartForm(prev => ({
                          ...prev,
                          category: (event.target as HTMLInputElement).value,
                        }))
                      }
                      placeholder='Electrical Components'
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label htmlFor='part-supplier'>Supplier</Label>
                    <Input
                      id='part-supplier'
                      value={partForm.supplier}
                      onChange={event =>
                        setPartForm(prev => ({
                          ...prev,
                          supplier: (event.target as HTMLInputElement).value,
                        }))
                      }
                      placeholder='Supplier name'
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label htmlFor='part-manufacturer'>Manufacturer no.</Label>
                    <Input
                      id='part-manufacturer'
                      value={partForm.manufacturerNumber}
                      onChange={event =>
                        setPartForm(prev => ({
                          ...prev,
                          manufacturerNumber: (event.target as HTMLInputElement).value,
                        }))
                      }
                      placeholder='MFG-1234'
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <datalist id='part-category-options'>
                  {categoryOptions.map(category => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
                  <Button onClick={handleAddPart} disabled={!canEdit || isSaving}>
                    <Plus size={16} /> Add part
                  </Button>
                  <div className='text-xs text-slate-500'>
                    {draftCatalog.length}{' '}
                    {draftCatalog.length === 1 ? 'part' : 'parts'} in the database.
                  </div>
                </div>
              </div>

              <div className='overflow-hidden rounded-2xl border border-slate-200/80'>
                <div className='max-h-[420px] overflow-auto'>
                  <table className='min-w-full text-left text-xs text-slate-600'>
                    <thead className='sticky top-0 bg-slate-100/80 text-[11px] uppercase tracking-wide text-slate-500'>
                      <tr>
                        <th className='px-3 py-2'>Part no.</th>
                        <th className='px-3 py-2'>Description</th>
                        <th className='px-3 py-2'>Category</th>
                        <th className='px-3 py-2'>Supplier</th>
                        <th className='px-3 py-2'>Manufacturer no.</th>
                        <th className='px-3 py-2'>Actions</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-200/70 bg-white/90'>
                      {filteredParts.length === 0 ? (
                        <tr>
                          <td className='px-3 py-4 text-sm text-slate-400' colSpan={6}>
                            {draftCatalog.length === 0
                              ? 'No parts are in the database yet.'
                              : 'No parts match this search yet.'}
                          </td>
                        </tr>
                      ) : (
                        filteredParts.map(part => (
                          <tr key={part.id} className='align-top'>
                            <td className='px-3 py-3'>
                              <Input
                                value={part.partNumber}
                                onChange={event =>
                                  handleUpdatePart(part.id, {
                                    partNumber: (event.target as HTMLInputElement).value,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className='px-3 py-3'>
                              <Input
                                value={part.description}
                                onChange={event =>
                                  handleUpdatePart(part.id, {
                                    description: (event.target as HTMLInputElement).value,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className='px-3 py-3'>
                              <Input
                                list='part-category-options'
                                value={part.category ?? ''}
                                onChange={event =>
                                  handleUpdatePart(part.id, {
                                    category: (event.target as HTMLInputElement).value,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className='px-3 py-3'>
                              <Input
                                value={part.supplier ?? ''}
                                onChange={event =>
                                  handleUpdatePart(part.id, {
                                    supplier: (event.target as HTMLInputElement).value,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className='px-3 py-3'>
                              <Input
                                value={part.manufacturerNumber ?? ''}
                                onChange={event =>
                                  handleUpdatePart(part.id, {
                                    manufacturerNumber: (event.target as HTMLInputElement).value,
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </td>
                            <td className='px-3 py-3'>
                              <Button
                                variant='ghost'
                                onClick={() => handleRemovePart(part.id)}
                                disabled={!canEdit}
                              >
                                <Trash2 size={14} /> Remove
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className='space-y-4'>
              <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Database status</div>
              <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-sm text-slate-600'>
                <p className='font-semibold text-slate-800'>Parts ready for BOMs</p>
                <p className='mt-1 text-xs text-slate-500'>
                  Use the BOM Builder tab in a project to select from this list.
                </p>
                <div className='mt-4 text-xs text-slate-500'>
                  {draftCatalog.length} {draftCatalog.length === 1 ? 'part' : 'parts'} available.
                </div>
              </div>
              {partsError && (
                <p className='flex items-center gap-1 text-sm text-rose-600'>
                  <AlertCircle size={14} /> {partsError}
                </p>
              )}
              <div className='flex flex-wrap justify-end gap-2'>
                <Button variant='ghost' onClick={() => updatePartsCatalog(partsCatalog)} disabled={!canEdit || !hasChanges}>
                  Reset changes
                </Button>
                <Button onClick={handleSavePartsCatalog} disabled={!canEdit || isSaving || !hasChanges}>
                  {isSaving ? 'Saving…' : 'Save parts database'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
