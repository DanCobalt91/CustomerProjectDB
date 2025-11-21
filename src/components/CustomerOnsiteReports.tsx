import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, Download, FileText, Pencil, Plus, Trash2, X } from 'lucide-react'

import type {
  BusinessSettings,
  Customer,
  CustomerContact,
  Project,
  ProjectOnsiteReport,
  OnsiteServiceEntry,
} from '../types'
import { Card, CardContent, CardHeader } from './ui/Card'
import Button from './ui/Button'
import Input from './ui/Input'
import Label from './ui/Label'
import { getBusinessEndTimeForDate, getBusinessStartTimeForDate } from '../lib/businessHours'
import type { OnsiteReportSubmission } from '../lib/onsiteReport'
import { createId } from '../lib/id'

type Props = {
  customer: Customer
  businessSettings: BusinessSettings
  currentUserName: string
  canEdit: boolean
  onCreateOnsiteReport: (customerId: string, projectId: string, submission: OnsiteReportSubmission) => Promise<string | null>
  onDeleteOnsiteReport: (customerId: string, projectId: string, reportId: string) => Promise<string | null>
}

type OnsiteReportDraft = {
  reportDate: string
  arrivalTime: string
  departureTime: string
  engineerName: string
  customerContact: string
  siteAddress: string
  workSummary: string
  materialsUsed: string
  additionalNotes: string
  signedByName: string
  signedByPosition: string
  serviceEntries: ServiceEntryDraft[]
}

type ServiceEntryDraft = Omit<OnsiteServiceEntry, 'id'> & { id?: string }

type ProjectScopedReport = {
  report: ProjectOnsiteReport
  project: Project
}

const CUSTOM_SITE_OPTION = '__custom__'
const NEW_MACHINE_OPTION = '__new_machine__'

