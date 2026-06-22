"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type WorkEntry, type Plan } from "@/lib/db";
import {
  normalizeArticle,
  formatQtyShort,
  getTodayStr,
  getSaturdayStr,
  getSundayStr,
  calcHours,
  formatDate,
  getShortDayName,
  parseQty,
  roundToHundredths,
  DAILY_HOURS_LIMIT,
  getNextWorkday,
  getDayTypeForDate,
  isWeekend,
} from "@/lib/utils";
import { LongPressWrapper } from "@/components/LongPressWrapper";
import { AutoComplete } from "@/components/AutoComplete";
import { useAppStore } from "@/lib/store";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Timeline types ──────────────────────────────────────────────────────────

type ConnectorMode = "top" | "bottom" | "single" | "none";

interface DisplayEntry extends WorkEntry {
  normHours?: number;
  timelineKey: string;
  timelineColorResolved: string;
  hasTimelineAbove: boolean;
  hasTimelineBelow: boolean;
  connectorMode: ConnectorMode;
}

interface DayGroup {
  date: string;
  dayType: "workday" | "sb" | "vs";
  entries: DisplayEntry[];
  totalHours: number;
  headerActiveTimelineKeys: string[];
}

// ─── Timeline visual constants (px) ──────────────────────────────────────────

const TIMELINE_LEFT_WIDTH = "30%";
const TL_LINE_W = 2.5; // vertical / horizontal line thickness
const TL_ARM_W = 14; // horizontal arm width (from right edge of left panel)
const TL_CORNER = 6; // CSS border-radius for the elbow

// ─── Timeline helpers ─────────────────────────────────────────────────────────

const LEGACY_BUCKET_MS = 1000;

function getTimelineKey(entry: WorkEntry): string {
  if (entry.timelineId) return entry.timelineId;
  const ms = new Date(entry.createdAt).getTime();
  const bucket = Number.isFinite(ms) ? Math.floor(ms / LEGACY_BUCKET_MS) : 0;
  return `legacy-${entry.welderId}-${entry.planId}-${entry.article}-${bucket}`;
}

function getTimelineColor(entry: WorkEntry): string {
  if (entry.timelineColor) return entry.timelineColor;
  let hash = 0;
  const key = getTimelineKey(entry);
  for (let i = 0; i < key.length; i++)
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 72% 52%)`;
}

function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} ${65 + Math.floor(Math.random() * 20)}% ${45 + Math.floor(Math.random() * 10)}%)`;
}

function getMostRecentEntry(entries: WorkEntry[]): WorkEntry | undefined {
  return entries.reduce<WorkEntry | undefined>((latest, e) => {
    if (!latest) return e;
    const lt = new Date(latest.createdAt).getTime();
    const et = new Date(e.createdAt).getTime();
    if (et !== lt) return et > lt ? e : latest;
    return (e.id || 0) > (latest.id || 0) ? e : latest;
  }, undefined);
}

// ─── Timeline row CSS renderer ────────────────────────────────────────────────

