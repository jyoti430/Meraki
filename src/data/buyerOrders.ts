import type { BuyerOrder, OrderSpecification } from '../types'

const stamp = (date: string) => new Date(date).toISOString()

export function createSpecification(criteria: OrderSpecification['criteria'], otherDocumentation = ''): OrderSpecification {
  return {
    criteria,
    safetyRequirements: {
      laboratoryReportRequired: true,
      residueTestingRequired: false,
      phytosanitaryDocumentationRequired: true,
      otherDocumentation,
    },
  }
}

function createSeedOrder(order: Omit<BuyerOrder, 'specificationHistory' | 'specificationVersion'>): BuyerOrder {
  return {
    ...order,
    specificationVersion: 1,
    specificationHistory: [{
      version: 1,
      changedAt: order.createdAt,
      changedBy: 'Demo Manager',
      specification: order.specification,
    }],
  }
}

// These orders, counterparties, quantities and dates are synthetic prototype data.
// They are sized for a Rabi 2026–27 pre-sowing planning scenario.
const noDocs = { laboratoryReportRequired: false, residueTestingRequired: false, phytosanitaryDocumentationRequired: false, otherDocumentation: '' }
const exportDocs = (other = '') => ({ laboratoryReportRequired: true, residueTestingRequired: true, phytosanitaryDocumentationRequired: true, otherDocumentation: other })

