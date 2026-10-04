import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { 
  Users, Building2, Sliders, Save, Plus, Trash2, Edit, Globe, Clock, Mail, MapPin, Tag, ShieldCheck, Lock, UserPlus, X, CheckCircle2, MailCheck, Send, Sparkles, AlertTriangle, RefreshCw, Database, QrCode
} from 'lucide-react';
import { SystemSettings, Plant, AdminProfile, AdminRole, DailyDigestConfig } from '../../types/database';
import { saveSettings, triggerDailyDigestEmail, purge72HoursFeedbacks, resetToAugustMockData } from '../../lib/supabase';
import { ConfirmModal } from '../common/ConfirmModal';
import { PlantQRModal } from '../common/QRCodeCard';
import { MultiTierEmailConfigPanel } from './MultiTierEmailConfigPanel';

interface Props {
  settings: SystemSettings;
  plants: Plant[];
  adminUsers: AdminProfile[];
  currentAdmin: AdminProfile;
  onUpdateSettings: (newSettings: SystemSettings) => void;
  onAddPlant: (newPlant: Plant) => void;
  onUpdatePlant: (updatedPlant: Plant) => void;
  onDeletePlant: (plantId: string) => void;
  onAddAdminUser: (newUser: AdminProfile) => void;
  onUpdateAdminUser: (updatedUser: AdminProfile) => void;
  onDeleteAdminUser: (userId: string) => void | Promise<void>;
}

