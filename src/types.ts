export type WOType = 'Build' | 'Onsite';

export type WO = {
  id: string;
  number: string;
  type: WOType;
  note?: string;
};

export type ProjectFDS = {
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
};

export type Project = {
  id: string;
  number: string;
  note?: string; // ⬅️ new
  wos: WO[];
  fds?: ProjectFDS;
};

export type Customer = {
  id: string;
  name: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  projects: Project[];
};

export type AppRole = 'viewer' | 'editor' | 'admin';
