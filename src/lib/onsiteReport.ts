import type {
  CustomerSignOffSignatureDimensions,
  CustomerSignOffSignatureStroke,
  OnsiteServiceEntry,
} from '../types'

export type OnsiteReportSubmission = {
  reportDate: string
  arrivalTime?: string
  departureTime?: string
  engineerName: string
  customerContact?: string
  siteAddress?: string
  workSummary: string
  materialsUsed?: string
  additionalNotes?: string
  signedByName: string
  signedByPosition?: string
  signatureDataUrl: string
  signaturePaths: CustomerSignOffSignatureStroke[]
  signatureDimensions: CustomerSignOffSignatureDimensions
  machineId?: string
  serviceInformation?: string
  firmwareVersion?: string
  serviceEntries: OnsiteServiceEntry[]
}
