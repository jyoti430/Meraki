import { Navigate, Route, Routes } from 'react-router-dom'
import { TradeProvider, TradeBoardPage, TradeAuctionPage, TradeContractsPage, TradeLotsPage, TradeReviewPage, TradeShipmentsPage, TradeArrivalsPage, TradeSettlementsPage, TradeRequirementsPage, TradeRequirementDetailsPage } from '../trade'

export default function TradeRoutes() {
  return <TradeProvider><Routes>
    <Route index element={<TradeBoardPage />} />
    <Route path="requirements" element={<TradeRequirementsPage />} />
    <Route path="requirements/:requirementId" element={<TradeRequirementDetailsPage />} />
    <Route path="auctions/:auctionId" element={<TradeAuctionPage />} />
    <Route path="contracts" element={<TradeContractsPage />} />
    <Route path="contracts/:contractId" element={<TradeContractsPage />} />
    <Route path="lots" element={<TradeLotsPage />} />
    <Route path="review" element={<TradeReviewPage />} />
    <Route path="shipments" element={<TradeShipmentsPage />} />
    <Route path="arrivals" element={<TradeArrivalsPage />} />
    <Route path="settlements" element={<TradeSettlementsPage />} />
    <Route path="*" element={<Navigate to="/trade" replace />} />
  </Routes></TradeProvider>
}
