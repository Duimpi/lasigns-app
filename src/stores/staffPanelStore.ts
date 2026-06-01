import { create } from 'zustand'
import type { JobCard } from '@/types'

interface StaffPanelState {
  isOpen: boolean
  activeTab: 'jobs' | 'updates'
  jobsByWorker: Record<string, JobCard[]>
  setIsOpen: (v: boolean) => void
  setActiveTab: (tab: 'jobs' | 'updates') => void
  setJobsByWorker: (jobs: Record<string, JobCard[]>) => void
  toggle: () => void
}

export const useStaffPanelStore = create<StaffPanelState>((set, get) => ({
  isOpen: false,
  activeTab: 'jobs',
  jobsByWorker: {},
  setIsOpen: (isOpen) => set({ isOpen }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setJobsByWorker: (jobsByWorker) => set({ jobsByWorker }),
  toggle: () => set({ isOpen: !get().isOpen }),
}))
