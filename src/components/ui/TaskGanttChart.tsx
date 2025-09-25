import type { ProjectTask, ProjectTaskStatus } from '../../types'

type TaskWithBounds = {
  task: ProjectTask
  start: number
  end: number
}

const STATUS_COLORS: Record<ProjectTaskStatus, string> = {
  'Not started': 'bg-slate-300',
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
  const totalDuration = Math.max(maxEnd - minStart, 1)

  return (
    <div className='space-y-3'>
      <div className='flex justify-between text-xs text-slate-500'>
        <span>{formatAxisLabel(minStart)}</span>
        <span>{formatAxisLabel(maxEnd)}</span>
      </div>
      <div className='space-y-3'>
        {entries.map(entry => {
          const duration = Math.max(entry.end - entry.start, 1)
          const startOffset = ((entry.start - minStart) / totalDuration) * 100
          const widthPercent = (duration / totalDuration) * 100
          const left = Math.min(Math.max(startOffset, 0), 100)
          const width = Math.max(Math.min(widthPercent, 100 - left), 1)
          const colorClass = STATUS_COLORS[entry.task.status] ?? STATUS_COLORS['Not started']

          return (
            <div key={entry.task.id} className='space-y-1'>
              <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500'>
                <span className='font-medium text-slate-700'>{entry.task.name}</span>
                <span>{formatTimestampRange(entry.task)}</span>
              </div>
              <div className='relative h-2.5 rounded-full bg-slate-100'>
                <div
                  className={`absolute top-0 h-2.5 rounded-full ${colorClass}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
