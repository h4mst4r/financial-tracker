import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Icon } from './Icon'

interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

export function Dropdown({ value, options, onChange, placeholder, disabled, id }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  // Close on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleOutsideClick, handleKeyDown])

  const handleTriggerClick = () => {
    if (!disabled) {
      setOpen((p) => !p)
      setActiveIndex(-1)
    }
  }

  const handleOptionClick = (optValue: string) => {
    onChange(optValue)
    setOpen(false)
  }

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleOptionClick(options[activeIndex].value)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={handleTriggerClick}
        className={`
          w-full h-control py-control px-sm rounded-md text-sm
          bg-surface-raised border text-text-primary
          transition-colors duration-quick
          flex items-center justify-between gap-2
          focus:outline-none
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : open
              ? 'border-border-accent ring-2 ring-glow-accent'
              : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
          }
        `}
      >
        <span className={selectedOption ? 'text-text-primary' : 'text-text-muted'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon icon={ChevronDown} size={16} className={`transition-transform duration-quick ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute z-dropdown mt-1 w-full bg-surface-raised border border-border rounded-md shadow-lg"
          onKeyDown={handlePanelKeyDown}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              className={`
                w-full flex items-center justify-between px-sm py-2 text-sm
                ${i === activeIndex ? 'bg-surface-active' : 'hover:bg-surface-hover'}
                ${opt.value === value ? 'text-primary' : 'text-text-primary'}
              `}
              onClick={() => handleOptionClick(opt.value)}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Icon icon={Check} size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
