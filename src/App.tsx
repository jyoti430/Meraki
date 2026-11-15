import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmersProvider } from './context/FarmersContext'
import { PlanProvider } from './context/PlanContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <PlanProvider>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </PlanProvider>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
