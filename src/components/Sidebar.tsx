import {
  FileText,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
  X,
} from 'lucide-react';

export type NavSection = 'overview' | 'verify' | 'history' | 'reports' | 'settings';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  historyCount: number;
}

const NAV_ITEMS: { id: NavSection; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'verify', label: 'New Verification', Icon: ScanSearch },
  { id: 'history', label: 'Verification History', Icon: History },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function TruthLensLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <rect width="28" height="28" rx="7" fill="#1E1B4B" stroke="#4F46E5" strokeWidth="1.25" />
        <circle cx="13" cy="13" r="5.5" stroke="#A5B4FC" strokeWidth="1.6" />
        <path d="M17.2 17.2L21.2 21.2" stroke="#818CF8" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10.8 13.1L12.3 14.6L15.4 11.3" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="font-semibold text-[15px] tracking-tight text-slate-100 whitespace-nowrap truncate">
          TruthLens AI
        </span>
      )}
    </div>
  );
}

export function Sidebar({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  historyCount,
}: SidebarProps) {
  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const navContent = (isMobile: boolean) => {
    const isCollapsed = !isMobile && collapsed;
    return (
      <div className="flex flex-col h-full bg-[#0C1222] border-r border-[#1F2B42]">
        <div
          className={`flex items-center h-16 px-4 border-b border-[#1F2B42] ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <TruthLensLogo compact={isCollapsed} />
          {isMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            !isCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                title={isCollapsed ? label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between'
                } ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-400' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  {!isCollapsed && <span className="whitespace-nowrap truncate">{label}</span>}
                </span>
                {!isCollapsed && id === 'history' && historyCount > 0 && (
                  <span className="text-xs font-mono tabular-nums text-slate-400">{historyCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1F2B42]">
          {isCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="w-full flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : (
            <div className="px-2 py-1.5 text-xs text-slate-400 leading-relaxed">
              Know whether an AI answer is still true.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{navContent(false)}</div>
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[272px] max-w-[85vw] h-full">{navContent(true)}</div>
        </div>
      )}
    </>
  );
}
