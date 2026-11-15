import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmersProvider } from './context/FarmersContext'
import { SupplyPlanningProvider } from './context/SupplyPlanningContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <SupplyPlanningProvider>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </SupplyPlanningProvider>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
