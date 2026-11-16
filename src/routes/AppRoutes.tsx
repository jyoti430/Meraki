import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Overview from '../pages/Overview'
import LiveSensors from '../pages/LiveSensors'
import BuyerOrders from '../pages/BuyerOrders'
import FarmersPlots from '../pages/FarmersPlots'
import FarmIntelligence from '../pages/FarmIntelligence'
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
import SupplyPlanning from '../pages/SupplyPlanning'
import SupplyPlanCreate from '../pages/SupplyPlanCreate'
import SupplyPlanPreview from '../pages/SupplyPlanPreview'
import SupplyPlanDetails from '../pages/SupplyPlanDetails'
import LotReceive from '../pages/LotReceive'
import LotDetails from '../pages/LotDetails'
import LabReviewDetails from '../pages/LabReviewDetails'
import SegmentSelection from '../exporter/pages/SegmentSelection'
import ExporterLayout from '../exporter/layout/ExporterLayout'
import ExporterDashboard from '../exporter/pages/Dashboard'
import ExporterRequirements from '../exporter/pages/Requirements'
import ExporterRequirementForm from '../exporter/pages/RequirementForm'
import ExporterRequirementDetails from '../exporter/pages/RequirementDetails'
import ExporterMarketplace from '../exporter/pages/Marketplace'
import ExporterOrders from '../exporter/pages/Orders'
import { useI18n } from '../i18n'
const TradeRoutes = lazy(() => import('./TradeRoutes'))
const LiveData = lazy(() => import('../pages/LiveData'))

export default function AppRoutes() {
  const { t } = useI18n()
  return <Routes>
    <Route path="/" element={<SegmentSelection />} />
    <Route path="/fpo" element={<Overview />} />
    <Route path="/exporter" element={<ExporterLayout><ExporterDashboard /></ExporterLayout>} />
    <Route path="/exporter/requirements" element={<ExporterLayout><ExporterRequirements /></ExporterLayout>} />
    <Route path="/exporter/requirements/new" element={<ExporterLayout><ExporterRequirementForm /></ExporterLayout>} />
    <Route path="/exporter/requirements/:requirementId/edit" element={<ExporterLayout><ExporterRequirementForm /></ExporterLayout>} />
    <Route path="/exporter/requirements/:requirementId" element={<ExporterLayout><ExporterRequirementDetails /></ExporterLayout>} />
    <Route path="/exporter/marketplace" element={<ExporterLayout><ExporterMarketplace /></ExporterLayout>} />
    <Route path="/exporter/orders" element={<ExporterLayout><ExporterOrders /></ExporterLayout>} />
    <Route path="/sensors" element={<LiveSensors />} />
    <Route path="/demand" element={<BuyerOrders />} />
    <Route path="/plan" element={<PlantingPlan />} />
    <Route path="/farmers" element={<FarmersPlots />} />
    <Route path="/farm-intelligence" element={<FarmIntelligence />} />
    <Route path="/live-data" element={<Suspense fallback={<p className="m-page" role="status">{t('loading_public')}</p>}><LiveData /></Suspense>} />
    <Route path="/messages" element={<Messages />} />
    <Route path="/later" element={<LaterModules />} />
    <Route path="/trade/*" element={<Suspense fallback={<p className="m-page" role="status">{t('loading_trade')}</p>}><TradeRoutes /></Suspense>} />
    {/* Previous URLs keep working */}
    <Route path="/buyer-orders" element={<Navigate to="/demand" replace />} />
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
    {/* Order reservations: reserve estimates from crops already growing against one buyer order */}
    <Route path="/supply-planning" element={<SupplyPlanning />} />
    <Route path="/supply-planning/new" element={<SupplyPlanCreate />} />
    <Route path="/supply-planning/preview" element={<SupplyPlanPreview />} />
    <Route path="/supply-planning/:planId" element={<SupplyPlanDetails />} />
    {/* Post-harvest modules: retained, not in primary navigation */}
    <Route path="/lots-inspection" element={<LotsInspection />} />
    <Route path="/lots-inspection/receive" element={<LotReceive />} />
    <Route path="/lots-inspection/:lotId" element={<LotDetails />} />
    <Route path="/lab-release-review/:lotId" element={<LabReviewDetails />} />
    <Route path="/lab-release-review" element={<LabReleaseReview />} />
    <Route path="/crates-shipments" element={<CratesShipments />} />
    <Route path="/arrival-claims" element={<ArrivalClaims />} />
    <Route path="/farmer-settlements" element={<FarmerSettlements />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
