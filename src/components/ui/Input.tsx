import React from 'react'

export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input
      className={`w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-800 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${className}`}
      {...rest}
    />
  )
}
