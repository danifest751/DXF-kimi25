"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import type { DxfDocument } from "./viewer-content"

interface DxfCanvasProps {
  document: DxfDocument
  zoom: number
  showGrid: boolean
  showPierces: boolean
  visibleLayers: Set<string>
  onEntitySelect?: (entityId: number | null) => void
}

export function DxfCanvas({
  document,
  zoom,
  showGrid,
  showPierces,
  visibleLayers,
  onEntitySelect,
}: DxfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size to container size
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = "hsl(220, 15%, 5%)"
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Calculate transform
    const scale = zoom / 100
    const centerX = rect.width / 2 + pan.x
    const centerY = rect.height / 2 + pan.y

    // Draw grid
    if (showGrid) {
      const gridSize = 50 * scale
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"
      ctx.lineWidth = 1

      const startX = (centerX % gridSize) - gridSize
      const startY = (centerY % gridSize) - gridSize

      ctx.beginPath()
      for (let x = startX; x < rect.width + gridSize; x += gridSize) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, rect.height)
      }
      for (let y = startY; y < rect.height + gridSize; y += gridSize) {
        ctx.moveTo(0, y)
        ctx.lineTo(rect.width, y)
      }
      ctx.stroke()
    }

    // Transform for drawing
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.scale(scale, -scale) // Flip Y axis

    // Draw bounding box
    const { bbox } = document
    const width = bbox.maxX - bbox.minX
    const height = bbox.maxY - bbox.minY

    // Center the drawing
    ctx.translate(-width / 2, -height / 2)

    // Draw sheet outline
    ctx.strokeStyle = "rgba(0, 212, 255, 0.3)"
    ctx.lineWidth = 2 / scale
    ctx.setLineDash([10 / scale, 5 / scale])
    ctx.strokeRect(bbox.minX - 10, bbox.minY - 10, width + 20, height + 20)
    ctx.setLineDash([])

    // Draw mock geometry (demo shapes)
    ctx.strokeStyle = "hsl(190, 100%, 50%)"
    ctx.lineWidth = 1 / scale

    // Main outline
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.stroke()

    // Inner shapes (demo)
    const shapes = generateDemoShapes(width, height, document.entities)
    shapes.forEach((shape) => {
      ctx.beginPath()
      if (shape.type === "rect") {
        ctx.rect(shape.x, shape.y, shape.w, shape.h)
      } else if (shape.type === "circle") {
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2)
      }
      ctx.stroke()
    })

    // Draw pierce points
    if (showPierces) {
      ctx.fillStyle = "hsl(38, 92%, 50%)"
      const piercePoints = generatePiercePoints(shapes, document.pierces)
      piercePoints.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 3 / scale, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    ctx.restore()

    // Draw dimensions
    ctx.fillStyle = "hsl(210, 40%, 98%)"
    ctx.font = "12px JetBrains Mono, monospace"
    ctx.textAlign = "center"
    ctx.fillText(
      `${width.toFixed(0)} x ${height.toFixed(0)} мм`,
      rect.width / 2,
      rect.height - 20
    )
  }, [document, zoom, showGrid, showPierces, pan])

  // Handle resize
  useEffect(() => {
    draw()

    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])

  // Handle mouse events for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setLastMouse({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.x
      const dy = e.clientY - lastMouse.y
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
      setLastMouse({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    // Wheel zooming would modify the zoom prop via callback
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab bg-background active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

// Helper functions for demo visualization
function generateDemoShapes(
  width: number,
  height: number,
  count: number
): Array<
  { type: "rect"; x: number; y: number; w: number; h: number } |
  { type: "circle"; x: number; y: number; r: number }
> {
  const shapes: Array<
    { type: "rect"; x: number; y: number; w: number; h: number } |
    { type: "circle"; x: number; y: number; r: number }
  > = []
  const numShapes = Math.min(count / 10, 30)

  for (let i = 0; i < numShapes; i++) {
    const isCircle = Math.random() > 0.6
    if (isCircle) {
      const r = 10 + Math.random() * 30
      shapes.push({
        type: "circle",
        x: r + Math.random() * (width - r * 2),
        y: r + Math.random() * (height - r * 2),
        r,
      })
    } else {
      const w = 20 + Math.random() * 80
      const h = 15 + Math.random() * 60
      shapes.push({
        type: "rect",
        x: Math.random() * (width - w),
        y: Math.random() * (height - h),
        w,
        h,
      })
    }
  }

  return shapes
}

function generatePiercePoints(
  shapes: Array<
    { type: "rect"; x: number; y: number; w: number; h: number } |
    { type: "circle"; x: number; y: number; r: number }
  >,
  count: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  const numPoints = Math.min(count, shapes.length * 2)

  for (let i = 0; i < numPoints && i < shapes.length; i++) {
    const shape = shapes[i]
    if (shape.type === "rect") {
      points.push({ x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 })
    } else {
      points.push({ x: shape.x, y: shape.y })
    }
  }

  return points
}
