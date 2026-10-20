import { useEffect, useState } from 'react'
import { fmtMs, parseTime } from '../lib/time'

/**
 * Saisie d'un temps en texte libre (« 45.123 », « 1:23.45 »), convertie en ms.
 * La valeur n'est propagée qu'une fois valide ; une saisie invalide est surlignée.
 */
export function TimeInput({
  value,
  onChange,
  placeholder = 'm:ss.mmm',
  allowEmpty = true,
  className = '',
}: {
  value: number | null
  onChange: (ms: number | null) => void
  placeholder?: string
  allowEmpty?: boolean
  className?: string
}) {
  const [text, setText] = useState(value == null ? '' : fmtMs(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(value == null ? '' : fmtMs(value))
    setInvalid(false)
  }, [value])

  function commit() {
    if (text.trim() === '') {
      if (allowEmpty) {
        onChange(null)
        setInvalid(false)
      } else setInvalid(true)
      return
    }
    const ms = parseTime(text)
    if (ms == null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(fmtMs(ms))
    if (ms !== value) onChange(ms)
  }

  return (
    <input
      className={`mono ${className}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      style={invalid ? { outline: '2px solid var(--danger)' } : undefined}
      aria-invalid={invalid}
    />
  )
}
