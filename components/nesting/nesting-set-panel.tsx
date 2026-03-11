"use client"

import { Plus, Minus, Trash2, Layers, FileBox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn, formatNumber, formatCutLength } from "@/lib/utils"
import { useAppStore } from "@/lib/store"

export function NestingSetPanel() {
  const {
    set,
    library,
    updateSetQty,
    removeFromSet,
    clearSet,
    getSetTotals,
  } = useAppStore()

  const totals = getSetTotals()
  const setItems = Array.from(set.entries()).map(([id, item]) => {
    const libItem = library.find((l) => l.id === id)
    return { ...item, ...libItem }
  })

  return (
    <div className="flex h-full w-72 flex-col border-r bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <h3 className="font-semibold">Набор</h3>
        </div>
        <Badge variant="secondary">{totals.totalQty} шт.</Badge>
      </div>

      {/* Summary */}
      <div className="border-b p-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Деталей</p>
            <p className="font-mono font-medium">{totals.totalParts}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Общее кол-во</p>
            <p className="font-mono font-medium">{totals.totalQty}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Врезок</p>
            <p className="font-mono font-medium">{totals.totalPierces}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Длина реза</p>
            <p className="font-mono font-medium">
              {formatCutLength(totals.totalCutLength)}
            </p>
          </div>
        </div>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {setItems.length > 0 ? (
            <div className="space-y-1">
              {setItems.map((item) => (
                <div
                  key={item.libraryId}
                  className="group flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-accent"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileBox className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.name || `Деталь #${item.libraryId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.width && item.height
                        ? `${formatNumber(item.width)} x ${formatNumber(item.height)} мм`
                        : "—"}
                    </p>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() =>
                        updateSetQty(item.libraryId, item.qty - 1)
                      }
                      disabled={item.qty <= 1}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-mono">
                      {item.qty}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() =>
                        updateSetQty(item.libraryId, item.qty + 1)
                      }
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100"
                    onClick={() => removeFromSet(item.libraryId)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Layers className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Набор пуст
              </p>
              <p className="text-xs text-muted-foreground">
                Добавьте детали из библиотеки
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {setItems.length > 0 && (
        <div className="border-t p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={clearSet}
          >
            <Trash2 className="size-4" />
            Очистить набор
          </Button>
        </div>
      )}
    </div>
  )
}
