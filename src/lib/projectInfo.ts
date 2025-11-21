import type { ProjectInfo, ProjectMachine, User } from '../types'
import { createId } from './id'

export type ProjectInfoDraftDefaults = {
  startDate?: string
  proposedCompletionDate?: string
}

export type ProjectMachineDraft = {
  id: string
  machineSerialNumber: string
  lineReference: string
  toolSerialNumbers: string[]
  model?: string
  make?: string
  handing?: ProjectMachine['handing'] | ''
  dateInstalled?: string
  dateLastService?: string
  lastServiceCount?: string
  firmwareVersion?: string
  notes?: string
}

export type ProjectInfoDraft = {
  machines: ProjectMachineDraft[]
  cobaltOrderNumber: string
  customerOrderNumber: string
  salespersonId: string
  startDate: string
  proposedCompletionDate: string
}

export function createProjectInfoDraft(
  info: ProjectInfo | undefined,
  users: User[],
  defaults: ProjectInfoDraftDefaults = {},
): ProjectInfoDraft {
  let salespersonId = info?.salespersonId ?? ''
  if (salespersonId && !users.some(user => user.id === salespersonId)) {
    salespersonId = ''
  }

  if (!salespersonId && info?.salespersonName) {
    const match = users.find(
      user => user.name.trim().toLowerCase() === info.salespersonName!.trim().toLowerCase(),
    )
    if (match) {
      salespersonId = match.id
    }
  }

  const machines: ProjectMachineDraft[] = []
  if (info?.machines && info.machines.length > 0) {
    machines.push(
      ...info.machines.map(machine => ({
        id: createId(),
        machineSerialNumber: machine.machineSerialNumber,
        lineReference: machine.lineReference ?? '',
        toolSerialNumbers: machine.toolSerialNumbers ? [...machine.toolSerialNumbers] : [],
        model: machine.model,
        make: machine.make,
        handing: (machine.handing ?? '') as ProjectMachineDraft['handing'],
        dateInstalled: machine.dateInstalled,
        dateLastService: machine.dateLastService,
        lastServiceCount:
          typeof machine.lastServiceCount === 'number' ? String(machine.lastServiceCount) : '',
        firmwareVersion: machine.firmwareVersion,
        notes: machine.notes,
      })),
    )
  } else if (info) {
    const legacy = info as { machineSerialNumbers?: unknown; toolSerialNumbers?: unknown }
    const legacyMachineSerials = Array.isArray(legacy.machineSerialNumbers)
      ? (legacy.machineSerialNumbers as string[])
      : []
    const legacyToolSerials = Array.isArray(legacy.toolSerialNumbers)
      ? (legacy.toolSerialNumbers as string[])
      : []

    if (legacyMachineSerials.length > 0) {
      machines.push(
        ...legacyMachineSerials.map(serial => ({
          id: createId(),
          machineSerialNumber: serial,
          lineReference: '',
          toolSerialNumbers: [],
        })),
      )
    }

    if (legacyToolSerials.length > 0) {
      if (machines.length === 1) {
        machines[0] = {
          ...machines[0],
          toolSerialNumbers: [...legacyToolSerials],
        }
      } else if (machines.length === 0) {
        machines.push(
          ...legacyToolSerials.map(serial => ({
            id: createId(),
            machineSerialNumber: '',
            lineReference: '',
            toolSerialNumbers: [serial],
          })),
        )
      } else {
        machines.push({
          id: createId(),
          machineSerialNumber: '',
          lineReference: '',
          toolSerialNumbers: [...legacyToolSerials],
        })
      }
    }
  }

  return {
    machines,
    cobaltOrderNumber: info?.cobaltOrderNumber ?? '',
    customerOrderNumber: info?.customerOrderNumber ?? '',
    salespersonId,
    startDate: info?.startDate ?? defaults.startDate ?? '',
    proposedCompletionDate: info?.proposedCompletionDate ?? defaults.proposedCompletionDate ?? '',
  }
}

