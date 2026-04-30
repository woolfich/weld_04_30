'use client';

import React, { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Norm } from '@/lib/db';
import { normalizeArticle, formatQty, sortArticles, forceRefresh } from '@/lib/utils';
import { LongPressWrapper } from '@/components/LongPressWrapper';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function NormsScreen() {
  const [articleInput, setArticleInput] = useState('');
  const [hoursInput, setHoursInput] = useState('');
  const [editModal, setEditModal] = useState<{ open: boolean; norm: Norm | null }>({ open: false, norm: null });
  const [editArticle, setEditArticle] = useState('');
  const [editHours, setEditHours] = useState('');

  // Добавляем принудительное обновление при изменении
  const [, setForceUpdate] = React.useState({});

  const norms = useLiveQuery(() => db.norms.toArray(), []) || [];
  const sortedNorms = sortArticles(norms);

  // Force refresh when component mounts
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Force refresh periodically to ensure data is up-to-date
      forceRefresh();
    }, 1000); // Refresh every second when component is mounted

    return () => clearInterval(interval);
  }, []);

  const handleAdd = useCallback(async () => {
    const article = normalizeArticle(articleInput);
    const hours = parseFloat(hoursInput.replace(',', '.'));
    if (!article || isNaN(hours) || hours <= 0) return;

    // Check if article already exists
    const existing = await db.norms.where('article').equals(article).first();
    if (existing) return; // Don't add duplicate

    await db.norms.add({
      article,
      timeHours: Math.round(hours * 100) / 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    setArticleInput('');
    setHoursInput('');
  }, [articleInput, hoursInput]);

  const handleDelete = useCallback(async (id: number) => {
    await db.norms.delete(id);
  }, []);

  const handleEditOpen = useCallback((norm: Norm) => {
    setEditArticle(norm.article);
    setEditHours(norm.timeHours.toString());
    setEditModal({ open: true, norm });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editModal.norm?.id) return;
    const article = normalizeArticle(editArticle);
    const hours = parseFloat(editHours.replace(',', '.'));
    if (!article || isNaN(hours) || hours <= 0) return;

    await db.norms.update(editModal.norm.id, {
      article,
      timeHours: Math.round(hours * 100) / 100,
      updatedAt: new Date(),
    });

    setEditModal({ open: false, norm: null });
  }, [editModal.norm, editArticle, editHours]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5">
            <input
              type="text"
              value={articleInput}
              onChange={(e) => setArticleInput(e.target.value)}
              placeholder="ХТ44"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <span className="text-muted-foreground text-lg">|</span>
            <input
              type="text"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder="ч"
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
        {sortedNorms.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Добавьте норму
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedNorms.map((norm) => (
              <LongPressWrapper
                key={norm.id}
                onLongPress={() => handleEditOpen(norm)}
              >
                <div className="flex items-center px-4 py-3 active:bg-accent/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-mono font-semibold">{norm.article}</span>
                      <span className="text-muted-foreground flex-1 text-center tracking-widest text-xs">· · · ·</span>
                      <span className="font-mono">{formatQty(norm.timeHours)} ч</span>
                    </div>
                  </div>
                </div>
              </LongPressWrapper>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Delete Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ open, norm: null })}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Редактировать норму</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <input
              type="text"
              value={editArticle}
              onChange={(e) => setEditArticle(e.target.value)}
              placeholder="Артикул"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
            />
            <input
              type="text"
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
              placeholder="Часы"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring text-right"
              inputMode="decimal"
            />
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (editModal.norm?.id) handleDelete(editModal.norm.id);
                setEditModal({ open: false, norm: null });
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