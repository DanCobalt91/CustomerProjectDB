import React from 'react'

export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input
      className={`w-full rounded-xl border border-zinc-600/40 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-400 outline-none ring-0 focus:border-zinc-400 ${className}`}
      {...rest}
    />
  )
}
