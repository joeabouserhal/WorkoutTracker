import { create } from 'zustand'

type DataRefreshState = {
  version: number
  bumpDataVersion: () => void
}

export const useDataRefreshStore = create<DataRefreshState>()((set) => ({
  version: 0,
  bumpDataVersion: () => set((state) => ({ version: state.version + 1 })),
}))
