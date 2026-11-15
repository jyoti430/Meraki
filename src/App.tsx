import AppRoutes from './routes/AppRoutes'
import AppLayout from './components/layout/AppLayout'
import { BuyerOrdersProvider } from './context/BuyerOrdersContext'
import { FarmersProvider } from './context/FarmersContext'

export default function App() {
  return (
    <BuyerOrdersProvider>
      <FarmersProvider>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
      </FarmersProvider>
    </BuyerOrdersProvider>
  )
}
