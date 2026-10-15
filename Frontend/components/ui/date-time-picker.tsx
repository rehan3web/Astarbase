'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Calendar as CalendarIcon, Clock, X, Check, Sparkles } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

export interface DateTimePickerProps {
  value?: string | null
  onChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
  mode?: 'datetime' | 'date' | 'time'
  className?: string
  id?: string
}

function parseDateTimeString(val?: string | null): Date | null {
  if (!val || typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!trimmed) return null

  // Support ISO string, YYYY-MM-DD HH:mm:ss, or YYYY-MM-DD
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  // Handle standard "YYYY-MM-DD HH:mm:ss" without timezone
  const parts = trimmed.split(/[\sT]+/)
  if (parts.length >= 1) {
    const dateParts = parts[0].split('-').map(Number)
    if (dateParts.length === 3 && !isNaN(dateParts[0])) {
      const year = dateParts[0]
      const month = dateParts[1] - 1
      const day = dateParts[2]
      let hours = 0
      let minutes = 0
      let seconds = 0

      if (parts[1]) {
        const timeParts = parts[1].split(':').map(Number)
        if (!isNaN(timeParts[0])) hours = timeParts[0]
        if (!isNaN(timeParts[1])) minutes = timeParts[1]
        if (!isNaN(timeParts[2])) seconds = timeParts[2]
      }
      return new Date(year, month, day, hours, minutes, seconds)
    }
  }
  return null
}

