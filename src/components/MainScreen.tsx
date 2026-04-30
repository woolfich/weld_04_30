'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Welder, type WorkEntry, type ExportData, type Norm, type Plan } from '@/lib/db';
import { normalizeArticle, formatQty, formatQtyShort, getTodayStr, calcHours, sortByUpdatedDesc, formatDateShort, dateToStr } from '@/lib/utils';
import { LongPressWrapper } from '@/components/LongPressWrapper';
import { useAppStore } from '@/lib/store';
import { Plus, Pencil, Trash2, Info, Download, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function MainScreen() {
  const [nameInput, setNameInput] = useState('');
  const [editModal, setEditModal] = useState<{ open: boolean; welder: Welder | null }>({ open: false, welder: null });
  const [editName, setEditName] = useState('');
  const [infoModal, setInfoModal] = useState<{ open: boolean; welderId: number | null }>({ open: false, welderId: null });
  const [sortField, setSortField] = useState<'name' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { setActiveScreen, setActiveWelderId } = useAppStore();
  const { toast } = useToast();

  const welders = useLiveQuery(() => db.welders.toArray(), []) || [];
  const workEntries = useLiveQuery(() => db.workEntries.toArray(), []) || [];
  const norms = useLiveQuery(() => db.norms.toArray(), []) || [];
  const plans = useLiveQuery(() => db.plans.toArray(), []) || [];

  const today = getTodayStr();
  const sortedWelders = useMemo(() => {
    let result = [...welders];
    
    // Apply search filter
    if (searchTerm) {
      const normalizedSearch = normalizeArticle(searchTerm);
      result = result.filter(w => normalizeArticle(w.name).includes(normalizedSearch));
    }
    
    // Apply sorting
    switch (sortField) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        break;
      case 'date':
        result.sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());
        break;
    }
    
    // Apply sort order
    if (sortOrder === 'desc' && sortField !== 'name') {
      result.reverse();
    }
    
    return result;
  }, [welders, sortField, sortOrder, searchTerm]);

  // Get today's work summary for a welder (for the center of the row)
  const getTodaySummary = useCallback((welderId: number): string => {
    const todayEntries = workEntries.filter(e => e.welderId === welderId && e.date === today);
    if (todayEntries.length === 0) return '';

    // Group by article and sum quantities
    const articleMap = new Map<string, number>();
    for (const entry of todayEntries) {
      const current = articleMap.get(entry.article) || 0;
      articleMap.set(entry.article, current + entry.quantity);
    }

    const parts: string[] = [];
    for (const [article, qty] of articleMap) {
      parts.push(`${article} ${formatQtyShort(qty)} шт`);
    }
    return parts.join('; ');
  }, [workEntries, today]);

  // Get work summary for a welder grouped by plan (for info modal)
  // Shows each article per plan with plan date range, most recent plan on top
  const getWelderSummary = useCallback((welderId: number): { article: string; qty: number; hours: number; planLabel: string; planCreatedAt: Date }[] => {
    const entries = workEntries.filter(e => e.welderId === welderId);

    // Group by (article, planId)
    const groupMap = new Map<string, { article: string; qty: number; planId: number }>();
    for (const entry of entries) {
      const key = `${entry.article}__${entry.planId}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.qty += entry.quantity;
      } else {
        groupMap.set(key, { article: entry.article, qty: entry.quantity, planId: entry.planId });
      }
    }

    const result: { article: string; qty: number; hours: number; planLabel: string; planCreatedAt: Date }[] = [];
    for (const [, data] of groupMap) {
      const norm = norms.find(n => n.article === data.article);
      const hours = norm ? calcHours(data.qty, norm.timeHours) : 0;

      const plan = plans.find((p: Plan) => p.id === data.planId);
      let planLabel = '';
      if (plan) {
        if (plan.completedAt) {
          // Completed plan - show date range
          const startStr = formatDateShort(dateToStr(new Date(plan.createdAt)));
          const endStr = formatDateShort(dateToStr(new Date(plan.completedAt)));
          if (startStr === endStr) {
            planLabel = startStr;
          } else {
            planLabel = `${startStr}-${endStr}`;
          }
        }
        // Active plan - no date label (user said "в текущем плане дата не ставится")
      }

      result.push({
        article: data.article,
        qty: data.qty,
        hours,
        planLabel,
        planCreatedAt: plan ? new Date(plan.createdAt) : new Date(0),
      });
    }

    // Sort: most recently created plan first, then by article
    return result.sort((a, b) => {
      const dateDiff = b.planCreatedAt.getTime() - a.planCreatedAt.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.article.localeCompare(b.article, 'ru');
    });
  }, [workEntries, norms, plans]);

  const handleAdd = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;

    await db.welders.add({
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    setNameInput('');
  }, [nameInput]);

  const handleWelderClick = useCallback((welderId: number) => {
    setActiveWelderId(welderId);
    setActiveScreen('welder-card');
  }, [setActiveWelderId, setActiveScreen]);

  const handleDelete = useCallback(async (id: number) => {
    await db.workEntries.where('welderId').equals(id).delete();
    await db.welders.delete(id);
  }, []);

  const handleEditOpen = useCallback((welder: Welder) => {
    setEditName(welder.name);
    setEditModal({ open: true, welder });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editModal.welder?.id) return;
    const name = editName.trim();
    if (!name) return;

    await db.welders.update(editModal.welder.id, {
      name,
      updatedAt: new Date(),
    });

    setEditModal({ open: false, welder: null });
  }, [editModal.welder, editName]);

  // Export - downloads JSON with all data
  const handleExport = useCallback(async () => {
    try {
      const data: ExportData = {
        norms: await db.norms.toArray(),
        plans: await db.plans.toArray(),
        welders: await db.welders.toArray(),
        workEntries: await db.workEntries.toArray(),
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `welder-tracker-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Экспорт завершён', description: `Файл welder-tracker-${today}.json скачан` });
    } catch {
      toast({ title: 'Ошибка экспорта', variant: 'destructive' });
    }
  }, [today, toast]);

  // Import - opens file picker, merges data
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      // Merge norms
      const existingNorms = await db.norms.toArray();
      const normIds = new Set(existingNorms.map(n => n.id));
      for (const norm of (data.norms || [])) {
        if (norm.id && !normIds.has(norm.id)) {
          await db.norms.add(norm);
        }
      }

      // Merge plans
      const existingPlans = await db.plans.toArray();
      const planIds = new Set(existingPlans.map(p => p.id));
      for (const plan of (data.plans || [])) {
        if (plan.id && !planIds.has(plan.id)) {
          await db.plans.add(plan);
        }
      }

      // Merge welders
      const existingWelders = await db.welders.toArray();
      const welderIds = new Set(existingWelders.map(w => w.id));
      for (const welder of (data.welders || [])) {
        if (welder.id && !welderIds.has(welder.id)) {
          await db.welders.add(welder);
        }
      }

      // Merge work entries
      const existingEntries = await db.workEntries.toArray();
      const entryIds = new Set(existingEntries.map(e => e.id));
      for (const entry of (data.workEntries || [])) {
        if (entry.id && !entryIds.has(entry.id)) {
          await db.workEntries.add(entry);
        }
      }
      toast({ title: 'Импорт завершён', description: 'Данные успешно загружены' });
    } catch (err) {
      console.error('Import error:', err);
      toast({ title: 'Ошибка импорта', description: 'Не удалось прочитать файл', variant: 'destructive' });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [toast]);

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      {/* Header */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex flex-col gap-2">
          {/* Search and Add */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Иванов И.И."
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="text"
              autoCapitalize="words"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              onClick={handleAdd}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Filters and Actions */}
          <div className="flex items-center gap-1">
            <div className="flex-1 flex items-center gap-1">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as 'name' | 'date')}
                className="h-10 px-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="date">Сортировка по дате</option>
                <option value="name">Сортировка по имени</option>
              </select>
              
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="h-10 px-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </div>
            
            <button
              onClick={handleImportClick}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-secondary text-secondary-foreground active:opacity-80"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={handleExport}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-secondary text-secondary-foreground active:opacity-80"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* List */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          // Reset pull-to-refresh if user scrolls down
          if (scrollContainerRef.current?.scrollTop === 0) {
            handlePullToRefresh();
          }
        }}
      >
        {sortedWelders.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Добавьте сварщика
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedWelders.map((welder) => {
              const todaySummary = getTodaySummary(welder.id!);
              return (
                <LongPressWrapper
                  key={welder.id}
                  onLongPress={() => handleEditOpen(welder)}
                >
                  <div 
                    className="flex items-center px-4 py-3 active:bg-accent/50"
                    onClick={() => handleViewWelder(welder.id!)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-semibold truncate">{welder.name}</span>
                      </div>
                      {todaySummary && (
                        <div className="text-xs text-muted-foreground truncate">
                          {todaySummary}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setInfoModal({ open: true, welderId: welder.id }); }}
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
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ open, welder: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Редактировать сварщика</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Фамилия"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (editModal.welder?.id) handleDelete(editModal.welder.id);
                setEditModal({ open: false, welder: null });
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

      {/* Info Modal - shows work summary grouped by plan */}
      <Dialog open={infoModal.open} onOpenChange={(open) => setInfoModal({ open, welderId: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Сводка</DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-64 overflow-y-auto">
            {infoModal.welderId && (() => {
              const summary = getWelderSummary(infoModal.welderId);
              if (summary.length === 0) {
                return <div className="text-sm text-muted-foreground">Нет записей</div>;
              }
              return (
                <div className="space-y-1.5">
                  {summary.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="truncate">{item.article}</div>
                        <div className="text-xs text-muted-foreground">{item.planLabel}</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div>{formatQtyShort(item.qty)} шт</div>
                        <div className="text-xs text-muted-foreground">{formatQtyShort(item.hours)} ч</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