export function parseProjectInfoDraft(
  draft: ProjectInfoDraft,
  users: User[],
): { info: ProjectInfo | null; error?: string } {
  const machines: ProjectMachine[] = []
  const seenMachineSerials = new Set<string>()
  const seenToolSerials = new Set<string>()
  for (const machine of draft.machines) {
    const machineSerialNumber = machine.machineSerialNumber.trim()
    const lineReference = machine.lineReference.trim()
    const model = machine.model?.trim() ?? ''
    const make = machine.make?.trim() ?? ''
    const firmwareVersion = machine.firmwareVersion?.trim() ?? ''
    const notes = machine.notes?.trim() ?? ''
    const dateInstalled = machine.dateInstalled?.trim() ?? ''
    const dateLastService = machine.dateLastService?.trim() ?? ''
    const handing = machine.handing?.trim() ?? ''
    const lastServiceCountInput = machine.lastServiceCount?.trim() ?? ''
    const normalizedTools: string[] = []
    const seenTools = new Set<string>()
    for (const tool of machine.toolSerialNumbers) {
      const trimmed = tool.trim()
      if (!trimmed) {
        continue
      }
      const normalized = trimmed.toLowerCase()
      if (seenTools.has(normalized)) {
        continue
      }
      seenTools.add(normalized)
      normalizedTools.push(trimmed)
    }

    if (normalizedTools.length > 1) {
      return { info: null, error: 'Machines can only have one tool.' }
    }

    if (!machineSerialNumber) {
      if (normalizedTools.length > 0) {
        return {
          info: null,
          error: 'Enter a machine serial number before adding tool serial numbers.',
        }
      }
      continue
    }

    const normalizedMachine = machineSerialNumber.toLowerCase()
    if (seenMachineSerials.has(normalizedMachine)) {
      return { info: null, error: 'Machine serial numbers must be unique.' }
    }
    seenMachineSerials.add(normalizedMachine)
    const machineEntry: ProjectMachine = { machineSerialNumber, toolSerialNumbers: normalizedTools }
    if (normalizedTools.length === 1) {
      const normalizedTool = normalizedTools[0].toLowerCase()
      if (seenToolSerials.has(normalizedTool)) {
        return { info: null, error: 'Tool serial numbers must be unique.' }
      }
      seenToolSerials.add(normalizedTool)
    }
    if (lineReference) {
      machineEntry.lineReference = lineReference
    }
    if (model) machineEntry.model = model
    if (make) machineEntry.make = make
    if (firmwareVersion) machineEntry.firmwareVersion = firmwareVersion
    if (notes) machineEntry.notes = notes
    if (dateInstalled) machineEntry.dateInstalled = dateInstalled
    if (dateLastService) machineEntry.dateLastService = dateLastService
    if (handing === 'left' || handing === 'right') {
      machineEntry.handing = handing
    }
    if (lastServiceCountInput) {
      const parsedCount = Number(lastServiceCountInput)
      if (!Number.isFinite(parsedCount) || parsedCount < 0) {
        return { info: null, error: 'Enter a valid non-negative last service count.' }
      }
      machineEntry.lastServiceCount = Math.floor(parsedCount)
    }
    machines.push(machineEntry)
  }
  const cobaltOrderNumber = draft.cobaltOrderNumber.trim()
  const customerOrderNumber = draft.customerOrderNumber.trim()
  const startDate = draft.startDate.trim()
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { info: null, error: 'Enter a valid project start date (YYYY-MM-DD).' }
  }
  const proposedCompletionDate = draft.proposedCompletionDate.trim()
  if (proposedCompletionDate && !/^\d{4}-\d{2}-\d{2}$/.test(proposedCompletionDate)) {
    return { info: null, error: 'Enter a valid proposed completion date (YYYY-MM-DD).' }
  }

  let salespersonId: string | undefined
  let salespersonName: string | undefined
  if (draft.salespersonId) {
    const user = users.find(entry => entry.id === draft.salespersonId)
    if (!user) {
      return { info: null, error: 'Select a valid salesperson.' }
    }
    salespersonId = user.id
    salespersonName = user.name
  }

  const info: ProjectInfo = {}
  if (machines.length > 0) info.machines = machines
  if (cobaltOrderNumber) info.cobaltOrderNumber = cobaltOrderNumber
  if (customerOrderNumber) info.customerOrderNumber = customerOrderNumber
  if (salespersonId) info.salespersonId = salespersonId
  if (salespersonName) info.salespersonName = salespersonName
  if (startDate) info.startDate = startDate
  if (proposedCompletionDate) info.proposedCompletionDate = proposedCompletionDate

  const hasInfo = Object.values(info).some(value => {
    if (Array.isArray(value)) {
      return value.length > 0
    }
    return value !== undefined
  })

  return { info: hasInfo ? info : null }
}
