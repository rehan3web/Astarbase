'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarProps {
  selected?: Date | null
  onSelect?: (date: Date) => void
  className?: string
  minDate?: Date
  maxDate?: Date
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function Calendar({
  selected,
  onSelect,
  className,
  minDate,
  maxDate,
}: CalendarProps) {
  const [viewDate, setViewDate] = React.useState<Date>(() => {
    return selected ? new Date(selected) : new Date()
  })

  // Synchronize view when selected date changes externally
  React.useEffect(() => {
    if (selected) {
      setViewDate(new Date(selected))
    }
  }, [selected])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1))
  }

  const isToday = (d: number, m: number, y: number) => {
    const today = new Date()
    return (
      today.getDate() === d &&
      today.getMonth() === m &&
      today.getFullYear() === y
    )
  }

  const isSelected = (d: number, m: number, y: number) => {
    if (!selected) return false
    return (
      selected.getDate() === d &&
      selected.getMonth() === m &&
      selected.getFullYear() === y
    )
  }

  // Calculate calendar grid cells
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  // Previous month trailing days
  const prevDays = []
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    prevDays.push({
      day: daysInPrevMonth - i,
      month: month - 1,
      year: month === 0 ? year - 1 : year,
      isCurrentMonth: false,
    })
  }

  // Current month days
  const currentDays = []
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    currentDays.push({
      day: d,
      month,
      year,
      isCurrentMonth: true,
    })
  }

  // Next month leading days (fill up to 35 or 42 grid cells)
  const totalDays = prevDays.length + currentDays.length
  const remainingCells = totalDays > 35 ? 42 - totalDays : 35 - totalDays
  const nextDays = []
  for (let d = 1; d <= remainingCells; d++) {
    nextDays.push({
      day: d,
      month: month + 1,
      year: month === 11 ? year + 1 : year,
      isCurrentMonth: false,
    })
  }

  const allCalendarDays = [...prevDays, ...currentDays, ...nextDays]

  const handleSelectDay = (cell: { day: number; month: number; year: number }) => {
    const newSelected = new Date(cell.year, cell.month, cell.day)
    if (selected) {
      // Preserve existing hours, minutes, seconds if selected date had time
      newSelected.setHours(selected.getHours())
      newSelected.setMinutes(selected.getMinutes())
      newSelected.setSeconds(selected.getSeconds())
      newSelected.setMilliseconds(selected.getMilliseconds())
    }
    onSelect?.(newSelected)
  }

  return (
    <div className={cn('p-3 bg-surface-100 select-none font-sans', className)}>
      {/* Month & Year Navigation Header */}
      <div className="flex items-center justify-between pb-3">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <span>{MONTH_NAMES[month]}</span>
          <span className="text-foreground-lighter font-normal">{year}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-strong bg-surface-200 hover:bg-surface-300 text-foreground transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-strong bg-surface-200 hover:bg-surface-300 text-foreground transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
        {DAYS_OF_WEEK.map((d) => (
          <span
            key={d}
            className="text-[10px] font-medium text-foreground-lighter py-1 font-mono uppercase tracking-wider"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {allCalendarDays.map((cell, idx) => {
          const selectedState = isSelected(cell.day, cell.month, cell.year)
          const todayState = isToday(cell.day, cell.month, cell.year)

          return (
            <button
              key={`${cell.year}-${cell.month}-${cell.day}-${idx}`}
              type="button"
              onClick={() => handleSelectDay(cell)}
              className={cn(
                'h-7 w-7 text-xs rounded-md flex items-center justify-center transition-all cursor-pointer font-mono relative',
                cell.isCurrentMonth
                  ? 'text-foreground'
                  : 'text-foreground-muted/40 hover:text-foreground-muted',
                selectedState
                  ? 'bg-[#086E43] text-white font-semibold shadow-xs hover:bg-[#065836]'
                  : 'hover:bg-surface-200 hover:text-foreground',
                todayState && !selectedState && 'border border-brand/50 font-semibold text-brand'
              )}
            >
              <span>{cell.day}</span>
              {todayState && !selectedState && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
