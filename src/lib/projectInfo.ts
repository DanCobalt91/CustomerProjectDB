import type { ProjectInfo, User } from '../types'

export type ProjectInfoDraftDefaults = {
  startDate?: string
  proposedCompletionDate?: string
}

export type ProjectInfoDraft = {
  lineReference: string
  machineSerialNumbers: string
  toolSerialNumbers: string
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

  return {
    lineReference: info?.lineReference ?? '',
    machineSerialNumbers: info?.machineSerialNumbers?.join('\n') ?? '',
    toolSerialNumbers: info?.toolSerialNumbers?.join('\n') ?? '',
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
  const machineSerialNumbers = draft.machineSerialNumbers
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
  const toolSerialNumbers = draft.toolSerialNumbers
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
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
  if (machineSerialNumbers.length > 0) info.machineSerialNumbers = machineSerialNumbers
  if (toolSerialNumbers.length > 0) info.toolSerialNumbers = toolSerialNumbers
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
