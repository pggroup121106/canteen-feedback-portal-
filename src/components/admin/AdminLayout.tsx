import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users,
  MessageSquareQuote, 
  CalendarDays,
  Settings, 
  LogOut, 
  Globe, 
  Utensils, 
  Radio, 
  Menu, 
  X,
  RefreshCw,
  Filter,
  Lock,
  UserCheck,
  Bell,
  AlertTriangle,
  Layers,
  History,
  MailCheck
} from 'lucide-react';
import { AdminProfile, SystemSettings } from '../../types/database';
import { PgLogo } from '../common/PgLogo';

export type AdminTab = 
  | 'dashboard'
  | 'unsatisfied'
  | 'actions'
  | 'action_history'
  | 'email_logs'
  | 'feed'
  | 'logs'
  | 'settings';

interface Props {
  admin: AdminProfile;
  settings: SystemSettings;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  onSwitchToKiosk?: () => void;
  onToggleTheme: () => void;
  onRefreshData?: () => void;
  onToggleFilter?: () => void;
  isFilterOpen?: boolean;
  filterCount?: number;
  unreadCount?: number;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<Props> = ({
  admin,
  settings,
  activeTab,
  onTabChange,
  onLogout,
  onSwitchToKiosk,
  onToggleTheme,
  onRefreshData,
  onToggleFilter,
  isFilterOpen = false,
  filterCount = 0,
  unreadCount = 0,
  children,
}) => {
  const { i18n } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHrAdmin = admin.role === 'hr_admin';

  const allNavItems = [
    { id: 'dashboard', label: 'Feedback Overview', icon: LayoutDashboard },
    { id: 'unsatisfied', label: 'Unsatisfied Feedback', icon: AlertTriangle },
    { id: 'actions', label: 'Action Management', icon: Layers },
    { id: 'action_history', label: 'Action Taken History', icon: History },
    { id: 'email_logs', label: 'Email Logs', icon: MailCheck },
    { id: 'feed', label: 'Employee Feed', icon: Users },
    { id: 'logs', label: 'Feedback Logs', icon: MessageSquareQuote },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ] as const;

  // HR Admin gets Dashboard, Unsatisfied, Action Management, Action History, and Employee Feed
  const navItems = isHrAdmin
    ? allNavItems.filter(item => 
        item.id === 'dashboard' || 
        item.id === 'unsatisfied' || 
        item.id === 'actions' || 
        item.id === 'action_history' || 
        item.id === 'feed'
      )
    : allNavItems;

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'hi' ? 'en' : 'hi');
  };

  const handleNavClick = (tabId: AdminTab) => {
    onTabChange(tabId);
    setMobileOpen(false);
  };

  // 2-Second Auto-Hide Sidebar logic on Mouse Leave
  const handleMouseEnter = () => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    collapseTimeoutRef.current = setTimeout(() => {
      setIsCollapsed(true);
    }, 2000);
  };

  const toggleSidebar = () => {
    setIsCollapsed(prev => !prev);
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    if (onRefreshData) {
      onRefreshData();
    }
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Ultra-Slim & Compact Sidebar Navigation */}
      <aside 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`hidden md:flex flex-col bg-white border-r border-slate-200 p-2 justify-between select-none shadow-2xs transition-all duration-300 sticky top-0 h-screen shrink-0 z-30 overflow-y-auto ${
          isCollapsed ? 'w-14' : 'w-52'
        }`}
      >
        <div className="space-y-4">
          {/* Top Header of Sidebar: ONLY 3-Lines Menu Icon */}
          <div className="flex items-center justify-center pb-2.5 border-b border-slate-100">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title={item.label}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  {/* Unread Badge on Employee Feed */}
                  {item.id === 'feed' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-rose-500 text-white text-[9px] font-black shadow-md shadow-rose-500/30 animate-pulse">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-1 pt-3 border-t border-slate-100">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Logout Admin Session"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sticky top stack: main header + dashboard KPI portal */}
        <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200 shadow-sm">
          <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-1.5 rounded-xl text-slate-600 hover:bg-slate-100"
              >
                <Menu className="w-4 h-4" />
              </button>

              <PgLogo size="lg" showText={true} />

            </div>

            {/* Right Header Buttons */}
            <div className="flex items-center gap-2">
              {/* Notification Bell with Unread Badge */}
              <button
                onClick={() => onTabChange('feed')}
                className="relative p-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 transition-all cursor-pointer shadow-2xs"
                title={unreadCount > 0 ? `${unreadCount} new feedback(s)` : 'No new feedbacks'}
              >
                <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-emerald-600 animate-bounce' : 'text-slate-400'}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-rose-500 text-white text-[8px] font-black shadow-lg shadow-rose-500/40 animate-pulse border-2 border-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Filter Analytics Button in Header */}
              {activeTab === 'dashboard' && onToggleFilter && (
                <button
                  onClick={onToggleFilter}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    isFilterOpen
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                  title="Filter Analytics by Location & Plant"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Filter Analytics</span>
                  {filterCount > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isFilterOpen ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-800'}`}>
                      {filterCount}
                    </span>
                  )}
                </button>
              )}

              {/* Refresh Data Header Button */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-slate-800 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Refresh Real-time Canteen Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
            </div>
          </header>

          {activeTab === 'dashboard' && (
            <div
              id="dashboard-kpi-portal"
              className="bg-slate-50 px-3 sm:px-4 py-2.5"
            />
          )}
        </div>

        {/* Page Content Container */}
        <main className="flex-1 p-3 sm:p-4">
          {children}
        </main>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-64 bg-white h-full p-4 flex flex-col justify-between shadow-2xl"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <PgLogo className="h-8" showText={true} />
                  <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold relative ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                        {item.id === 'feed' && unreadCount > 0 && (
                          <span className="ml-auto min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full bg-rose-500 text-white text-[9px] font-black shadow-sm">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
