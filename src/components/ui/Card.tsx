import React from 'react'

export function Card({ className = '', children, ...props }: any) {
  return (
    <div
      className={`rounded-3xl border border-slate-200/60 bg-white/85 shadow-[0_24px_55px_-32px_rgba(15,23,42,0.65)] transition-shadow duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
export function CardHeader({ className = '', children }: any) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b border-slate-200/70 bg-white/60 p-5 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  )
}
export function CardContent({ className = '', children }: any) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
