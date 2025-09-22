import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'lg'
}

export default function Button({
  className = '',
  variant = 'default',
  size = 'sm',
  type = 'button',
  children,
  ...props
}: Props) {
  const base =
    'inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium shadow-sm transition active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none'
  const v =
    variant === 'outline'
      ? 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-white hover:border-slate-300'
      : variant === 'ghost'
      ? 'border-transparent text-slate-600 hover:bg-slate-100/80'
      : 'border-transparent bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-[0_10px_25px_-18px_rgba(14,165,233,0.9)] hover:from-sky-500 hover:to-sky-600'
  const s = size === 'lg' ? 'px-4 py-3 text-base' : ''
  return (
    <button type={type} className={`${base} ${v} ${s} ${className}`} {...props}>
      {children}
    </button>
  )
}
