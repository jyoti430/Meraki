import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmIntelligenceProvider } from './context/FarmIntelligenceContext'
import { FarmersProvider } from './context/FarmersContext'
import { PlanProvider } from './context/PlanContext'
import { SupplyPlanningProvider } from './context/SupplyPlanningContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <FarmIntelligenceProvider>
          <SupplyPlanningProvider>
            <PlanProvider>
              <AppLayout>
                <AppRoutes />
              </AppLayout>
            </PlanProvider>
          </SupplyPlanningProvider>
        </FarmIntelligenceProvider>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
