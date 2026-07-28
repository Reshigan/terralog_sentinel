import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

/**
 * Terminus UI Layout - Split-Field Console (Option A)
 *
 * Mobile: stacked single column with collapsible sidebar drawer
 * Tablet+: persistent sidebar (ReadingList) + main area (ReadingForm)
 *
 * Design tokens from Terminus palette:
 * - surface: #0d0f11 (dark), #ffffff (light)
 * - accent: #f5a623
 * - ink: #e8ecf0 (dark), #14181c (light)
 * - line: #232830 (dark), #dfe2e6 (light)
 */
export function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <div className="min-h-[100dvh] bg-[#0d0f11] text-[#e8ecf0] font-mono">
      {/* Mobile header - sticky top */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[#232830] bg-[#0d0f11]/95 px-4 py-3 backdrop-blur-sm lg:hidden"
        aria-label="App header"
      >
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Terminus
        </h1>
        <div
          className="flex items-center gap-2"
          data-state="online"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          </span>
          <span className="text-xs text-[#aab0b8]">Online</span>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar - ReadingList */}
        <aside
          className="hidden lg:flex lg:w-72 lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-[#232830] lg:bg-[#16191d]"
          aria-label="Readings sidebar"
        >
          <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
            {/* Sidebar header */}
            <div className="border-b border-[#232830] px-4 py-4">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#aab0b8]">
                Recent readings
              </h2>
            </div>
            {/* Reading list content - would render ReadingList component here */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-sm text-[#aab0b8]">
                No readings yet. Submit your first reading to see it here.
              </div>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 px-4 py-4 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-2xl">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#232830] bg-[#0d0f11]/95 px-4 py-3 backdrop-blur-sm lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-[#232830] bg-[#16191d] px-4 py-2.5 text-sm font-semibold text-[#e8ecf0] transition-colors hover:bg-[#1a1e24]"
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            Menu
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-[#f5a623] px-6 py-2.5 text-sm font-semibold text-[#0d0f11] transition-colors hover:bg-[#e09820]"
            aria-label="Sync now"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            Sync
          </button>
        </div>
      </nav>

      {/* Spacer for fixed mobile nav */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </div>
  );
}
