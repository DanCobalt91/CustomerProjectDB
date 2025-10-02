import type { ProjectInfo, ProjectMachine, User } from '../types'
import { createId } from './id'

export type ProjectInfoDraftDefaults = {
  startDate?: string
  proposedCompletionDate?: string
}

export type ProjectMachineDraft = {
  id: string
  machineSerialNumber: string
  toolSerialNumbers: string[]
}

export type ProjectInfoDraft = {
  lineReference: string
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
        toolSerialNumbers: machine.toolSerialNumbers ? [...machine.toolSerialNumbers] : [],
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
            toolSerialNumbers: [serial],
          })),
        )
      } else {
        machines.push({
          id: createId(),
          machineSerialNumber: '',
          toolSerialNumbers: [...legacyToolSerials],
        })
      }
    }
  }

  return {
    lineReference: info?.lineReference ?? '',
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
  const lineReference = draft.lineReference.trim()
  const machines: ProjectMachine[] = []
  const seenMachineSerials = new Set<string>()
  for (const machine of draft.machines) {
    const machineSerialNumber = machine.machineSerialNumber.trim()
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
    machines.push({ machineSerialNumber, toolSerialNumbers: normalizedTools })
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
  if (lineReference) info.lineReference = lineReference
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
