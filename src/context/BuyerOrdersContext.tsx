import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { initialBuyerOrders } from '../data/buyerOrders'
import type { BuyerOrder, BuyerOrderStatus, OrderSpecification } from '../types'

type BuyerOrderInput = Omit<BuyerOrder, 'id' | 'createdAt' | 'updatedAt' | 'specificationVersion' | 'specificationHistory' | 'status'>

type BuyerOrdersContextValue = {
  orders: BuyerOrder[]
  createOrder: (input: BuyerOrderInput, status: 'Draft' | 'Active') => BuyerOrder
  updateOrder: (id: string, input: BuyerOrderInput) => void
  updateStatus: (id: string, status: BuyerOrderStatus) => void
}

const STORAGE_KEY = 'nexus-supply-buyer-orders-v1'
const BuyerOrdersContext = createContext<BuyerOrdersContextValue | null>(null)

function loadOrders(): BuyerOrder[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed as BuyerOrder[]
    }
  } catch {
    // If local storage is unavailable or malformed, use the in-repo synthetic examples.
  }
  return initialBuyerOrders
}

const now = () => new Date().toISOString()
const copySpecification = (specification: OrderSpecification): OrderSpecification => JSON.parse(JSON.stringify(specification)) as OrderSpecification

export function BuyerOrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<BuyerOrder[]>(loadOrders)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
    } catch {
      // The UI remains usable for this session when storage is unavailable.
    }
  }, [orders])

  const value = useMemo<BuyerOrdersContextValue>(() => ({
    orders,
    createOrder(input, status) {
      const nextNumber = Math.max(24, ...orders.map((order) => Number(order.id.match(/(\d+)$/)?.[1] ?? 0))) + 1
      const timestamp = now()
      const id = `ORD-DEMO-${String(nextNumber).padStart(3, '0')}`
      const specification = copySpecification(input.specification)
      const order: BuyerOrder = {
        ...input,
        id,
        status,
        createdAt: timestamp,
        updatedAt: timestamp,
        specificationVersion: 1,
        specificationHistory: [{ version: 1, changedAt: timestamp, changedBy: 'Demo Manager', specification }],
      }
      setOrders((current) => [order, ...current])
      return order
    },
    updateOrder(id, input) {
      const timestamp = now()
      setOrders((current) => current.map((order) => {
        if (order.id !== id) return order
        const changed = JSON.stringify(order.specification) !== JSON.stringify(input.specification)
        const version = order.specificationVersion + (changed ? 1 : 0)
        const specification = copySpecification(input.specification)
        return {
          ...order,
          ...input,
          updatedAt: timestamp,
          specificationVersion: version,
          specificationHistory: changed
            ? [...order.specificationHistory, { version, changedAt: timestamp, changedBy: 'Demo Manager', specification }]
            : order.specificationHistory,
        }
      }))
    },
    updateStatus(id, status) {
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status, updatedAt: now() } : order))
    },
  }), [orders])

  return <BuyerOrdersContext.Provider value={value}>{children}</BuyerOrdersContext.Provider>
}

export function useBuyerOrders() {
  const context = useContext(BuyerOrdersContext)
  if (!context) throw new Error('useBuyerOrders must be used inside BuyerOrdersProvider')
  return context
}
