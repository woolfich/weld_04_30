'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkEntry, type Plan, type Norm } from '@/lib/db';
import {
  normalizeArticle, formatQty, formatQtyShort, getTodayStr, getSaturdayStr, getSundayStr,
  calcHours, formatDate, getShortDayName, parseQty,
  DAILY_HOURS_LIMIT, addDays, getNextWorkday, getDayTypeForDate, isWeekend
} from '@/lib/utils';
import { LongPressWrapper } from '@/components/LongPressWrapper';
import { AutoComplete } from '@/components/AutoComplete';
import { useAppStore } from '@/lib/store';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DayGroup {
  date: string;
  dayType: 'workday' | 'sb' | 'vs';
  entries: (WorkEntry & { normHours?: number })[];
  totalHours: number;
}

export function WelderCardScreen() {
  const { activeWelderId, setActiveWelderId, setActiveScreen } = useAppStore();

  const [articleInput, setArticleInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [showArticleInfo, setShowArticleInfo] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; entry: WorkEntry | null }>({ open: false, entry: null });
  const [editQty, setEditQty] = useState('');
  const [planCompleteMsg, setPlanCompleteMsg] = useState('');

  const welder = useLiveQuery(
    () => activeWelderId ? db.welders.get(activeWelderId) : undefined,
    [activeWelderId]
  );

  const workEntries = useLiveQuery(
    () => activeWelderId ? db.workEntries.where('welderId').equals(activeWelderId).toArray() : [],
    [activeWelderId]
  ) || [];

  const plans = useLiveQuery(() => db.plans.toArray(), []) || [];
  const norms = useLiveQuery(() => db.norms.toArray(), []) || [];
  const allWorkEntries = useLiveQuery(() => db.workEntries.toArray(), []) || [];
  const welders = useLiveQuery(() => db.welders.toArray(), []) || [];

  const sbActive = welder?.sbActive ?? false;
  const vsActive = welder?.vsActive ?? false;

  const toggleSb = useCallback(async () => {
    if (!activeWelderId) return;
    await db.welders.update(activeWelderId, { sbActive: !sbActive });
  }, [activeWelderId, sbActive]);

  const toggleVs = useCallback(async () => {
    if (!activeWelderId) return;
    await db.welders.update(activeWelderId, { vsActive: !vsActive });
  }, [activeWelderId, vsActive]);

  // Active plan articles for autocomplete
  const activePlanArticles = useMemo(() => {
    return [...new Set(plans.filter(p => !p.completedAt).map(p => p.article))];
  }, [plans]);

  // Get active plan for an article
  const getActivePlan = useCallback((article: string): Plan | undefined => {
    return plans.find(p => p.article === article && !p.completedAt);
  }, [plans]);

  // Get article info hint
  const getArticleHint = useCallback((article: string): string => {
    const activePlan = getActivePlan(article);
    if (!activePlan) return 'Нет активного плана';

    const planEntries = allWorkEntries.filter(e => e.planId === activePlan.id);
    const completedQty = planEntries.reduce((sum, e) => sum + e.quantity, 0);

    const welderMap = new Map<string, number>();
    for (const entry of planEntries) {
      const w = welders.find(w2 => w2.id === entry.welderId);
      if (w) {
        const current = welderMap.get(w.name) || 0;
        welderMap.set(w.name, current + entry.quantity);
      }
    }

    const welderInfo = Array.from(welderMap.entries())
      .map(([name, qty]) => `${name}: ${formatQtyShort(qty)} шт`)
      .join('; ');

    return `План: ${formatQtyShort(activePlan.targetQty)} шт, Выполнено: ${formatQtyShort(completedQty)} шт${welderInfo ? ' | ' + welderInfo : ''}`;
  }, [plans, allWorkEntries, welders, getActivePlan]);

  // Calculate existing hours for this welder on a given date
  const getExistingHoursForDate = useCallback((date: string): number => {
    const dayEntries = workEntries.filter(e => e.date === date);
    let totalHours = 0;
    for (const entry of dayEntries) {
      const norm = norms.find(n => n.article === entry.article);
      if (norm) {
        totalHours += calcHours(entry.quantity, norm.timeHours);
      }
    }
    return Math.round(totalHours * 100) / 100;
  }, [workEntries, norms]);

  const handleArticleSelect = useCallback((article: string) => {
    const normalized = normalizeArticle(article);
    setArticleInput(normalized);
    setSelectedArticle(normalized);
    setShowArticleInfo(true);
    setPlanCompleteMsg('');
  }, []);

  const handleArticleChange = useCallback((value: string) => {
    setArticleInput(value);
    setSelectedArticle('');
    setShowArticleInfo(false);
    setPlanCompleteMsg('');
  }, []);

  // Handle tapping an existing entry to autofill input
  const handleEntryTap = useCallback((article: string) => {
    const normalized = normalizeArticle(article);
    setArticleInput(normalized);
    setSelectedArticle(normalized);
    setShowArticleInfo(true);
    setPlanCompleteMsg('');
  }, []);

  /**
   * Main add handler with 8h daily distribution logic:
   * 1. Calculate total hours = qty × normHours
   * 2. Fill initial date(s): СБ→Saturday, ВС→Sunday, or today
   * 3. Overflow to future workdays, each limited to 8h
   * 4. Each day gets a proportional share of the quantity
   */
  const handleAdd = useCallback(async () => {
    if (!activeWelderId) return;
    const article = selectedArticle || normalizeArticle(articleInput);
    const qty = parseQty(qtyInput);
    if (!article || qty <= 0) return;

    const activePlan = getActivePlan(article);
    if (!activePlan) {
      setPlanCompleteMsg('Нет активного плана для этого артикула');
      return;
    }

    // Check if plan is already completed
    const planEntries = allWorkEntries.filter(e => e.planId === activePlan.id);
    const completedQty = planEntries.reduce((sum, e) => sum + e.quantity, 0);
    if (completedQty >= activePlan.targetQty) {
      setPlanCompleteMsg(`План для ${article} выполнен!`);
      return;
    }

    const norm = norms.find(n => n.article === article);
    if (!norm) return;

    // Calculate total hours for this work
    const totalHours = calcHours(qty, norm.timeHours);
    let remainingHours = Math.round(totalHours * 100) / 100;

    // === Step 1: Generate initial date sequence ===
    const initialDates: { date: string; dayType: 'workday' | 'sb' | 'vs' }[] = [];

    if (sbActive) {
      initialDates.push({ date: getSaturdayStr(), dayType: 'sb' });
    }
    if (vsActive) {
      initialDates.push({ date: getSundayStr(), dayType: 'vs' });
    }
    if (!sbActive && !vsActive) {
      // Normal workday - start from today
      const today = getTodayStr();
      if (isWeekend(today)) {
        // Weekend without СБ/ВС - start from next Monday
        initialDates.push({ date: getNextWorkday(today), dayType: 'workday' });
      } else {
        initialDates.push({ date: today, dayType: 'workday' });
      }
    }

    // === Step 2: Distribute hours across initial dates ===
    for (const dateInfo of initialDates) {
      if (remainingHours <= 0.001) break;

      const existingHours = getExistingHoursForDate(dateInfo.date);
      const availableHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);

      if (availableHours <= 0) continue;

      const allocatedHours = Math.min(availableHours, remainingHours);
      const allocatedQty = Math.round((allocatedHours / norm.timeHours) * 100) / 100;

      // Find existing entry for this article on this date in this plan with same dayType
      const existingEntry = workEntries.find(
        e => e.article === article && e.planId === activePlan.id && e.date === dateInfo.date && e.dayType === dateInfo.dayType
      );

      if (existingEntry && existingEntry.id) {
        const newQty = Math.round((existingEntry.quantity + allocatedQty) * 100) / 100;
        await db.workEntries.update(existingEntry.id, {
          quantity: newQty,
          updatedAt: new Date(),
        });
      } else {
        await db.workEntries.add({
          welderId: activeWelderId,
          planId: activePlan.id!,
          article,
          quantity: allocatedQty,
          date: dateInfo.date,
          dayType: dateInfo.dayType,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      remainingHours = Math.round((remainingHours - allocatedHours) * 100) / 100;
    }

    // === Step 3: Overflow to future workdays ===
    if (remainingHours > 0.001) {
      const lastInitialDate = initialDates.length > 0 ? initialDates[initialDates.length - 1].date : getTodayStr();
      let currentDate = getNextWorkday(lastInitialDate);
      let safetyCounter = 0;
      const MAX_DAYS = 100;

      while (remainingHours > 0.001 && safetyCounter < MAX_DAYS) {
        const existingHours = getExistingHoursForDate(currentDate);
        const availableHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);

        if (availableHours > 0) {
          const allocatedHours = Math.min(availableHours, remainingHours);
          const allocatedQty = Math.round((allocatedHours / norm.timeHours) * 100) / 100;
          const dayType = getDayTypeForDate(currentDate);

          // Check for existing entry of same article on this date
          const existingEntry = workEntries.find(
            e => e.article === article && e.planId === activePlan.id && e.date === currentDate && e.dayType === dayType
          );

          if (existingEntry && existingEntry.id) {
            const newQty = Math.round((existingEntry.quantity + allocatedQty) * 100) / 100;
            await db.workEntries.update(existingEntry.id, {
              quantity: newQty,
              updatedAt: new Date(),
            });
          } else {
            await db.workEntries.add({
              welderId: activeWelderId,
              planId: activePlan.id!,
              article,
              quantity: allocatedQty,
              date: currentDate,
              dayType,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }

          remainingHours = Math.round((remainingHours - allocatedHours) * 100) / 100;
        }

        currentDate = getNextWorkday(currentDate);
        safetyCounter++;
      }
    }

    // Update welder's updatedAt so they move to top on main screen
    await db.welders.update(activeWelderId, { updatedAt: new Date() });

    // Update plan completion
    const updatedPlanEntries = await db.workEntries.where('planId').equals(activePlan.id!).toArray();
    const newCompletedQty = updatedPlanEntries.reduce((sum, e) => sum + e.quantity, 0);
    if (newCompletedQty >= activePlan.targetQty && !activePlan.completedAt) {
      await db.plans.update(activePlan.id!, {
        completedAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await db.plans.update(activePlan.id!, {
        updatedAt: new Date(),
      });
    }

    // Reset form
    setArticleInput('');
    setQtyInput('');
    setSelectedArticle('');
    setShowArticleInfo(false);
    setPlanCompleteMsg('');
  }, [activeWelderId, articleInput, qtyInput, selectedArticle, sbActive, vsActive, workEntries, allWorkEntries, norms, getActivePlan, getExistingHoursForDate]);

  const handleDelete = useCallback(async (id: number) => {
    const entry = await db.workEntries.get(id);
    if (!entry) return;

    await db.workEntries.delete(id);

    // Re-check plan completion after deletion
    if (entry.planId) {
      const plan = await db.plans.get(entry.planId);
      if (plan) {
        const planEntries = await db.workEntries.where('planId').equals(entry.planId).toArray();
        const completedQty = planEntries.reduce((sum, e) => sum + e.quantity, 0);
        if (completedQty < plan.targetQty && plan.completedAt) {
          await db.plans.update(entry.planId, {
            completedAt: null,
            updatedAt: new Date(),
          });
        }
      }
    }
  }, []);

  const handleEditOpen = useCallback((entry: WorkEntry) => {
    setEditQty(entry.quantity.toString());
    setEditModal({ open: true, entry });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editModal.entry?.id) return;
    const qty = parseQty(editQty);
    if (qty <= 0) return;

    await db.workEntries.update(editModal.entry.id, {
      quantity: qty,
      updatedAt: new Date(),
    });

    // Re-check plan completion
    const planId = editModal.entry.planId;
    const plan = await db.plans.get(planId);
    if (plan) {
      const planEntries = await db.workEntries.where('planId').equals(planId).toArray();
      const completedQty = planEntries.reduce((sum, e) => sum + e.quantity, 0);
      if (completedQty >= plan.targetQty && !plan.completedAt) {
        await db.plans.update(planId, {
          completedAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (completedQty < plan.targetQty && plan.completedAt) {
        await db.plans.update(planId, {
          completedAt: null,
          updatedAt: new Date(),
        });
      }
    }

    setEditModal({ open: false, entry: null });
  }, [editModal.entry, editQty]);

  // Group entries by date
  const dayGroups = useMemo((): DayGroup[] => {
    const groupMap = new Map<string, DayGroup>();

    for (const entry of workEntries) {
      const dateKey = entry.date;
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, {
          date: dateKey,
          dayType: entry.dayType,
          entries: [],
          totalHours: 0,
        });
      }

      const group = groupMap.get(dateKey)!;
      const norm = norms.find(n => n.article === entry.article);
      const normHours = norm?.timeHours || 0;
      const hours = calcHours(entry.quantity, normHours);

      group.entries.push({ ...entry, normHours });
      group.totalHours += hours;
    }

    // Sort entries within each day by updatedAt desc
    for (const group of groupMap.values()) {
      group.entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      group.totalHours = Math.round(group.totalHours * 100) / 100;
    }

    // Sort days by date desc (most recent/future first)
    return Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [workEntries, norms]);

  const handleBack = useCallback(() => {
    setActiveWelderId(null);
    setActiveScreen('main');
  }, [setActiveWelderId, setActiveScreen]);

  if (!welder) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Выберите сварщика
      </div>
    );
  }

  const currentArticleHint = selectedArticle ? getArticleHint(selectedArticle) : '';

  return (
    <div className="flex flex-col h-full">
      {/* Header with welder name and СБ/ВС */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleBack}
            className="flex-shrink-0 p-1.5 text-foreground active:bg-accent rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-base flex-1 truncate">{welder.name}</span>
          <button
            onClick={toggleSb}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              sbActive
                ? 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                : 'border-border text-muted-foreground'
            }`}
          >
            СБ
          </button>
          <button
            onClick={toggleVs}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              vsActive
                ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                : 'border-border text-muted-foreground'
            }`}
          >
            ВС
          </button>
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5">
            <AutoComplete
              suggestions={activePlanArticles}
              value={articleInput}
              onChange={handleArticleChange}
              onSelect={handleArticleSelect}
              placeholder="ХТ44"
              className="flex-1 min-w-0"
            />
            <span className="text-muted-foreground text-lg">|</span>
            <input
              type="text"
              value={qtyInput}
              onChange={(e) => { setQtyInput(e.target.value); setPlanCompleteMsg(''); }}
              placeholder="шт"
              className="w-20 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring text-right"
              inputMode="decimal"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <button
            onClick={handleAdd}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Article info hint */}
        {showArticleInfo && currentArticleHint && (
          <div className="mt-1.5 px-2 py-1.5 text-xs text-muted-foreground bg-muted rounded-md">
            {currentArticleHint}
          </div>
        )}

        {/* Plan complete message */}
        {planCompleteMsg && (
          <div className="mt-1.5 px-2 py-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-md font-semibold">
            {planCompleteMsg}
          </div>
        )}
      </div>

      {/* List grouped by day */}
      <div className="flex-1 overflow-y-auto">
        {dayGroups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Нет записей
          </div>
        ) : (
          <div>
            {dayGroups.map((group) => {
              const isSb = group.dayType === 'sb';
              const isVs = group.dayType === 'vs';
              const headerBg = isSb
                ? 'bg-orange-100/90 dark:bg-orange-900/40'
                : isVs
                  ? 'bg-red-100/90 dark:bg-red-900/40'
                  : 'bg-muted/80';
              const dateTextClass = isSb
                ? 'text-orange-700 dark:text-orange-300'
                : isVs
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-muted-foreground';

              return (
                <div key={group.date}>
                  {/* Day header */}
                  <div className={`sticky top-0 z-10 backdrop-blur-sm px-4 py-1.5 flex justify-between items-center ${headerBg}`}>
                    <span className={`text-xs font-semibold ${dateTextClass}`}>
                      {formatDate(group.date)} ({getShortDayName(group.date)})
                      {isSb && <span className="ml-1 font-bold">СБ</span>}
                      {isVs && <span className="ml-1 font-bold">ВС</span>}
                    </span>
                    <span className={`text-xs ${dateTextClass}`}>
                      {formatQtyShort(group.totalHours)} / {DAILY_HOURS_LIMIT} ч
                    </span>
                  </div>

                  {/* Entries for this day */}
                  <div className="divide-y divide-border">
                    {group.entries.map((entry) => {
                      const norm = norms.find(n => n.article === entry.article);
                      const hours = norm ? calcHours(entry.quantity, norm.timeHours) : 0;

                      return (
                        <LongPressWrapper
                          key={entry.id}
                          onLongPress={() => handleEditOpen(entry)}
                        >
                          <div
                            className="flex items-center justify-between px-4 py-2.5 active:bg-accent/50 cursor-pointer"
                            onClick={() => handleEntryTap(entry.article)}
                          >
                            <span className="font-mono font-semibold text-sm">{entry.article}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm">{formatQtyShort(entry.quantity)} шт</span>
                              {hours > 0 && (
                                <span className="text-xs text-muted-foreground">{formatQtyShort(hours)} ч</span>
                              )}
                            </div>
                          </div>
                        </LongPressWrapper>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Delete Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ open, entry: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Редактировать запись</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="text-sm font-mono font-semibold mb-1">{editModal.entry?.article}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {editModal.entry && formatDate(editModal.entry.date)}{editModal.entry?.dayType === 'sb' ? ' СБ' : ''}{editModal.entry?.dayType === 'vs' ? ' ВС' : ''}
            </div>
            <input
              type="text"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              placeholder="Количество (шт)"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="decimal"
            />
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (editModal.entry?.id) handleDelete(editModal.entry.id);
                setEditModal({ open: false, entry: null });
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Удалить
            </Button>
            <Button
              className="flex-1"
              onClick={handleEditSave}
            >
              <Pencil className="w-4 h-4 mr-1" /> Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
