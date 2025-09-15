import type { Customer } from '../types'

const LS_KEY = 'cpdb.v1'

export function loadDb(): Customer[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to load DB', e)
  }
  // Seed
  const now = Date.now().toString(36).slice(-4)
  const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2,9)}${now}`
  const seed: Customer[] = [
    {
      id: uid('cust'),
      name: 'Acme Logistics',
      address: '1 Industrial Way, Manchester',
      contactName: 'S. Ramos',
      contactPhone: '+44 161 555 0101',
      contactEmail: 's.ramos@acmelog.co.uk',
      projects: [
        {
          id: uid('proj'),
          number: 'PRJ-2025-001',
          wos: [
            { id: uid('wo'), number: 'WO-11021', type: 'Build', note: 'Line 3 applicator' },
            { id: uid('wo'), number: 'WO-11022', type: 'Onsite', note: 'SAT & training' },
          ],
          pos: [
            { id: uid('po'), number: 'PO-77231', note: '50% upfront' },
            { id: uid('po'), number: 'PO-77232', note: 'Balance' },
          ],
        },
      ],
    },
    {
      id: uid('cust'),
      name: 'Cobalt Systems',
      address: 'Unit 5, Tech Park, Stoke-on-Trent',
      contactName: 'Daniel Taylor',
      contactPhone: '+44 1782 555 0202',
      contactEmail: 'daniel@cobalt.example',
      projects: [
        {
          id: uid('proj'),
          number: 'PRJ-PA-0042',
          wos: [ { id: uid('wo'), number: 'WO-65400', type: 'Build' } ],
          pos: [],
        },
      ],
    },
  ]
  return seed
}

export function saveDb(db: Customer[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db))
  } catch (e) {
    console.warn('Failed to save DB', e)
  }
}

export function resetDemo(setter: (c: Customer[]) => void) {
  localStorage.removeItem(LS_KEY)
  setter(loadDb())
}
