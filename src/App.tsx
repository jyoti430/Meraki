import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmersProvider } from './context/FarmersContext'
import { SupplyPlanningProvider } from './context/SupplyPlanningContext'
import { LotsProvider } from './context/LotsContext'
import { LabReviewProvider } from './context/LabReviewContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <SupplyPlanningProvider>
          <LotsProvider>
            <LabReviewProvider>
              <AppLayout>
                <AppRoutes />
              </AppLayout>
            </LabReviewProvider>
          </LotsProvider>
        </SupplyPlanningProvider>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
