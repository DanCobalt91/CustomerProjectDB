import React from 'react'

export default function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-xs uppercase tracking-wide text-zinc-400 ${className}`} {...props}>
      {children}
    </label>
  )
}
