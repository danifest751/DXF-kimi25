"use client"

import { Eye, EyeOff, Info, Layers, Ruler, Target, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, formatCutLength, formatNumber, formatArea } from "@/lib/utils"
import type { DxfDocument } from "./viewer-content"

interface PropertiesPanelProps {
  document: DxfDocument
  visibleLayers: Set<string>
  onToggleLayer: (layer: string) => void
  selectedEntity: number | null
}

export function PropertiesPanel({
  document,
  visibleLayers,
  onToggleLayer,
  selectedEntity,
}: PropertiesPanelProps) {
  const stats = [
    {
      label: "Размер",
      value: `${formatNumber(document.bbox.maxX - document.bbox.minX)} x ${formatNumber(document.bbox.maxY - document.bbox.minY)} мм`,
      icon: Ruler,
    },
    {
      label: "Площадь",
      value: formatArea(document.areaMm2),
      icon: Info,
    },
    {
      label: "Врезки",
      value: formatNumber(document.pierces),
      icon: Target,
    },
    {
      label: "Длина реза",
      value: formatCutLength(document.cutLength),
      icon: Scissors,
    },
  ]

  return (
    <div className="flex h-full w-64 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="font-semibold">Свойства</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* File info */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Файл
            </p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="truncate font-medium">{document.name}</p>
              <p className="text-sm text-muted-foreground">
                {document.entities} сущностей
              </p>
            </div>
          </div>

          <Separator />

          {/* Stats */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Статистика
            </p>
            <div className="space-y-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <stat.icon className="size-4" />
                    <span>{stat.label}</span>
                  </div>
                  <span className="font-mono">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Layers */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Слои
              </p>
              <Badge variant="outline" className="text-xs">
                {document.layers.length}
              </Badge>
            </div>
            <div className="space-y-1">
              {document.layers.map((layer) => {
                const isVisible = visibleLayers.has(layer)
                return (
                  <div
                    key={layer}
                    className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-3 rounded-full",
                          layer === "0"
                            ? "bg-foreground"
                            : layer === "Contour"
                              ? "bg-primary"
                              : layer === "Cut"
                                ? "bg-destructive"
                                : layer === "Engrave"
                                  ? "bg-warning"
                                  : "bg-accent"
                        )}
                      />
                      <span className={cn(!isVisible && "text-muted-foreground")}>
                        {layer}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => onToggleLayer(layer)}
                    >
                      {isVisible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected entity info */}
          {selectedEntity !== null && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Выбранный объект
                </p>
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="font-mono text-sm">Entity #{selectedEntity}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
