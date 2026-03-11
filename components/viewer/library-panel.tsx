"use client"

import { useState } from "react"
import { useDropzone } from "react-dropzone"
import {
  FileBox,
  Search,
  Upload,
  MoreVertical,
  Trash2,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, formatCutLength, formatNumber } from "@/lib/utils"
import { useAppStore } from "@/lib/store"

interface LibraryPanelProps {
  onFileSelect: (files: File[]) => void
}

export function LibraryPanel({ onFileSelect }: LibraryPanelProps) {
  const { library, selectedIds, toggleSelected, addToSet, removeFromLibrary } =
    useAppStore()
  const [search, setSearch] = useState("")

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/dxf": [".dxf"],
      "image/vnd.dxf": [".dxf"],
    },
    onDrop: onFileSelect,
  })

  const filteredItems = library.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="font-semibold">Библиотека</h3>
        <Badge variant="secondary">{library.length}</Badge>
      </div>

      {/* Search */}
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredItems.length > 0 ? (
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm transition-colors hover:bg-accent",
                    selectedIds.has(item.id) && "bg-accent"
                  )}
                  onClick={() => toggleSelected(item.id)}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md",
                      item.status === "ok" && "bg-success/10 text-success",
                      item.status === "warn" && "bg-warning/10 text-warning",
                      item.status === "error" &&
                        "bg-destructive/10 text-destructive"
                    )}
                  >
                    <FileBox className="size-4" />
                  </div>
                  <div className="flex-1 truncate">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(item.width)} x {formatNumber(item.height)} мм
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => addToSet(item.id)}>
                        <Plus className="mr-2 size-4" />
                        Добавить в набор
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => removeFromLibrary(item.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : library.length === 0 ? (
            <div
              {...getRootProps()}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Перетащите DXF файлы
              </p>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Footer with upload */}
      <div className="border-t p-2">
        <div {...getRootProps()}>
          <input {...getInputProps()} />
          <Button variant="outline" className="w-full gap-2">
            <Upload className="size-4" />
            Загрузить файлы
          </Button>
        </div>
      </div>
    </div>
  )
}
