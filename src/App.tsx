import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmIntelligenceProvider } from './context/FarmIntelligenceContext'
import { FarmersProvider } from './context/FarmersContext'
import { PlanProvider } from './context/PlanContext'
import { LotsProvider } from './context/LotsContext'
import { LabReviewProvider } from './context/LabReviewContext'
import { SupplyPlanningProvider } from './context/SupplyPlanningContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <FarmIntelligenceProvider>
          <SupplyPlanningProvider>
            <LotsProvider>
              <LabReviewProvider>
                <PlanProvider>
                  <AppLayout>
                    <AppRoutes />
                  </AppLayout>
                </PlanProvider>
              </LabReviewProvider>
            </LotsProvider>
          </SupplyPlanningProvider>
        </FarmIntelligenceProvider>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
