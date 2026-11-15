import { Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
import BuyerOrders from '../pages/BuyerOrders'
import FarmersPlots from '../pages/FarmersPlots'
import SupplyPlanning from '../pages/SupplyPlanning'
import LotsInspection from '../pages/LotsInspection'
import LabReleaseReview from '../pages/LabReleaseReview'
import CratesShipments from '../pages/CratesShipments'
import ArrivalClaims from '../pages/ArrivalClaims'
import FarmerSettlements from '../pages/FarmerSettlements'
import BuyerOrderForm from '../pages/BuyerOrderForm'
import BuyerOrderDetails from '../pages/BuyerOrderDetails'
import FarmerForm from '../pages/FarmerForm'
import FarmerDetails from '../pages/FarmerDetails'
import PlotForm from '../pages/PlotForm'
import PlotDetails from '../pages/PlotDetails'
import CropCycleForm from '../pages/CropCycleForm'
import CropCycleDetails from '../pages/CropCycleDetails'
import SupplyPlanCreate from '../pages/SupplyPlanCreate'
import SupplyPlanPreview from '../pages/SupplyPlanPreview'
import SupplyPlanDetails from '../pages/SupplyPlanDetails'
import LotReceive from '../pages/LotReceive'
import LotDetails from '../pages/LotDetails'
import LabReviewDetails from '../pages/LabReviewDetails'

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/buyer-orders" element={<BuyerOrders />} />
    <Route path="/buyer-orders/new" element={<BuyerOrderForm />} />
    <Route path="/buyer-orders/:orderId/edit" element={<BuyerOrderForm />} />
    <Route path="/buyer-orders/:orderId" element={<BuyerOrderDetails />} />
    <Route path="/farmers-plots" element={<FarmersPlots />} />
    <Route path="/farmers-plots/new" element={<FarmerForm />} />
    <Route path="/farmers-plots/:farmerId/edit" element={<FarmerForm />} />
    <Route path="/farmers-plots/:farmerId" element={<FarmerDetails />} />
    <Route path="/plots/new" element={<PlotForm />} />
    <Route path="/plots/:plotId/edit" element={<PlotForm />} />
    <Route path="/plots/:plotId" element={<PlotDetails />} />
    <Route path="/crop-cycles/new" element={<CropCycleForm />} />
    <Route path="/crop-cycles/:cycleId/edit" element={<CropCycleForm />} />
    <Route path="/crop-cycles/:cycleId" element={<CropCycleDetails />} />
    <Route path="/supply-planning" element={<SupplyPlanning />} />
    <Route path="/supply-planning/new" element={<SupplyPlanCreate />} />
    <Route path="/supply-planning/preview" element={<SupplyPlanPreview />} />
    <Route path="/supply-planning/:planId" element={<SupplyPlanDetails />} />
    <Route path="/lots-inspection" element={<LotsInspection />} />
    <Route path="/lots-inspection/receive" element={<LotReceive />} />
    <Route path="/lots-inspection/:lotId" element={<LotDetails />} />
    <Route path="/lab-release-review" element={<LabReleaseReview />} />
    <Route path="/lab-release-review/:lotId" element={<LabReviewDetails />} />
    <Route path="/crates-shipments" element={<CratesShipments />} />
    <Route path="/arrival-claims" element={<ArrivalClaims />} />
    <Route path="/farmer-settlements" element={<FarmerSettlements />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
