import { Navigate, Route, Routes } from 'react-router-dom'
import Overview from '../pages/Overview'
import BuyerOrders from '../pages/BuyerOrders'
import FarmersPlots from '../pages/FarmersPlots'
import PlantingPlan from '../pages/PlantingPlan'
import Messages from '../pages/Messages'
import LaterModules from '../pages/LaterModules'
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

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Overview />} />
    <Route path="/demand" element={<BuyerOrders />} />
    <Route path="/plan" element={<PlantingPlan />} />
    <Route path="/farmers" element={<FarmersPlots />} />
    <Route path="/messages" element={<Messages />} />
    <Route path="/later" element={<LaterModules />} />
    {/* Previous URLs keep working */}
    <Route path="/buyer-orders" element={<Navigate to="/demand" replace />} />
    <Route path="/supply-planning" element={<Navigate to="/plan" replace />} />
    <Route path="/farmers-plots" element={<Navigate to="/farmers" replace />} />
    <Route path="/buyer-orders/new" element={<BuyerOrderForm />} />
    <Route path="/buyer-orders/:orderId/edit" element={<BuyerOrderForm />} />
    <Route path="/buyer-orders/:orderId" element={<BuyerOrderDetails />} />
    <Route path="/farmers-plots/new" element={<FarmerForm />} />
    <Route path="/farmers-plots/:farmerId/edit" element={<FarmerForm />} />
    <Route path="/farmers-plots/:farmerId" element={<FarmerDetails />} />
    <Route path="/plots/new" element={<PlotForm />} />
    <Route path="/plots/:plotId/edit" element={<PlotForm />} />
    <Route path="/plots/:plotId" element={<PlotDetails />} />
    <Route path="/crop-cycles/new" element={<CropCycleForm />} />
    <Route path="/crop-cycles/:cycleId/edit" element={<CropCycleForm />} />
    <Route path="/crop-cycles/:cycleId" element={<CropCycleDetails />} />
    {/* Post-harvest modules: retained, not in primary navigation */}
    <Route path="/lots-inspection" element={<LotsInspection />} />
    <Route path="/lab-release-review" element={<LabReleaseReview />} />
    <Route path="/crates-shipments" element={<CratesShipments />} />
    <Route path="/arrival-claims" element={<ArrivalClaims />} />
    <Route path="/farmer-settlements" element={<FarmerSettlements />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
