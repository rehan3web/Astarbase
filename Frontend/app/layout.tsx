import type { Metadata } from 'next'
import '@/styles/fonts.css'
import '@/styles/globals.css'
import '@/styles/ui.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { MobileRestriction } from '@/components/MobileRestriction'
import { StudioProvider } from '@/components/providers/StudioProvider'
import { NotificationProvider } from '@/components/providers/NotificationProvider'

export const metadata: Metadata = {
  title: 'Sorabase Studio',
  description: 'A self-hosted Postgres console for developers managing isolated branches.',
  icons: {
    icon: '/sorabase-icon.png',
    shortcut: '/sorabase-icon.png',
    apple: '/sorabase-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark h-full antialiased" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('studio-theme');
                  var d = document.documentElement;
                  if (theme === 'light') {
                    d.classList.remove('dark');
                    d.classList.add('light');
                    d.setAttribute('data-theme', 'light');
                    d.style.colorScheme = 'light';
                  } else {
                    d.classList.remove('light');
                    d.classList.add('dark');
                    d.setAttribute('data-theme', 'dark');
                    d.style.colorScheme = 'dark';
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="h-full w-full bg-studio text-foreground overflow-hidden font-sans">
        <ThemeProvider>
          <MobileRestriction />
          <NotificationProvider>
            <StudioProvider>{children}</StudioProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
