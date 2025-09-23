export type WOType = 'Build' | 'Onsite';

export type WO = {
  id: string;
  number: string;
  type: WOType;
  note?: string;
};

export type ProjectFileCategory = 'fds' | 'electrical' | 'mechanical';

export const PROJECT_FILE_CATEGORIES: ProjectFileCategory[] = ['fds', 'electrical', 'mechanical'];

export type ProjectFile = {
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
};

export type ProjectDocuments = Partial<Record<ProjectFileCategory, ProjectFile>>;

export type Project = {
  id: string;
  number: string;
  note?: string; // ⬅️ new
  wos: WO[];
  documents?: ProjectDocuments;
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
