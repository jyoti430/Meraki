import type { CropCycle, Farmer, ParticipationRecord, Plot } from '../types'

const time = (value: string) => new Date(value).toISOString()
const optedIn = (date: string) => ({ consented: true, status: 'opted-in' as const, recordedAt: time(date), reason: 'Farmer confirmed participation', notes: '' })
const base = (created: string) => ({ notes: '', createdAt: time(created), updatedAt: time(created) })

// All names, contact numbers, locations, soil readings and production figures below are synthetic demo records.
export const demoFarmers: Farmer[] = [
  { id: 'FPO-DEMO-001', name: 'Anita Patil', phone: '+91 90000 00001', village: 'Khadki', district: 'Pune', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: optedIn('2026-10-10T10:00:00Z'), ...base('2026-09-04T08:00:00Z') },
  { id: 'FPO-DEMO-002', name: 'Ramesh Kumar', phone: '+91 90000 00002', village: 'Nandgaon', district: 'Nashik', state: 'Maharashtra', preferredLanguage: 'Hindi', membershipStatus: 'Active', consent: { ...optedIn('2026-10-18T09:30:00Z'), notes: 'Contact before harvest collection.' }, ...base('2026-09-08T08:00:00Z'), notes: 'Prefers phone contact.' },
  { id: 'FPO-DEMO-003', name: 'Sunita Deshmukh', phone: '+91 90000 00003', village: 'Pimpalgaon', district: 'Nashik', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: { consented: false, status: 'opted-out', recordedAt: time('2026-11-02T07:15:00Z'), reason: 'Unavailable this season', notes: 'Asked to pause supply programme participation.' }, ...base('2026-09-14T08:00:00Z') },
  { id: 'FPO-DEMO-004', name: 'Imran Shaikh', phone: '+91 90000 00004', village: 'Wadgaon', district: 'Pune', state: 'Maharashtra', preferredLanguage: 'Urdu', membershipStatus: 'Inactive', consent: { consented: false, status: 'not-recorded', recordedAt: null, reason: '', notes: '' }, ...base('2026-09-20T08:00:00Z'), notes: 'Membership inactive in this synthetic example.' },
  { id: 'FPO-DEMO-005', name: 'Vijay Jadhav', phone: '+91 90000 00005', village: 'Koregaon', district: 'Satara', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: optedIn('2026-10-12T10:00:00Z'), ...base('2026-09-22T08:00:00Z') },
  { id: 'FPO-DEMO-006', name: 'Lakshmi Pawar', phone: '+91 90000 00006', village: 'Ozar', district: 'Nashik', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: optedIn('2026-10-14T10:00:00Z'), ...base('2026-09-25T08:00:00Z') },
  { id: 'FPO-DEMO-007', name: 'Mohan Gaikwad', phone: '+91 90000 00007', village: 'Saswad', district: 'Pune', state: 'Maharashtra', preferredLanguage: 'Hindi', membershipStatus: 'Active', consent: optedIn('2026-10-15T10:00:00Z'), ...base('2026-09-26T08:00:00Z') },
  { id: 'FPO-DEMO-008', name: 'Savita More', phone: '+91 90000 00008', village: 'Wai', district: 'Satara', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: optedIn('2026-10-16T10:00:00Z'), ...base('2026-09-27T08:00:00Z'), notes: 'Pilot farm for the soil sensor trial.' },
  { id: 'FPO-DEMO-009', name: 'Prakash Shinde', phone: '+91 90000 00009', village: 'Sinnar', district: 'Nashik', state: 'Maharashtra', preferredLanguage: 'Marathi', membershipStatus: 'Active', consent: optedIn('2026-10-20T10:00:00Z'), ...base('2026-09-29T08:00:00Z') },
  { id: 'FPO-DEMO-010', name: 'Rekha Bhosale', phone: '+91 90000 00010', village: 'Jejuri', district: 'Pune', state: 'Maharashtra', preferredLanguage: 'Hindi', membershipStatus: 'Active', consent: { consented: false, status: 'not-recorded', recordedAt: null, reason: '', notes: '' }, ...base('2026-11-01T08:00:00Z'), notes: 'New member – participation not yet discussed.' },
]

const plot = (p: Omit<Plot, 'createdAt' | 'updatedAt' | 'notes' | 'soilReport'> & Partial<Pick<Plot, 'notes' | 'soilReport'>>): Plot => ({ notes: '', soilReport: null, createdAt: time('2026-09-30T08:00:00Z'), updatedAt: time('2026-09-30T08:00:00Z'), ...p })

