import { useMemo } from 'react'
import { ArrowLeft, Download, MapPin, Pencil, Tag } from 'lucide-react'
import type { Customer, CustomerMachine, Project, ProjectOnsiteReport } from '../types'
import Button from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import Label from '../components/ui/Label'

function formatDateValue(value?: string | null): string {
  if (!value) {
    return 'Not specified'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return value
  }
  return new Date(parsed).toLocaleDateString()
}

function formatHanding(value?: CustomerMachine['handing']): string {
  if (!value) {
    return 'Not specified'
  }
  return value === 'left' ? 'Left' : 'Right'
}

type ServiceHistoryEntry = {
  project: Project
  report: ProjectOnsiteReport
}

type MachinePageProps = {
  customer: Customer
  machine: CustomerMachine
  canEdit: boolean
  onBack: () => void
  onEdit: () => void
  onNavigateToProject: (projectId: string) => void
}

export default function MachinePage({
  customer,
  machine,
  canEdit,
  onBack,
  onEdit,
  onNavigateToProject,
}: MachinePageProps) {
  const site = machine.siteId ? customer.sites.find(entry => entry.id === machine.siteId) ?? null : null
  const linkedProject = machine.projectId
    ? customer.projects.find(entry => entry.id === machine.projectId) ?? null
    : null

  const serviceHistory = useMemo<ServiceHistoryEntry[]>(() => {
    const entries: ServiceHistoryEntry[] = []
    for (const project of customer.projects) {
      const reports = project.onsiteReports ?? []
      for (const report of reports) {
        if (report.machineId === machine.id) {
          entries.push({ project, report })
        }
      }
    }
    entries.sort((a, b) => {
      const aDate = a.report.reportDate ? Date.parse(a.report.reportDate) : Date.parse(a.report.createdAt)
      const bDate = b.report.reportDate ? Date.parse(b.report.reportDate) : Date.parse(b.report.createdAt)
      if (Number.isNaN(aDate) && Number.isNaN(bDate)) {
        return 0
      }
      if (Number.isNaN(aDate)) {
        return 1
      }
      if (Number.isNaN(bDate)) {
        return -1
      }
      return bDate - aDate
    })
    return entries
  }, [customer.projects, machine.id])

  const handleDownloadReport = (entry: ServiceHistoryEntry) => {
    const { report, project } = entry
    if (!report.pdfDataUrl) {
      window.alert('This onsite report is missing a PDF document.')
      return
    }
    const link = document.createElement('a')
    const sanitizedNumber = project.number.replace(/[^A-Za-z0-9-]/g, '')
    const datePart = report.reportDate ? report.reportDate.replace(/[^0-9-]/g, '') : null
    link.href = report.pdfDataUrl
    link.download = `OnsiteReport-${sanitizedNumber || project.number}-${datePart || report.id}.pdf`
    link.rel = 'noopener'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button variant='ghost' onClick={onBack} className='flex items-center gap-2'>
          <ArrowLeft size={16} /> Back to customer
        </Button>
        <div className='flex items-center gap-2'>
          {canEdit ? (
            <Button onClick={onEdit} className='flex items-center gap-2'>
              <Pencil size={16} /> Edit machine
            </Button>
          ) : null}
        </div>
      </div>
      <Card className='panel'>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h2 className='text-xl font-semibold text-slate-900'>Machine {machine.machineSerialNumber}</h2>
              <p className='mt-1 text-sm text-slate-500'>Detailed information and service history.</p>
            </div>
            {linkedProject ? (
              <Button variant='outline' onClick={() => onNavigateToProject(linkedProject.id)}>
                <Tag size={16} /> View project {linkedProject.number}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 md:grid-cols-2'>
            <div>
              <Label>Model</Label>
              <p className='mt-1 text-sm text-slate-700'>{machine.model?.trim() || 'Not specified'}</p>
            </div>
            <div>
              <Label>Make</Label>
              <p className='mt-1 text-sm text-slate-700'>{machine.make?.trim() || 'Not specified'}</p>
            </div>
            <div>
              <Label>Handing</Label>
              <p className='mt-1 text-sm text-slate-700'>{formatHanding(machine.handing)}</p>
            </div>
            <div>
              <Label>Firmware version</Label>
              <p className='mt-1 text-sm text-slate-700'>{machine.firmwareVersion?.trim() || 'Not specified'}</p>
            </div>
            <div>
              <Label>Date installed</Label>
              <p className='mt-1 text-sm text-slate-700'>{formatDateValue(machine.dateInstalled)}</p>
            </div>
            <div>
              <Label>Date of last service</Label>
              <p className='mt-1 text-sm text-slate-700'>{formatDateValue(machine.dateLastService)}</p>
            </div>
            <div>
              <Label>Last service count</Label>
              <p className='mt-1 text-sm text-slate-700'>
                {typeof machine.lastServiceCount === 'number' ? machine.lastServiceCount : 'Not specified'}
              </p>
            </div>
            <div>
              <Label>Line reference</Label>
              <p className='mt-1 text-sm text-slate-700'>{machine.lineReference?.trim() || 'Not specified'}</p>
            </div>
          </div>
          <div className='mt-4 grid gap-3 md:grid-cols-2'>
            <div>
              <Label>Site</Label>
              <p className='mt-1 flex items-center gap-2 text-sm text-slate-700'>
                <MapPin size={14} className='text-slate-400' />
                {site
                  ? site.name?.trim() || site.address?.trim() || 'Unnamed site'
                  : 'Not assigned to a site'}
              </p>
            </div>
            <div>
              <Label>Associated project</Label>
              <p className='mt-1 text-sm text-slate-700'>
                {linkedProject ? `Project ${linkedProject.number}` : 'No associated project'}
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Label>Notes</Label>
            <p className='mt-1 whitespace-pre-wrap rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-sm text-slate-700'>
              {machine.notes?.trim() || 'No additional notes recorded.'}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card className='panel'>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h3 className='text-lg font-semibold text-slate-900'>Service history</h3>
              <p className='mt-1 text-sm text-slate-500'>Onsite reports linked to this machine.</p>
            </div>
            <span className='rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600'>
              {serviceHistory.length} visits
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {serviceHistory.length === 0 ? (
            <p className='text-sm text-slate-600'>No service visits recorded yet.</p>
          ) : (
            <div className='space-y-3'>
              {serviceHistory.map(entry => {
                const { report, project } = entry
                const reportDate = report.reportDate ? formatDateValue(report.reportDate) : formatDateValue(report.createdAt)
                return (
                  <div key={report.id} className='rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div>
                        <div className='text-sm font-semibold text-slate-800'>
                          {project ? `Project ${project.number}` : 'Project removed'}
                        </div>
                        <div className='text-xs text-slate-500'>Report date: {reportDate}</div>
                        <div className='mt-1 text-xs text-slate-500'>Engineer: {report.engineerName || 'Not recorded'}</div>
                      </div>
                      <Button
                        variant='outline'
                        onClick={() => handleDownloadReport(entry)}
                        disabled={!report.pdfDataUrl}
                        title={report.pdfDataUrl ? 'Download onsite report' : 'Report PDF unavailable'}
                      >
                        <Download size={16} /> Download
                      </Button>
                    </div>
                    <div className='mt-3 grid gap-3 md:grid-cols-2'>
                      <div>
                        <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Service details</div>
                        <p className='mt-1 whitespace-pre-wrap text-sm text-slate-700'>
                          {report.serviceInformation || report.workSummary || 'No details recorded.'}
                        </p>
                      </div>
                      <div>
                        <div className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Firmware version</div>
                        <p className='mt-1 text-sm text-slate-700'>
                          {report.firmwareVersion || machine.firmwareVersion || 'Not specified.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
