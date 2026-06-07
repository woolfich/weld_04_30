import { create } from 'zustand';

export type Screen = 'main' | 'norms' | 'plan' | 'welder-card';

interface AppState {
  activeScreen: Screen;
  activeWelderId: number | null;

  setActiveScreen: (screen: Screen) => void;
  setActiveWelderId: (id: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'main',
  activeWelderId: null,

  setActiveScreen: (screen) => set({ activeScreen: screen }),
  setActiveWelderId: (id) => set({ activeWelderId: id }),
}));
