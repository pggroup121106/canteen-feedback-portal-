import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { 
  FeedbackEntry, 
  Plant, 
  SystemSettings, 
  FeedbackFilterOptions,
  AdminProfile
} from './types/database';
import { 
  fetchFeedbacks, 
  fetchPlants, 
  fetchSettings, 
  fetchAdmins,
  saveAdminUser,
  updateAdminUser,
  deleteAdminUser,
  savePlant,
  updatePlant, 
  deletePlant,
  deleteFeedbackEntry,
  deleteMultipleFeedbackEntries,
  calculateDashboardStats,
  subscribeToRealtimeFeedback,
  setAdminSession,
  getCurrentAdminSession
} from './lib/supabase';
import { sendDesktopNotification } from './lib/soundEffects';

// Kiosk & Admin Components
import { FeedbackFlow } from './components/kiosk/FeedbackFlow';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLogin } from './components/admin/AdminLogin';
import { DashboardOverview } from './components/admin/DashboardOverview';
import { FeedbackTable } from './components/admin/FeedbackTable';
import { SettingsPage } from './components/admin/SettingsPage';
import { EmployeeFeedView } from './components/admin/EmployeeFeedView';
import { LiveFeedbackPopupModal } from './components/common/LiveFeedbackPopupModal';
import { StartScreen } from './components/common/StartScreen';

// Web Audio Chime Sound for Real-time Popup Alert
const playAlertChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Silent fail if audio blocked
  }
};

