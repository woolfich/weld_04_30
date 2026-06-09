'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Plan } from '@/lib/db';
import { normalizeArticle, formatQty, formatQtyShort, calcHours, formatDate, forceRefresh, roundToHundredths } from '@/lib/utils';
import { LongPressWrapper } from '@/components/LongPressWrapper';
import { AutoComplete } from '@/components/AutoComplete';
import { useAppStore } from '@/lib/store';
import { Plus, Pencil, Trash2, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function PlanScreen() {
  const [articleInput, setArticleInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [editModal, setEditModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });
  const [editQty, setEditQty] = useState('');
  const [infoModal, setInfoModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });
  
  // Добавляем принудительное обновление при изменении
  const [, setForceUpdate] = React.useState({});
  
  const norms = useLiveQuery(() => db.norms.toArray(), []) || [];
  const plans = useLiveQuery(() => db.plans.toArray(), []) || [];
  const workEntries = useLiveQuery(() => db.workEntries.toArray(), []) || [];
  const welders = useLiveQuery(() => db.welders.toArray(), []) || [];

  // Force refresh when component mounts or when needed
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Force refresh periodically to ensure data is up-to-date
      forceRefresh();
    }, 1000); // Refresh every second when component is mounted

    return () => clearInterval(interval);
  }, []);

  // Norm articles for autocomplete
  const normArticles = useMemo(() => norms.map(n => n.article), [norms]);

  // Calculate completed qty for each plan
  const planCompletedQty = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of workEntries) {
      const current = map.get(entry.planId) || 0;
      map.set(entry.planId, roundToHundredths(current + entry.quantity));
    }
    return map;
  }, [workEntries]);

  // Sort plans: active first, newest createdAt on top; completed below, also newest first
  const sortedPlans = useMemo(() => {
    const byCreatedDesc = (a: Plan, b: Plan) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const active = plans.filter(p => !p.completedAt).sort(byCreatedDesc);
    const completed = plans.filter(p => p.completedAt).sort(byCreatedDesc);
    return [...active, ...completed];
  }, [plans]);

  // Check if an article already has an active plan
  const hasActivePlan = useCallback((article: string) => {
    return plans.some(p => p.article === article && !p.completedAt);
  }, [plans]);

  const handleArticleSelect = useCallback((article: string) => {
    const normalized = normalizeArticle(article);
    setArticleInput(normalized);
    setSelectedArticle(normalized);
  }, []);

  const handleArticleChange = useCallback((value: string) => {
    setArticleInput(value);
    setSelectedArticle('');
  }, []);

  const handleAdd = useCallback(async () => {
    const article = selectedArticle || normalizeArticle(articleInput);
    const qty = parseFloat(qtyInput.replace(',', '.'));
    if (!article || isNaN(qty) || qty <= 0) return;

    // Check if article exists in norms
    const norm = norms.find(n => n.article === article);
    if (!norm) return;

    // Check if there's already an active plan for this article
    if (hasActivePlan(article)) return;

    await db.plans.add({
      article,
      targetQty: roundToHundredths(qty),
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    });

    setArticleInput('');
    setQtyInput('');
    setSelectedArticle('');
  }, [articleInput, qtyInput, selectedArticle, norms, hasActivePlan]);

  const handleDelete = useCallback(async (id: number) => {
    await db.workEntries.where('planId').equals(id).delete();
    await db.plans.delete(id);
  }, []);

  const handleEditOpen = useCallback((plan: Plan) => {
    setEditQty(plan.targetQty.toString());
    setEditModal({ open: true, plan });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editModal.plan?.id) return;
    const qty = parseFloat(editQty.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) return;

    await db.plans.update(editModal.plan.id, {
      targetQty: roundToHundredths(qty),
      updatedAt: new Date(),
    });

    setEditModal({ open: false, plan: null });
  }, [editModal.plan, editQty]);

  // Check and update plan completion status
  React.useEffect(() => {
    const checkCompletion = async () => {
      for (const plan of plans) {
        if (!plan.id) continue;
        const completed = planCompletedQty.get(plan.id) || 0;
        if (completed >= plan.targetQty && !plan.completedAt) {
          await db.plans.update(plan.id, {
            completedAt: new Date(),
            updatedAt: new Date(),
          });
        } else if (completed < plan.targetQty && plan.completedAt) {
          await db.plans.update(plan.id, {
            completedAt: null,
            updatedAt: new Date(),
          });
        }
      }
    };
    checkCompletion();
  }, [plans, planCompletedQty]);

  // Get plan info for modal (which welders participated)
  const getPlanInfo = useCallback((plan: Plan) => {
    const entries = workEntries.filter(e => e.planId === plan.id);
    const welderMap = new Map<string, number>();
    for (const entry of entries) {
      const welder = welders.find(w => w.id === entry.welderId);
      if (welder) {
        const current = welderMap.get(welder.name) || 0;
        welderMap.set(welder.name, roundToHundredths(current + entry.quantity));
      }
    }
    return Array.from(welderMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [workEntries, welders]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5">
            <AutoComplete
              suggestions={normArticles}
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
              onChange={(e) => setQtyInput(e.target.value)}
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sortedPlans.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Добавьте план
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedPlans.map((plan) => {
              const completed = planCompletedQty.get(plan.id!) || 0;
              const isComplete = !!plan.completedAt;
              const norm = norms.find(n => n.article === plan.article);

              return (
                <LongPressWrapper
                  key={plan.id}
                  onLongPress={() => handleEditOpen(plan)}
                >
                  <div className={`flex items-center px-4 py-3 gap-2 ${isComplete ? 'bg-green-50 dark:bg-green-950/30' : 'active:bg-accent/50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-mono font-semibold">{plan.article}</span>
                        <span className="text-muted-foreground flex-1 text-center tracking-widest text-xs">· · · ·</span>
                        <span className={`font-mono ${isComplete ? 'text-green-600 dark:text-green-400 font-semibold' : ''}`}>
                          {formatQtyShort(plan.targetQty)}/{formatQtyShort(completed)}
                        </span>
                      </div>
                      {isComplete && (
                        <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                          Выполнен {plan.completedAt ? new Date(plan.completedAt).toLocaleDateString('ru') : ''}
                        </div>
                      )}
                      {!isComplete && norm && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatQtyShort(calcHours(completed, norm.timeHours))}/{formatQtyShort(calcHours(plan.targetQty, norm.timeHours))} ч
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setInfoModal({ open: true, plan }); }}
                      className="flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground active:bg-accent rounded-full"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                </LongPressWrapper>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Delete Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ open, plan: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Редактировать план</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="text-sm font-mono font-semibold mb-2">{editModal.plan?.article}</div>
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
                if (editModal.plan?.id) handleDelete(editModal.plan.id);
                setEditModal({ open: false, plan: null });
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

      {/* Info Modal - shows welders who worked on this plan */}
      <Dialog open={infoModal.open} onOpenChange={(open) => setInfoModal({ open, plan: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>{infoModal.plan?.article} — Исполнители</DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-64 overflow-y-auto">
            {infoModal.plan && (() => {
              const info = getPlanInfo(infoModal.plan);
              if (info.length === 0) {
                return <div className="text-sm text-muted-foreground">Нет записей</div>;
              }
              return (
                <div className="space-y-1.5">
                  {info.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.name}</span>
                      <span className="font-mono">{formatQtyShort(item.qty)} шт</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          {infoModal.plan?.createdAt && (
            <div className="text-xs text-muted-foreground border-t pt-2 mt-1">
              Создан: {new Date(infoModal.plan.createdAt).toLocaleDateString('ru')}
              {infoModal.plan.completedAt && (
                <> · Выполнен: {new Date(infoModal.plan.completedAt).toLocaleDateString('ru')}</>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}