export const demoPlots: Plot[] = [
  plot({ id: 'PLOT-DEMO-001', farmerId: 'FPO-DEMO-001', name: 'North orchard', villageLocation: 'Khadki, Pune', area: 2.5, areaUnit: 'acre', waterAvailability: 'Limited', irrigationType: 'Drip', soilType: 'Black soil', soilReport: { details: 'Sample report summary: pH and nutrient panel recorded by farmer.', reportDate: '2026-08-12' } }),
  plot({ id: 'PLOT-DEMO-002', farmerId: 'FPO-DEMO-001', name: 'Canal-side plot', villageLocation: 'Khadki, Pune', area: 1.2, areaUnit: 'hectare', waterAvailability: 'Available', irrigationType: 'Furrow', soilType: 'Loamy' }),
  plot({ id: 'PLOT-DEMO-005', farmerId: 'FPO-DEMO-001', name: 'Well plot', villageLocation: 'Khadki, Pune', area: 1.5, areaUnit: 'acre', waterAvailability: 'Available', irrigationType: 'Drip', soilType: 'Red soil' }),
  plot({ id: 'PLOT-DEMO-003', farmerId: 'FPO-DEMO-002', name: 'Upper orchard', villageLocation: 'Nandgaon, Nashik', area: 3, areaUnit: 'acre', waterAvailability: 'Limited', irrigationType: '', soilType: 'Sandy loam', soilReport: { details: 'Sample report reference: DEMO-SOIL-23.', reportDate: '2026-07-20' } }),
  plot({ id: 'PLOT-DEMO-006', farmerId: 'FPO-DEMO-002', name: 'River bank', villageLocation: 'Nandgaon, Nashik', area: 2, areaUnit: 'acre', waterAvailability: 'Available', irrigationType: 'Furrow', soilType: 'Loamy', soilMeasurement: { source: 'Lab test', ph: 6.8, moisturePct: null, measuredAt: '2026-08-02' } }),
  plot({ id: 'PLOT-DEMO-004', farmerId: 'FPO-DEMO-003', name: 'East parcel', villageLocation: 'Pimpalgaon, Nashik', area: 1.75, areaUnit: 'acre', waterAvailability: 'Unknown', irrigationType: '', soilType: '' }),
  plot({ id: 'PLOT-DEMO-007', farmerId: 'FPO-DEMO-005', name: 'Home field', villageLocation: 'Koregaon, Satara', area: 3, areaUnit: 'acre', waterAvailability: 'Limited', irrigationType: 'Drip', soilType: 'Black soil' }),
  plot({ id: 'PLOT-DEMO-008', farmerId: 'FPO-DEMO-005', name: 'Lower field', villageLocation: 'Koregaon, Satara', area: 1.5, areaUnit: 'acre', waterAvailability: 'Unknown', irrigationType: '', soilType: '' }),
  plot({ id: 'PLOT-DEMO-009', farmerId: 'FPO-DEMO-006', name: 'Main plot', villageLocation: 'Ozar, Nashik', area: 2.5, areaUnit: 'acre', waterAvailability: 'Available', irrigationType: 'Sprinkler', soilType: 'Loamy', soilMeasurement: { source: 'Field test kit', ph: 6.5, moisturePct: null, measuredAt: '2026-10-28' } }),
  plot({ id: 'PLOT-DEMO-010', farmerId: 'FPO-DEMO-007', name: 'Roadside field', villageLocation: 'Saswad, Pune', area: 2, areaUnit: 'acre', waterAvailability: 'Limited', irrigationType: '', soilType: 'Sandy loam' }),
  plot({ id: 'PLOT-DEMO-011', farmerId: 'FPO-DEMO-008', name: 'East field', villageLocation: 'Wai, Satara', area: 1, areaUnit: 'hectare', waterAvailability: 'Available', irrigationType: 'Drip', soilType: 'Loamy', soilMeasurement: { source: 'Soil sensor', ph: 6.4, moisturePct: 27, measuredAt: '2026-11-14' } }),
  plot({ id: 'PLOT-DEMO-012', farmerId: 'FPO-DEMO-009', name: 'Tank-side field', villageLocation: 'Sinnar, Nashik', area: 3.5, areaUnit: 'acre', waterAvailability: 'Available', irrigationType: 'Furrow', soilType: 'Black soil' }),
  plot({ id: 'PLOT-DEMO-013', farmerId: 'FPO-DEMO-009', name: 'Dry patch', villageLocation: 'Sinnar, Nashik', area: 1.5, areaUnit: 'acre', waterAvailability: 'None', irrigationType: '', soilType: 'Red soil', notes: 'Rainfed only.' }),
  plot({ id: 'PLOT-DEMO-014', farmerId: 'FPO-DEMO-010', name: 'Family field', villageLocation: 'Jejuri, Pune', area: 2, areaUnit: 'acre', waterAvailability: 'Available', irrigationType: 'Drip', soilType: 'Loamy' }),
]

