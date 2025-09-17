import React from 'react'

export default function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`} {...props}>
      {children}
    </label>
  )
}
