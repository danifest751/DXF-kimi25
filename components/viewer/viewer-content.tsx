"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import {
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Eye,
  EyeOff,
  Layers,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { cn, formatCutLength, formatNumber, formatArea } from "@/lib/utils"
import { DxfCanvas } from "@/components/viewer/dxf-canvas"
import { LibraryPanel } from "@/components/viewer/library-panel"
import { PropertiesPanel } from "@/components/viewer/properties-panel"
import { toast } from "sonner"

export interface DxfDocument {
  name: string
  entities: number
  layers: string[]
  bbox: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  pierces: number
  cutLength: number
  areaMm2: number
}

export function ViewerContent() {
  const [activeDoc, setActiveDoc] = useState<DxfDocument | null>(null)
  const [zoom, setZoom] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const [showPierces, setShowPierces] = useState(true)
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set())
  const [selectedEntity, setSelectedEntity] = useState<number | null>(null)

  const handleFileDrop = useCallback((files: File[]) => {
    if (files.length === 0) return

    // Mock document for demo - in real app would parse with core-engine
    const mockDoc: DxfDocument = {
      name: files[0].name,
      entities: Math.floor(Math.random() * 500) + 100,
      layers: ["0", "Contour", "Cut", "Engrave", "Text"],
      bbox: {
        minX: 0,
        minY: 0,
        maxX: 500,
        maxY: 300,
      },
      pierces: Math.floor(Math.random() * 50) + 10,
      cutLength: Math.floor(Math.random() * 5000) + 1000,
      areaMm2: Math.floor(Math.random() * 100000) + 10000,
    }

    setActiveDoc(mockDoc)
    setVisibleLayers(new Set(mockDoc.layers))
    toast.success(`Загружен файл: ${files[0].name}`)
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "application/dxf": [".dxf"],
      "image/vnd.dxf": [".dxf"],
    },
    noClick: true,
    noKeyboard: true,
    onDrop: handleFileDrop,
  })

  const toggleLayer = (layer: string) => {
    setVisibleLayers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(layer)) {
        newSet.delete(layer)
      } else {
        newSet.add(layer)
      }
      return newSet
    })
  }

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 400))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25))
  const handleFit = () => setZoom(100)

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Toolbar */}
      <div className="flex h-12 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={open} className="gap-2">
            <Upload className="size-4" />
            Открыть
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleZoomOut}>
                  <ZoomOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Уменьшить</TooltipContent>
            </Tooltip>
            <span className="w-14 text-center text-sm font-mono">
              {zoom}%
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleZoomIn}>
                  <ZoomIn className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Увеличить</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleFit}>
                  <Maximize className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Вписать (F)</TooltipContent>
            </Tooltip>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showGrid ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid3X3 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Сетка (G)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showPierces ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowPierces(!showPierces)}
              >
                {showPierces ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Врезки</TooltipContent>
          </Tooltip>
        </div>

        {activeDoc && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono">{activeDoc.name}</span>
            <Badge variant="outline">{activeDoc.entities} сущностей</Badge>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Library sidebar */}
        <LibraryPanel onFileSelect={handleFileDrop} />

        {/* Canvas */}
        <div className="relative flex-1">
          {isDragActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary p-12">
                <Upload className="size-16 text-primary animate-pulse" />
                <p className="text-xl font-medium">Перетащите DXF файл</p>
              </div>
            </div>
          )}

          {activeDoc ? (
            <DxfCanvas
              document={activeDoc}
              zoom={zoom}
              showGrid={showGrid}
              showPierces={showPierces}
              visibleLayers={visibleLayers}
              onEntitySelect={setSelectedEntity}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-muted p-6">
                  <Upload className="size-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    Загрузите DXF файл
                  </h3>
                  <p className="mt-1 max-w-sm text-muted-foreground">
                    Перетащите файл в эту область или нажмите кнопку "Открыть"
                  </p>
                </div>
                <Button onClick={open} className="gap-2">
                  <Upload className="size-4" />
                  Выбрать файл
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Properties sidebar */}
        {activeDoc && (
          <PropertiesPanel
            document={activeDoc}
            visibleLayers={visibleLayers}
            onToggleLayer={toggleLayer}
            selectedEntity={selectedEntity}
          />
        )}
      </div>

      {/* Status bar */}
      {activeDoc && (
        <div className="flex h-8 items-center justify-between border-t bg-card px-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              Размер:{" "}
              <span className="font-mono text-foreground">
                {formatNumber(activeDoc.bbox.maxX - activeDoc.bbox.minX)} x{" "}
                {formatNumber(activeDoc.bbox.maxY - activeDoc.bbox.minY)} мм
              </span>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span>
              Врезок:{" "}
              <span className="font-mono text-foreground">
                {activeDoc.pierces}
              </span>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span>
              Длина реза:{" "}
              <span className="font-mono text-foreground">
                {formatCutLength(activeDoc.cutLength)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Масштаб: {zoom}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
