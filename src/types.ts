export type WOType = 'Build' | 'Onsite';

export type WO = {
  id: string;
  number: string;
  type: WOType;
  note?: string;
};

export type ProjectFileCategory = 'fds' | 'electrical' | 'mechanical' | 'installation';

export const PROJECT_FILE_CATEGORIES: ProjectFileCategory[] = [
  'fds',
  'electrical',
  'mechanical',
  'installation',
];

export const PROJECT_STATUS_OPTIONS = ['Active', 'Complete'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

export const PROJECT_ACTIVE_SUB_STATUS_OPTIONS = [
  'FDS',
  'Design',
  'Build',
  'Install',
  'Install (Snagging)',
] as const;

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

export type ProjectInfo = {
  lineReference?: string;
  machineSerialNumbers?: string[];
  toolSerialNumbers?: string[];
  cobaltOrderNumber?: string;
  customerOrderNumber?: string;
  salespersonId?: string;
  salespersonName?: string;
  startDate?: string;
  proposedCompletionDate?: string;
};

export const BUSINESS_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type BusinessDay = (typeof BUSINESS_DAYS)[number];

export type BusinessDayHours = {
  enabled: boolean;
  start: string; // HH:MM (24h)
  end: string; // HH:MM (24h)
};

export type BusinessSettings = {
  businessName: string;
  hours: Record<BusinessDay, BusinessDayHours>;
};

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessName: 'Cobalt Systems',
  hours: {
    monday: { enabled: true, start: '08:30', end: '17:00' },
    tuesday: { enabled: true, start: '08:30', end: '17:00' },
    wednesday: { enabled: true, start: '08:30', end: '17:00' },
    thursday: { enabled: true, start: '08:30', end: '17:00' },
    friday: { enabled: true, start: '08:30', end: '17:00' },
    saturday: { enabled: false, start: '09:00', end: '13:00' },
    sunday: { enabled: false, start: '09:00', end: '13:00' },
  },
};

export type ProjectOnsiteReport = {
  id: string;
  reportDate: string;
  arrivalTime?: string;
  departureTime?: string;
  engineerName: string;
  customerContact?: string;
  siteAddress?: string;
  workSummary: string;
  materialsUsed?: string;
  additionalNotes?: string;
  signedByName?: string;
  signedByPosition?: string;
  signatureDataUrl?: string;
  createdAt: string;
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
  projectInfo?: ProjectInfo;
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

export const PROJECT_TASK_STATUSES = ['Not started', 'Started', 'Complete'] as const;

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

export type ProjectTask = {
  id: string;
  name: string;
  status: ProjectTaskStatus;
  start?: string;
  end?: string;
  assigneeId?: string;
  assigneeName?: string;
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
  tasks?: ProjectTask[];
  info?: ProjectInfo;
  onsiteReports?: ProjectOnsiteReport[];
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

export type TwoFactorMethod = 'authenticator' | 'sms';

export type User = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  twoFactorEnabled: boolean;
  twoFactorMethod?: TwoFactorMethod;
  passwordHash: string;
};

export function formatProjectStatus(status: ProjectStatus, activeSubStatus?: ProjectActiveSubStatus): string {
  if (status === 'Active') {
    return activeSubStatus ?? DEFAULT_PROJECT_ACTIVE_SUB_STATUS;
  }
  return 'Complete';
}
