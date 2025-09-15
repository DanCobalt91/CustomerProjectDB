import type { Customer } from '../types'

const LS_KEY = 'cpdb.v1'

// Convert your legacy JSON into our Customer[] schema
function convertLegacyToDb(data: any): Customer[] {
  const now = Date.now().toString(36).slice(-4)
  const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2,9)}${now}`

  const byCustomer: Record<string, Customer> = {}

  for (const p of (data?.projects || [])) {
    const customerName: string = (p.customer ?? 'Unknown').trim()
    if (!byCustomer[customerName]) {
      byCustomer[customerName] = {
        id: uid('cust'),
        name: customerName,
        projects: [],
      }
    }

    byCustomer[customerName].projects.push({
      id: uid('proj'),
      number: String(p.projectCode ?? '').trim(),
      // No legacy project note field; leave undefined
      wos: (p.workOrders || []).map((w: any) => ({
        id: uid('wo'),
        // Normalise to "WOxxxx" (keeps existing "WO" if already present)
        number: String(w.number ?? '').startsWith('WO') ? String(w.number) : `WO${w.number}`,
        type: (w.type === 'Onsite' ? 'Onsite' : 'Build'),
      })),
      pos: [],
    })
  }

  return Object.values(byCustomer)
}

export function loadDb(): Customer[] {
  // 1) Try current saved data
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to load DB', e)
  }

  // 2) Seed (kept minimal)
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
          number: 'P2025-001',
          note: 'Example seeded project note.',
          wos: [
            { id: uid('wo'), number: 'WO11021', type: 'Build', note: 'Line 3 applicator' },
            { id: uid('wo'), number: 'WO11022', type: 'Onsite', note: 'SAT & training' },
          ],
          pos: [
            { id: uid('po'), number: 'PO77231', note: '50% upfront' },
            { id: uid('po'), number: 'PO77232', note: 'Balance' },
          ],
        },
      ],
    },
  ]

  // 3) Merge your legacy list on first load (when no localStorage exists)
  try {
    const legacy = {
      "projects": [
        {"projectCode":"P1403","customer":"Cyan Tech","workOrders":[{"number":"804322","type":"Onsite"},{"number":"804323","type":"Build"},{"number":"807606","type":"Build"}]},
        {"projectCode":"P1545","customer":"Miliken","workOrders":[]},
        {"projectCode":"P1638","customer":"Leprino Foods","workOrders":[{"number":"805234","type":"Build"},{"number":"806317","type":"Onsite"}]},
        {"projectCode":"P1882","customer":"Arla Foods","workOrders":[{"number":"806191","type":"Build"},{"number":"806627","type":"Onsite"},{"number":"806628","type":"Onsite"},{"number":"806946","type":"Build"},{"number":"807611","type":"Onsite"}]},
        {"projectCode":"P1900","customer":"Walkers","workOrders":[{"number":"806274","type":"Onsite"},{"number":"806278","type":"Build"}]},
        {"projectCode":"P1945","customer":"Independent Pharm","workOrders":[{"number":"806421","type":"Build"},{"number":"807063","type":"Onsite"},{"number":"807064","type":"Onsite"},{"number":"807066","type":"Onsite"}]},
        {"projectCode":"P1955","customer":"Pakeeza","workOrders":[{"number":"806473-4","type":"Build"},{"number":"806868","type":"Onsite"}]},
        {"projectCode":"P1968","customer":"Hologic","workOrders":[{"number":"806555","type":"Build"}]},
        {"projectCode":"P1974","customer":"Walkers Charnwood Bakery","workOrders":[{"number":"806593","type":"Build"},{"number":"806612","type":"Onsite"}]},
        {"projectCode":"P1982","customer":"Heinz","workOrders":[{"number":"806633","type":"Build"}]},
        {"projectCode":"P1983","customer":"Eurilait","workOrders":[{"number":"806608","type":"Build"},{"number":"807849","type":"Onsite"}]},
        {"projectCode":"P1984","customer":"Eurilait","workOrders":[{"number":"806609","type":"Build"},{"number":"807848","type":"Onsite"}]},
        {"projectCode":"P2007","customer":"Criminisi","workOrders":[{"number":"806718","type":"Onsite"},{"number":"806719","type":"Build"}]},
        {"projectCode":"P2635","customer":"Pakeeza","workOrders":[{"number":"806858","type":"Build"}]},
        {"projectCode":"P2637","customer":"Unilever","workOrders":[{"number":"806860","type":"Build"}]},
        {"projectCode":"P2697","customer":"Central Foods","workOrders":[{"number":"807134","type":"Onsite"},{"number":"807323","type":"Build"}]},
        {"projectCode":"P2720","customer":"Unilever","workOrders":[{"number":"807248","type":"Build"}]},
        {"projectCode":"P2736","customer":"Dematic - Aldi","workOrders":[{"number":"807380","type":"Build"},{"number":"808009","type":"Onsite"}]},
        {"projectCode":"P2743","customer":"Little Moons","workOrders":[{"number":"807381","type":"Build"},{"number":"807663","type":"Onsite"},{"number":"807787","type":"Onsite"}]},
        {"projectCode":"P2777","customer":"Independent Pharmacy","workOrders":[{"number":"807458","type":"Onsite"},{"number":"807459","type":"Build"},{"number":"807460","type":"Build"},{"number":"807461","type":"Build"}]},
        {"projectCode":"P2781","customer":"Churchill China","workOrders":[{"number":"807453","type":"Onsite"},{"number":"807454","type":"Build"}]},
        {"projectCode":"P2791","customer":"Aston Manor","workOrders":[{"number":"807528","type":"Build"}]},
        {"projectCode":"P2797","customer":"Freidheim - Col Tach","workOrders":[{"number":"807605","type":"Build"}]},
        {"projectCode":"P2798","customer":"Friedheim - Snuggles","workOrders":[{"number":"807607","type":"Build"},{"number":"807608","type":"Build"},{"number":"807988","type":"Onsite"}]},
        {"projectCode":"P2818","customer":"Green Custard","workOrders":[{"number":"807658","type":"Onsite"},{"number":"807659","type":"Build"}]}
      ]
    }
    const merged = convertLegacyToDb(legacy)
    return [...merged, ...seed]
  } catch {
    return seed
  }
}

export function saveDb(db: Customer[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db))
  } catch (e) {
    console.warn('Failed to save DB', e)
  }
}
