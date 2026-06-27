'use client';

import React, { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkEntry, type Welder } from '@/lib/db';
import { getTodayStr, formatQtyShort, roundToHundredths, sortByUpdatedDesc } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface WelderDayEntry {
  welderId: number;
  welderName: string;
  articles: { article: string; qty: number }[];
  totalQty: number;
}

export function DailyScreen() {
  const { setActiveScreen } = useAppStore();

  const welders = useLiveQuery(() => db.welders.toArray(), []) || [];
  const workEntries = useLiveQuery(() => db.workEntries.toArray(), []) || [];

  const today = getTodayStr();

  // Filter today's entries and group by welder → article
  const dailySummary = useMemo((): WelderDayEntry[] => {
    const todayEntries = workEntries.filter(e => e.date === today);
    if (todayEntries.length === 0) return [];

    const welderMap = new Map<number, WelderDayEntry>();

    for (const entry of todayEntries) {
      const welder = welders.find(w => w.id === entry.welderId);
      if (!welder) continue;

      const existing = welderMap.get(entry.welderId);
      if (existing) {
        // Add or update article
        const articleIdx = existing.articles.findIndex(a => a.article === entry.article);
        if (articleIdx >= 0) {
          existing.articles[articleIdx].qty = roundToHundredths(existing.articles[articleIdx].qty + entry.quantity);
        } else {
          existing.articles.push({ article: entry.article, qty: entry.quantity });
        }
        existing.totalQty = roundToHundredths(existing.totalQty + entry.quantity);
      } else {
        welderMap.set(entry.welderId, {
          welderId: entry.welderId,
          welderName: welder.name,
          articles: [{ article: entry.article, qty: entry.quantity }],
          totalQty: entry.quantity,
        });
      }
    }

    // Sort by most recently updated welder
    const sorted = Array.from(welderMap.values());
    return sorted.sort((a, b) => {
      const aLast = workEntries
        .filter(e => e.welderId === a.welderId && e.date === today)
        .sort((x, y) => new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime())[0];
      const bLast = workEntries
        .filter(e => e.welderId === b.welderId && e.date === today)
        .sort((x, y) => new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime())[0];
      if (!aLast || !bLast) return 0;
      return new Date(bLast.updatedAt).getTime() - new Date(aLast.updatedAt).getTime();
    });
  }, [workEntries, welders, today]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveScreen('main')}
            className="flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground active:bg-accent rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-semibold">Сводка за день</h1>
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(today + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {dailySummary.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Нет записей за сегодня
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dailySummary.map((item) => (
              <div key={item.welderId} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm">{item.welderName}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.articles.length} арт. · {formatQtyShort(item.totalQty)} шт
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.articles.map((a) => (
                    <div
                      key={a.article}
                      className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="font-mono text-xs font-semibold">{a.article}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="font-mono text-xs">{formatQtyShort(a.qty)} шт</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