export const SettingsPage: React.FC<Props> = ({
  settings,
  plants,
  adminUsers,
  currentAdmin,
  onUpdateSettings,
  onAddPlant,
  onUpdatePlant,
  onDeletePlant,
  onAddAdminUser,
  onUpdateAdminUser,
  onDeleteAdminUser,
}) => {
  const { i18n } = useTranslation();
  const canManageUsers = currentAdmin.role === 'super_admin';

  // Settings Inner Navigation State (Sidebar options: 'users' | 'plants' | 'email_digest' | 'general' | 'data_management')
  const [activeNav, setActiveNav] = useState<'users' | 'plants' | 'email_digest' | 'general' | 'data_management'>('users');

  const [isPurging, setIsPurging] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);

  // Plant-Specific QR Code Modal State
  const [qrModalPlant, setQrModalPlant] = useState<Plant | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const handleExecutePurge = async () => {
    setIsPurging(true);
    try {
      const purged = await purge72HoursFeedbacks(72);
      toast.success(`Purged ${purged} feedbacks older than 72 hours.`);
      setIsPurgeModalOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error('Failed to execute purge.');
    } finally {
      setIsPurging(false);
    }
  };

  const handleExecuteSeed = async () => {
    setIsSeeding(true);
    try {
      await resetToAugustMockData();
      toast.success('Successfully loaded 1 Aug - 28 Aug feedback dataset!');
      setIsSeedModalOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error('Failed to populate feedback data.');
    } finally {
      setIsSeeding(false);
    }
  };

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 1. USER MANAGEMENT STATE (Add & Edit User)
  // -------------------------------------------------------------------------
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminProfile | null>(null);
  const [userEmpId, setUserEmpId] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userCorporateMail, setUserCorporateMail] = useState('');
  const [userRole, setUserRole] = useState<AdminRole>('hr_admin');
  const [userSelectedLocation, setUserSelectedLocation] = useState('');
  const [userSelectedPlantId, setUserSelectedPlantId] = useState('');

  // Extract distinct locations from active plants list
  const availableLocations = Array.from(
    new Set(plants.map((p) => p.location).filter(Boolean))
  );

  // Filter plants based on selected location
  const filteredPlantsForUser = userSelectedLocation
    ? plants.filter((p) => p.location.toLowerCase() === userSelectedLocation.toLowerCase())
    : plants;

  const handleStartAddUser = () => {
    handleCancelUserForm();
    setIsUserFormOpen(true);
  };

  const handleStartEditUser = (usr: AdminProfile) => {
    setEditingUser(usr);
    setUserEmpId(usr.employee_id || '');
    setUserFullName(usr.full_name || '');
    setUserCorporateMail(usr.email || '');
    setUserRole(usr.role || 'hr_admin');
    setUserSelectedLocation(usr.location || '');
    setUserSelectedPlantId(usr.plant_id || '');
    setIsUserFormOpen(true);
  };

  const handleCancelUserForm = () => {
    setEditingUser(null);
    setUserEmpId('');
    setUserFullName('');
    setUserCorporateMail('');
    setUserRole('hr_admin');
    setUserSelectedLocation('');
    setUserSelectedPlantId('');
    setIsUserFormOpen(false);
  };

  const handleSubmitUserForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers) {
      toast.error('Only IT Admin can grant dashboard access');
      return;
    }
    if (!userFullName.trim() || !userCorporateMail.trim() || !userCorporateMail.includes('@')) {
      toast.error('Please enter valid Name and Corporate Email');
      return;
    }

    if (editingUser) {
      // Edit Mode
      const updated: AdminProfile = {
        ...editingUser,
        employee_id: userEmpId.trim().toUpperCase() || undefined,
        full_name: userFullName.trim(),
        email: userCorporateMail.trim().toLowerCase(),
        role: userRole,
        location: userSelectedLocation || undefined,
        plant_id: userSelectedPlantId || undefined,
      };
      onUpdateAdminUser(updated);
      toast.success(`User "${updated.full_name}" updated successfully!`);
    } else {
      // Add Mode
      const created: AdminProfile = {
        id: `usr-${Date.now()}`,
        employee_id: userEmpId.trim().toUpperCase() || undefined,
        full_name: userFullName.trim(),
        email: userCorporateMail.trim().toLowerCase(),
        role: userRole,
        location: userSelectedLocation || undefined,
        plant_id: userSelectedPlantId || undefined,
      };
      onAddAdminUser(created);
      toast.success(`User "${created.full_name}" created successfully!`);
    }

    handleCancelUserForm();
  };

  // -------------------------------------------------------------------------
  // 2. PLANT MANAGEMENT STATE (Add & Edit Plant)
  // -------------------------------------------------------------------------
  const [isPlantFormOpen, setIsPlantFormOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [plantLocation, setPlantLocation] = useState('');
  const [plantCode, setPlantCode] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantDisplayName, setPlantDisplayName] = useState('');
  const [plantNotificationEmail, setPlantNotificationEmail] = useState('');

  const handleAutoGenerateDisplayName = (loc: string, name: string, code: string) => {
    if (loc && name && code) {
      setPlantDisplayName(`${loc.trim().toUpperCase()} — ${name.trim().toUpperCase()} (${code.trim()})`);
    }
  };

  const handleStartAddPlant = () => {
    handleCancelPlantForm();
    setIsPlantFormOpen(true);
  };

  const handleStartEditPlant = (p: Plant) => {
    setEditingPlant(p);
    setPlantLocation(p.location || '');
    setPlantCode(p.code || '');
    setPlantName(p.name || '');
    setPlantDisplayName(p.display_name || `${p.location} — ${p.name} (${p.code})`);
    setPlantNotificationEmail(p.notification_email || '');
    setIsPlantFormOpen(true);
  };

  const handleCancelPlantForm = () => {
    setEditingPlant(null);
    setPlantLocation('');
    setPlantCode('');
    setPlantName('');
    setPlantDisplayName('');
    setPlantNotificationEmail('');
    setIsPlantFormOpen(false);
  };

  const handleSubmitPlantForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plantLocation.trim() || !plantCode.trim() || !plantName.trim()) {
      toast.error('Please enter Location, Plant Code, and Plant Name');
      return;
    }

    const formattedDisplayName = plantDisplayName.trim() || `${plantLocation.trim().toUpperCase()} — ${plantName.trim().toUpperCase()} (${plantCode.trim()})`;

    if (editingPlant) {
      // Edit Mode
      const updated: Plant = {
        ...editingPlant,
        location: plantLocation.trim().toUpperCase(),
        code: plantCode.trim(),
        name: plantName.trim().toUpperCase(),
        display_name: formattedDisplayName,
        notification_email: plantNotificationEmail.trim() || undefined,
      };
      onUpdatePlant(updated);
      toast.success(`Plant "${updated.display_name}" updated!`);
    } else {
      // Add Mode
      const created: Plant = {
        id: `plant-${Date.now()}`,
        location: plantLocation.trim().toUpperCase(),
        code: plantCode.trim(),
        name: plantName.trim().toUpperCase(),
        display_name: formattedDisplayName,
        is_active: true,
        notification_email: plantNotificationEmail.trim() || undefined,
      };
      onAddPlant(created);
      toast.success(`Plant "${created.display_name}" created!`);
    }

    handleCancelPlantForm();
  };

  // -------------------------------------------------------------------------
  // 3. GENERAL SETTINGS STATE (Shift Timing & Language Support Only)
  // -------------------------------------------------------------------------
  const [shifts, setShifts] = useState<string[]>(
    (settings.shifts || [
      'Day Shift (06:00 AM - 06:00 PM)',
      'Night Shift (06:00 PM - 06:00 AM)'
    ]).map(s => typeof s === 'string' ? s : `${s.name} (${s.start_time} - ${s.end_time})`)
  );
  const [enableEnglish, setEnableEnglish] = useState(settings.enable_english);
  const [enableHindi, setEnableHindi] = useState(settings.enable_hindi);

  // Shift Creator Inputs
  const [shiftName, setShiftName] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [startAmPm, setStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [endTime, setEndTime] = useState('06:00');
  const [endAmPm, setEndAmPm] = useState<'AM' | 'PM'>('PM');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  const handleAddShiftStructured = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftName.trim()) {
      toast.error('Please enter a shift name');
      return;
    }

    const formattedShift = `${shiftName.trim()} (${startTime} ${startAmPm} - ${endTime} ${endAmPm})`;

    if (shifts.includes(formattedShift)) {
      toast.error('Shift timing already exists');
      return;
    }

    setShifts([...shifts, formattedShift]);
    setShiftName('');
    toast.success(`Shift "${formattedShift}" added! Click Save General Settings.`);
  };

  const handleDeleteShift = (shiftToDelete: string) => {
    if (shifts.length <= 1) {
      toast.error('At least one shift is required');
      return;
    }
    setShifts(shifts.filter((s) => s !== shiftToDelete));
    toast.success(`Shift deleted`);
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGeneral(true);

    const updated: SystemSettings = {
      ...settings,
      shifts: shifts,
      enable_english: enableEnglish,
      enable_hindi: enableHindi,
    };

    try {
      await saveSettings(updated);
      onUpdateSettings(updated);
      toast.success('General Settings saved successfully!');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. DAILY EMAIL DIGEST STATE & HANDLERS (With Plant-Specific Isolation)
  // -------------------------------------------------------------------------
  const initialDigest: DailyDigestConfig = settings.daily_digest || {
    enabled: true,
    to_emails: ['software.2040@pgel.in'],
    cc_emails: ['verify.software2040@pgel.in'],
    scheduled_time: '20:00',
    unsatisfied_threshold_alert: 20,
    plant_recipients: {},
  };

  const [digestEnabled, setDigestEnabled] = useState(initialDigest.enabled);
  const [globalToEmails, setGlobalToEmails] = useState<string[]>(initialDigest.to_emails || ['software.2040@pgel.in']);
  const [globalCcEmails, setGlobalCcEmails] = useState<string[]>(initialDigest.cc_emails || ['verify.software2040@pgel.in']);
  const [scheduledTime, setScheduledTime] = useState(initialDigest.scheduled_time || '20:00');
  const [unsatisfiedAlertThreshold, setUnsatisfiedAlertThreshold] = useState(initialDigest.unsatisfied_threshold_alert || 20);

  // Plant-specific email recipient state (plant_id -> { to_emails, cc_emails })
  const [plantRecipients, setPlantRecipients] = useState<Record<string, { to_emails: string[]; cc_emails: string[] }>>(
    initialDigest.plant_recipients || {}
  );
  const [selectedPlantScope, setSelectedPlantScope] = useState<string>('all'); // 'all' or plant.id
  
  const [newToInput, setNewToInput] = useState('');
  const [newCcInput, setNewCcInput] = useState('');
  const [isSavingDigest, setIsSavingDigest] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [isSendingLiveDigest, setIsSendingLiveDigest] = useState(false);

  // Synchronize when settings load asynchronously from server/database
  useEffect(() => {
    if (settings.daily_digest) {
      setDigestEnabled(settings.daily_digest.enabled ?? true);
      if (settings.daily_digest.to_emails?.length) {
        setGlobalToEmails(settings.daily_digest.to_emails);
      }
      if (settings.daily_digest.cc_emails?.length) {
        setGlobalCcEmails(settings.daily_digest.cc_emails);
      }
      if (settings.daily_digest.scheduled_time) {
        setScheduledTime(settings.daily_digest.scheduled_time);
      }
      if (settings.daily_digest.unsatisfied_threshold_alert !== undefined) {
        setUnsatisfiedAlertThreshold(settings.daily_digest.unsatisfied_threshold_alert);
      }
      if (settings.daily_digest.plant_recipients) {
        setPlantRecipients(settings.daily_digest.plant_recipients);
      }
    }
  }, [settings.daily_digest]);

  const formatTimeDisplay = (timeStr: string) => {
    try {
      const [h, m] = (timeStr || '20:00').split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return timeStr;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  // Active TO & CC emails depending on selected plant scope
  const activeToEmails = selectedPlantScope === 'all'
    ? globalToEmails
    : (plantRecipients[selectedPlantScope]?.to_emails ?? globalToEmails);

  const activeCcEmails = selectedPlantScope === 'all'
    ? globalCcEmails
    : (plantRecipients[selectedPlantScope]?.cc_emails ?? globalCcEmails);

  const handleAddToEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const email = newToInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid recipient email address');
      return;
    }
    if (activeToEmails.includes(email)) {
      toast.error('Email already in TO recipients list');
      return;
    }

    if (selectedPlantScope === 'all') {
      setGlobalToEmails([...globalToEmails, email]);
    } else {
      const current = plantRecipients[selectedPlantScope] || { to_emails: [...globalToEmails], cc_emails: [...globalCcEmails] };
      setPlantRecipients({
        ...plantRecipients,
        [selectedPlantScope]: {
          ...current,
          to_emails: [...(current.to_emails || []), email],
        },
      });
    }
    setNewToInput('');
    toast.success(`Added ${email} to TO list`);
  };

  const handleRemoveToEmail = (emailToRemove: string) => {
    if (selectedPlantScope === 'all') {
      if (globalToEmails.length <= 1) {
        toast.error('At least one default TO recipient email is required');
        return;
      }
      setGlobalToEmails(globalToEmails.filter((e) => e !== emailToRemove));
    } else {
      const current = plantRecipients[selectedPlantScope] || { to_emails: [...globalToEmails], cc_emails: [...globalCcEmails] };
      setPlantRecipients({
        ...plantRecipients,
        [selectedPlantScope]: {
          ...current,
          to_emails: (current.to_emails || []).filter((e) => e !== emailToRemove),
        },
      });
    }
    toast.success(`Removed ${emailToRemove}`);
  };

  const handleAddCcEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const email = newCcInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid CC email address');
      return;
    }
    if (activeCcEmails.includes(email)) {
      toast.error('Email already in CC list');
      return;
    }

    if (selectedPlantScope === 'all') {
      setGlobalCcEmails([...globalCcEmails, email]);
    } else {
      const current = plantRecipients[selectedPlantScope] || { to_emails: [...globalToEmails], cc_emails: [...globalCcEmails] };
      setPlantRecipients({
        ...plantRecipients,
        [selectedPlantScope]: {
          ...current,
          cc_emails: [...(current.cc_emails || []), email],
        },
      });
    }
    setNewCcInput('');
    toast.success(`Added ${email} to CC`);
  };

  const handleRemoveCcEmail = (emailToRemove: string) => {
    if (selectedPlantScope === 'all') {
      setGlobalCcEmails(globalCcEmails.filter((e) => e !== emailToRemove));
    } else {
      const current = plantRecipients[selectedPlantScope] || { to_emails: [...globalToEmails], cc_emails: [...globalCcEmails] };
      setPlantRecipients({
        ...plantRecipients,
        [selectedPlantScope]: {
          ...current,
          cc_emails: (current.cc_emails || []).filter((e) => e !== emailToRemove),
        },
      });
    }
    toast.success(`Removed ${emailToRemove} from CC`);
  };

  const handleSaveDailyDigestSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (globalToEmails.length === 0) {
      toast.error('Please configure at least one global TO recipient email');
      return;
    }

    setIsSavingDigest(true);
    const updatedDigest: DailyDigestConfig = {
      ...initialDigest,
      enabled: digestEnabled,
      to_emails: globalToEmails,
      cc_emails: globalCcEmails,
      scheduled_time: scheduledTime,
      unsatisfied_threshold_alert: Number(unsatisfiedAlertThreshold) || 20,
      plant_recipients: plantRecipients,
    };

    const updatedSettings: SystemSettings = {
      ...settings,
      daily_digest: updatedDigest,
    };

    try {
      await saveSettings(updatedSettings);
      onUpdateSettings(updatedSettings);
      toast.success('Plant-wise Daily Digest settings saved successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save daily digest settings');
    } finally {
      setIsSavingDigest(false);
    }
  };

  const handleSendTestDailyDigest = async () => {
    setIsSendingTestEmail(true);
    try {
      const res = await triggerDailyDigestEmail({
        is_test: true,
        to_emails: activeToEmails,
        cc_emails: activeCcEmails,
      });
      toast.success(res.message || 'Plant test daily digest sent successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send test daily digest email');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSendTodayDigestNow = async () => {
    if (!window.confirm('Do you want to dispatch today\'s live plant daily digest emails right now to all configured distribution lists?')) {
      return;
    }
    setIsSendingLiveDigest(true);
    try {
      const res = await triggerDailyDigestEmail({
        is_test: false,
        force: true,
      });
      toast.success(res.message || 'Today\'s live daily digest dispatched successfully to all plant recipients!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch today\'s live digest');
    } finally {
      setIsSendingLiveDigest(false);
    }
  };

  // -------------------------------------------------------------------------
  // DELETE MODAL STATES
  // -------------------------------------------------------------------------
  const [deletingUser, setDeletingUser] = useState<AdminProfile | null>(null);
  const [deletingPlant, setDeletingPlant] = useState<Plant | null>(null);

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser || !canManageUsers) return;
    try {
      await onDeleteAdminUser(deletingUser.id);
      toast.success(`User "${deletingUser.full_name}" access removed`);
      setDeletingUser(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user access');
    }
  };

  const handleConfirmDeletePlant = () => {
    if (deletingPlant) {
      onDeletePlant(deletingPlant.id);
      toast.success(`Plant "${deletingPlant.name}" deleted`);
      setDeletingPlant(null);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col md:flex-row gap-5 max-w-6xl mx-auto select-none">
      {/* Settings Inner Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white border border-slate-200 rounded-3xl p-3 shadow-xs shrink-0 flex md:flex-col gap-1.5 h-fit">
        <div className="px-3 py-2 border-b border-slate-100 hidden md:block">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">System Settings</h2>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Control Panel & Rules</p>
        </div>

        <button
          type="button"
          onClick={() => setActiveNav('users')}
          className={`flex-1 md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
            activeNav === 'users'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">User Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNav('plants')}
          className={`flex-1 md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
            activeNav === 'plants'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate">Plant Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNav('email_digest')}
          className={`flex-1 md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
            activeNav === 'email_digest'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MailCheck className="w-4 h-4 shrink-0" />
          <span className="truncate">Email Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNav('general')}
          className={`flex-1 md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
            activeNav === 'general'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="truncate">General Settings</span>
        </button>

        {canManageUsers && (
          <button
            type="button"
            onClick={() => setActiveNav('data_management')}
            className={`flex-1 md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
              activeNav === 'data_management'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">Data & Maintenance</span>
          </button>
        )}
      </aside>

      {/* Main Settings Panel Area */}
      <main className="flex-1 min-w-0">
        {/* PANEL 1: USER MANAGEMENT */}
        {activeNav === 'users' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <span>Authorized Dashboard Users</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Only emails approved by IT Admin can receive OTP and access the dashboard
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    {adminUsers.length} Approved Users
                  </span>
                  {canManageUsers && !isUserFormOpen && (
                    <button
                      type="button"
                      onClick={handleStartAddUser}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add User Account</span>
                    </button>
                  )}
                </div>
              </div>

              {!canManageUsers && (
                <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold">
                  Only IT Admin can grant or remove dashboard access. Contact your IT Admin for changes.
                </div>
              )}

              {/* Add / Edit User Form — IT Admin only */}
              {canManageUsers && isUserFormOpen && (
              <form onSubmit={handleSubmitUserForm} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    {editingUser ? <Edit className="w-4 h-4 text-emerald-600" /> : <UserPlus className="w-4 h-4 text-emerald-600" />}
                    <span>{editingUser ? `Edit User: ${editingUser.full_name}` : 'Grant Access (IT Admin)'}</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleCancelUserForm}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      1. Employee ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. EMP-2040"
                      value={userEmpId}
                      onChange={(e) => setUserEmpId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold uppercase focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      2. Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rakesh Sharma"
                      value={userFullName}
                      onChange={(e) => setUserFullName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      3. Corporate Mail <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rakesh.sharma@pgel.in"
                      value={userCorporateMail}
                      onChange={(e) => setUserCorporateMail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>4. Role</span>
                    </label>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as AdminRole)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-extrabold text-slate-900 focus:border-emerald-500"
                    >
                      <option value="super_admin">IT Admin (Full Information &amp; Identity)</option>
                      <option value="hr_admin">HR Admin (Anonymized Identity View)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>5. Location Dropdown</span>
                    </label>
                    <select
                      value={userSelectedLocation}
                      onChange={(e) => {
                        setUserSelectedLocation(e.target.value);
                        setUserSelectedPlantId(''); // reset plant when location changes
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-extrabold text-slate-900 focus:border-emerald-500"
                    >
                      <option value="">Select Location (All)...</option>
                      {availableLocations.map((loc) => (
                        <option key={loc} value={loc}>
                          📍 {loc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-emerald-600" />
                      <span>6. Plant Dropdown</span>
                    </label>
                    <select
                      value={userSelectedPlantId}
                      onChange={(e) => setUserSelectedPlantId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-extrabold text-slate-900 focus:border-emerald-500"
                    >
                      <option value="">Select Plant (All)...</option>
                      {filteredPlantsForUser.map((p) => (
                        <option key={p.id} value={p.id}>
                          🏢 {p.display_name || p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    {editingUser ? <Save className="w-4 h-4 text-emerald-400" /> : <UserPlus className="w-4 h-4 text-emerald-400" />}
                    <span>{editingUser ? 'Save User Changes' : 'Add User Account'}</span>
                  </button>

                  {editingUser && (
                    <button
                      type="button"
                      onClick={handleCancelUserForm}
                      className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              )}

              {/* Users Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adminUsers.map((usr) => {
                  const assignedPlant = plants.find(p => p.id === usr.plant_id);
                  return (
                    <div key={usr.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 relative group hover:border-slate-300 transition-all shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                            <span>{usr.full_name}</span>
                            {usr.employee_id && (
                              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-bold">
                                {usr.employee_id}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono font-semibold mt-0.5">{usr.email}</div>
                        </div>

                        {canManageUsers && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditUser(usr)}
                            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all cursor-pointer shadow-2xs"
                            title="Edit User"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {usr.role !== 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => setDeletingUser(usr)}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer shadow-2xs"
                              title="Delete User"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          (usr.role === 'super_admin' || usr.role === 'it_admin') ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {(usr.role === 'super_admin' || usr.role === 'it_admin') ? 'IT Admin' : 'HR Admin'}
                        </span>

                        {usr.location && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-800">
                            📍 {usr.location}
                          </span>
                        )}

                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 ${
                          assignedPlant ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-200 text-slate-700'
                        }`}>
                          <Lock className="w-3 h-3 text-amber-600" />
                          <span>{assignedPlant ? `Plant: ${assignedPlant.display_name || assignedPlant.name}` : '🌐 All Plants Access'}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PANEL 2: PLANT MANAGEMENT */}
        {activeNav === 'plants' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                    <span>Plant Management</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure Locations, Plant Codes, Plant Names, and Form Display Names (Used everywhere across app)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    {plants.length} Active Plants
                  </span>
                  {!isPlantFormOpen && (
                    <button
                      type="button"
                      onClick={handleStartAddPlant}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Plant</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Add / Edit Plant Form */}
              {isPlantFormOpen && (
              <form onSubmit={handleSubmitPlantForm} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    {editingPlant ? <Edit className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
                    <span>{editingPlant ? `Edit Plant: ${editingPlant.display_name}` : 'Add New Manufacturing Plant'}</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleCancelPlantForm}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      1. Location <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BHIWADI"
                      value={plantLocation}
                      onChange={(e) => {
                        setPlantLocation(e.target.value);
                        handleAutoGenerateDisplayName(e.target.value, plantName, plantCode);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      2. Plant Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 4020"
                      value={plantCode}
                      onChange={(e) => {
                        setPlantCode(e.target.value);
                        handleAutoGenerateDisplayName(plantLocation, plantName, e.target.value);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase font-bold focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">
                      3. Plant Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. NEXT GENERATION MANUFACTURING"
                      value={plantName}
                      onChange={(e) => {
                        setPlantName(e.target.value);
                        handleAutoGenerateDisplayName(plantLocation, e.target.value, plantCode);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      <span>4. Feedback Form Display Name (Shown Everywhere)</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BHIWADI — NGM (4020)"
                      value={plantDisplayName}
                      onChange={(e) => setPlantDisplayName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                      <span>5. Plant HR / Contractor Alert Email</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. canteen.ngm@pgel.in"
                      value={plantNotificationEmail}
                      onChange={(e) => setPlantNotificationEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-semibold focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    {editingPlant ? <Save className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4 text-emerald-400" />}
                    <span>{editingPlant ? 'Save Plant Changes' : 'Add Plant'}</span>
                  </button>

                  {editingPlant && (
                    <button
                      type="button"
                      onClick={handleCancelPlantForm}
                      className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              )}

              {/* Plants Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {plants.map((p) => (
                  <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 relative group hover:border-slate-300 transition-all shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{p.name}</div>
                        <div className="text-[11px] text-emerald-700 font-mono font-bold mt-0.5">Code: {p.code}</div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setQrModalPlant(p);
                            setIsQrModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs flex items-center gap-1 font-bold text-[11px]"
                          title={`Generate & Download dedicated QR Code for ${p.name}`}
                        >
                          <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                          <span>QR</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEditPlant(p)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all cursor-pointer shadow-2xs"
                          title="Edit Plant"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingPlant(p)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer shadow-2xs"
                          title="Delete Plant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Location: {p.location}</span>
                    </div>

                    <div className="p-2 bg-white rounded-xl border border-slate-200 text-[10px] text-slate-700 font-mono font-bold space-y-0.5">
                      <span className="text-slate-400 block uppercase text-[9px]">Global Display Name:</span>
                      <span className="text-emerald-800">{p.display_name || `${p.location} — ${p.name} (${p.code})`}</span>
                    </div>

                    {p.notification_email && (
                      <div className="p-2 bg-emerald-50/80 rounded-xl border border-emerald-200 text-[10px] text-emerald-900 font-mono font-bold flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Alert Email:</span>
                        </div>
                        <span className="underline">{p.notification_email}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PANEL 3: GENERAL SETTINGS (Shift Timing & Languages Only) */}
        {activeNav === 'general' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-emerald-600" />
                    <span>General Settings</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage shift timings and language support settings
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveGeneralSettings} className="space-y-5">
                {/* 1. Shift Timings Configuration */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span>Shift Timings Configuration</span>
                    </label>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {shifts.length} Active Shifts
                    </span>
                  </div>

                  {/* Active Shifts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {shifts.map((sh) => (
                      <div key={sh} className="p-3 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2 shadow-2xs font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{sh}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteShift(sh)}
                          className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Shift Form */}
                  <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                      Add Custom Shift (with AM/PM format)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        placeholder="Shift Name (e.g. Day Shift)"
                        value={shiftName}
                        onChange={(e) => setShiftName(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500 sm:col-span-2"
                      />

                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="06:00"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                        />
                        <select
                          value={startAmPm}
                          onChange={(e) => setStartAmPm(e.target.value as 'AM' | 'PM')}
                          className="bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="06:00"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:border-emerald-500"
                        />
                        <select
                          value={endAmPm}
                          onChange={(e) => setEndAmPm(e.target.value as 'AM' | 'PM')}
                          className="bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddShiftStructured}
                        className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Add Shift</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Language Support Settings */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span>Language Support Settings</span>
                  </label>
                  <div className="flex flex-wrap gap-5 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableEnglish}
                        onChange={(e) => setEnableEnglish(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span>🇬🇧 Enable English Language</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableHindi}
                        onChange={(e) => setEnableHindi(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span>🇮🇳 Enable Hindi Language (हिन्दी)</span>
                    </label>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingGeneral ? 'Saving General Settings...' : 'Save General Settings'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PANEL 4: 4-TIER AUTOMATED EMAIL CONFIGURATION */}
        {activeNav === 'email_digest' && (
          <MultiTierEmailConfigPanel
            settings={settings}
            plants={plants}
            onUpdateSettings={onUpdateSettings}
            currentAdmin={currentAdmin}
          />
        )}

        {/* PANEL 4: DATA & RETENTION MAINTENANCE (IT ADMIN ONLY) */}
        {activeNav === 'data_management' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-600" />
                  <span>Data Maintenance & Retention Controls (IT Admin)</span>
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Manage retention policy, manual 72-hour log purge, and feedback database dataset.
                </p>
              </div>

              {/* Box 1: 72-Hour Data Purge */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0 mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">72-Hour Data Retention & Cleanup (IT Admin Only)</h3>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5 max-w-xl">
                        Automatic forced deletion has been disabled for safety so that all historical feedback records remain intact. Only IT Admins can manually execute a 72-hour purge whenever needed.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPurgeModalOpen(true)}
                    disabled={isPurging}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isPurging ? 'Purging...' : 'Execute 72h Purge'}</span>
                  </button>
                </div>
              </div>

              {/* Box 2: Reload / Seed Full August Feedback Data */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 mt-0.5">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Populate 1 Aug – 28 Aug Feedback Data</h3>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5 max-w-xl">
                        Load comprehensive dummy dataset spanning every day from August 1 to August 28 across PGTL and NGM Bhiwadi plants with realistic ratings & remarks.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSeedModalOpen(true)}
                    disabled={isSeeding}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                    <span>{isSeeding ? 'Populating...' : 'Sync Aug 1-28 Data'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete User Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingUser)}
        title="Delete User Account"
        message={`Are you sure you want to delete user account "${deletingUser?.full_name}"?`}
        confirmText="Delete User"
        onConfirm={handleConfirmDeleteUser}
        onClose={() => setDeletingUser(null)}
      />

      {/* Delete Plant Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingPlant)}
        title="Delete Plant Location"
        message={`Are you sure you want to delete plant "${deletingPlant?.display_name || deletingPlant?.name}"?`}
        confirmText="Delete Plant"
        onConfirm={handleConfirmDeletePlant}
        onClose={() => setDeletingPlant(null)}
      />

      {/* Execute 72h Purge Confirmation Modal */}
      <ConfirmModal
        isOpen={isPurgeModalOpen}
        title="Execute 72-Hour Data Purge"
        message="Are you sure you want to delete all feedback records older than 72 hours (3 days)? This action is permanent."
        confirmText="Yes, Purge Old Logs"
        onConfirm={handleExecutePurge}
        onClose={() => setIsPurgeModalOpen(false)}
      />

      {/* Seed August Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isSeedModalOpen}
        title="Populate August 1-28 Feedback Data"
        message="This will reload the comprehensive dataset from August 1 to August 28 for PGTL and NGM Bhiwadi plants. Continue?"
        confirmText="Yes, Load Dataset"
        onConfirm={handleExecuteSeed}
        onClose={() => setIsSeedModalOpen(false)}
      />

      {/* Plant Dedicated QR Code Generator Modal */}
      <PlantQRModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        plants={plants}
        initialPlantId={qrModalPlant?.id || 'all'}
      />
    </div>
  );
};
