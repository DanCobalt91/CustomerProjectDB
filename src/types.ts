export type WOType = 'Build' | 'Onsite';

export type WO = {
  id: string;
  number: string;
  type: WOType;
  note?: string;
};

export type ProjectFileCategory = 'fds' | 'electrical' | 'mechanical';

export const PROJECT_FILE_CATEGORIES: ProjectFileCategory[] = ['fds', 'electrical', 'mechanical'];

export const PROJECT_STATUS_OPTIONS = ['Active', 'Complete'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

export const PROJECT_ACTIVE_SUB_STATUS_OPTIONS = ['FDS', 'Design', 'Build', 'Install'] as const;

export type ProjectActiveSubStatus = (typeof PROJECT_ACTIVE_SUB_STATUS_OPTIONS)[number];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'Active';

export const DEFAULT_PROJECT_ACTIVE_SUB_STATUS: ProjectActiveSubStatus = 'FDS';

export type ProjectFile = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
};

export type ProjectDocuments = Partial<Record<ProjectFileCategory, ProjectFile[]>>;

export type ProjectStatusLogEntry = {
  id: string;
  status: ProjectStatus;
  activeSubStatus?: ProjectActiveSubStatus;
  changedAt: string;
  changedBy: string;
};

export type CustomerSignOffDecision = 'option1' | 'option2' | 'option3';

export const CUSTOMER_SIGN_OFF_DECISIONS: CustomerSignOffDecision[] = ['option1', 'option2', 'option3'];

export type CustomerSignOffSignaturePoint = { x: number; y: number };

export type CustomerSignOffSignatureStroke = CustomerSignOffSignaturePoint[];

export type CustomerSignOffSignatureDimensions = { width: number; height: number };

export type ProjectCustomerSignOff = {
  id: string;
  type: 'upload' | 'generated';
  completedAt: string;
  file: ProjectFile;
  signedByName?: string;
  signedByPosition?: string;
  decision?: CustomerSignOffDecision;
  snags?: string[];
  signatureDataUrl?: string;
};

export type CustomerSignOffSubmission = {
  name: string;
  position: string;
  decision: CustomerSignOffDecision;
  snags: string[];
  signatureDataUrl: string;
  signaturePaths: CustomerSignOffSignatureStroke[];
  signatureDimensions: CustomerSignOffSignatureDimensions;
};

export type Project = {
  id: string;
  number: string;
  status: ProjectStatus;
  activeSubStatus?: ProjectActiveSubStatus;
  note?: string; // ⬅️ new
  wos: WO[];
  documents?: ProjectDocuments;
  statusHistory?: ProjectStatusLogEntry[];
  customerSignOff?: ProjectCustomerSignOff;
};

export type CustomerContact = {
  id: string;
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
};

export type Customer = {
  id: string;
  name: string;
  address?: string;
  contacts: CustomerContact[];
  projects: Project[];
};

export type AppRole = 'viewer' | 'editor' | 'admin';

export function formatProjectStatus(status: ProjectStatus, activeSubStatus?: ProjectActiveSubStatus): string {
  return status === 'Active'
    ? `Active — ${activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS}`
    : 'Complete';
}
