import { create } from 'zustand';

export type Screen = 'main' | 'norms' | 'plan' | 'welder-card';

interface AppState {
  activeScreen: Screen;
  activeWelderId: number | null;
  sbActive: boolean;
  vsActive: boolean;

  setActiveScreen: (screen: Screen) => void;
  setActiveWelderId: (id: number | null) => void;
  toggleSb: () => void;
  toggleVs: () => void;
  resetDayFlags: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeScreen: 'main',
  activeWelderId: null,
  sbActive: false,
  vsActive: false,

  setActiveScreen: (screen) => set({ activeScreen: screen }),
  setActiveWelderId: (id) => set({ activeWelderId: id }),
  toggleSb: () => set({ sbActive: !get().sbActive }),
  toggleVs: () => set({ vsActive: !get().vsActive }),
  resetDayFlags: () => set({ sbActive: false, vsActive: false }),
}));
