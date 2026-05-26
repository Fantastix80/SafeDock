import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function gradeColor(score) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-blue-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-500';
}

export function gradeBg(score) {
  if (score >= 90) return 'bg-emerald-400/10';
  if (score >= 75) return 'bg-blue-400/10';
  if (score >= 60) return 'bg-amber-400/10';
  if (score >= 40) return 'bg-orange-400/10';
  return 'bg-red-500/10';
}

export function gradeLabel(grade) {
  const map = { A: 'Excellent', B: 'Bon', C: 'Moyen', D: 'Faible', F: 'Critique' };
  return map[grade] || 'Inconnu';
}

export function gradeStroke(grade) {
  const map = { A: '#34d399', B: '#4F8EF7', C: '#fbbf24', D: '#f97316', F: '#ef4444' };
  return map[grade] || '#ef4444';
}