export function CustomerOnsiteReports({
  businessSettings,
  canEdit,
  currentUserName,
  customer,
  onCreateOnsiteReport,
  onDeleteOnsiteReport,
}: Props) {
  const [activeProjectId, setActiveProjectId] = useState(customer.projects[0]?.id ?? '')
  const [onsiteReportDraft, setOnsiteReportDraft] = useState<OnsiteReportDraft>(() =>
    buildDefaultDraft(customer, businessSettings, currentUserName, activeProjectId),
  )
  const [selectedSiteOption, setSelectedSiteOption] = useState<string>(() =>
    resolveDefaultSiteOption(customer, activeProjectId),
  )
  const [isCreatingOnsiteReport, setIsCreatingOnsiteReport] = useState(false)
  const [isSavingOnsiteReport, setIsSavingOnsiteReport] = useState(false)
  const [onsiteReportError, setOnsiteReportError] = useState<string | null>(null)
  const [onsiteHasSignature, setOnsiteHasSignature] = useState(false)
  const [removingOnsiteReportId, setRemovingOnsiteReportId] = useState<string | null>(null)
  const [serviceEntryError, setServiceEntryError] = useState<string | null>(null)
  const [showServiceEntryEditor, setShowServiceEntryEditor] = useState(false)
  const [serviceEntryMode, setServiceEntryMode] = useState<'create' | 'edit'>('create')
  const [serviceEntryDraft, setServiceEntryDraft] = useState<ServiceEntryDraft | null>(null)
  const onsiteSignatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const onsiteSignatureDrawingRef = useRef(false)
  const onsiteSignatureStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const onsiteActiveSignatureStrokeRef = useRef<number | null>(null)

  useEffect(() => {
    setActiveProjectId(customer.projects[0]?.id ?? '')
  }, [customer.id, customer.projects])

  useEffect(() => {
    setOnsiteReportDraft(buildDefaultDraft(customer, businessSettings, currentUserName, activeProjectId))
    setSelectedSiteOption(resolveDefaultSiteOption(customer, activeProjectId))
    resetOnsiteSignature()
  }, [activeProjectId, businessSettings, currentUserName, customer])

  useEffect(() => {
    setOnsiteReportDraft(prev => ({ ...prev, engineerName: currentUserName }))
  }, [currentUserName])

  const sortedReports: ProjectScopedReport[] = useMemo(() => {
    const reports: ProjectScopedReport[] = []
    customer.projects.forEach(project => {
      (project.onsiteReports ?? []).forEach(report => {
        reports.push({ project, report })
      })
    })
    return reports.sort((a, b) => {
      const dateCompare = (b.report.reportDate || '').localeCompare(a.report.reportDate || '')
      if (dateCompare !== 0) return dateCompare
      return new Date(b.report.createdAt).getTime() - new Date(a.report.createdAt).getTime()
    })
  }, [customer.projects])

  const activeProject = useMemo(
    () => customer.projects.find(project => project.id === activeProjectId) ?? null,
    [activeProjectId, customer.projects],
  )

  const machineOptions = useMemo(() => {
    if (!activeProject) return []
    const options = customer.machines
      .filter(machine => machine.projectId === activeProject.id || machine.siteId === activeProject.siteId)
      .map(machine => {
        const serial = machine.machineSerialNumber.trim() || 'Machine'
        const line = machine.lineReference?.trim()
        const parts = [serial]
        if (line) parts.push(`(${line})`)
        const priority = machine.projectId === activeProject.id ? 0 : 1
        return { id: machine.id, label: parts.join(' '), priority }
      })
    return options.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
  }, [activeProject, customer.machines])

  const machineLookup = useMemo(() => new Map(customer.machines.map(machine => [machine.id, machine])), [customer.machines])

  const contactOptions = useMemo(() => sortContacts(customer.contacts), [customer.contacts])

  const siteOptions = useMemo(() => {
    const seenAddresses = new Set<string>()
    const options: Array<{ value: string; label: string; address: string }> = []
    customer.sites.forEach(site => {
      const address = site.address?.trim()
      if (address && !seenAddresses.has(address)) {
        seenAddresses.add(address)
        options.push({
          value: site.id,
          label: site.name?.trim() || address,
          address,
        })
      }
    })
    return options
  }, [customer.sites])

  const updateOnsiteReportField = <K extends keyof OnsiteReportDraft>(field: K, value: string) => {
    setOnsiteReportDraft(prev => {
      if (field === 'reportDate') {
        const nextDate = value
        const previousStart = getBusinessStartTimeForDate(businessSettings, prev.reportDate)
        const previousEnd = getBusinessEndTimeForDate(businessSettings, prev.reportDate)
        const nextStart = getBusinessStartTimeForDate(businessSettings, nextDate)
        const nextEnd = getBusinessEndTimeForDate(businessSettings, nextDate)
        const shouldUpdateArrival = !prev.arrivalTime || prev.arrivalTime === previousStart
        const shouldUpdateDeparture = !prev.departureTime || prev.departureTime === previousEnd
        return {
          ...prev,
          reportDate: nextDate,
          arrivalTime: shouldUpdateArrival ? nextStart : prev.arrivalTime,
          departureTime: shouldUpdateDeparture ? nextEnd : prev.departureTime,
        }
      }
      return { ...prev, [field]: value } as OnsiteReportDraft
    })
    if (onsiteReportError) setOnsiteReportError(null)
  }

  const resetOnsiteSignature = useCallback(() => {
    const canvas = onsiteSignatureCanvasRef.current
    const context = canvas?.getContext('2d') ?? null
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    onsiteSignatureDrawingRef.current = false
    onsiteActiveSignatureStrokeRef.current = null
    onsiteSignatureStrokesRef.current = []
    setOnsiteHasSignature(false)
  }, [])

  const openServiceEntryEditor = (entry?: ServiceEntryDraft) => {
    const defaultMachineId = entry?.machineId ?? machineOptions[0]?.id ?? ''
    const defaultMachine = defaultMachineId ? machineLookup.get(defaultMachineId) ?? null : null
    const baseEntry: ServiceEntryDraft = {
      id: entry?.id,
      machineId: defaultMachineId,
      machineSerialNumber: entry?.machineSerialNumber ?? defaultMachine?.machineSerialNumber ?? '',
      lineReference: entry?.lineReference ?? defaultMachine?.lineReference ?? '',
      serviceInformation: entry?.serviceInformation ?? '',
      firmwareVersion: entry?.firmwareVersion ?? defaultMachine?.firmwareVersion ?? '',
      serviceCount: entry?.serviceCount ?? '',
    }
    setServiceEntryMode(entry ? 'edit' : 'create')
    setServiceEntryDraft(baseEntry)
    setServiceEntryError(null)
    setShowServiceEntryEditor(true)
  }

  const handleServiceEntryMachineSelect = (value: string) => {
    setServiceEntryDraft(prev => {
      if (!prev) return prev
      if (!value || value === NEW_MACHINE_OPTION) {
        return { ...prev, machineId: '', machineSerialNumber: '', lineReference: '', firmwareVersion: '' }
      }
      const machine = machineLookup.get(value)
      return {
        ...prev,
        machineId: value,
        machineSerialNumber: machine?.machineSerialNumber ?? prev.machineSerialNumber ?? '',
        lineReference: machine?.lineReference ?? prev.lineReference ?? '',
        firmwareVersion: machine?.firmwareVersion ?? prev.firmwareVersion ?? '',
      }
    })
  }

  const handleSaveServiceEntry = () => {
    if (!serviceEntryDraft) return
    const normalized: OnsiteServiceEntry = {
      id: serviceEntryDraft.id ?? createId(),
      machineId: serviceEntryDraft.machineId?.trim() || undefined,
      machineSerialNumber: serviceEntryDraft.machineSerialNumber?.trim() || undefined,
      lineReference: serviceEntryDraft.lineReference?.trim() || undefined,
      serviceInformation: serviceEntryDraft.serviceInformation?.trim() || undefined,
      firmwareVersion: serviceEntryDraft.firmwareVersion?.trim() || undefined,
      serviceCount: serviceEntryDraft.serviceCount?.trim() || undefined,
    }

    if (!normalized.machineSerialNumber && !normalized.serviceInformation) {
      setServiceEntryError('Add a machine or service details before saving.')
      return
    }

    setOnsiteReportDraft(prev => {
      const existing = prev.serviceEntries ?? []
      const nextEntries =
        serviceEntryMode === 'edit'
          ? existing.map(entry => (entry.id === normalized.id ? normalized : entry))
          : [...existing, normalized]
      return { ...prev, serviceEntries: nextEntries }
    })
    setServiceEntryError(null)
    setShowServiceEntryEditor(false)
    setServiceEntryDraft(null)
    setServiceEntryMode('create')
  }

  const handleRemoveServiceEntry = (entryId: string) => {
    setOnsiteReportDraft(prev => ({
      ...prev,
      serviceEntries: prev.serviceEntries.filter(entry => entry.id !== entryId),
    }))
  }

  const startOnsiteReport = () => {
    setOnsiteReportDraft(
      buildDefaultDraft(customer, businessSettings, currentUserName, activeProjectId, selectedSiteOption, siteOptions),
    )
    setIsCreatingOnsiteReport(true)
    setOnsiteReportError(null)
    resetOnsiteSignature()
  }

    const cancelOnsiteReport = () => {
    setIsCreatingOnsiteReport(false)
    setIsSavingOnsiteReport(false)
    setOnsiteReportError(null)
    setOnsiteHasSignature(false)
    resetOnsiteSignature()
  }

  const handleOnsiteSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || !isCreatingOnsiteReport) return
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = event.currentTarget.width / rect.width
    const scaleY = event.currentTarget.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    onsiteSignatureDrawingRef.current = true
    const strokeIndex = onsiteSignatureStrokesRef.current.length
    onsiteActiveSignatureStrokeRef.current = strokeIndex
    onsiteSignatureStrokesRef.current.push([{ x, y }])
  }

  const handleOnsiteSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onsiteSignatureDrawingRef.current) return
    const canvas = onsiteSignatureCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    const strokeIndex = onsiteActiveSignatureStrokeRef.current
    if (strokeIndex === null) return
    const points = onsiteSignatureStrokesRef.current[strokeIndex] ?? []
    points.push({ x, y })
    onsiteSignatureStrokesRef.current[strokeIndex] = points
    drawSignature(context, onsiteSignatureStrokesRef.current)
  }

  const finishOnsiteSignatureStroke = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onsiteSignatureDrawingRef.current) return
    onsiteSignatureDrawingRef.current = false
    if (event) {
      handleOnsiteSignaturePointerMove(event)
    }
    onsiteActiveSignatureStrokeRef.current = null
    setOnsiteHasSignature(onsiteSignatureStrokesRef.current.some(stroke => stroke.length > 0))
  }

  const handleOnsiteSignaturePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    finishOnsiteSignatureStroke(event)
  }

  const handleOnsiteSignaturePointerLeave = () => {
    finishOnsiteSignatureStroke()
  }

  const handleSaveOnsiteReport = async () => {
    if (!canEdit) {
      setOnsiteReportError('You have read-only access.')
      return
    }
    if (!activeProjectId) {
      setOnsiteReportError('Select a project to save the onsite report.')
      return
    }

    if (!onsiteReportDraft.reportDate) {
      setOnsiteReportError('Select the report date.')
      return
    }
    if (!onsiteReportDraft.workSummary.trim()) {
      setOnsiteReportError('Enter the work summary.')
      return
    }
    if (!onsiteReportDraft.signedByName.trim()) {
      setOnsiteReportError('Enter the customer name.')
      return
    }
    if (onsiteReportDraft.serviceEntries.length === 0) {
      setOnsiteReportError('Add at least one machine service entry.')
      return
    }

    const canvas = onsiteSignatureCanvasRef.current
    if (!canvas) {
      setOnsiteReportError('Signature pad not ready.')
      return
    }
    if (onsiteSignatureStrokesRef.current.length === 0) {
      setOnsiteReportError('Capture a signature to continue.')
      return
    }

    const signatureDimensions = { width: canvas.width, height: canvas.height }
    const signatureDataUrl = canvas.toDataURL('image/png')

    setIsSavingOnsiteReport(true)
    setOnsiteReportError(null)

    try {
      const normalizedEntries = onsiteReportDraft.serviceEntries.map(entry => ({
        ...entry,
        id: entry.id ?? createId(),
      }))
      const primaryService = normalizedEntries[0]

      const submission: OnsiteReportSubmission = {
        ...onsiteReportDraft,
        serviceEntries: normalizedEntries,
        machineId: primaryService?.machineId,
        serviceInformation: primaryService?.serviceInformation,
        firmwareVersion: primaryService?.firmwareVersion,
        engineerName: currentUserName,
        signatureDataUrl,
        signaturePaths: onsiteSignatureStrokesRef.current,
        signatureDimensions,
      }
      const result = await onCreateOnsiteReport(customer.id, activeProjectId, submission)
      if (result) {
        setOnsiteReportError(result)
      } else {
        setIsCreatingOnsiteReport(false)
        setOnsiteReportDraft(
          buildDefaultDraft(customer, businessSettings, currentUserName, activeProjectId, selectedSiteOption, siteOptions),
        )
        resetOnsiteSignature()
        setSelectedSiteOption(resolveDefaultSiteOption(customer, activeProjectId))
      }
    } finally {
      setIsSavingOnsiteReport(false)
    }
  }

  const handleRemoveOnsiteReport = async (projectId: string, reportId: string) => {
    if (!canEdit) {
      setOnsiteReportError('You have read-only access.')
      return
    }
    setRemovingOnsiteReportId(reportId)
    setOnsiteReportError(null)
    try {
      const result = await onDeleteOnsiteReport(customer.id, projectId, reportId)
      if (result) setOnsiteReportError(result)
    } finally {
      setRemovingOnsiteReportId(null)
    }
  }

  const handleDownloadOnsiteReport = (project: Project, report: ProjectOnsiteReport) => {
    if (!report.pdfDataUrl) {
      setOnsiteReportError('This onsite report is missing a PDF document.')
      return
    }
    const link = document.createElement('a')
    link.href = report.pdfDataUrl
    const sanitizedNumber = project.number.replace(/[^a-zA-Z0-9-]/g, '')
    const datePart = report.reportDate?.replace(/[^0-9-]/g, '')
    link.download = `OnsiteReport-${sanitizedNumber || project.number}-${datePart || report.id}.pdf`
    link.click()
  }

  const handleCustomerNameChange = (value: string) => {
    setOnsiteReportDraft(prev => ({ ...prev, signedByName: value }))
    const trimmed = value.trim().toLowerCase()
    const matchedContact = contactOptions.find(
      contact => (contact.name ?? '').trim().toLowerCase() === trimmed,
    )
    if (matchedContact) {
      setOnsiteReportDraft(prev => ({
        ...prev,
        signedByPosition: matchedContact.position ?? prev.signedByPosition,
        customerContact: buildContactInfo(matchedContact) || prev.customerContact,
      }))
    }
  }

  const handleSiteSelect = (value: string) => {
    setSelectedSiteOption(value)
    const option = siteOptions.find(entry => entry.value === value)
    if (option) {
      updateOnsiteReportField('siteAddress', option.address)
    } else if (value === CUSTOM_SITE_OPTION) {
      updateOnsiteReportField('siteAddress', '')
    }
  }

  return (
    <>
      {showServiceEntryEditor && serviceEntryDraft && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <div className='text-lg font-semibold text-slate-900'>
                  {serviceEntryMode === 'edit' ? 'Edit service entry' : 'Add service entry'}
                </div>
                <p className='text-sm text-slate-500'>Capture the machine and its service details.</p>
              </div>
              <Button
                variant='ghost'
                className='text-slate-500 hover:bg-slate-100'
                onClick={() => {
                  setShowServiceEntryEditor(false)
                  setServiceEntryError(null)
                  setServiceEntryDraft(null)
                  setServiceEntryMode('create')
                }}
              >
                <X size={16} />
              </Button>
            </div>
            <div className='mt-4 grid gap-3 md:grid-cols-2'>
              <div className='md:col-span-2'>
                <Label htmlFor='service-machine'>Machine</Label>
                <select
                  id='service-machine'
                  className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2'
                  value={serviceEntryDraft.machineId || ''}
                  onChange={event => handleServiceEntryMachineSelect((event.target as HTMLSelectElement).value)}
                  disabled={!canEdit}
                >
                  <option value=''>Custom machine</option>
                  {machineOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                  <option value={NEW_MACHINE_OPTION}>Create new machine</option>
                </select>
              </div>
              <div>
                <Label htmlFor='service-serial'>Machine serial</Label>
                <Input
                  id='service-serial'
                  value={serviceEntryDraft.machineSerialNumber ?? ''}
                  onChange={event =>
                    setServiceEntryDraft(prev =>
                      prev ? { ...prev, machineSerialNumber: (event.target as HTMLInputElement).value } : prev,
                    )
                  }
                  placeholder='e.g. SN-12345'
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor='service-line'>Line reference</Label>
                <Input
                  id='service-line'
                  value={serviceEntryDraft.lineReference ?? ''}
                  onChange={event =>
                    setServiceEntryDraft(prev =>
                      prev ? { ...prev, lineReference: (event.target as HTMLInputElement).value } : prev,
                    )
                  }
                  placeholder='Optional line identifier'
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor='service-firmware'>Firmware version</Label>
                <Input
                  id='service-firmware'
                  value={serviceEntryDraft.firmwareVersion ?? ''}
                  onChange={event =>
                    setServiceEntryDraft(prev =>
                      prev ? { ...prev, firmwareVersion: (event.target as HTMLInputElement).value } : prev,
                    )
                  }
                  placeholder='e.g. v2.3.1'
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor='service-count'>Service count</Label>
                <Input
                  id='service-count'
                  value={serviceEntryDraft.serviceCount ?? ''}
                  onChange={event =>
                    setServiceEntryDraft(prev =>
                      prev ? { ...prev, serviceCount: (event.target as HTMLInputElement).value } : prev,
                    )
                  }
                  placeholder='e.g. 1200'
                  disabled={!canEdit}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='service-info'>Service information</Label>
                <textarea
                  id='service-info'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
                  rows={4}
                  value={serviceEntryDraft.serviceInformation ?? ''}
                  onChange={event =>
                    setServiceEntryDraft(prev =>
                      prev ? { ...prev, serviceInformation: (event.target as HTMLTextAreaElement).value } : prev,
                    )
                  }
                  placeholder='Document the service activities performed on this machine'
                  disabled={!canEdit}
                />
              </div>
            </div>
            {serviceEntryError && <p className='mt-2 text-sm text-rose-600'>{serviceEntryError}</p>}
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <Button onClick={handleSaveServiceEntry} disabled={!canEdit}>
                {serviceEntryMode === 'edit' ? 'Update machine' : 'Add machine'}
              </Button>
              <Button
                variant='ghost'
                onClick={() => {
                  setShowServiceEntryEditor(false)
                  setServiceEntryDraft(null)
                  setServiceEntryError(null)
                  setServiceEntryMode('create')
                }}
              >
                <X size={16} /> Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      <Card className='panel'>
        <CardHeader className='flex flex-col gap-2 border-b border-slate-200 pb-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <div className='text-lg font-semibold text-slate-800'>Onsite reports</div>
            <p className='text-sm text-slate-500'>Capture onsite visits directly from the customer record.</p>
          </div>
          {!isCreatingOnsiteReport && (
            <Button onClick={startOnsiteReport} disabled={!canEdit || customer.projects.length === 0}>
              <FileText size={16} /> New onsite report
            </Button>
          )}
        </div>
        {customer.projects.length === 0 && (
          <p className='text-sm text-slate-500'>Add a project for this customer to start capturing onsite reports.</p>
        )}
      </CardHeader>
      <CardContent className='space-y-6'>
        {onsiteReportError && !isCreatingOnsiteReport && (
          <p className='flex items-center gap-1 text-sm text-rose-600'>
            <AlertCircle size={14} /> {onsiteReportError}
          </p>
        )}

        {isCreatingOnsiteReport && (
          <div className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
            <div className='grid gap-3 md:grid-cols-2'>
              <div>
                <Label>Project</Label>
                <select
                  className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={activeProjectId}
                  onChange={event => setActiveProjectId((event.target as HTMLSelectElement).value)}
                  disabled={!canEdit}
                >
                  <option value=''>Select project</option>
                  {customer.projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.number} — {project.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor='onsite-date'>Report date</Label>
                <input
                  id='onsite-date'
                  type='date'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.reportDate}
                  onChange={event => updateOnsiteReportField('reportDate', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-engineer'>Engineer</Label>
                <Input id='onsite-engineer' value={currentUserName} readOnly disabled className='bg-slate-50' />
              </div>
              <div>
                <Label htmlFor='onsite-arrival'>Arrival time</Label>
                <input
                  id='onsite-arrival'
                  type='time'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.arrivalTime}
                  step={1800}
                  onChange={event => updateOnsiteReportField('arrivalTime', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-departure'>Departure time</Label>
                <input
                  id='onsite-departure'
                  type='time'
                  className='mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={onsiteReportDraft.departureTime}
                  step={1800}
                  onChange={event => updateOnsiteReportField('departureTime', (event.target as HTMLInputElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2 space-y-3'>
                <div className='flex items-center justify-between gap-2'>
                  <Label className='mb-0'>Machines serviced</Label>
                  <Button variant='outline' onClick={() => openServiceEntryEditor()} disabled={!canEdit}>
                    <Plus size={16} /> Add machine
                  </Button>
                </div>
                {onsiteReportDraft.serviceEntries.length === 0 ? (
                  <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500'>
                    Add each serviced machine with its firmware and service details.
                  </div>
                ) : (
                  <div className='grid gap-3 md:grid-cols-2'>
                    {onsiteReportDraft.serviceEntries.map(entry => {
                      const label = entry.machineSerialNumber || 'Machine'
                      return (
                        <div key={entry.id} className='rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm'>
                          <div className='flex items-start justify-between gap-2'>
                            <div>
                              <div className='text-sm font-semibold text-slate-800'>{label}</div>
                              {entry.lineReference ? (
                                <div className='text-xs text-slate-500'>Line: {entry.lineReference}</div>
                              ) : null}
                              {entry.serviceCount ? (
                                <div className='text-xs text-slate-500'>Service count: {entry.serviceCount}</div>
                              ) : null}
                              {entry.firmwareVersion ? (
                                <div className='text-xs text-slate-500'>Firmware: {entry.firmwareVersion}</div>
                              ) : null}
                            </div>
                            <div className='flex items-center gap-1'>
                              <Button
                                variant='ghost'
                                className='h-8 w-8 rounded-full text-slate-600 hover:bg-slate-100'
                                onClick={() => openServiceEntryEditor(entry)}
                                disabled={!canEdit}
                              >
                                <Pencil size={14} />
                                <span className='sr-only'>Edit service entry</span>
                              </Button>
                              <Button
                                variant='ghost'
                                className='h-8 w-8 rounded-full text-rose-600 hover:bg-rose-50'
                                onClick={() => handleRemoveServiceEntry(entry.id)}
                                disabled={!canEdit}
                              >
                                <Trash2 size={14} />
                                <span className='sr-only'>Remove service entry</span>
                              </Button>
                            </div>
                          </div>
                          <div className='mt-2 text-xs text-slate-600 whitespace-pre-wrap'>
                            {entry.serviceInformation || 'No service information captured.'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor='onsite-site-select'>Site address</Label>
                <select
                  id='onsite-site-select'
                  className='mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  value={selectedSiteOption}
                  onChange={event => handleSiteSelect((event.target as HTMLSelectElement).value)}
                  disabled={!canEdit || isSavingOnsiteReport}
                >
                  <option value=''>Select site address</option>
                  {siteOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value={CUSTOM_SITE_OPTION}>Custom address</option>
                </select>
                <textarea
                  id='onsite-site-address'
                  className='mt-2 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={2}
                  value={onsiteReportDraft.siteAddress}
                  onChange={event => updateOnsiteReportField('siteAddress', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Where was the work completed?'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-work-summary'>Work summary</Label>
                <textarea
                  id='onsite-work-summary'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={4}
                  value={onsiteReportDraft.workSummary}
                  onChange={event => updateOnsiteReportField('workSummary', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Describe the work carried out onsite'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-materials'>Materials used</Label>
                <textarea
                  id='onsite-materials'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={3}
                  value={onsiteReportDraft.materialsUsed}
                  onChange={event => updateOnsiteReportField('materialsUsed', (event.target as HTMLTextAreaElement).value)}
                  placeholder='List any materials or parts used'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div className='md:col-span-2'>
                <Label htmlFor='onsite-notes'>Additional notes</Label>
                <textarea
                  id='onsite-notes'
                  className='mt-1 w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100/70'
                  rows={3}
                  value={onsiteReportDraft.additionalNotes}
                  onChange={event => updateOnsiteReportField('additionalNotes', (event.target as HTMLTextAreaElement).value)}
                  placeholder='Any additional remarks'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-signee'>Customer name</Label>
                <Input
                  id='onsite-signee'
                  list='onsite-contact-options'
                  value={onsiteReportDraft.signedByName}
                  onChange={event => handleCustomerNameChange((event.target as HTMLInputElement).value)}
                  placeholder='Type a name or pick a saved contact'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
                <datalist id='onsite-contact-options'>
                  {contactOptions.map(contact => (
                    <option key={contact.id} value={contact.name || contact.email || 'Contact'} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label htmlFor='onsite-contact-info'>Contact details</Label>
                <Input
                  id='onsite-contact-info'
                  value={onsiteReportDraft.customerContact}
                  onChange={event => updateOnsiteReportField('customerContact', (event.target as HTMLInputElement).value)}
                  placeholder='Phone or email for the customer contact'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
              <div>
                <Label htmlFor='onsite-position'>Customer position</Label>
                <Input
                  id='onsite-position'
                  value={onsiteReportDraft.signedByPosition}
                  onChange={event => updateOnsiteReportField('signedByPosition', (event.target as HTMLInputElement).value)}
                  placeholder='e.g. Operations Manager'
                  disabled={!canEdit || isSavingOnsiteReport}
                />
              </div>
            </div>
            <div className='mt-4 space-y-2'>
              <Label>Signature</Label>
              <p className='text-xs text-slate-500'>Ask the customer to sign below.</p>
              <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
                <canvas
                  ref={onsiteSignatureCanvasRef}
                  className='h-36 w-full'
                  style={{ touchAction: 'none' }}
                  onPointerDown={handleOnsiteSignaturePointerDown}
                  onPointerMove={handleOnsiteSignaturePointerMove}
                  onPointerUp={handleOnsiteSignaturePointerUp}
                  onPointerLeave={handleOnsiteSignaturePointerLeave}
                />
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Button variant='outline' onClick={resetOnsiteSignature} disabled={isSavingOnsiteReport || !canEdit}>
                  <X size={16} /> Clear signature
                </Button>
                <span className='text-xs text-slate-500'>
                  {onsiteHasSignature ? 'Signature captured.' : 'Use your cursor or finger to sign.'}
                </span>
              </div>
            </div>
            {onsiteReportError && (
              <p className='mt-3 flex items-center gap-1 text-sm text-rose-600'>
                <AlertCircle size={14} /> {onsiteReportError}
              </p>
            )}
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <Button onClick={() => void handleSaveOnsiteReport()} disabled={isSavingOnsiteReport || !canEdit}>
                {isSavingOnsiteReport ? 'Saving…' : 'Save onsite report'}
              </Button>
              <Button variant='ghost' onClick={cancelOnsiteReport} disabled={isSavingOnsiteReport}>
                <X size={16} /> Cancel
              </Button>
            </div>
          </div>
        )}

        {sortedReports.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
            No onsite reports recorded yet.
          </div>
        ) : (
          <div className='space-y-4'>
            {sortedReports.map(entry => {
              const { report, project } = entry
              const createdDisplay = formatTimestamp(report.createdAt)
              const serviceEntries =
                report.serviceEntries && report.serviceEntries.length > 0
                  ? report.serviceEntries
                  : [
                      {
                        id: 'legacy',
                        machineSerialNumber: report.machineSerialNumber,
                        firmwareVersion: report.firmwareVersion,
                        serviceInformation: report.serviceInformation,
                      },
                    ]
              return (
                <div key={report.id} className='rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <div className='text-sm font-semibold text-slate-800'>
                        {project.number}: Report on {report.reportDate || '—'}
                      </div>
                      <div className='text-xs text-slate-500'>Engineer: {report.engineerName || '—'}</div>
                      {(report.arrivalTime || report.departureTime) && (
                        <div className='text-xs text-slate-500'>
                          Arrival {report.arrivalTime || '—'} · Departure {report.departureTime || '—'}
                        </div>
                      )}
                      <div className='text-xs text-slate-500'>Machines serviced: {serviceEntries.length}</div>
                      {createdDisplay && <div className='text-xs text-slate-400'>Created {createdDisplay}</div>}
                      {report.customerContact && (
                        <div className='text-xs text-slate-500'>Contact: {report.customerContact}</div>
                      )}
                      {report.siteAddress && (
                        <div className='text-xs text-slate-500 whitespace-pre-wrap'>Site address: {report.siteAddress}</div>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button variant='outline' onClick={() => handleDownloadOnsiteReport(project, report)}>
                        <Download size={16} /> Download PDF
                      </Button>
                      {canEdit && (
                        <Button
                          variant='ghost'
                          className='text-rose-600 hover:bg-rose-50'
                          onClick={() => void handleRemoveOnsiteReport(project.id, report.id)}
                          disabled={removingOnsiteReportId === report.id}
                        >
                          <Trash2 size={16} /> Remove
                        </Button>
                      )}
                      {removingOnsiteReportId === report.id && <span className='text-xs text-slate-500'>Removing…</span>}
                    </div>
                  </div>
                  <div className='mt-4 grid gap-4 md:grid-cols-2'>
                    <div className='md:col-span-2 space-y-2'>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Machines serviced</div>
                      <div className='grid gap-2 md:grid-cols-2'>
                        {serviceEntries.map(entry => (
                          <div key={entry.id} className='rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm'>
                            <div className='text-sm font-semibold text-slate-800'>
                              {entry.machineSerialNumber || 'Machine'}
                            </div>
                            {entry.lineReference ? (
                              <div className='text-xs text-slate-500'>Line: {entry.lineReference}</div>
                            ) : null}
                            {entry.firmwareVersion ? (
                              <div className='text-xs text-slate-500'>Firmware: {entry.firmwareVersion}</div>
                            ) : null}
                            {entry.serviceCount ? (
                              <div className='text-xs text-slate-500'>Service count: {entry.serviceCount}</div>
                            ) : null}
                            <div className='mt-2 text-xs text-slate-600 whitespace-pre-wrap'>
                              {entry.serviceInformation || 'No service details recorded.'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Work summary</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.workSummary || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Materials used</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.materialsUsed || 'Not provided.'}
                      </p>
                    </div>
                    <div className='md:col-span-2'>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Additional notes</div>
                      <p className='mt-2 whitespace-pre-wrap text-sm text-slate-700'>
                        {report.additionalNotes || 'Not provided.'}
                      </p>
                    </div>
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Customer name</div>
                      <p className='mt-2 text-sm text-slate-700'>
                        {report.signedByName || '—'}
                        {report.signedByPosition ? ` — ${report.signedByPosition}` : ''}
                      </p>
                    </div>
                  </div>
                  {report.signatureDataUrl && (
                    <div className='mt-4'>
                      <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Signature</div>
                      <div className='mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3'>
                        <img
                          src={report.signatureDataUrl}
                          alt={`Onsite report signature for ${report.signedByName ?? 'customer'}`}
                          className='max-h-32 w-full object-contain'
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        </CardContent>
      </Card>
    </>
  )
}

function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function drawSignature(context: CanvasRenderingContext2D, strokes: Array<Array<{ x: number; y: number }>>) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  context.strokeStyle = '#111827'
  context.lineWidth = 2
  context.lineJoin = 'round'
  context.lineCap = 'round'

  strokes.forEach(stroke => {
    if (stroke.length < 2) return
    context.beginPath()
    context.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i += 1) {
      context.lineTo(stroke[i].x, stroke[i].y)
    }
    context.stroke()
  })
}

function buildContactInfo(contact: CustomerContact): string {
  const parts = [] as string[]
  if (contact.phone?.trim()) parts.push(contact.phone.trim())
  if (contact.email?.trim()) parts.push(contact.email.trim())
  return parts.join(' • ')
}

function sortContacts(contacts: CustomerContact[]): CustomerContact[] {
  return [...contacts].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
}

function buildDefaultDraft(
  customer: Customer,
  businessSettings: BusinessSettings,
  currentUserName: string,
  projectId: string,
  selectedSiteOption?: string,
  siteOptions?: Array<{ value: string; address: string }>,
): OnsiteReportDraft {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  const reportDate = local.toISOString().slice(0, 10)
  const arrivalTime = getBusinessStartTimeForDate(businessSettings, reportDate)
  const departureTime = getBusinessEndTimeForDate(businessSettings, reportDate)
  const project = customer.projects.find(entry => entry.id === projectId) ?? null
  const projectSite = project?.siteId ? customer.sites.find(site => site.id === project.siteId) ?? null : null
  const fallbackSite = customer.sites.find(site => site.address?.trim()) ?? null

  const preferredOption =
    (siteOptions ?? []).find(option => option.value === selectedSiteOption) ??
    (projectSite?.address?.trim() ? { address: projectSite.address.trim() } : null) ??
    (fallbackSite?.address?.trim() ? { address: fallbackSite.address.trim() } : null)

  return {
    reportDate,
    arrivalTime,
    departureTime,
    engineerName: currentUserName,
    customerContact: customer.contacts[0]?.name ?? '',
    siteAddress: preferredOption?.address ?? '',
    workSummary: '',
    materialsUsed: '',
    additionalNotes: '',
    signedByName: customer.contacts[0]?.name ?? '',
    signedByPosition: customer.contacts[0]?.position ?? '',
    serviceEntries: [],
  }
}

function resolveDefaultSiteOption(customer: Customer, projectId: string): string {
  const project = customer.projects.find(entry => entry.id === projectId) ?? null
  if (project?.siteId && customer.sites.some(site => site.id === project.siteId && site.address?.trim())) {
    return project.siteId
  }
  const firstAddress = customer.sites.find(site => site.address?.trim())
  return firstAddress?.id ?? ''
}

