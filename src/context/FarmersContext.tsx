import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CropCycle, Farmer, Plot } from '../types'
import {
  createCropCycle, createFarmer, createPlot, loadFarmersData, persistFarmersData, recordParticipation,
  setFarmerMembership, updateCropCycle, updateFarmer, updatePlot,
} from '../services/FarmersService'
import type { CropCycleInput, FarmerInput, FarmersData, ParticipationInput, PlotInput } from '../services/FarmersService'

type FarmersContextValue = {
  data: FarmersData
  addFarmer: (input: FarmerInput) => Farmer
  editFarmer: (farmerId: string, input: FarmerInput) => void
  changeMembership: (farmerId: string, status: Farmer['membershipStatus']) => void
  addPlot: (input: PlotInput) => Plot
  editPlot: (plotId: string, input: PlotInput) => void
  addCropCycle: (input: CropCycleInput) => CropCycle
  editCropCycle: (cycleId: string, input: CropCycleInput) => void
  addParticipation: (input: ParticipationInput) => void
}

const FarmersContext = createContext<FarmersContextValue | null>(null)

export function FarmersProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FarmersData>(loadFarmersData)

  useEffect(() => persistFarmersData(data), [data])

  const value = useMemo<FarmersContextValue>(() => ({
    data,
    addFarmer(input) {
      const result = createFarmer(data, input)
      setData(result.data)
      return result.farmer
    },
    editFarmer(farmerId, input) { setData((current) => updateFarmer(current, farmerId, input)) },
    changeMembership(farmerId, status) { setData((current) => setFarmerMembership(current, farmerId, status)) },
    addPlot(input) {
      const result = createPlot(data, input)
      setData(result.data)
      return result.plot
    },
    editPlot(plotId, input) { setData((current) => updatePlot(current, plotId, input)) },
    addCropCycle(input) {
      const result = createCropCycle(data, input)
      setData(result.data)
      return result.cropCycle
    },
    editCropCycle(cycleId, input) { setData((current) => updateCropCycle(current, cycleId, input)) },
    addParticipation(input) {
      const result = recordParticipation(data, input)
      setData(result.data)
    },
  }), [data])

  return <FarmersContext.Provider value={value}>{children}</FarmersContext.Provider>
}

export function useFarmers() {
  const context = useContext(FarmersContext)
  if (!context) throw new Error('useFarmers must be used inside FarmersProvider')
  return context
}