export const App: React.FC = () => {
  const [appMode, setAppMode] = useState<'start_screen' | 'admin_login' | 'admin_dashboard' | 'kiosk'>('start_screen');
  const [activeAdmin, setActiveAdmin] = useState<AdminProfile | null>(null);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'feed' | 'logs' | 'settings'>('dashboard');
  // Track if kiosk was opened via QR scan (public URL) — hides Admin Portal button
  const [isQrKiosk, setIsQrKiosk] = useState<boolean>(false);

  const [feedbacks, setFeedbacks] = useState<FeedbackEntry[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminProfile[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Header Analytics Filter Bar Toggle State
  const [isHeaderFilterOpen, setIsHeaderFilterOpen] = useState<boolean>(false);

  // Real-time Popup Alert State (compact stacked toasts)
  const [liveAlerts, setLiveAlerts] = useState<FeedbackEntry[]>([]);

  // Unread feedback count for sidebar badge
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Active Filter State
  const [activeFilters, setActiveFilters] = useState<FeedbackFilterOptions>({});
  const activeFiltersRef = useRef(activeFilters);
  
  // Track previous feedback IDs to detect brand new submissions
  const previousFeedbackIdsRef = useRef<Set<string>>(new Set());
  const appModeRef = useRef(appMode);
  const activeAdminRef = useRef(activeAdmin);
  const alertedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);

  useEffect(() => {
    activeAdminRef.current = activeAdmin;
  }, [activeAdmin]);

  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

  // Automated background trigger for daily digest email dispatch
  // Periodically pings /api/daily-digest (from any active screen: 24/7 canteen kiosk tablets or admin screens)
  // so that the exact moment the configured IST dispatch time arrives, the email is dispatched automatically.
  useEffect(() => {
    const pingDigest = async () => {
      // Don't ping if device is offline or screen/document is suspended
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        await fetch('/api/daily-digest', { cache: 'no-store' });
      } catch {
        // silent background ping
      }
    };
    pingDigest();
    const interval = setInterval(pingDigest, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Browser Desktop Tab Notification Permission (admin only — mobile kiosk cannot use Notification API)
  const requestNotificationPermission = () => {
    if (appModeRef.current === 'kiosk') return;
    if (!('Notification' in window) || typeof Notification !== 'function') return;
    if (Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {
        console.warn('Notification permission request failed', e);
      }
    }
  };

  const handleNewFeedbackAlert = (entry: FeedbackEntry) => {
    // Never alert on employee kiosk — sound/notification are admin-only
    if (appModeRef.current === 'kiosk' || !activeAdminRef.current) return;

    // Strict location/plant filtering for HR Admin alerts
    if (activeAdminRef.current.role === 'hr_admin') {
      const assignedPlant = activeAdminRef.current.plant_id;
      const assignedLocation = activeAdminRef.current.location?.toLowerCase();

      if (assignedPlant && assignedPlant !== 'all' && entry.plant_id !== assignedPlant) {
        return;
      }
      if (assignedLocation && assignedLocation !== 'all' && entry.plant_location?.toLowerCase() !== assignedLocation) {
        return;
      }
    }

    try {
      playAlertChime();
    } catch (e) {
      console.warn('Alert chime failed', e);
    }

    setLiveAlerts((prev) => [entry, ...prev.filter((f) => f.id !== entry.id)].slice(0, 8));
    setUnreadCount(prev => prev + 1);

    // Auto-dismiss compact toast after a few seconds
    window.setTimeout(() => {
      setLiveAlerts((prev) => prev.filter((f) => f.id !== entry.id));
    }, 4500);

    try {
      sendDesktopNotification(
        'New Canteen Feedback Submitted!',
        `Ticket #FB-${entry.id.slice(-5).toUpperCase()} rated ${entry.overall_rating} ★ (${entry.plant_name || 'Plant'})`,
        '/pg-logo.png'
      );
    } catch (e) {
      console.warn('Desktop notification failed', e);
    }
  };

  const dismissLiveAlert = (id: string) => {
    setLiveAlerts((prev) => prev.filter((f) => f.id !== id));
  };

  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const isKioskRoute = urlParams.has('kiosk') || 
                             urlParams.get('mode') === 'kiosk' || 
                             urlParams.has('feedback') ||
                             urlParams.has('plant') ||
                             urlParams.has('plant_id') ||
                             urlParams.has('plantId') ||
                             urlParams.has('code') ||
                             window.location.hash.includes('kiosk') || 
                             window.location.pathname.includes('/kiosk') ||
                             window.location.pathname.includes('/feedback');

        if (isKioskRoute) {
          // Employee QR Code Link -> Clean Employee Feedback Form (Admin Portal button HIDDEN)
          setIsQrKiosk(true);
          setAppMode('kiosk');
          setActiveAdmin(null);
        } else {
          // Default start screen on refresh
          setIsQrKiosk(false);
          setAppMode('start_screen');
        }

        const [fetchedFeedbacks, fetchedPlants, fetchedSettings, fetchedAdmins] = await Promise.all([
          fetchFeedbacks(undefined, { migrateLocal: true }),
          fetchPlants(),
          fetchSettings(),
          fetchAdmins(),
        ]);

        setFeedbacks(fetchedFeedbacks);
        setPlants(fetchedPlants);
        setSettings(fetchedSettings);
        setAdminUsers(fetchedAdmins);
        
        previousFeedbackIdsRef.current = new Set(fetchedFeedbacks.map(f => f.id));
      } catch (err) {
        console.error('Initialization error', err);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
    // Only ask notification permission on admin portal loads (never on QR/kiosk phone links)
    const bootParams = new URLSearchParams(window.location.search);
    const bootIsKiosk =
      bootParams.has('kiosk') ||
      bootParams.get('mode') === 'kiosk' ||
      bootParams.has('feedback') ||
      bootParams.has('plant') ||
      bootParams.has('plant_id') ||
      bootParams.has('plantId') ||
      bootParams.has('code') ||
      window.location.hash.includes('kiosk') ||
      window.location.pathname.includes('/kiosk') ||
      window.location.pathname.includes('/feedback');
    if (!bootIsKiosk) {
      requestNotificationPermission();
    }
  }, []);

  // Real-time Listener & Polling Engine
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeFeedback((newEntry) => {
      if (!previousFeedbackIdsRef.current.has(newEntry.id)) {
        previousFeedbackIdsRef.current.add(newEntry.id);
        handleNewFeedbackAlert(newEntry);
        setFeedbacks((prev) => [newEntry, ...prev.filter((f) => f.id !== newEntry.id)]);
      }
    });

    const checkAndNotifyNewFeedbacks = (latestList: FeedbackEntry[]) => {
      const knownIds = previousFeedbackIdsRef.current;
      const brandNewEntries = latestList.filter(f => !knownIds.has(f.id));

      if (brandNewEntries.length > 0) {
        brandNewEntries.forEach(item => {
          knownIds.add(item.id);
          handleNewFeedbackAlert(item);
        });
        setFeedbacks(latestList);
      } else {
        setFeedbacks((prev) => {
          const prevMap = new Map(prev.map(p => [p.id, p]));
          const hasChange = latestList.some(item => {
            const old = prevMap.get(item.id);
            return !old || old.action_status !== item.action_status || old.action_taken !== item.action_taken;
          }) || prev.length !== latestList.length;
          return hasChange ? latestList : prev;
        });
      }
    };

    const handleStorageChange = async () => {
      const latest = await fetchFeedbacks(activeFiltersRef.current);
      checkAndNotifyNewFeedbacks(latest);
    };
    window.addEventListener('storage', handleStorageChange);

    // Only poll when an Admin is viewing the dashboard! Never on Employee Kiosk or QR links!
    const pollInterval = setInterval(async () => {
      if (appModeRef.current !== 'admin_dashboard') return;
      const latest = await fetchFeedbacks(activeFiltersRef.current);
      checkAndNotifyNewFeedbacks(latest);
    }, 15000);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
  }, []);

  const handleManualRefreshData = async () => {
    const latest = await fetchFeedbacks(activeFilters);
    const fetchedPlants = await fetchPlants();
    const fetchedAdmins = await fetchAdmins();
    setFeedbacks(latest);
    setPlants(fetchedPlants);
    setAdminUsers(fetchedAdmins);
    toast.success(`Data refreshed successfully! (${latest.length} records loaded)`);
  };

  const handleFilterChange = async (filters: FeedbackFilterOptions) => {
    setActiveFilters(filters);
    const updated = await fetchFeedbacks(filters);
    setFeedbacks(updated);
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteFeedbackEntry(id);
    setFeedbacks((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDeleteMultipleEntries = async (ids: string[]) => {
    await deleteMultipleFeedbackEntries(ids);
    setFeedbacks((prev) => prev.filter((item) => !ids.includes(item.id)));
  };

  const handleUpdateEntry = (updated: FeedbackEntry) => {
    setFeedbacks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleAddPlant = async (newPlant: Plant) => {
    const updated = await savePlant(newPlant);
    setPlants(updated);
  };

  const handleUpdatePlant = async (updatedPlant: Plant) => {
    const updated = await updatePlant(updatedPlant);
    setPlants(updated);
  };

  const handleDeletePlant = async (plantId: string) => {
    const updated = await deletePlant(plantId);
    setPlants(updated);
  };

  const handleAddAdminUser = async (newUser: AdminProfile) => {
    const updated = await saveAdminUser(newUser);
    setAdminUsers(updated);
  };

  const handleUpdateAdminUser = async (updatedUser: AdminProfile) => {
    const updated = await updateAdminUser(updatedUser);
    setAdminUsers(updated);
  };

  const handleDeleteAdminUser = async (userId: string): Promise<void> => {
    const updated = await deleteAdminUser(userId);
    setAdminUsers(updated);
  };

  const toggleTheme = () => {
    if (!settings) return;
    const newTheme: 'light' | 'dark' = settings.theme_mode === 'dark' ? 'light' : 'dark';
    const updated: SystemSettings = { ...settings, theme_mode: newTheme };
    setSettings(updated);
  };

  // Strict Plant & Location Access Control Filtering for HR Admins (All Hooks called unconditionally at top)
  const effectivePlants = useMemo(() => {
    if (!activeAdmin || activeAdmin.role === 'super_admin') {
      return plants;
    }
    // HR Admin with specific plant
    if (activeAdmin.plant_id && activeAdmin.plant_id !== 'all') {
      const match = plants.filter(p => 
        p.id === activeAdmin.plant_id || 
        (p.code && activeAdmin.plant_id && p.code.toLowerCase() === activeAdmin.plant_id.toLowerCase()) ||
        (p.name && activeAdmin.plant_id && p.name.toLowerCase() === activeAdmin.plant_id.toLowerCase())
      );
      if (match.length > 0) return match;
    }
    // HR Admin with specific location
    if (activeAdmin.location && activeAdmin.location !== 'all') {
      return plants.filter(p => p.location.toLowerCase() === activeAdmin.location!.toLowerCase());
    }
    return plants;
  }, [activeAdmin, plants]);

  const effectiveFeedbacks = useMemo(() => {
    if (!activeAdmin || activeAdmin.role === 'super_admin') {
      return feedbacks;
    }

    const assignedPlantId = activeAdmin.plant_id;
    const assignedLocation = activeAdmin.location?.trim().toLowerCase();

    // 1. If HR Admin has an assigned specific plant:
    if (assignedPlantId && assignedPlantId !== 'all') {
      const matchedPlant = plants.find(p => 
        p.id === assignedPlantId || 
        (p.code && p.code.toLowerCase() === assignedPlantId.toLowerCase()) ||
        (p.name && p.name.toLowerCase() === assignedPlantId.toLowerCase())
      );

      return feedbacks.filter((f) => {
        if (f.plant_id === assignedPlantId) return true;
        if (matchedPlant) {
          if (f.plant_id === matchedPlant.id) return true;
          if (f.plant_code && matchedPlant.code && f.plant_code.toLowerCase() === matchedPlant.code.toLowerCase()) return true;
          if (f.plant_name && matchedPlant.name && f.plant_name.toLowerCase() === matchedPlant.name.toLowerCase()) return true;
        }
        return false;
      });
    }

    // 2. If HR Admin has an assigned location (and no specific plant):
    if (assignedLocation && assignedLocation !== 'all') {
      const plantsInLocation = plants.filter(p => p.location?.toLowerCase() === assignedLocation);
      const plantIdsInLocation = new Set(plantsInLocation.map(p => p.id));
      const plantNamesInLocation = new Set(plantsInLocation.map(p => p.name.toLowerCase()));

      return feedbacks.filter((f) => {
        if (f.plant_location && f.plant_location.toLowerCase() === assignedLocation) return true;
        if (f.plant_id && plantIdsInLocation.has(f.plant_id)) return true;
        if (f.plant_name && plantNamesInLocation.has(f.plant_name.toLowerCase())) return true;
        return false;
      });
    }

    // 3. Fallback for HR Admin with no assignment
    if (activeAdmin.role === 'hr_admin') {
      return [];
    }

    return feedbacks;
  }, [activeAdmin, feedbacks, plants]);

  const dashboardStats = useMemo(() => {
    return calculateDashboardStats(effectiveFeedbacks);
  }, [effectiveFeedbacks]);

  if (isLoading || !settings) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center">
        <Loader2 className="w-9 h-9 animate-spin text-emerald-600 mb-3" />
        <span className="text-xs font-bold tracking-wider text-slate-500">Loading Canteen Feedback Portal...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster position="top-right" theme="light" richColors />

      {/* 0. Start Screen View (Clean Start App Button & 4K Logo Animation with Audio) */}
      {appMode === 'start_screen' && (
        <StartScreen
          onComplete={() => {
            const existingSession = getCurrentAdminSession();
            if (existingSession) {
              setActiveAdmin(existingSession);
              setAppMode('admin_dashboard');
              requestNotificationPermission();
            } else {
              setActiveAdmin(null);
              setAppMode('admin_login');
            }
          }}
        />
      )}

      {/* 1. Admin Login View (Main Portal Link default when unauthenticated - MANDATORY OTP VERIFICATION) */}
      {appMode === 'admin_login' && (
        <AdminLogin
          onLoginSuccess={(admin) => {
            setActiveAdmin(admin);
            setAdminSession(admin);
            setAppMode('admin_dashboard');
            requestNotificationPermission();
          }}
          onBackToKiosk={() => {
            setIsQrKiosk(false);
            setActiveAdmin(null);
            setAppMode('kiosk');
          }}
        />
      )}

      {/* 2. Admin Dashboard View (Requires verified Email OTP session) */}
      {appMode === 'admin_dashboard' && activeAdmin && (
        <>
          <LiveFeedbackPopupModal
            alerts={liveAlerts}
            onDismiss={dismissLiveAlert}
            onViewFeed={() => setAdminTab('feed')}
          />

          <AdminLayout
            admin={activeAdmin}
            settings={settings}
            activeTab={adminTab}
            onTabChange={(tab) => {
              // HR Admin restriction — only allow 'dashboard' and 'feed'
              if (activeAdmin.role === 'hr_admin' && (tab === 'logs' || tab === 'settings')) {
                return; // Silently block restricted tabs
              }
              if (tab === 'feed') setUnreadCount(0);
              setAdminTab(tab);
            }}
            unreadCount={unreadCount}
            onLogout={() => {
              setAdminSession(null);
              setActiveAdmin(null);
              setAppMode('admin_login');
            }}
            onSwitchToKiosk={() => { setIsQrKiosk(false); setAppMode('kiosk'); }}
            onToggleTheme={toggleTheme}
            onRefreshData={handleManualRefreshData}
            onToggleFilter={() => setIsHeaderFilterOpen(!isHeaderFilterOpen)}
            isFilterOpen={isHeaderFilterOpen}
            filterCount={effectiveFeedbacks.length}
          >
            {adminTab === 'dashboard' && (
              <DashboardOverview 
                stats={dashboardStats} 
                feedbacks={effectiveFeedbacks} 
                plants={effectivePlants} 
                isFilterOpen={isHeaderFilterOpen}
                onCloseFilter={() => setIsHeaderFilterOpen(false)}
                onUpdateEntry={handleUpdateEntry}
                adminName={activeAdmin?.full_name}
                isItAdmin={activeAdmin?.role === 'super_admin' || activeAdmin?.role === 'it_admin'}
              />
            )}

            {adminTab === 'feed' && (
              <EmployeeFeedView 
                feedbacks={effectiveFeedbacks} 
                plants={effectivePlants}
                admin={activeAdmin}
                onDeleteEntry={handleDeleteEntry}
                onDeleteMultipleEntries={handleDeleteMultipleEntries}
                onUpdateEntry={handleUpdateEntry}
              />
            )}

            {adminTab === 'logs' && (
              <FeedbackTable
                feedbacks={effectiveFeedbacks}
                plants={effectivePlants}
                admin={activeAdmin}
                onFilterChange={handleFilterChange}
                onDeleteEntry={handleDeleteEntry}
                onDeleteMultipleEntries={handleDeleteMultipleEntries}
                onUpdateEntry={handleUpdateEntry}
              />
            )}

            {adminTab === 'settings' && (
              <SettingsPage
                settings={settings}
                plants={plants}
                adminUsers={adminUsers}
                currentAdmin={activeAdmin}
                onUpdateSettings={setSettings}
                onAddPlant={handleAddPlant}
                onUpdatePlant={handleUpdatePlant}
                onDeletePlant={handleDeletePlant}
                onAddAdminUser={handleAddAdminUser}
                onUpdateAdminUser={handleUpdateAdminUser}
                onDeleteAdminUser={handleDeleteAdminUser}
              />
            )}
          </AdminLayout>
        </>
      )}

      {/* 3. Employee Feedback Form View (Public QR Code Link view) */}
      {appMode === 'kiosk' && (
        <div className="relative min-h-screen flex flex-col justify-between">
          <FeedbackFlow
            plants={plants}
            settings={settings}
            onBackToDashboard={activeAdmin ? () => setAppMode('admin_dashboard') : undefined}
            onOpenAdminLogin={isQrKiosk ? undefined : () => setAppMode('admin_login')}
          />
        </div>
      )}
    </div>
  );
};
