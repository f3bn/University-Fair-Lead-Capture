'use client'

import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface SearchableComboboxProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  dir?: 'rtl' | 'ltr'
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder,
  className,
  dir,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        // Save the current input value when clicking outside
        if (inputValue !== value) {
          onChange(inputValue)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [inputValue, value, onChange])

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(inputValue.toLowerCase())
  )

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    // Immediately update parent with typed value
    onChange(newValue)
  }

  const handleOptionSelect = (option: string) => {
    setInputValue(option)
    onChange(option)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)} dir={dir}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={cn('rounded-xl', dir === 'rtl' && 'text-right')}
        dir={dir}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          <ScrollArea className="max-h-48">
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleOptionSelect(option)}
                className={cn(
                  'w-full px-3 py-2 text-start hover:bg-accent transition-colors text-sm',
                  dir === 'rtl' && 'text-right',
                  option === value && 'bg-accent'
                )}
              >
                {option}
              </button>
            ))}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
