import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Security grade colors — semantic: green=safe, gold=good, amber=warn, orange=degraded, red=critical
export function gradeColor(score) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-[#FFD600]';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-[#F7931A]';
  return 'text-red-500';
}

export function gradeBg(score) {
  if (score >= 90) return 'bg-emerald-400/10';
  if (score >= 75) return 'bg-[#FFD600]/10';
  if (score >= 60) return 'bg-amber-400/10';
  if (score >= 40) return 'bg-[#F7931A]/10';
  return 'bg-red-500/10';
}

export function gradeLabel(grade) {
  const map = { A: 'Excellent', B: 'Bon', C: 'Moyen', D: 'Faible', F: 'Critique' };
  return map[grade] || 'Inconnu';
}

export function gradeStroke(grade) {
  const map = { A: '#34d399', B: '#FFD600', C: '#fbbf24', D: '#F7931A', F: '#ef4444' };
  return map[grade] || '#ef4444';
}