function TimelineCell({ color, mode }: { color: string; mode: ConnectorMode }) {
  const lineStyle: React.CSSProperties = {
    position: "absolute",
    right: `${TL_ARM_W - TL_LINE_W / 2}px`,
    width: `${TL_LINE_W}px`,
    backgroundColor: color,
  };

  if (mode === "none") {
    // Passthrough: full vertical line, no arm
    return <div style={{ ...lineStyle, top: 0, bottom: 0 }} />;
  }

  if (mode === "single") {
    // No vertical line, just a short horizontal arm with rounded left tip
    return (
      <div
        style={{
          position: "absolute",
          right: 0,
          top: `calc(50% - ${TL_LINE_W / 2}px)`,
          width: `${TL_ARM_W}px`,
          height: `${TL_LINE_W}px`,
          backgroundColor: color,
          borderRadius: `${TL_CORNER}px 0 0 ${TL_CORNER}px`,
        }}
      />
    );
  }

  if (mode === "top") {
    // Top entry: arm + elbow turning down + vertical line going down
    return (
      <>
        {/* Arm + rounded elbow (turns downward) */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: `calc(50% - ${TL_LINE_W / 2}px)`,
            width: `${TL_ARM_W + TL_LINE_W / 2}px`,
            height: `${TL_CORNER + TL_LINE_W / 2}px`,
            borderTop: `${TL_LINE_W}px solid ${color}`,
            borderLeft: `${TL_LINE_W}px solid ${color}`,
            borderTopLeftRadius: `${TL_CORNER}px`,
            boxSizing: "border-box",
          }}
        />
        {/* Vertical line going down */}
        <div
          style={{
            ...lineStyle,
            top: `calc(50% + ${TL_CORNER}px)`,
            bottom: 0,
          }}
        />
      </>
    );
  }

  // mode === "bottom": line from above + elbow turning into arm
  return (
    <>
      {/* Vertical line from above */}
      <div
        style={{
          ...lineStyle,
          top: 0,
          height: `calc(50% - ${TL_CORNER}px)`,
        }}
      />
      {/* Rounded elbow + arm */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: `calc(50% - ${TL_CORNER}px)`,
          width: `${TL_ARM_W + TL_LINE_W / 2}px`,
          height: `${TL_CORNER + TL_LINE_W / 2}px`,
          borderBottom: `${TL_LINE_W}px solid ${color}`,
          borderLeft: `${TL_LINE_W}px solid ${color}`,
          borderBottomLeftRadius: `${TL_CORNER}px`,
          boxSizing: "border-box",
        }}
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WelderCardScreen() {
  const { activeWelderId, setActiveWelderId, setActiveScreen } = useAppStore();

  const [articleInput, setArticleInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState("");
  const [showArticleInfo, setShowArticleInfo] = useState(false);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    entry: WorkEntry | null;
  }>({ open: false, entry: null });
  const [editQty, setEditQty] = useState("");
  const [planCompleteMsg, setPlanCompleteMsg] = useState("");

  const welder = useLiveQuery(
    () => (activeWelderId ? db.welders.get(activeWelderId) : undefined),
    [activeWelderId],
  );

  const workEntries =
    useLiveQuery(
      () =>
        activeWelderId
          ? db.workEntries.where("welderId").equals(activeWelderId).toArray()
          : [],
      [activeWelderId],
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

  const activePlanArticles = useMemo(
    () => [
      ...new Set(plans.filter((p) => !p.completedAt).map((p) => p.article)),
    ],
    [plans],
  );

  const getActivePlan = useCallback(
    (article: string): Plan | undefined =>
      plans.find((p) => p.article === article && !p.completedAt),
    [plans],
  );

  const getArticleHint = useCallback(
    (article: string): string => {
      const activePlan = getActivePlan(article);
      if (!activePlan) return "Нет активного плана";

      const planEntries = allWorkEntries.filter(
        (e) => e.planId === activePlan.id,
      );
      const completedQty = roundToHundredths(
        planEntries.reduce((sum, e) => sum + e.quantity, 0),
      );

      const welderMap = new Map<string, number>();
      for (const entry of planEntries) {
        const w = welders.find((w2) => w2.id === entry.welderId);
        if (w) {
          welderMap.set(
            w.name,
            roundToHundredths((welderMap.get(w.name) || 0) + entry.quantity),
          );
        }
      }

      const welderInfo = Array.from(welderMap.entries())
        .map(([name, qty]) => `${name}: ${formatQtyShort(qty)} шт`)
        .join("; ");

      return `План: ${formatQtyShort(activePlan.targetQty)} шт, Выполнено: ${formatQtyShort(completedQty)} шт${welderInfo ? " | " + welderInfo : ""}`;
    },
    [plans, allWorkEntries, welders, getActivePlan],
  );

  const getExistingHoursForDate = useCallback(
    (date: string): number => {
      let total = 0;
      for (const entry of workEntries.filter((e) => e.date === date)) {
        const norm = norms.find((n) => n.article === entry.article);
        if (norm) total += calcHours(entry.quantity, norm.timeHours);
      }
      return roundToHundredths(total);
    },
    [workEntries, norms],
  );

  const handleArticleSelect = useCallback((article: string) => {
    const normalized = normalizeArticle(article);
    setArticleInput(normalized);
    setSelectedArticle(normalized);
    setShowArticleInfo(true);
    setPlanCompleteMsg("");
  }, []);

  const handleArticleChange = useCallback((value: string) => {
    setArticleInput(value);
    setSelectedArticle("");
    setShowArticleInfo(false);
    setPlanCompleteMsg("");
  }, []);

  const handleEntryTap = useCallback((article: string) => {
    const normalized = normalizeArticle(article);
    setArticleInput(normalized);
    setSelectedArticle(normalized);
    setShowArticleInfo(true);
    setPlanCompleteMsg("");
  }, []);

  /**
   * Add handler:
   * - Each add = new timelineId (separate timeline)
   * - Color reused while same article is added consecutively
   * - Color resets when a different article is added in between
   */
  const handleAdd = useCallback(async () => {
    if (!activeWelderId) return;
    const article = selectedArticle || normalizeArticle(articleInput);
    const qty = parseQty(qtyInput);
    if (!article || qty <= 0) return;

    const activePlan = getActivePlan(article);
    if (!activePlan) {
      setPlanCompleteMsg("Нет активного плана для этого артикула");
      return;
    }

    const planEntries = allWorkEntries.filter(
      (e) => e.planId === activePlan.id,
    );
    const completedQty = roundToHundredths(
      planEntries.reduce((sum, e) => sum + e.quantity, 0),
    );
    if (completedQty >= activePlan.targetQty) {
      setPlanCompleteMsg(`План для ${article} выполнен!`);
      return;
    }

    const norm = norms.find((n) => n.article === article);
    if (!norm) return;

    // Always new timeline ID, but reuse color while article stays the same
    const lastEntry = getMostRecentEntry(workEntries);
    const timelineId = crypto.randomUUID();
    const timelineColor =
      lastEntry?.article === article
        ? getTimelineColor(lastEntry)
        : generateRandomColor();
    const batchTimestamp = new Date();

    let remainingHours = roundToHundredths(calcHours(qty, norm.timeHours));

    const initialDates: { date: string; dayType: "workday" | "sb" | "vs" }[] =
      [];
    if (sbActive) initialDates.push({ date: getSaturdayStr(), dayType: "sb" });
    if (vsActive) initialDates.push({ date: getSundayStr(), dayType: "vs" });
    if (!sbActive && !vsActive) {
      const today = getTodayStr();
      initialDates.push({
        date: isWeekend(today) ? getNextWorkday(today) : today,
        dayType: "workday",
      });
    }

    for (const di of initialDates) {
      if (remainingHours <= 0.001) break;
      const available = Math.max(
        0,
        DAILY_HOURS_LIMIT - getExistingHoursForDate(di.date),
      );
      if (available <= 0) continue;
      const allocated = roundToHundredths(Math.min(available, remainingHours));
      await db.workEntries.add({
        welderId: activeWelderId,
        planId: activePlan.id!,
        article,
        quantity: roundToHundredths(allocated / norm.timeHours),
        date: di.date,
        dayType: di.dayType,
        timelineId,
        timelineColor,
        createdAt: batchTimestamp,
        updatedAt: batchTimestamp,
      });
      remainingHours = roundToHundredths(remainingHours - allocated);
    }

    if (remainingHours > 0.001) {
      const lastDate =
        initialDates.length > 0
          ? initialDates[initialDates.length - 1].date
          : getTodayStr();
      let cur = getNextWorkday(lastDate);
      let safety = 0;
      while (remainingHours > 0.001 && safety < 100) {
        const available = Math.max(
          0,
          DAILY_HOURS_LIMIT - getExistingHoursForDate(cur),
        );
        if (available > 0) {
          const allocated = roundToHundredths(
            Math.min(available, remainingHours),
          );
          await db.workEntries.add({
            welderId: activeWelderId,
            planId: activePlan.id!,
            article,
            quantity: roundToHundredths(allocated / norm.timeHours),
            date: cur,
            dayType: getDayTypeForDate(cur),
            timelineId,
            timelineColor,
            createdAt: batchTimestamp,
            updatedAt: batchTimestamp,
          });
          remainingHours = roundToHundredths(remainingHours - allocated);
        }
        cur = getNextWorkday(cur);
        safety++;
      }
    }

    await db.welders.update(activeWelderId, { updatedAt: new Date() });

    const updatedEntries = await db.workEntries
      .where("planId")
      .equals(activePlan.id!)
      .toArray();
    const newCompleted = roundToHundredths(
      updatedEntries.reduce((s, e) => s + e.quantity, 0),
    );
    if (newCompleted >= activePlan.targetQty && !activePlan.completedAt) {
      await db.plans.update(activePlan.id!, {
        completedAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await db.plans.update(activePlan.id!, { updatedAt: new Date() });
    }

    setArticleInput("");
    setQtyInput("");
    setSelectedArticle("");
    setShowArticleInfo(false);
    setPlanCompleteMsg("");
  }, [
    activeWelderId,
    articleInput,
    qtyInput,
    selectedArticle,
    sbActive,
    vsActive,
    workEntries,
    allWorkEntries,
    norms,
    getActivePlan,
    getExistingHoursForDate,
  ]);

  const handleDelete = useCallback(async (id: number) => {
    const entry = await db.workEntries.get(id);
    if (!entry) return;
    await db.workEntries.delete(id);
    if (entry.planId) {
      const plan = await db.plans.get(entry.planId);
      if (plan) {
        const remaining = await db.workEntries
          .where("planId")
          .equals(entry.planId)
          .toArray();
        const done = roundToHundredths(
          remaining.reduce((s, e) => s + e.quantity, 0),
        );
        if (done < plan.targetQty && plan.completedAt) {
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

    const planId = editModal.entry.planId;
    const plan = await db.plans.get(planId);
    if (plan) {
      const entries = await db.workEntries
        .where("planId")
        .equals(planId)
        .toArray();
      const done = roundToHundredths(
        entries.reduce((s, e) => s + e.quantity, 0),
      );
      if (done >= plan.targetQty && !plan.completedAt) {
        await db.plans.update(planId, {
          completedAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (done < plan.targetQty && plan.completedAt) {
        await db.plans.update(planId, {
          completedAt: null,
          updatedAt: new Date(),
        });
      }
    }

    setEditModal({ open: false, entry: null });
  }, [editModal.entry, editQty]);

  // ─── Build day groups with timeline metadata ────────────────────────────────

  const dayGroups = useMemo((): DayGroup[] => {
    const groupMap = new Map<string, DayGroup>();

    for (const entry of workEntries) {
      if (!groupMap.has(entry.date)) {
        groupMap.set(entry.date, {
          date: entry.date,
          dayType: entry.dayType,
          entries: [],
          totalHours: 0,
          headerActiveTimelineKeys: [],
        });
      }
      const group = groupMap.get(entry.date)!;
      const norm = norms.find((n) => n.article === entry.article);
      const normHours = norm?.timeHours || 0;
      group.entries.push({
        ...entry,
        normHours,
        timelineKey: getTimelineKey(entry),
        timelineColorResolved: getTimelineColor(entry),
        hasTimelineAbove: false,
        hasTimelineBelow: false,
        connectorMode: "single",
      });
      group.totalHours += calcHours(entry.quantity, normHours);
    }

    for (const group of groupMap.values()) {
      group.entries.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      group.totalHours = roundToHundredths(group.totalHours);
    }

    const sortedGroups = Array.from(groupMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );

    // Build flat list to detect first/last positions per timelineKey
    const flat = sortedGroups.flatMap((g) => g.entries);
    const indexMap = new Map<string, number[]>();
    flat.forEach((e, i) => {
      const arr = indexMap.get(e.timelineKey) || [];
      arr.push(i);
      indexMap.set(e.timelineKey, arr);
    });

    flat.forEach((e, i) => {
      const arr = indexMap.get(e.timelineKey)!;
      const first = arr[0];
      const last = arr[arr.length - 1];
      e.hasTimelineAbove = i !== first;
      e.hasTimelineBelow = i !== last;
      if (!e.hasTimelineAbove && !e.hasTimelineBelow)
        e.connectorMode = "single";
      else if (!e.hasTimelineAbove) e.connectorMode = "top";
      else if (!e.hasTimelineBelow) e.connectorMode = "bottom";
      else e.connectorMode = "none";
    });

    // Determine which timelines pass through each day-group header
    let startIdx = 0;
    for (const group of sortedGroups) {
      group.headerActiveTimelineKeys = Array.from(indexMap.entries())
        .filter(
          ([, arr]) => arr[0] < startIdx && arr[arr.length - 1] >= startIdx,
        )
        .map(([key]) => key);
      startIdx += group.entries.length;
    }

    return sortedGroups;
  }, [workEntries, norms]);

  // Map of timelineKey → color for header passthrough rendering
  const timelineColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of dayGroups) {
      for (const entry of group.entries) {
        if (!map.has(entry.timelineKey)) {
          map.set(entry.timelineKey, entry.timelineColorResolved);
        }
      }
    }
    return map;
  }, [dayGroups]);

  const handleBack = useCallback(() => {
    setActiveWelderId(null);
    setActiveScreen("main");
  }, [setActiveWelderId, setActiveScreen]);

  if (!welder) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Выберите сварщика
      </div>
    );
  }

  const currentArticleHint = selectedArticle
    ? getArticleHint(selectedArticle)
    : "";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="shrink-0 bg-card border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleBack}
            className="shrink-0 p-1.5 text-foreground active:bg-accent rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-base flex-1 truncate">
            {welder.name}
          </span>
          <button
            onClick={toggleSb}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              sbActive
                ? "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
                : "border-border text-muted-foreground"
            }`}
          >
            СБ
          </button>
          <button
            onClick={toggleVs}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              vsActive
                ? "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                : "border-border text-muted-foreground"
            }`}
          >
            ВС
          </button>
        </div>

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
              onChange={(e) => {
                setQtyInput(e.target.value);
                setPlanCompleteMsg("");
              }}
              placeholder="шт"
              className="w-20 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring text-right"
              inputMode="decimal"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <button
            onClick={handleAdd}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {showArticleInfo && currentArticleHint && (
          <div className="mt-1.5 px-2 py-1.5 text-xs text-muted-foreground bg-muted rounded-md">
            {currentArticleHint}
          </div>
        )}
        {planCompleteMsg && (
          <div className="mt-1.5 px-2 py-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-md font-semibold">
            {planCompleteMsg}
          </div>
        )}
      </div>

      {/* ── List ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          backgroundColor: "hsl(36 40% 74%)",
          backgroundImage:
            "radial-gradient(circle, hsl(36 38% 52%) 1.5px, transparent 1.5px)",
          backgroundSize: "18px 18px",
        }}
      >
        {dayGroups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Нет записей
          </div>
        ) : (
          <div className="flex flex-col px-3 py-3">
            {dayGroups.map((group, groupIdx) => {
              const isSb = group.dayType === "sb";
              const isVs = group.dayType === "vs";

              const cardBorderColor = isSb
                ? "border-orange-300 dark:border-orange-700"
                : isVs
                  ? "border-red-300 dark:border-red-700"
                  : "border-border";

              const headerBg = isSb
                ? "bg-orange-100 dark:bg-orange-900/50"
                : isVs
                  ? "bg-red-100 dark:bg-red-900/50"
                  : "bg-muted";

              const dateTextClass = isSb
                ? "text-orange-700 dark:text-orange-300"
                : isVs
                  ? "text-red-700 dark:text-red-300"
                  : "text-foreground";

              return (
                <React.Fragment key={group.date}>
                  {/* Gap between groups — timeline lines continue through it */}
                  {groupIdx > 0 && (
                    <div className="flex" style={{ height: "12px" }}>
                      <div
                        className="relative shrink-0"
                        style={{ width: TIMELINE_LEFT_WIDTH }}
                      >
                        {group.headerActiveTimelineKeys.map((key) => {
                          const color = timelineColorMap.get(key);
                          if (!color) return null;
                          return (
                            <div
                              key={key}
                              style={{
                                position: "absolute",
                                right: `${TL_ARM_W - TL_LINE_W / 2}px`,
                                top: 0,
                                bottom: 0,
                                width: `${TL_LINE_W}px`,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
                  <div>
                    {/* Header row: timeline outside, card header inside */}
                    <div className="flex">
                      <div
                        className="relative shrink-0"
                        style={{ width: TIMELINE_LEFT_WIDTH }}
                      >
                        {group.headerActiveTimelineKeys.map((key) => {
                          const color = timelineColorMap.get(key);
                          if (!color) return null;
                          return (
                            <div
                              key={key}
                              style={{
                                position: "absolute",
                                right: `${TL_ARM_W - TL_LINE_W / 2}px`,
                                top: 0,
                                bottom: 0,
                                width: `${TL_LINE_W}px`,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })}
                      </div>
                      <div
                        className={`flex-1 px-4 py-2 flex justify-between items-center border-t border-x rounded-t-xl ${headerBg} ${cardBorderColor}`}
                      >
                        <span className={`text-xs font-bold ${dateTextClass}`}>
                          {formatDate(group.date)} (
                          {getShortDayName(group.date)})
                          {isSb && <span className="ml-1">СБ</span>}
                          {isVs && <span className="ml-1">ВС</span>}
                        </span>
                        <span
                          className={`text-xs font-medium ${dateTextClass} opacity-70`}
                        >
                          {formatQtyShort(group.totalHours)} /{" "}
                          {DAILY_HOURS_LIMIT} ч
                        </span>
                      </div>
                    </div>

                    {/* Entry rows: timeline outside card border */}
                    {group.entries.map((entry, idx) => {
                      const isLast = idx === group.entries.length - 1;
                      const hours = entry.normHours
                        ? calcHours(entry.quantity, entry.normHours)
                        : 0;

                      return (
                        <div key={entry.id} className="flex">
                          {/* Timeline cell — outside the card */}
                          <div
                            className="relative shrink-0"
                            style={{ width: TIMELINE_LEFT_WIDTH }}
                          >
                            <TimelineCell
                              color={entry.timelineColorResolved}
                              mode={entry.connectorMode}
                            />
                          </div>

                          {/* Card row */}
                          <LongPressWrapper
                            className={`flex-1 min-w-0 bg-card border-x border-t ${
                              isLast ? "border-b rounded-b-xl" : ""
                            } ${cardBorderColor}`}
                            onLongPress={() => handleEditOpen(entry)}
                          >
                            <div
                              className="pl-4 pr-4 py-2.5 flex items-center justify-between gap-3 active:bg-accent/50 cursor-pointer"
                              onClick={() => handleEntryTap(entry.article)}
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span
                                  className="shrink-0 rounded-full"
                                  style={{
                                    display: "inline-block",
                                    width: `${TL_LINE_W + 1.5}px`,
                                    height: `${TL_LINE_W + 1.5}px`,
                                    backgroundColor:
                                      entry.timelineColorResolved,
                                  }}
                                />
                                <span className="font-mono font-semibold text-sm truncate">
                                  {entry.article}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-sm">
                                  {formatQtyShort(entry.quantity)} шт
                                </span>
                                {hours > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatQtyShort(hours)} ч
                                  </span>
                                )}
                              </div>
                            </div>
                          </LongPressWrapper>
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit / Delete modal ── */}
      <Dialog
        open={editModal.open}
        onOpenChange={(open) => setEditModal({ open, entry: null })}
      >
        <DialogContent className="max-w-75">
          <DialogHeader>
            <DialogTitle>Редактировать запись</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="text-sm font-mono font-semibold mb-1">
              {editModal.entry?.article}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {editModal.entry && formatDate(editModal.entry.date)}
              {editModal.entry?.dayType === "sb" ? " СБ" : ""}
              {editModal.entry?.dayType === "vs" ? " ВС" : ""}
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
            <Button className="flex-1" onClick={handleEditSave}>
              <Pencil className="w-4 h-4 mr-1" /> Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
