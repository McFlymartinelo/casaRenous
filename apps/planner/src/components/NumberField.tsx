import { useEffect, useRef, useState } from "react"

export function NumberField({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  step = 0.05,
  min,
  max,
  suffix,
  digits = 2,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  onFocus?: () => void
  onBlur?: () => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  digits?: number
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value.toFixed(digits))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value.toFixed(digits))
  }, [digits, value])

  function commit(raw: string) {
    const parsed = Number.parseFloat(raw.replace(",", "."))
    if (Number.isFinite(parsed)) {
      const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))
      onChange(bounded)
      setDraft(bounded.toFixed(digits))
    } else {
      setDraft(value.toFixed(digits))
    }
  }

  return (
    <label className={`number-field${disabled ? " number-field--disabled" : ""}`}>
      <span className="number-field__label">{label}</span>
      <span className="number-field__control">
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          step={step}
          disabled={disabled}
          onFocus={() => {
            focused.current = true
            onFocus?.()
          }}
          onBlur={() => {
            focused.current = false
            commit(draft)
            onBlur?.()
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            const parsed = Number.parseFloat(event.target.value.replace(",", "."))
            if (Number.isFinite(parsed)) {
              const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))
              onChange(bounded)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
            if (event.key === "Escape") {
              setDraft(value.toFixed(digits))
              event.currentTarget.blur()
            }
          }}
        />
        {suffix ? <span className="number-field__suffix">{suffix}</span> : null}
      </span>
    </label>
  )
}