const cycle = (c: Omit<CropCycle, 'createdAt' | 'updatedAt' | 'notes' | 'waterConstraints' | 'capitalInputConstraints' | 'otherLimitations' | 'previousCrop'> & Partial<CropCycle>): CropCycle => ({ notes: '', waterConstraints: '', capitalInputConstraints: '', otherLimitations: '', previousCrop: '', createdAt: time('2026-10-01T08:00:00Z'), updatedAt: time('2026-10-01T08:00:00Z'), ...c })

export const demoCropCycles: CropCycle[] = [
  cycle({ id: 'CYCLE-DEMO-001', plotId: 'PLOT-DEMO-001', crop: 'Mango', variety: 'Alphonso', plantingDate: '2026-06-01', expectedHarvestStartDate: '2027-03-25', expectedHarvestEndDate: '2027-04-30', estimatedProductionKg: 1800, status: 'Growing', notes: 'Sample estimate only.', waterConstraints: 'Limited water availability in late summer.' }),
  cycle({ id: 'CYCLE-DEMO-002', plotId: 'PLOT-DEMO-002', crop: 'Okra', variety: 'Arka Anamika', plantingDate: '2026-10-15', expectedHarvestStartDate: '2026-12-05', expectedHarvestEndDate: '2027-02-10', estimatedProductionKg: 3800, status: 'Growing', previousCrop: 'Onion' }),
  cycle({ id: 'CYCLE-DEMO-003', plotId: 'PLOT-DEMO-003', crop: 'Mango', variety: 'Kesar', plantingDate: '2026-05-20', expectedHarvestStartDate: '2027-04-05', expectedHarvestEndDate: '2027-05-10', estimatedProductionKg: 2200, status: 'Growing', notes: 'Sample estimate only.' }),
  cycle({ id: 'CYCLE-DEMO-004', plotId: 'PLOT-DEMO-004', crop: 'Onion', variety: 'Local red', plantingDate: '2026-01-04', expectedHarvestStartDate: '2026-04-20', expectedHarvestEndDate: '2026-05-10', estimatedProductionKg: 900, status: 'Harvested' }),
  cycle({ id: 'CYCLE-DEMO-005', plotId: 'PLOT-DEMO-012', crop: 'Cabbage', variety: 'Golden Acre', plantingDate: '2026-09-10', expectedHarvestStartDate: '2026-11-25', expectedHarvestEndDate: '2026-12-15', estimatedProductionKg: 9000, status: 'Growing' }),
  cycle({ id: 'CYCLE-DEMO-006', plotId: 'PLOT-DEMO-010', crop: 'Soybean', variety: 'JS-335', plantingDate: '2026-06-25', expectedHarvestStartDate: '2026-10-10', expectedHarvestEndDate: '2026-10-25', estimatedProductionKg: 1400, status: 'Harvested' }),
]

export const demoParticipationRecords: ParticipationRecord[] = [
  { id: 'PART-DEMO-001', farmerId: 'FPO-DEMO-001', scope: 'supply-programme', scopeId: null, status: 'opted-in', recordedAt: time('2026-10-10T10:00:00Z'), reason: 'Farmer confirmed participation', notes: '' },
  { id: 'PART-DEMO-003', farmerId: 'FPO-DEMO-002', scope: 'supply-programme', scopeId: null, status: 'opted-in', recordedAt: time('2026-10-18T09:30:00Z'), reason: 'Farmer confirmed participation', notes: '' },
  { id: 'PART-DEMO-004', farmerId: 'FPO-DEMO-003', scope: 'supply-programme', scopeId: null, status: 'opted-out', recordedAt: time('2026-11-02T07:15:00Z'), reason: 'Unavailable this season', notes: 'Asked to pause supply programme participation.' },
  ...['005', '006', '007', '008', '009'].map((n, i) => ({ id: `PART-DEMO-0${10 + i}`, farmerId: `FPO-DEMO-${n}`, scope: 'supply-programme' as const, scopeId: null, status: 'opted-in' as const, recordedAt: time(`2026-10-${12 + i}T10:00:00Z`), reason: 'Farmer confirmed participation', notes: '' })),
]
