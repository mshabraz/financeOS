import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names safely with tailwind-merge to avoid utility collisions.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