function formatTwoDigits(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateTime(date: Date, mode: 'datetime' | 'date' | 'time'): string {
  const y = date.getFullYear()
  const m = formatTwoDigits(date.getMonth() + 1)
  const d = formatTwoDigits(date.getDate())
  const hh = formatTwoDigits(date.getHours())
  const mm = formatTwoDigits(date.getMinutes())
  const ss = formatTwoDigits(date.getSeconds())

  if (mode === 'date') {
    return `${y}-${m}-${d}`
  }
  if (mode === 'time') {
    return `${hh}:${mm}:${ss}`
  }
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder,
  mode = 'datetime',
  className,
  id,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'timestamp' | 'date'>(
    mode === 'date' ? 'date' : 'timestamp'
  )

  const selectedDate = React.useMemo(() => parseDateTimeString(value), [value])

  // Internal time state for hours, minutes, seconds
  const [hours, setHours] = React.useState<string>(() =>
    selectedDate ? formatTwoDigits(selectedDate.getHours()) : '12'
  )
  const [minutes, setMinutes] = React.useState<string>(() =>
    selectedDate ? formatTwoDigits(selectedDate.getMinutes()) : '00'
  )
  const [seconds, setSeconds] = React.useState<string>(() =>
    selectedDate ? formatTwoDigits(selectedDate.getSeconds()) : '00'
  )

  // Keep hours/minutes/seconds synchronized when selectedDate updates
  React.useEffect(() => {
    if (selectedDate) {
      setHours(formatTwoDigits(selectedDate.getHours()))
      setMinutes(formatTwoDigits(selectedDate.getMinutes()))
      setSeconds(formatTwoDigits(selectedDate.getSeconds()))
    }
  }, [selectedDate])

  const handleSelectDate = (newDate: Date) => {
    const h = parseInt(hours, 10) || 0
    const m = parseInt(minutes, 10) || 0
    const s = parseInt(seconds, 10) || 0

    newDate.setHours(h)
    newDate.setMinutes(m)
    newDate.setSeconds(s)

    const formatted = formatDateTime(
      newDate,
      activeTab === 'date' ? 'date' : 'datetime'
    )
    onChange?.(formatted)
  }

  const handleTimeChange = (type: 'h' | 'm' | 's', val: string) => {
    const num = parseInt(val, 10)
    let validVal = val

    if (type === 'h') {
      if (!isNaN(num)) {
        const clamped = Math.max(0, Math.min(23, num))
        validVal = formatTwoDigits(clamped)
      }
      setHours(validVal)
    } else if (type === 'm') {
      if (!isNaN(num)) {
        const clamped = Math.max(0, Math.min(59, num))
        validVal = formatTwoDigits(clamped)
      }
      setMinutes(validVal)
    } else if (type === 's') {
      if (!isNaN(num)) {
        const clamped = Math.max(0, Math.min(59, num))
        validVal = formatTwoDigits(clamped)
      }
      setSeconds(validVal)
    }

    // Apply to current date if selected, or today if not selected
    const baseDate = selectedDate ? new Date(selectedDate) : new Date()
    const finalH = type === 'h' ? (parseInt(validVal, 10) || 0) : (parseInt(hours, 10) || 0)
    const finalM = type === 'm' ? (parseInt(validVal, 10) || 0) : (parseInt(minutes, 10) || 0)
    const finalS = type === 's' ? (parseInt(validVal, 10) || 0) : (parseInt(seconds, 10) || 0)

    baseDate.setHours(finalH, finalM, finalS)
    onChange?.(formatDateTime(baseDate, activeTab === 'date' ? 'date' : 'datetime'))
  }

  // Quick Action Helpers
  const setNow = () => {
    const now = new Date()
    setHours(formatTwoDigits(now.getHours()))
    setMinutes(formatTwoDigits(now.getMinutes()))
    setSeconds(formatTwoDigits(now.getSeconds()))
    onChange?.(formatDateTime(now, activeTab === 'date' ? 'date' : 'datetime'))
  }

  const setToday = () => {
    const today = new Date()
    if (activeTab === 'timestamp') {
      const h = parseInt(hours, 10) || 0
      const m = parseInt(minutes, 10) || 0
      const s = parseInt(seconds, 10) || 0
      today.setHours(h, m, s)
      onChange?.(formatDateTime(today, 'datetime'))
    } else {
      onChange?.(formatDateTime(today, 'date'))
    }
  }

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onChange?.('')
  }

  const defaultPlaceholder =
    placeholder ||
    (mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss')

  return (
    <div className={cn('relative w-full', className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <div className="relative flex items-center w-full">
          {/* Main Input field for display and manual entry */}
          <input
            id={id}
            type="text"
            disabled={disabled}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={defaultPlaceholder}
            className={cn(
              'w-full h-8 pl-3 pr-16 rounded-md bg-surface-200 border border-strong text-foreground text-xs font-mono outline-none',
              'transition-colors focus:border-brand disabled:opacity-50'
            )}
          />

          {/* Action Icons right side: Clear + Calendar Icon Trigger */}
          <div className="absolute right-1.5 flex items-center gap-1">
            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded text-foreground-lighter hover:text-foreground hover:bg-surface-300 transition-colors cursor-pointer"
                title="Clear date"
              >
                <X className="h-3 w-3" />
              </button>
            )}

            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'p-1.5 rounded-md text-foreground-lighter hover:text-brand hover:bg-surface-300 transition-colors cursor-pointer',
                  open && 'text-brand bg-surface-300',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
                title="Select date and timestamp"
                aria-label="Open calendar"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>
            </PopoverPrimitive.Trigger>
          </div>
        </div>

        {/* Calendar & Timestamp Popover Content */}
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="bottom"
            align="start"
            sideOffset={4}
            className={cn(
              'z-[70] w-80 rounded-lg border border-overlay bg-surface-100 p-0 text-foreground shadow-2xl outline-none select-none font-sans',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
            )}
          >
            {/* Tabs Header: [Timestamp] vs [Date] */}
            <div className="flex items-center border-b border-default bg-surface-200/50 px-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('timestamp')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px',
                  activeTab === 'timestamp'
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-foreground-lighter hover:text-foreground'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Timestamp</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('date')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px',
                  activeTab === 'date'
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-foreground-lighter hover:text-foreground'
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Date</span>
              </button>

              {/* Quick "Now" pill */}
              <button
                type="button"
                onClick={setNow}
                className="ml-auto text-[10px] px-2 py-0.5 rounded bg-brand/10 text-brand hover:bg-brand/20 border border-brand/20 font-mono transition-colors cursor-pointer flex items-center gap-1"
                title="Set current date and time"
              >
                <Sparkles className="h-2.5 w-2.5" />
                <span>Now</span>
              </button>
            </div>

            {/* Custom Modern Calendar Grid */}
            <Calendar
              selected={selectedDate}
              onSelect={handleSelectDate}
              className="border-b border-default"
            />

            {/* Timestamp Tab Controls: Hours : Minutes : Seconds */}
            {activeTab === 'timestamp' && (
              <div className="p-3 bg-surface-200/30 border-b border-default">
                <div className="flex items-center justify-between text-[11px] text-foreground-lighter mb-1.5">
                  <span className="font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Time (24h)</span>
                  </span>
                  <span className="font-mono text-[10px] text-foreground-muted">
                    HH : MM : SS
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Hours */}
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={hours}
                      onChange={(e) => handleTimeChange('h', e.target.value)}
                      placeholder="HH"
                      className="w-full h-8 px-2 text-center rounded bg-surface-200 border border-strong text-foreground text-xs font-mono outline-none focus:border-brand"
                    />
                  </div>
                  <span className="text-foreground-lighter font-bold">:</span>
                  {/* Minutes */}
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={minutes}
                      onChange={(e) => handleTimeChange('m', e.target.value)}
                      placeholder="MM"
                      className="w-full h-8 px-2 text-center rounded bg-surface-200 border border-strong text-foreground text-xs font-mono outline-none focus:border-brand"
                    />
                  </div>
                  <span className="text-foreground-lighter font-bold">:</span>
                  {/* Seconds */}
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={seconds}
                      onChange={(e) => handleTimeChange('s', e.target.value)}
                      placeholder="SS"
                      className="w-full h-8 px-2 text-center rounded bg-surface-200 border border-strong text-foreground text-xs font-mono outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions & Confirm Footer */}
            <div className="p-2.5 bg-surface-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={setToday}
                  className="px-2 py-1 text-[11px] rounded bg-surface-200 hover:bg-surface-300 text-foreground transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleClear()}
                  className="px-2 py-1 text-[11px] rounded bg-surface-200 hover:bg-surface-300 text-foreground-lighter hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1 rounded bg-[#086E43] hover:bg-[#065836] border border-[#338161] text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                <span>Done</span>
              </button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
