'use client'
import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from '@/components/providers/ThemeProvider'
const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false })
export function SqlCodeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { theme } = useTheme()
  const [enhanced, setEnhanced] = useState(false)
  return <div className="flex-1 min-h-[220px] flex flex-col border-b border-default">
    <div className="text-right px-3 py-1 text-[10px] text-foreground-lighter"><button onClick={() => setEnhanced(!enhanced)}>{enhanced ? 'Use plain editor' : 'Enable syntax editor (loads Monaco)'}</button></div>
    {enhanced ? <Monaco height="100%" language="sql" theme={theme === 'dark' ? 'vs-dark' : 'light'} value={value} onChange={v => onChange(v || '')} options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true }} /> :
      <textarea aria-label="SQL query" spellCheck={false} value={value} onChange={e => onChange(e.target.value)} className="flex-1 w-full resize-none bg-studio text-foreground p-4 font-mono text-[13px] leading-6 outline-none" />}
  </div>
}
