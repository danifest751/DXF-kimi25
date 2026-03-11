"use client"

import { useState } from "react"
import Link from "next/link"
import { useDropzone } from "react-dropzone"
import {
  FileBox,
  Upload,
  LayoutGrid,
  Scissors,
  ArrowRight,
  Layers,
  Target,
  Ruler,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatCutLength, formatNumber } from "@/lib/utils"
import { useAppStore } from "@/lib/store"
import { toast } from "sonner"

export function DashboardContent() {
  const { library, set, nestingResults, getSetTotals } = useAppStore()
  const [isDragActive, setIsDragActive] = useState(false)

  const totals = getSetTotals()

  const { getRootProps, getInputProps, open } = useDropzone({
    accept: {
      "application/dxf": [".dxf"],
      "image/vnd.dxf": [".dxf"],
    },
    noClick: true,
    noKeyboard: true,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDrop: (acceptedFiles) => {
      setIsDragActive(false)
      if (acceptedFiles.length > 0) {
        toast.success(`Загружено ${acceptedFiles.length} файлов`)
        // TODO: Process files with core-engine
      }
    },
  })

  const stats = [
    {
      title: "Файлов в библиотеке",
      value: formatNumber(library.length),
      icon: FileBox,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Деталей в наборе",
      value: formatNumber(totals.totalQty),
      icon: Layers,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Врезок (набор)",
      value: formatNumber(totals.totalPierces),
      icon: Target,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Длина реза (набор)",
      value: formatCutLength(totals.totalCutLength),
      icon: Ruler,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ]

  const quickActions = [
    {
      title: "Просмотр DXF",
      description: "Загрузите и просматривайте чертежи",
      href: "/viewer",
      icon: FileBox,
    },
    {
      title: "Раскладка деталей",
      description: "Оптимизируйте раскладку на листы",
      href: "/nesting",
      icon: LayoutGrid,
    },
    {
      title: "Статистика резки",
      description: "Анализ врезок и длины реза",
      href: "/analytics",
      icon: Scissors,
    },
  ]

  return (
    <div className="space-y-8" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drop overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary bg-card p-12">
            <Upload className="size-16 text-primary animate-pulse" />
            <p className="text-xl font-medium">Перетащите DXF файлы сюда</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Добро пожаловать в DXF Viewer
          </h1>
          <p className="mt-2 text-muted-foreground">
            Профессиональный инструмент для работы с чертежами и оптимизации
            лазерной резки
          </p>
        </div>
        <Button onClick={open} size="lg" className="gap-2">
          <Upload className="size-4" />
          Загрузить DXF
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={cn("rounded-lg p-2", stat.bgColor)}>
                <stat.icon className={cn("size-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Быстрые действия</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="group relative h-full cursor-pointer overflow-hidden transition-colors hover:border-primary/50 hover:bg-card/80">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <action.icon className="size-5 text-primary" />
                    </div>
                    <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <CardTitle className="mt-4">{action.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent results */}
      {nestingResults && nestingResults.sheets.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Последняя раскладка</h2>
            <Link href="/nesting">
              <Button variant="outline" size="sm">
                Открыть
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Листов:</span>
                  <Badge variant="secondary">
                    {nestingResults.sheets.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Заполнение:</span>
                  <Badge variant="success">
                    {formatNumber(nestingResults.avgUtilization)}%
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Размещено:</span>
                  <span className="font-mono">
                    {nestingResults.totalPlaced} / {nestingResults.totalRequired}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Длина реза:</span>
                  <span className="font-mono">
                    {formatCutLength(nestingResults.totalCutLength)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {library.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4">
              <Upload className="size-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Начните работу</h3>
            <p className="mt-2 max-w-sm text-center text-muted-foreground">
              Загрузите DXF файлы для просмотра, анализа и оптимизации раскладки
              на листы металла
            </p>
            <Button onClick={open} className="mt-6 gap-2">
              <Upload className="size-4" />
              Загрузить файлы
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
