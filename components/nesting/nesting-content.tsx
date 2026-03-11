"use client"

import { useState } from "react"
import {
  Play,
  Settings2,
  Download,
  Loader2,
  LayoutGrid,
  Trash2,
  Copy,
  Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn, formatCutLength, formatNumber, formatPercent } from "@/lib/utils"
import { useAppStore, SHEET_PRESETS } from "@/lib/store"
import { NestingSetPanel } from "./nesting-set-panel"
import { NestingSettingsPanel } from "./nesting-settings-panel"
import { SheetPreview } from "./sheet-preview"
import { toast } from "sonner"

export function NestingContent() {
  const {
    set,
    library,
    nestingPhase,
    setNestingPhase,
    nestingResults,
    setNestingResults,
    getSetTotals,
    getSheetSize,
  } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)

  const totals = getSetTotals()
  const sheetSize = getSheetSize()
  const isRunning = nestingPhase !== "idle"

  const handleRunNesting = async () => {
    if (set.size === 0) {
      toast.error("Набор пуст. Добавьте детали для раскладки.")
      return
    }

    setNestingPhase("preparing")

    // Simulate nesting process
    await new Promise((resolve) => setTimeout(resolve, 500))
    setNestingPhase("nesting")

    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Generate mock results
    const totalRequired = totals.totalQty
    const sheetsNeeded = Math.ceil(totalRequired / 8)
    const mockSheets = Array.from({ length: sheetsNeeded }, (_, i) => ({
      id: `sheet-${i + 1}`,
      utilization: 65 + Math.random() * 25,
      partCount: Math.min(8, totalRequired - i * 8),
      hash: Math.random().toString(36).substring(2, 10).toUpperCase(),
      sheetWidth: sheetSize.width,
      sheetHeight: sheetSize.height,
      gap: 5,
      placements: [],
    }))

    setNestingResults({
      sheets: mockSheets,
      totalPlaced: totalRequired,
      totalRequired,
      avgUtilization:
        mockSheets.reduce((a, s) => a + s.utilization, 0) / mockSheets.length,
      totalCutLength: totals.totalCutLength,
      totalPierces: totals.totalPierces,
    })

    setNestingPhase("idle")
    toast.success("Раскладка завершена")
  }

  const stats = [
    {
      label: "Листов",
      value: nestingResults?.sheets.length || 0,
      color: "text-primary",
    },
    {
      label: "Заполнение",
      value: nestingResults
        ? `${formatNumber(nestingResults.avgUtilization)}%`
        : "—",
      color: "text-accent",
    },
    {
      label: "Размещено",
      value: nestingResults
        ? `${nestingResults.totalPlaced}/${nestingResults.totalRequired}`
        : "—",
      color: "text-foreground",
    },
    {
      label: "Длина реза",
      value: nestingResults
        ? formatCutLength(nestingResults.totalCutLength)
        : "—",
      color: "text-warning",
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex h-12 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRunNesting}
            disabled={isRunning || set.size === 0}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {nestingPhase === "preparing"
                  ? "Подготовка..."
                  : "Раскладка..."}
              </>
            ) : (
              <>
                <Play className="size-4" />
                Запустить раскладку
              </>
            )}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showSettings ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Настройки раскладки</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-muted-foreground">{stat.label}:</span>
              <span className={cn("font-mono", stat.color)}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Set panel */}
        <NestingSetPanel />

        {/* Results */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {nestingResults && nestingResults.sheets.length > 0 ? (
            <ScrollArea className="flex-1">
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {nestingResults.sheets.map((sheet, index) => (
                  <SheetPreview
                    key={sheet.id}
                    sheet={sheet}
                    index={index + 1}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-muted p-6">
                  <LayoutGrid className="size-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Раскладка</h3>
                  <p className="mt-1 max-w-sm text-muted-foreground">
                    {set.size === 0
                      ? "Добавьте детали в набор и запустите раскладку"
                      : "Нажмите кнопку «Запустить раскладку» для оптимизации размещения деталей на листы"}
                  </p>
                </div>
                {set.size > 0 && (
                  <Button onClick={handleRunNesting} className="gap-2">
                    <Play className="size-4" />
                    Запустить
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Summary bar */}
          {nestingResults && (
            <div className="flex h-12 items-center justify-between border-t bg-card px-4">
              <div className="flex items-center gap-4 text-sm">
                <span>
                  Лист:{" "}
                  <span className="font-mono text-foreground">
                    {sheetSize.width} x {sheetSize.height} мм
                  </span>
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span>
                  Врезок:{" "}
                  <span className="font-mono text-foreground">
                    {nestingResults.totalPierces}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Copy className="size-4" />
                  Коды
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="size-4" />
                  Экспорт DXF
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Settings panel */}
        {showSettings && <NestingSettingsPanel />}
      </div>
    </div>
  )
}
