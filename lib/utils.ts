import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

export function formatCutLength(mm: number): string {
  if (mm >= 1000) {
    return `${formatNumber(mm / 1000, 2)} м`
  }
  return `${formatNumber(mm, 1)} мм`
}

export function formatArea(mm2: number): string {
  const cm2 = mm2 / 100
  if (cm2 >= 10000) {
    return `${formatNumber(cm2 / 10000, 2)} м²`
  }
  return `${formatNumber(cm2, 1)} см²`
}

export function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`
}

export function formatFileSize(bytes: number): string {
  const units = ["Б", "КБ", "МБ", "ГБ"]
  let unitIndex = 0
  let size = bytes

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${formatNumber(size, 1)} ${units[unitIndex]}`
}
