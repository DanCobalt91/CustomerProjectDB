import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { createId } from '../../lib/id'
import type { ProjectMachineDraft } from '../../lib/projectInfo'
import Button from './Button'
import Input from './Input'
import Label from './Label'
import SerialNumberListInput from './SerialNumberListInput'

type MachineToolListInputProps = {
  id: string
  machines: ProjectMachineDraft[]
  onChange: (machines: ProjectMachineDraft[]) => void
  disabled?: boolean
  className?: string
}

export default function MachineToolListInput({
  id,
  machines,
  onChange,
  disabled = false,
  className = '',
}: MachineToolListInputProps) {
  const handleAddMachine = useCallback(() => {
    if (disabled) {
      return
    }
    onChange([
      ...machines,
      { id: createId(), machineSerialNumber: '', lineReference: '', toolSerialNumbers: [] },
    ])
  }, [disabled, machines, onChange])

  const updateMachine = useCallback(
    (machineId: string, updates: Partial<ProjectMachineDraft>) => {
      onChange(
        machines.map(machine =>
          machine.id === machineId ? { ...machine, ...updates, id: machine.id } : machine,
        ),
      )
    },
    [machines, onChange],
  )

  const handleRemoveMachine = useCallback(
    (machineId: string) => {
      if (disabled) {
        return
      }
      onChange(machines.filter(machine => machine.id !== machineId))
    },
    [disabled, machines, onChange],
  )

  return (
    <div className={className}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Label htmlFor={`${id}-add`}>Machines &amp; Tools</Label>
        <Button
          id={`${id}-add`}
          type='button'
          variant='outline'
          onClick={handleAddMachine}
          disabled={disabled}
          title={disabled ? 'Read-only access' : 'Add machine'}
        >
          <Plus size={16} /> Add Machine
        </Button>
      </div>
      <div className='mt-3 space-y-3'>
        {machines.length === 0 ? (
          <p className='text-xs text-slate-500'>No machines recorded.</p>
        ) : (
          machines.map((machine, index) => {
            const machineId = machine.id
            const machineInputId = `${id}-machine-${machineId}`
            const toolsInputId = `${id}-tools-${machineId}`
            const lineInputId = `${id}-line-${machineId}`
            const machineLabel = `Machine ${index + 1}`
            const hasMachineSerial = machine.machineSerialNumber.trim().length > 0
            return (
              <div
                key={machineId}
                className='space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm'
              >
                <div className='flex flex-wrap items-start gap-3'>
                  <div className='min-w-[200px] flex-1'>
                    <Label htmlFor={machineInputId}>{machineLabel}</Label>
                    <Input
                      id={machineInputId}
                      value={machine.machineSerialNumber}
                      onChange={event =>
                        updateMachine(machineId, {
                          machineSerialNumber: (event.target as HTMLInputElement).value,
                        })
                      }
                      placeholder='e.g. SN-001234'
                      disabled={disabled}
                    />
                    <div className='mt-3'>
                      <Label htmlFor={lineInputId}>Line No/Name (optional)</Label>
                      <Input
                        id={lineInputId}
                        value={machine.lineReference}
                        onChange={event =>
                          updateMachine(machineId, {
                            lineReference: (event.target as HTMLInputElement).value,
                          })
                        }
                        placeholder='e.g. Line 2 — Packing'
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={() => handleRemoveMachine(machineId)}
                    disabled={disabled}
                    title={disabled ? 'Read-only access' : 'Remove machine'}
                    className='rounded-full px-3 py-1 text-sm text-rose-600 hover:bg-rose-50 disabled:text-slate-400'
                  >
                    <Trash2 size={16} /> Remove
                  </Button>
                </div>
                <div>
                  <SerialNumberListInput
                    id={toolsInputId}
                    label='Tool Serial Numbers'
                    values={machine.toolSerialNumbers}
                    onChange={values =>
                      updateMachine(machineId, { toolSerialNumbers: values })
                    }
                    placeholder='e.g. TOOL-045'
                    disabled={disabled}
                    validateAdd={(serial, existing) => {
                      if (!hasMachineSerial) {
                        return 'Enter the machine serial number before adding tools.'
                      }
                      if (existing.length >= 1) {
                        return 'Machines can only have one tool.'
                      }
                      const normalized = serial.trim().toLowerCase()
                      const hasDuplicateTool = machines.some(other => {
                        if (other.id === machineId) {
                          return false
                        }
                        return other.toolSerialNumbers.some(tool =>
                          tool.trim().toLowerCase() === normalized,
                        )
                      })
                      if (hasDuplicateTool) {
                        return 'Tool serial numbers must be unique.'
                      }
                      return null
                    }}
                  />
                  {!hasMachineSerial && machine.toolSerialNumbers.length === 0 ? (
                    <p className='mt-2 text-xs text-slate-500'>
                      Enter a machine serial number before adding tool serial numbers.
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
