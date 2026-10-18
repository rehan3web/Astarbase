'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from '@/components/providers/ThemeProvider'
import { LoadingIndicator } from '@/components/ui/spinner'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <LoadingIndicator label="Loading SQL editor" className="flex-1 bg-surface-100" size={28} />,
})
interface SqlCodeEditorProps { value: string; onChange: (value: string) => void }
export function SqlCodeEditor({ value, onChange }: SqlCodeEditorProps) {
  const { theme } = useTheme()
  return <div className={`flex-1 min-h-[220px] relative border-b border-default ${theme === 'dark' ? 'bg-[#171717]' : 'bg-[#ffffff]'}`}>
    <label htmlFor="sql-monaco-editor" className="sr-only">SQL query</label>
    <MonacoEditor
      height="100%"
      language="sql"
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      value={value}
      onChange={value => onChange(value || '')}
      options={{
        ariaLabel: 'SQL query',
        fontSize: 13,
        fontFamily: "'Source Code Pro', monospace",
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        cursorBlinking: 'smooth',
        renderLineHighlight: 'line',
      }}
    />
  </div>
}
