import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'lg'
}

export default function Button({ className = '', variant = 'default', size = 'sm', children, ...props }: Props) {
  const base = 'inline-flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm transition active:scale-[.98]'
  const v =
    variant === 'outline'
      ? 'border-zinc-600/30 bg-transparent hover:bg-zinc-700/20'
      : variant === 'ghost'
      ? 'border-transparent bg-transparent hover:bg-zinc-700/20'
      : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
  const s = size === 'lg' ? 'px-4 py-3 text-base' : 'text-sm'
  return (
    <button className={`${base} ${v} ${s} ${className}`} {...props}>
      {children}
    </button>
  )
}
