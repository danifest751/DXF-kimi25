"use client"

import { useRef, useEffect, useCallback } from "react"
import { Download, Copy, ZoomIn } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn, formatNumber } from "@/lib/utils"
import type { SheetResult } from "@/lib/store"
import { toast } from "sonner"

interface SheetPreviewProps {
  sheet: SheetResult
  index: number
}

export function SheetPreview({ sheet, index }: SheetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = "hsl(220, 15%, 8%)"
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Calculate scale to fit sheet
    const padding = 16
    const availableWidth = rect.width - padding * 2
    const availableHeight = rect.height - padding * 2
    const scale = Math.min(
      availableWidth / sheet.sheetWidth,
      availableHeight / sheet.sheetHeight
    )

    const sheetW = sheet.sheetWidth * scale
    const sheetH = sheet.sheetHeight * scale
    const offsetX = (rect.width - sheetW) / 2
    const offsetY = (rect.height - sheetH) / 2

    // Draw sheet outline
    ctx.strokeStyle = "rgba(0, 212, 255, 0.3)"
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(offsetX, offsetY, sheetW, sheetH)
    ctx.setLineDash([])

    // Draw mock parts
    ctx.fillStyle = "rgba(0, 212, 255, 0.15)"
    ctx.strokeStyle = "hsl(190, 100%, 50%)"
    ctx.lineWidth = 1

    const numParts = sheet.partCount
    const cols = Math.ceil(Math.sqrt(numParts * (sheet.sheetWidth / sheet.sheetHeight)))
    const rows = Math.ceil(numParts / cols)
    const partW = (sheetW - 20) / cols
    const partH = (sheetH - 20) / rows

    for (let i = 0; i < numParts; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = offsetX + 10 + col * partW + 2
      const y = offsetY + 10 + row * partH + 2
      const w = partW - 4
      const h = partH - 4

      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }, [sheet])

  useEffect(() => {
    draw()
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [draw])

  const handleCopyHash = () => {
    navigator.clipboard.writeText(sheet.hash)
    toast.success(`Код скопирован: ${sheet.hash}`)
  }

  const utilizationColor =
    sheet.utilization >= 80
      ? "text-accent"
      : sheet.utilization >= 60
        ? "text-warning"
        : "text-destructive"

  return (
    <Card className="group overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Лист #{index}</CardTitle>
        <Badge
          variant="outline"
          className={cn("font-mono", utilizationColor)}
        >
          {formatNumber(sheet.utilization)}%
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Canvas preview */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
          <canvas ref={canvasRef} className="h-full w-full" />
          <div className="absolute inset-0 flex items-center justify-center bg-background/0 opacity-0 transition-opacity group-hover:bg-background/50 group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon">
                  <ZoomIn className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Открыть предпросмотр</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {sheet.partCount} деталей
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {sheet.sheetWidth}x{sheet.sheetHeight}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1"
                onClick={handleCopyHash}
              >
                <Copy className="size-3" />
                {sheet.hash}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Копировать код</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="size-8">
                <Download className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Скачать DXF</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  )
}
