import Dexie, { type EntityTable } from 'dexie';

// Norm - product time standard
export interface Norm {
  id?: number;
  article: string; // e.g., "ХТ44" - always uppercase letters + digits, no spaces
  timeHours: number; // time in hours (e.g., 10)
  createdAt: Date;
  updatedAt: Date;
}

// Plan - production plan
export interface Plan {
  id?: number;
  article: string; // must exist in Norms
  targetQty: number; // target quantity
  createdAt: Date;
  completedAt: Date | null; // null if not completed
  updatedAt: Date;
}

// Welder
export interface Welder {
  id?: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// WorkEntry - individual work record
export interface WorkEntry {
  id?: number;
  welderId: number;
  planId: number;
  article: string;
  quantity: number; // can be decimal, e.g., 0.5
  date: string; // ISO date string YYYY-MM-DD - the date the work is attributed to
  dayType: 'workday' | 'sb' | 'vs'; // СБ/ВС flag
  createdAt: Date;
  updatedAt: Date;
}

// Export data structure
export interface ExportData {
  norms: Norm[];
  plans: Plan[];
  welders: Welder[];
  workEntries: WorkEntry[];
  exportedAt: string;
  version: string;
}

const db = new Dexie('WelderTrackerDB') as Dexie & {
  norms: EntityTable<Norm, 'id'>;
  plans: EntityTable<Plan, 'id'>;
  welders: EntityTable<Welder, 'id'>;
  workEntries: EntityTable<WorkEntry, 'id'>;
};

db.version(1).stores({
  norms: '++id, article, updatedAt',
  plans: '++id, article, completedAt, createdAt, updatedAt',
  welders: '++id, name, updatedAt',
  workEntries: '++id, welderId, planId, article, date, dayType, createdAt, updatedAt',
});

export { db };
