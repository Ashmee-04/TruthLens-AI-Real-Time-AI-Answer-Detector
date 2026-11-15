import { Menu, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  AppPreferences,
  DashboardMetrics,
  HealthResponse,
  VerificationRecord,
} from '../shared/types.ts';
import { HistoryPage } from './components/HistoryPage.tsx';
import { NewVerificationPage } from './components/NewVerificationPage.tsx';
import { OverviewPage } from './components/OverviewPage.tsx';
import { ReportsPage } from './components/ReportsPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { Sidebar, type NavSection } from './components/Sidebar.tsx';
import {
  deleteHistoryRecord,
  fetchHealth,
  fetchHistory,
  testConnections,
} from './utils/api.ts';
import { loadPreferences, savePreferences } from './utils/preferences.ts';

const EMPTY_METRICS: DashboardMetrics = {
  totalVerifications: 0,
  totalClaimsProcessed: 0,
  potentiallyOutdatedClaims: 0,
  conflictingClaims: 0,
  unverifiableClaims: 0,
  verifiedClaims: 0,
};

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  verify: 'New Verification',
  history: 'Verification History',
  reports: 'Reports',
  settings: 'Settings',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [activeVerificationResult, setActiveVerificationResult] =
    useState<VerificationRecord | null>(null);
  const [selectedReportRecord, setSelectedReportRecord] =
    useState<VerificationRecord | null>(null);

  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());

  const refreshData = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [historyRes, healthRes] = await Promise.all([fetchHistory(), fetchHealth(false)]);
      setRecords(historyRes.records);
      setMetrics(historyRes.metrics);
      setHealth(healthRes);
      setHealthError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach TruthLens AI backend.';
      setHistoryError(msg);
      setHealthError(msg);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleTestConnections = async () => {
    setHealthError(null);
    try {
      const res = await testConnections();
      setHealth(res);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Connection test failed.');
    }
  };

  const handleVerificationComplete = (record: VerificationRecord) => {
    setActiveVerificationResult(record);
    setSelectedReportRecord(record);
    // Refresh server history & dashboard metrics immediately from persistent storage
    void fetchHistory()
      .then((res) => {
        setRecords(res.records);
        setMetrics(res.metrics);
      })
      .catch(() => {
        // At minimum update client view with the returned saved record
        setRecords((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
      });
  };

  const handleDeleteRecord = async (id: string) => {
    await deleteHistoryRecord(id);
    if (activeVerificationResult?.id === id) setActiveVerificationResult(null);
    if (selectedReportRecord?.id === id) setSelectedReportRecord(null);
    const res = await fetchHistory();
    setRecords(res.records);
    setMetrics(res.metrics);
  };

  const handleOpenVerification = (record: VerificationRecord) => {
    setActiveVerificationResult(record);
    setActiveSection('verify');
  };

  const handleOpenReport = (record: VerificationRecord) => {
    setSelectedReportRecord(record);
    setActiveSection('reports');
  };

  const handleUpdatePreferences = (next: AppPreferences) => {
    setPreferences(next);
    savePreferences(next);
  };

  const navigateTo = (section: NavSection) => {
    if (section === 'verify' && activeSection !== 'verify') {
      // Keep active result only when navigating intentionally via Open Claims;
      // clicking New Verification from nav starts clean if already viewing a past item
      setActiveVerificationResult(null);
    }
    setActiveSection(section);
  };

  return (
    <div className="min-h-screen flex bg-[#090E1A] text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={navigateTo}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        historyCount={records.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean single-row Top Bar */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 bg-[#090E1A]/95 backdrop-blur-sm border-b border-[#1F2B42]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">TruthLens AI</span>
              <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-100 truncate">
                {SECTION_TITLES[activeSection]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeSection !== 'verify' && (
              <button
                type="button"
                onClick={() => {
                  setActiveVerificationResult(null);
                  setActiveSection('verify');
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />
                <span>New Verification</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1280px] w-full mx-auto">
          {activeSection === 'overview' && (
            <OverviewPage
              metrics={metrics}
              recentRecords={records}
              loading={historyLoading}
              error={historyError}
              health={health}
              onNewVerification={() => {
                setActiveVerificationResult(null);
                setActiveSection('verify');
              }}
              onOpenRecord={handleOpenVerification}
              onOpenSettings={() => setActiveSection('settings')}
            />
          )}

          {activeSection === 'verify' && (
            <NewVerificationPage
              maxInputChars={health?.maxInputChars ?? 12000}
              preferences={preferences}
              activeResult={activeVerificationResult}
              onVerificationComplete={handleVerificationComplete}
              onClearActiveResult={() => setActiveVerificationResult(null)}
              onOpenReport={handleOpenReport}
              onOpenSettings={() => setActiveSection('settings')}
            />
          )}

          {activeSection === 'history' && (
            <HistoryPage
              records={records}
              loading={historyLoading}
              error={historyError}
              preferences={preferences}
              onOpenVerification={handleOpenVerification}
              onOpenReport={handleOpenReport}
              onDeleteRecord={handleDeleteRecord}
              onStartNew={() => {
                setActiveVerificationResult(null);
                setActiveSection('verify');
              }}
            />
          )}

          {activeSection === 'reports' && (
            <ReportsPage
              records={records}
              selectedRecord={selectedReportRecord}
              onSelectRecord={setSelectedReportRecord}
              onOpenClaimsView={handleOpenVerification}
              onStartNew={() => {
                setActiveVerificationResult(null);
                setActiveSection('verify');
              }}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsPage
              health={health}
              healthError={healthError}
              onTestConnections={handleTestConnections}
              preferences={preferences}
              onUpdatePreferences={handleUpdatePreferences}
            />
          )}
        </main>
      </div>
    </div>
  );
}
