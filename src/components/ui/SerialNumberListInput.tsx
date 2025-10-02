import { useCallback, useState } from 'react'
import { Plus, X } from 'lucide-react'

import Button from './Button'
import Input from './Input'
import Label from './Label'

type SerialNumberListInputProps = {
  id: string
  label: string
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  validateAdd?: (serial: string, existing: string[]) => string | null
}

export default function SerialNumberListInput({
  id,
  label,
  values,
  onChange,
  disabled = false,
  placeholder,
  className = '',
  validateAdd,
}: SerialNumberListInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      setError('Enter a serial number before adding it.')
      return
    }

    const exists = values.some(entry => entry.toLowerCase() === trimmed.toLowerCase())
    if (exists) {
      setError('This serial number has already been added.')
      return
    }

    if (validateAdd) {
      const validationError = validateAdd(trimmed, values)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    onChange([...values, trimmed])
    setInputValue('')
    setError(null)
  }, [inputValue, onChange, validateAdd, values])

  const handleRemove = useCallback(
    (index: number) => {
      const next = values.filter((_, idx) => idx !== index)
      onChange(next)
      setError(null)
    },
    [onChange, values],
  )

  return (
    <div className={className}>
      <Label htmlFor={`${id}-input`}>{label}</Label>
      <div className='mt-1 flex flex-col gap-2 sm:flex-row'>
        <Input
          id={`${id}-input`}
          value={inputValue}
          onChange={event => {
            setInputValue((event.target as HTMLInputElement).value)
            if (error) {
              setError(null)
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!disabled) {
                handleAdd()
              }
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          onClick={handleAdd}
          disabled={disabled}
          title={disabled ? 'Read-only access' : 'Add serial number'}
        >
          <Plus size={16} /> Add
        </Button>
      </div>
      {error && <p className='mt-2 text-xs text-rose-600'>{error}</p>}
      <div className='mt-3 space-y-2'>
        {values.length === 0 ? (
          <p className='text-xs text-slate-500'>No serial numbers added.</p>
        ) : (
          <ul className='flex flex-wrap gap-2'>
            {values.map((serial, index) => (
              <li
                key={`${serial}-${index}`}
                className='flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-sm text-slate-700 shadow-sm'
              >
                <span className='font-medium text-slate-700'>{serial}</span>
                <button
                  type='button'
                  className='inline-flex items-center justify-center rounded-full border border-transparent p-1 text-slate-400 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60'
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                  title={disabled ? 'Read-only access' : 'Remove serial number'}
                >
                  <X size={14} />
                  <span className='sr-only'>Remove serial number</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
