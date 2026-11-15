type Opportunity = { crop: string; variety: string; grade: string; grade_protocol: string; quantity_g: number; delivery_start: string; delivery_end: string; bids: { organisation_id: string; capacity_id?: string; status: string }[] }
type Candidate = { id: string; crop: string; variety?: string; grade: string; grade_protocol?: string; available_g: number; consented?: boolean; reviewed?: boolean; delivery_start?: string; delivery_end?: string }

/** Selection aid only; server adapters independently revalidate/reserve eligibility. */
export function forwardCapacityOptions<T extends Candidate>(auction: Opportunity, capacities: T[], organisation: string): T[] {
  return capacities.filter((capacity) => {
    const ownReservation = auction.bids.some((bid) => bid.organisation_id === organisation && bid.capacity_id === capacity.id && bid.status === 'active') ? auction.quantity_g : 0
    return capacity.consented === true && capacity.reviewed === true && capacity.crop === auction.crop && capacity.variety === auction.variety && capacity.grade === auction.grade && capacity.grade_protocol === auction.grade_protocol && capacity.available_g + ownReservation >= auction.quantity_g &&
      new Date(capacity.delivery_start || '').getTime() <= new Date(auction.delivery_start).getTime() && new Date(capacity.delivery_end || '').getTime() >= new Date(auction.delivery_end).getTime()
  })
}
