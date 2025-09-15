import React from 'react'

export function Card({ className = '', children, ...props }: any) {
  return (
    <div className={`rounded-2xl border border-zinc-700/50 bg-zinc-900/70 shadow-lg ${className}`} {...props}>
      {children}
    </div>
  )
}
export function CardHeader({ className = '', children }: any) {
  return <div className={`flex items-center justify-between gap-2 border-b border-zinc-700/40 p-4 ${className}`}>{children}</div>
}
export function CardContent({ className = '', children }: any) {
  return <div className={`p-4 ${className}`}>{children}</div>
}
