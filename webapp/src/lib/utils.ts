import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Склеивает классы Tailwind, поздние перекрывают ранние: cn('p-2', 'p-4') → 'p-4'. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
