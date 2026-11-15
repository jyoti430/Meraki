import type { BuyerOrder, OrderSpecification } from '../types'

const stamp = (date: string) => new Date(date).toISOString()

function createSpecification(criteria: OrderSpecification['criteria'], otherDocumentation = ''): OrderSpecification {
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
export const initialBuyerOrders: BuyerOrder[] = [
  createSeedOrder({
    id: 'ORD-DEMO-024',
    buyer: { name: 'Pacific Harvest Trading', contactPerson: 'Maya Chen', email: 'maya@example.test', phone: '+65 6000 0101', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Mango', variety: 'Alphonso', requiredQuantityKg: 4200, orderType: 'Confirmed', deliveryStartDate: '2026-12-04', deliveryEndDate: '2026-12-10', preferredGrade: 'Premium export grade' },
    specification: createSpecification([
      { id: 'crit-024-1', attribute: 'Fruit size', unit: 'g', minimum: '220', maximum: '350', required: true, notes: 'Buyer-defined range for this order' },
      { id: 'crit-024-2', attribute: 'Visible defects', unit: '%', minimum: '', maximum: '2', required: true, notes: 'Surface inspection at receipt' },
      { id: 'crit-024-3', attribute: 'Maturity', unit: 'stage', minimum: '2', maximum: '3', required: false, notes: '' },
    ], 'Packing list and certificate of origin'),
    commercial: { packagingType: '5 kg ventilated carton', packagingInstructions: 'Use buyer-provided carton marks.', agreedPricePerKg: 185, currency: 'INR', paymentTerms: '30 days from accepted delivery', additionalInstructions: 'Keep lots separated by harvest date.' },
    status: 'Active', createdAt: stamp('2026-11-12T06:25:00Z'), updatedAt: stamp('2026-11-14T08:10:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-023',
    buyer: { name: 'Harbour Fresh Pte. Ltd.', contactPerson: 'Daniel Lim', email: 'daniel@example.test', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Jurong Port' },
    product: { crop: 'Okra', variety: 'Arka Anamika', requiredQuantityKg: 1800, orderType: 'Indicative', deliveryStartDate: '2026-12-08', deliveryEndDate: '2026-12-12', preferredGrade: 'Grade A' },
    specification: createSpecification([
      { id: 'crit-023-1', attribute: 'Pod length', unit: 'cm', minimum: '8', maximum: '12', required: true, notes: 'Buyer-defined range for this order' },
      { id: 'crit-023-2', attribute: 'Colour', unit: 'description', minimum: '', maximum: '', required: true, notes: 'Uniform green appearance' },
    ]),
    commercial: { packagingType: '5 kg crate', packagingInstructions: 'Food-contact safe liners.', agreedPricePerKg: '', currency: 'INR', paymentTerms: 'To be confirmed', additionalInstructions: '' },
    status: 'Active', createdAt: stamp('2026-11-11T09:15:00Z'), updatedAt: stamp('2026-11-13T12:40:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-022',
    buyer: { name: 'Green Lane Produce Co.', contactPerson: 'Aisha Rahman', email: '', phone: '+65 6000 0103', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Mango', variety: 'Kesar', requiredQuantityKg: 2500, orderType: 'Confirmed', deliveryStartDate: '2026-11-22', deliveryEndDate: '2026-11-27', preferredGrade: 'Grade A' },
    specification: createSpecification([{ id: 'crit-022-1', attribute: 'Fruit weight', unit: 'g', minimum: '180', maximum: '280', required: true, notes: '' }]),
    commercial: { packagingType: '4 kg carton', packagingInstructions: '', agreedPricePerKg: 172, currency: 'INR', paymentTerms: '15 days from accepted delivery', additionalInstructions: '' },
    status: 'Completed', createdAt: stamp('2026-10-28T04:30:00Z'), updatedAt: stamp('2026-11-09T10:20:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-021',
    buyer: { name: 'Pacific Harvest Trading', contactPerson: 'Maya Chen', email: 'maya@example.test', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Singapore Port' },
    product: { crop: 'Green chilli', variety: 'Byadgi', requiredQuantityKg: 900, orderType: 'Indicative', deliveryStartDate: '', deliveryEndDate: '', preferredGrade: '' },
    specification: createSpecification([]),
    commercial: { packagingType: '', packagingInstructions: '', agreedPricePerKg: '', currency: 'INR', paymentTerms: '', additionalInstructions: '' },
    status: 'Draft', createdAt: stamp('2026-11-14T07:00:00Z'), updatedAt: stamp('2026-11-14T07:00:00Z'),
  }),
  createSeedOrder({
    id: 'ORD-DEMO-020',
    buyer: { name: 'Harbour Fresh Pte. Ltd.', contactPerson: 'Daniel Lim', email: 'daniel@example.test', phone: '', destinationCountry: 'Singapore', destinationCityPort: 'Jurong Port' },
    product: { crop: 'Okra', variety: 'Arka Anamika', requiredQuantityKg: 1200, orderType: 'Confirmed', deliveryStartDate: '2026-10-20', deliveryEndDate: '2026-10-24', preferredGrade: 'Grade A' },
    specification: createSpecification([{ id: 'crit-020-1', attribute: 'Pod length', unit: 'cm', minimum: '8', maximum: '12', required: true, notes: '' }]),
    commercial: { packagingType: '5 kg crate', packagingInstructions: '', agreedPricePerKg: 92, currency: 'INR', paymentTerms: '15 days from accepted delivery', additionalInstructions: '' },
    status: 'Cancelled', createdAt: stamp('2026-10-12T03:45:00Z'), updatedAt: stamp('2026-10-18T06:00:00Z'),
  }),
]

export const formatOrderDate = (date: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
export const formatOrderDateTime = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
