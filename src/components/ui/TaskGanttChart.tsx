import type { ProjectTask, ProjectTaskStatus } from '../../types'

type TaskWithBounds = {
  task: ProjectTask
  start: number
  end: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * MS_PER_DAY
}

const STATUS_COLORS: Record<ProjectTaskStatus, string> = {
  'Not started': 'bg-rose-500',
  Started: 'bg-sky-500',
  Complete: 'bg-emerald-500',
}

function formatTimestampRange(task: ProjectTask): string {
  if (!task.start || !task.end) {
    return 'No schedule set'
  }
  const start = new Date(task.start)
  const end = new Date(task.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'No schedule set'
  }
  const startLabel = start.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const endLabel = end.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${startLabel} – ${endLabel}`
}

function buildTaskBounds(tasks: ProjectTask[]): TaskWithBounds[] {
  return tasks
    .map(task => {
      if (!task.start || !task.end) {
        return null
      }
      const start = Date.parse(task.start)
      const end = Date.parse(task.end)
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return null
      }
      return {
        task,
        start,
        end: Math.max(end, start),
      }
    })
    .filter((entry): entry is TaskWithBounds => !!entry)
    .sort((a, b) => a.start - b.start)
}

function formatAxisLabel(value: number): string {
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TaskGanttChart({ tasks }: { tasks: ProjectTask[] }) {
  const entries = buildTaskBounds(tasks)

  if (entries.length === 0) {
    return (
      <div className='rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500'>
        Add start and end times to display tasks on the timeline.
      </div>
    )
  }

  const minStart = entries.reduce((min, entry) => Math.min(min, entry.start), entries[0].start)
  const maxEnd = entries.reduce((max, entry) => Math.max(max, entry.end), entries[0].end)
  const calendarStart = startOfDay(minStart)
  const calendarEnd = addDays(startOfDay(maxEnd), 1)
  const totalDuration = Math.max(calendarEnd - calendarStart, MS_PER_DAY)
  const dayCount = Math.max(1, Math.ceil((calendarEnd - calendarStart) / MS_PER_DAY))
  const days = Array.from({ length: dayCount }, (_, index) => addDays(calendarStart, index))
  const gridTemplateStyle = { gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }

  return (
    <div className='space-y-4'>
      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div
          className='grid border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500'
          style={gridTemplateStyle}
        >
          {days.map(day => {
            const date = new Date(day)
            const weekdayLabel = date.toLocaleDateString(undefined, { weekday: 'short' })
            const dateLabel = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
            return (
              <div key={day} className='border-r border-slate-200 px-3 py-2 last:border-r-0'>
                <div>{weekdayLabel}</div>
                <div className='text-[11px] font-normal text-slate-400'>{dateLabel}</div>
              </div>
            )
          })}
        </div>
        <div className='space-y-4 px-4 py-4'>
          {entries.map(entry => {
            const clampedStart = Math.max(entry.start, calendarStart)
            const rawEnd = Math.min(entry.end, calendarEnd)
            const clampedEnd = Math.max(rawEnd, clampedStart + 1)
            const startOffset = ((clampedStart - calendarStart) / totalDuration) * 100
            const widthPercent = ((clampedEnd - clampedStart) / totalDuration) * 100
            const left = Math.min(Math.max(startOffset, 0), 100)
            const width = Math.max(Math.min(widthPercent, 100 - left), 1)
            const colorClass = STATUS_COLORS[entry.task.status] ?? STATUS_COLORS['Not started']

            return (
              <div key={entry.task.id} className='space-y-2'>
                <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500'>
                  <span className='font-medium text-slate-700'>{entry.task.name}</span>
                  <span>{formatTimestampRange(entry.task)}</span>
                </div>
                <div className='relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50'>
                  <div
                    className='pointer-events-none absolute inset-0 grid'
                    style={gridTemplateStyle}
                  >
                    {days.map((day, index) => (
                      <div
                        key={day}
                        className={`border-r border-slate-200/80 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                        } last:border-r-0`}
                      />
                    ))}
                  </div>
                  <div className='relative h-14 px-2 py-2'>
                    <div
                      className={`absolute top-2 bottom-2 rounded-lg ${colorClass}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className='flex justify-between text-xs text-slate-500'>
        <span>{formatAxisLabel(minStart)}</span>
        <span>{formatAxisLabel(maxEnd)}</span>
      </div>
    </div>
  )

}
