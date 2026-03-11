"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

// Types from core-engine
export interface LibraryItem {
  id: number
  name: string
  catalog: string
  width: number
  height: number
  areaMm2: number
  pierces: number
  cutLength: number
  layersCount: number
  status: "ok" | "warn" | "error"
  issues: string[]
}

export interface SetItem {
  libraryId: number
  qty: number
  enabled: boolean
}

export interface SheetResult {
  id: string
  utilization: number
  partCount: number
  hash: string
  sheetWidth: number
  sheetHeight: number
  gap: number
  placements: Array<{
    itemId: number
    name: string
    x: number
    y: number
    w: number
    h: number
    angleDeg: number
  }>
}

export interface NestingResults {
  sheets: SheetResult[]
  totalPlaced: number
  totalRequired: number
  avgUtilization: number
  totalCutLength: number
  totalPierces: number
}

export type NestingStrategy = "maxrects_bbox" | "true_shape"
export type NestingPhase = "idle" | "preparing" | "nesting" | "saving"

export interface SheetPreset {
  id: string
  label: string
  width: number
  height: number
}

export const SHEET_PRESETS: SheetPreset[] = [
  { id: "1500x3000", label: "1500 x 3000", width: 1500, height: 3000 },
  { id: "1250x2500", label: "1250 x 2500", width: 1250, height: 2500 },
  { id: "1000x2000", label: "1000 x 2000", width: 1000, height: 2000 },
  { id: "600x1200", label: "600 x 1200", width: 600, height: 1200 },
  { id: "custom", label: "Свой размер", width: 1500, height: 3000 },
]

interface AppState {
  // Library
  library: LibraryItem[]
  setLibrary: (items: LibraryItem[]) => void
  addToLibrary: (item: LibraryItem) => void
  removeFromLibrary: (id: number) => void

  // Selected items
  selectedIds: Set<number>
  toggleSelected: (id: number) => void
  selectAll: () => void
  clearSelection: () => void

  // Set for nesting
  set: Map<number, SetItem>
  addToSet: (id: number, qty?: number) => void
  removeFromSet: (id: number) => void
  updateSetQty: (id: number, qty: number) => void
  clearSet: () => void

  // Nesting settings
  sheetPresetId: string
  setSheetPresetId: (id: string) => void
  customSheetWidth: number
  customSheetHeight: number
  setCustomSheetSize: (w: number, h: number) => void
  gapMm: number
  setGapMm: (gap: number) => void
  nestingStrategy: NestingStrategy
  setNestingStrategy: (strategy: NestingStrategy) => void
  rotationEnabled: boolean
  setRotationEnabled: (enabled: boolean) => void
  rotationStep: 1 | 2 | 5
  setRotationStep: (step: 1 | 2 | 5) => void

  // Nesting state
  nestingPhase: NestingPhase
  setNestingPhase: (phase: NestingPhase) => void
  nestingResults: NestingResults | null
  setNestingResults: (results: NestingResults | null) => void

  // UI state
  previewItemId: number | null
  setPreviewItemId: (id: number | null) => void
  previewSheetId: string | null
  setPreviewSheetId: (id: string | null) => void

  // Computed helpers
  getSheetSize: () => { width: number; height: number }
  getSetTotals: () => {
    totalParts: number
    totalQty: number
    totalPierces: number
    totalCutLength: number
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Library
      library: [],
      setLibrary: (items) => set({ library: items }),
      addToLibrary: (item) =>
        set((state) => ({ library: [...state.library, item] })),
      removeFromLibrary: (id) =>
        set((state) => ({
          library: state.library.filter((item) => item.id !== id),
        })),

      // Selected
      selectedIds: new Set(),
      toggleSelected: (id) =>
        set((state) => {
          const newSet = new Set(state.selectedIds)
          if (newSet.has(id)) {
            newSet.delete(id)
          } else {
            newSet.add(id)
          }
          return { selectedIds: newSet }
        }),
      selectAll: () =>
        set((state) => ({
          selectedIds: new Set(state.library.map((item) => item.id)),
        })),
      clearSelection: () => set({ selectedIds: new Set() }),

      // Set
      set: new Map(),
      addToSet: (id, qty = 1) =>
        set((state) => {
          const newSet = new Map(state.set)
          const existing = newSet.get(id)
          if (existing) {
            newSet.set(id, { ...existing, qty: existing.qty + qty })
          } else {
            newSet.set(id, { libraryId: id, qty, enabled: true })
          }
          return { set: newSet }
        }),
      removeFromSet: (id) =>
        set((state) => {
          const newSet = new Map(state.set)
          newSet.delete(id)
          return { set: newSet }
        }),
      updateSetQty: (id, qty) =>
        set((state) => {
          const newSet = new Map(state.set)
          const existing = newSet.get(id)
          if (existing) {
            newSet.set(id, { ...existing, qty: Math.max(1, qty) })
          }
          return { set: newSet }
        }),
      clearSet: () => set({ set: new Map(), nestingResults: null }),

      // Nesting settings
      sheetPresetId: "1500x3000",
      setSheetPresetId: (id) => set({ sheetPresetId: id }),
      customSheetWidth: 1500,
      customSheetHeight: 3000,
      setCustomSheetSize: (w, h) =>
        set({ customSheetWidth: w, customSheetHeight: h }),
      gapMm: 5,
      setGapMm: (gap) => set({ gapMm: gap }),
      nestingStrategy: "maxrects_bbox",
      setNestingStrategy: (strategy) => set({ nestingStrategy: strategy }),
      rotationEnabled: true,
      setRotationEnabled: (enabled) => set({ rotationEnabled: enabled }),
      rotationStep: 2,
      setRotationStep: (step) => set({ rotationStep: step }),

      // Nesting state
      nestingPhase: "idle",
      setNestingPhase: (phase) => set({ nestingPhase: phase }),
      nestingResults: null,
      setNestingResults: (results) => set({ nestingResults: results }),

      // UI
      previewItemId: null,
      setPreviewItemId: (id) => set({ previewItemId: id }),
      previewSheetId: null,
      setPreviewSheetId: (id) => set({ previewSheetId: id }),

      // Computed
      getSheetSize: () => {
        const state = get()
        if (state.sheetPresetId === "custom") {
          return {
            width: state.customSheetWidth,
            height: state.customSheetHeight,
          }
        }
        const preset = SHEET_PRESETS.find((p) => p.id === state.sheetPresetId)
        return preset
          ? { width: preset.width, height: preset.height }
          : { width: 1500, height: 3000 }
      },
      getSetTotals: () => {
        const state = get()
        let totalParts = 0
        let totalQty = 0
        let totalPierces = 0
        let totalCutLength = 0

        state.set.forEach((setItem) => {
          if (setItem.enabled) {
            const libItem = state.library.find(
              (item) => item.id === setItem.libraryId
            )
            if (libItem) {
              totalParts++
              totalQty += setItem.qty
              totalPierces += libItem.pierces * setItem.qty
              totalCutLength += libItem.cutLength * setItem.qty
            }
          }
        })

        return { totalParts, totalQty, totalPierces, totalCutLength }
      },
    }),
    {
      name: "dxf-viewer-store",
      partialize: (state) => ({
        sheetPresetId: state.sheetPresetId,
        customSheetWidth: state.customSheetWidth,
        customSheetHeight: state.customSheetHeight,
        gapMm: state.gapMm,
        nestingStrategy: state.nestingStrategy,
        rotationEnabled: state.rotationEnabled,
        rotationStep: state.rotationStep,
      }),
    }
  )
)
