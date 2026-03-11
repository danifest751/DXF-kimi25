"use client"

import { Settings2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppStore, SHEET_PRESETS } from "@/lib/store"

export function NestingSettingsPanel() {
  const {
    sheetPresetId,
    setSheetPresetId,
    customSheetWidth,
    customSheetHeight,
    setCustomSheetSize,
    gapMm,
    setGapMm,
    nestingStrategy,
    setNestingStrategy,
    rotationEnabled,
    setRotationEnabled,
    rotationStep,
    setRotationStep,
  } = useAppStore()

  return (
    <div className="flex h-full w-72 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-3">
        <Settings2 className="size-4 text-muted-foreground" />
        <h3 className="font-semibold">Настройки</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {/* Sheet size */}
          <div className="space-y-3">
            <Label className="text-xs font-medium uppercase text-muted-foreground">
              Размер листа
            </Label>
            <Select value={sheetPresetId} onValueChange={setSheetPresetId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите размер" />
              </SelectTrigger>
              <SelectContent>
                {SHEET_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {sheetPresetId === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Ширина (мм)</Label>
                  <Input
                    type="number"
                    value={customSheetWidth}
                    onChange={(e) =>
                      setCustomSheetSize(
                        Number(e.target.value),
                        customSheetHeight
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Высота (мм)</Label>
                  <Input
                    type="number"
                    value={customSheetHeight}
                    onChange={(e) =>
                      setCustomSheetSize(
                        customSheetWidth,
                        Number(e.target.value)
                      )
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Gap */}
          <div className="space-y-3">
            <Label className="text-xs font-medium uppercase text-muted-foreground">
              Зазор между деталями
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={gapMm}
                onChange={(e) => setGapMm(Number(e.target.value))}
                min={0}
                max={100}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">мм</span>
            </div>
          </div>

          <Separator />

          {/* Strategy */}
          <div className="space-y-3">
            <Label className="text-xs font-medium uppercase text-muted-foreground">
              Стратегия раскладки
            </Label>
            <Select
              value={nestingStrategy}
              onValueChange={(v) => setNestingStrategy(v as "maxrects_bbox" | "true_shape")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maxrects_bbox">
                  Прямоугольная (bbox)
                </SelectItem>
                <SelectItem value="true_shape">
                  Контурная (true shape)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Rotation */}
          <div className="space-y-3">
            <Label className="text-xs font-medium uppercase text-muted-foreground">
              Поворот деталей
            </Label>
            <div className="flex items-center justify-between">
              <Label htmlFor="rotation" className="text-sm">
                Разрешить поворот
              </Label>
              <Switch
                id="rotation"
                checked={rotationEnabled}
                onCheckedChange={setRotationEnabled}
              />
            </div>
            {rotationEnabled && (
              <div className="space-y-1">
                <Label className="text-xs">Шаг поворота</Label>
                <Select
                  value={rotationStep.toString()}
                  onValueChange={(v) => setRotationStep(Number(v) as 1 | 2 | 5)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1°</SelectItem>
                    <SelectItem value="2">2°</SelectItem>
                    <SelectItem value="5">5°</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