export const initialBuyerOrders: BuyerOrder[] = [
  createSeedOrder({
    id: 'ORD-DEMO-024',
    buyer: { name: 'Pacific Harvest Trading', contactPerson: 'Maya Chen', email: 'maya@example.test', phone: '+65 6000 0101', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Okra', variety: 'Arka Anamika', requiredQuantityKg: 12000, orderType: 'Confirmed', deliveryStartDate: '2027-02-01', deliveryEndDate: '2027-03-05', preferredGrade: 'Export Grade A' },
    specification: { criteria: [
      { id: 'crit-024-1', attribute: 'Pod length', unit: 'cm', minimum: '8', maximum: '12', required: true, notes: 'Tender pods, picked every 2 days' },
      { id: 'crit-024-2', attribute: 'Visible defects', unit: '%', minimum: '', maximum: '3', required: true, notes: '' },
    ], safetyRequirements: exportDocs('Packing list and certificate of origin') },
    commercial: { packagingType: '5 kg ventilated carton', packagingInstructions: 'Buyer carton marks.', agreedPricePerKg: 82, currency: 'INR', paymentTerms: '30 days from accepted delivery', additionalInstructions: 'Weekly volumes preferred over one large lot.' },
    status: 'Active', createdAt: stamp('2026-11-03T06:25:00Z'), updatedAt: stamp('2026-11-12T08:10:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-025',
    buyer: { name: 'FreshKart Retail (Pune)', contactPerson: 'Neha Kulkarni', email: 'neha@example.test', phone: '+91 90000 10025', destinationCountry: 'India', destinationCityPort: 'Pune DC' },
    product: { crop: 'Okra', variety: 'Arka Anamika', requiredQuantityKg: 8000, orderType: 'Indicative', deliveryStartDate: '2027-02-10', deliveryEndDate: '2027-03-15', preferredGrade: 'Grade A' },
    specification: { criteria: [], safetyRequirements: noDocs },
    commercial: { packagingType: '10 kg crate', packagingInstructions: '', agreedPricePerKg: 34, currency: 'INR', paymentTerms: 'To be confirmed', additionalInstructions: 'Buyer will confirm volume after their January review.' },
    status: 'Active', createdAt: stamp('2026-11-08T09:15:00Z'), updatedAt: stamp('2026-11-08T09:15:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-026',
    buyer: { name: 'Vashi Fresh Commission Agents', contactPerson: 'Sanjay Patil', email: '', phone: '+91 90000 10026', destinationCountry: 'India', destinationCityPort: 'Navi Mumbai APMC' },
    product: { crop: 'Green chilli', variety: 'G-4', requiredQuantityKg: 10000, orderType: 'Confirmed', deliveryStartDate: '2027-02-15', deliveryEndDate: '2027-04-10', preferredGrade: 'Grade A' },
    specification: { criteria: [{ id: 'crit-026-1', attribute: 'Colour', unit: 'description', minimum: '', maximum: '', required: true, notes: 'Dark green, firm' }], safetyRequirements: noDocs },
    commercial: { packagingType: '20 kg mesh bag', packagingInstructions: '', agreedPricePerKg: 40, currency: 'INR', paymentTerms: '7 days from delivery', additionalInstructions: '' },
    status: 'Active', createdAt: stamp('2026-11-05T04:30:00Z'), updatedAt: stamp('2026-11-05T04:30:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-027',
    buyer: { name: 'Harbour Fresh Pte. Ltd.', contactPerson: 'Daniel Lim', email: 'daniel@example.test', phone: '+65 6000 0102', destinationCountry: 'Singapore', destinationCityPort: 'Jurong Port' },
    product: { crop: 'Baby corn', variety: 'G-5 Shweta', requiredQuantityKg: 3000, orderType: 'Confirmed', deliveryStartDate: '2027-02-15', deliveryEndDate: '2027-03-10', preferredGrade: 'Dehusked, export grade' },
    specification: { criteria: [{ id: 'crit-027-1', attribute: 'Cob length', unit: 'cm', minimum: '6', maximum: '10', required: true, notes: '' }], safetyRequirements: exportDocs() },
    commercial: { packagingType: '2 kg punnet in carton', packagingInstructions: 'Cold chain from pack house.', agreedPricePerKg: 135, currency: 'INR', paymentTerms: '30 days from accepted delivery', additionalInstructions: '' },
    status: 'Active', createdAt: stamp('2026-11-10T03:45:00Z'), updatedAt: stamp('2026-11-10T03:45:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-028',
    buyer: { name: 'Harbour Fresh Pte. Ltd.', contactPerson: 'Daniel Lim', email: 'daniel@example.test', phone: '+65 6000 0102', destinationCountry: 'Singapore', destinationCityPort: 'Jurong Port' },
    product: { crop: 'Drumstick', variety: 'PKM-1', requiredQuantityKg: 6000, orderType: 'Indicative', deliveryStartDate: '2027-05-25', deliveryEndDate: '2027-06-30', preferredGrade: 'Export grade, 45–60 cm' },
    specification: { criteria: [], safetyRequirements: exportDocs() },
    commercial: { packagingType: '10 kg carton', packagingInstructions: '', agreedPricePerKg: 120, currency: 'INR', paymentTerms: 'To be confirmed', additionalInstructions: 'Interest confirmed by email; volume not yet committed.' },
    status: 'Active', createdAt: stamp('2026-11-11T07:00:00Z'), updatedAt: stamp('2026-11-11T07:00:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-029',
    buyer: { name: 'Little India Grocers Co.', contactPerson: 'Priya Nair', email: 'priya@example.test', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Bitter gourd', variety: 'Pusa Do Mausami', requiredQuantityKg: 5000, orderType: 'Indicative', deliveryStartDate: '2027-02-05', deliveryEndDate: '2027-03-20', preferredGrade: 'Grade A' },
    specification: { criteria: [], safetyRequirements: exportDocs() },
    commercial: { packagingType: '5 kg carton', packagingInstructions: '', agreedPricePerKg: 70, currency: 'INR', paymentTerms: 'To be confirmed', additionalInstructions: '' },
    status: 'Active', createdAt: stamp('2026-11-12T07:00:00Z'), updatedAt: stamp('2026-11-12T07:00:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-021',
    buyer: { name: 'Pacific Harvest Trading', contactPerson: 'Maya Chen', email: 'maya@example.test', phone: '+65 6000 0101', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Mango', variety: 'Alphonso', requiredQuantityKg: 4200, orderType: 'Confirmed', deliveryStartDate: '2027-04-01', deliveryEndDate: '2027-04-25', preferredGrade: 'Premium export grade' },
    specification: { criteria: [
      { id: 'crit-021-1', attribute: 'Fruit size', unit: 'g', minimum: '220', maximum: '350', required: true, notes: 'Buyer-defined range for this order' },
      { id: 'crit-021-2', attribute: 'Visible defects', unit: '%', minimum: '', maximum: '2', required: true, notes: 'Surface inspection at receipt' },
    ], safetyRequirements: exportDocs('Packing list and certificate of origin') },
    commercial: { packagingType: '5 kg ventilated carton', packagingInstructions: 'Use buyer-provided carton marks.', agreedPricePerKg: 185, currency: 'INR', paymentTerms: '30 days from accepted delivery', additionalInstructions: 'Keep lots separated by harvest date.' },
    status: 'Active', createdAt: stamp('2026-10-20T06:25:00Z'), updatedAt: stamp('2026-11-01T08:10:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-030',
    buyer: { name: 'Pacific Harvest Trading', contactPerson: 'Maya Chen', email: '', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Green chilli', variety: 'Byadgi', requiredQuantityKg: 900, orderType: 'Indicative', deliveryStartDate: '', deliveryEndDate: '', preferredGrade: '' },
    specification: { criteria: [], safetyRequirements: noDocs },
    commercial: { packagingType: '', packagingInstructions: '', agreedPricePerKg: '', currency: 'INR', paymentTerms: '', additionalInstructions: '' },
    status: 'Draft', createdAt: stamp('2026-11-14T07:00:00Z'), updatedAt: stamp('2026-11-14T07:00:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-022',
    buyer: { name: 'Green Lane Produce Co.', contactPerson: 'Aisha Rahman', email: '', phone: '+65 6000 0103', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Mango', variety: 'Kesar', requiredQuantityKg: 2500, orderType: 'Confirmed', deliveryStartDate: '2026-05-10', deliveryEndDate: '2026-05-25', preferredGrade: 'Grade A' },
    specification: { criteria: [{ id: 'crit-022-1', attribute: 'Fruit weight', unit: 'g', minimum: '180', maximum: '280', required: true, notes: '' }], safetyRequirements: exportDocs() },
    commercial: { packagingType: '4 kg carton', packagingInstructions: '', agreedPricePerKg: 172, currency: 'INR', paymentTerms: '15 days from accepted delivery', additionalInstructions: '' },
    status: 'Completed', createdAt: stamp('2026-03-28T04:30:00Z'), updatedAt: stamp('2026-05-28T10:20:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-020',
    buyer: { name: 'Harbour Fresh Pte. Ltd.', contactPerson: 'Daniel Lim', email: 'daniel@example.test', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Jurong Port' },
    product: { crop: 'Okra', variety: 'Arka Anamika', requiredQuantityKg: 1200, orderType: 'Confirmed', deliveryStartDate: '2026-10-20', deliveryEndDate: '2026-10-24', preferredGrade: 'Grade A' },
    specification: { criteria: [{ id: 'crit-020-1', attribute: 'Pod length', unit: 'cm', minimum: '8', maximum: '12', required: true, notes: '' }], safetyRequirements: noDocs },
    commercial: { packagingType: '5 kg crate', packagingInstructions: '', agreedPricePerKg: 92, currency: 'INR', paymentTerms: '15 days from accepted delivery', additionalInstructions: '' },
    status: 'Cancelled', createdAt: stamp('2026-09-12T03:45:00Z'), updatedAt: stamp('2026-09-18T06:00:00Z'),
  }),
]

export const formatOrderDate = (date: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
export const formatOrderDateTime = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
