'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import { TabBar } from '@/components/TabBar';
import { MainScreen } from '@/components/MainScreen';
import { NormsScreen } from '@/components/NormsScreen';
import { PlanScreen } from '@/components/PlanScreen';
import { WelderCardScreen } from '@/components/WelderCardScreen';

export default function Home() {
  const { activeScreen } = useAppStore();

  const renderScreen = () => {
    switch (activeScreen) {
      case 'main':
        return <MainScreen />;
      case 'norms':
        return <NormsScreen />;
      case 'plan':
        return <PlanScreen />;
      case 'welder-card':
        return <WelderCardScreen />;
      default:
        return <MainScreen />;
    }
  };

  return (
    <div className="flex flex-col h-screen-dvh bg-background">
      {/* Main content area - fills remaining space */}
      <main className="flex-1 overflow-hidden">
        {renderScreen()}
      </main>

      {/* Bottom tab bar - stays at bottom */}
      <TabBar />
    </div>
  );
}
