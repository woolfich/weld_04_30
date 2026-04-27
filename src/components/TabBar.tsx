'use client';

import React from 'react';
import { useAppStore, type Screen } from '@/lib/store';
import { Home, ClipboardList, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs: { id: Screen; label: string; icon: React.ReactNode }[] = [
  { id: 'main', label: 'Главная', icon: <Home className="w-5 h-5" /> },
  { id: 'norms', label: 'Нормы', icon: <ClipboardList className="w-5 h-5" /> },
  { id: 'plan', label: 'План', icon: <Target className="w-5 h-5" /> },
];

export function TabBar() {
  const { activeScreen, setActiveScreen, setActiveWelderId } = useAppStore();

  const handleTabClick = (id: Screen) => {
    setActiveWelderId(null);
    setActiveScreen(id);
  };

  // КС (welder-card) is a sub-screen of Главная, so highlight Главная when on КС
  const effectiveScreen = activeScreen === 'welder-card' ? 'main' : activeScreen;

  return (
    <nav className="flex-shrink-0 bg-card border-t border-border flex items-center justify-around h-14 safe-area-bottom">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => handleTabClick(tab.id)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
            effectiveScreen === tab.id
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.icon}
          <span className="text-[10px]">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
