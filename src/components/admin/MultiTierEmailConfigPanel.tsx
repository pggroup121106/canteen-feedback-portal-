import React, { useState, useEffect } from 'react';
import { 
  Mail, Users, Building2, ShieldCheck, Clock, Check, X, Plus, 
  Trash2, Edit, Send, RefreshCw, AlertTriangle, Sparkles, CheckCircle2,
  Calendar, Layers, Save, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  SystemSettings, Plant, EmailTier, EmailFrequency, 
  EmailRecipientConfig, MultiTierEmailConfig, AdminProfile 
} from '../../types/database';
import { saveSettings, triggerMultiTierTestEmail } from '../../lib/supabase';
import { ConfirmModal } from '../common/ConfirmModal';

interface Props {
  settings: SystemSettings;
  plants: Plant[];
  onUpdateSettings: (newSettings: SystemSettings) => void;
  currentAdmin: AdminProfile;
}

const DEFAULT_SCHEDULED_TIME = '20:00';

export const MultiTierEmailConfigPanel: React.FC<Props> = ({
  settings,
  plants,
  onUpdateSettings,
  currentAdmin,
}) => {
  // Active email section tab: 'admin' | 'hr' | 'plant_head' | 'top_management'
  const [activeTier, setActiveTier] = useState<EmailTier>('admin');

  // Master Email Config State
  const initialConfig: MultiTierEmailConfig = settings.email_tiers || {
    enabled: true,
    scheduled_time: DEFAULT_SCHEDULED_TIME,
    admin_emails: [
      { id: 'adm-1', tier: 'admin', email: 'software.2040@pgel.in', name: 'IT / Operations Admin', plant_ids: ['plant-1'], frequency: 'daily', status: 'active' },
    ],
    hr_emails: [
      { id: 'hr-1', tier: 'hr', email: 'hr.bhiwadi@pgel.in', name: 'HR Lead', plant_ids: ['plant-1'], frequency: '7_days', status: 'active' },
    ],
    plant_head_emails: [
      { id: 'ph-1', tier: 'plant_head', email: 'planthead.2040@pgel.in', name: 'Plant Head (PGTL 2040)', plant_ids: ['plant-1'], frequency: '15_days', status: 'active' },
    ],
    top_management_emails: [
      { id: 'tm-1', tier: 'top_management', email: 'management@pgel.in', name: 'Executive Management', plant_ids: ['all'], frequency: 'monthly', status: 'active' },
    ],
  };

  const [emailConfig, setEmailConfig] = useState<MultiTierEmailConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [testingRecipientId, setTestingRecipientId] = useState<string | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<EmailRecipientConfig | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPlantIds, setRecipientPlantIds] = useState<string[]>([]);
  const [recipientStatus, setRecipientStatus] = useState<'active' | 'inactive'>('active');
  const [deletingRecipient, setDeletingRecipient] = useState<EmailRecipientConfig | null>(null);

  // Synchronize when settings change
  useEffect(() => {
    if (settings.email_tiers) {
      setEmailConfig(settings.email_tiers);
    }
  }, [settings.email_tiers]);

  const activeRecipientsList = (): EmailRecipientConfig[] => {
    switch (activeTier) {
      case 'admin':
        return emailConfig.admin_emails || [];
      case 'hr':
        return emailConfig.hr_emails || [];
      case 'plant_head':
        return emailConfig.plant_head_emails || [];
      case 'top_management':
        return emailConfig.top_management_emails || [];
      default:
        return [];
    }
  };

  const updateRecipientsForTier = (tier: EmailTier, list: EmailRecipientConfig[]) => {
    setEmailConfig((prev) => {
      const next = { ...prev };
      if (tier === 'admin') next.admin_emails = list;
      else if (tier === 'hr') next.hr_emails = list;
      else if (tier === 'plant_head') next.plant_head_emails = list;
      else if (tier === 'top_management') next.top_management_emails = list;
      return next;
    });
  };

  const handleOpenAddModal = () => {
    setEditingRecipient(null);
    setRecipientEmail('');
    setRecipientName('');
    // Default plant access: for admin single first plant, for top management 'all'
    if (activeTier === 'admin') {
      setRecipientPlantIds(plants.length > 0 ? [plants[0].id] : []);
    } else if (activeTier === 'top_management') {
      setRecipientPlantIds(['all']);
    } else {
      setRecipientPlantIds(plants.length > 0 ? [plants[0].id] : []);
    }
    setRecipientStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (recipient: EmailRecipientConfig) => {
    setEditingRecipient(recipient);
    setRecipientEmail(recipient.email);
    setRecipientName(recipient.name || '');
    setRecipientPlantIds(recipient.plant_ids || []);
    setRecipientStatus(recipient.status || 'active');
    setIsModalOpen(true);
  };

  const handleSaveRecipient = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = recipientEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Please enter a valid company email address');
      return;
    }

    if (recipientPlantIds.length === 0) {
      toast.error('Plant-level access is mandatory. Please select at least one plant.');
      return;
    }

    // Strict Admin rule: Exactly one plant access is mandatory
    if (activeTier === 'admin' && recipientPlantIds.includes('all')) {
      toast.error('Admin emails must be mapped to a specific plant, not "All Plants".');
      return;
    }

    const currentList = activeRecipientsList();

    // Prevent duplicate emails within the same tier
    const isDuplicate = currentList.some(
      (r) => r.email.toLowerCase() === cleanEmail && (!editingRecipient || r.id !== editingRecipient.id)
    );
    if (isDuplicate) {
      toast.error(`Email ${cleanEmail} is already registered in this section.`);
      return;
    }

    let defaultFrequency: EmailFrequency = 'daily';
    if (activeTier === 'hr') defaultFrequency = '7_days';
    else if (activeTier === 'plant_head') defaultFrequency = '15_days';
    else if (activeTier === 'top_management') defaultFrequency = 'monthly';

    if (editingRecipient) {
      // Update existing
      const updatedList = currentList.map((r) => {
        if (r.id === editingRecipient.id) {
          return {
            ...r,
            email: cleanEmail,
            name: recipientName.trim() || undefined,
            plant_ids: recipientPlantIds,
            status: recipientStatus,
            frequency: defaultFrequency,
          };
        }
        return r;
      });
      updateRecipientsForTier(activeTier, updatedList);
      toast.success(`Updated ${cleanEmail}`);
    } else {
      // Add new
      const newRecipient: EmailRecipientConfig = {
        id: `rec-${activeTier}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tier: activeTier,
        email: cleanEmail,
        name: recipientName.trim() || undefined,
        plant_ids: recipientPlantIds,
        frequency: defaultFrequency,
        status: recipientStatus,
        created_at: new Date().toISOString(),
      };
      updateRecipientsForTier(activeTier, [...currentList, newRecipient]);
      toast.success(`Added ${cleanEmail} to ${activeTier.toUpperCase()} list`);
    }

    setIsModalOpen(false);
  };

  const handleDeleteRecipientConfirm = () => {
    if (!deletingRecipient) return;
    const currentList = activeRecipientsList();
    const filtered = currentList.filter((r) => r.id !== deletingRecipient.id);
    updateRecipientsForTier(activeTier, filtered);
    toast.success(`Removed ${deletingRecipient.email}`);
    setDeletingRecipient(null);
  };

  const handleSendTestEmailForRecipient = async (recipient: EmailRecipientConfig) => {
    setTestingRecipientId(recipient.id);
    try {
      await triggerMultiTierTestEmail({
        tier: recipient.tier,
        email: recipient.email,
        recipient_id: recipient.id,
        plant_id: recipient.plant_ids[0] !== 'all' ? recipient.plant_ids[0] : undefined,
      });
      toast.success(`Test email dispatched to ${recipient.email}!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch test email');
    } finally {
      setTestingRecipientId(null);
    }
  };

  const handleSaveAllSettings = async () => {
    setIsSaving(true);
    const updatedSettings: SystemSettings = {
      ...settings,
      email_tiers: emailConfig,
    };

    try {
      await saveSettings(updatedSettings);
      onUpdateSettings(updatedSettings);
      toast.success('4-Tier Email Configurations saved successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save email settings');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePlantSelection = (plantId: string) => {
    if (plantId === 'all') {
      if (recipientPlantIds.includes('all')) {
        setRecipientPlantIds([]);
      } else {
        setRecipientPlantIds(['all']);
      }
      return;
    }

    let next = recipientPlantIds.filter((id) => id !== 'all');
    if (next.includes(plantId)) {
      next = next.filter((id) => id !== plantId);
    } else {
      next.push(plantId);
    }
    setRecipientPlantIds(next);
  };

  const getTierMeta = (tier: EmailTier) => {
    switch (tier) {
      case 'admin':
        return {
          title: 'A. Admin Emails',
          badge: 'Daily Email',
          freqLabel: 'Daily (Every 24 Hours)',
          desc: 'Only Admin email IDs can be added here. Sends daily report of assigned plant feedback for the previous day. Plant-level access is mandatory.',
          color: 'text-sky-700 bg-sky-50 border-sky-200',
        };
      case 'hr':
        return {
          title: 'B. HR Emails',
          badge: '7-Day Frequency',
          freqLabel: 'Once every 7 Days',
          desc: 'Only HR email IDs can be added here. Sends 7-day review: Total, Satisfied, Unsatisfied %, Top 10 unsatisfied feedbacks, and Action Taken against grouped complaints.',
          color: 'text-purple-700 bg-purple-50 border-purple-200',
        };
      case 'plant_head':
        return {
          title: 'C. Plant Head Emails',
          badge: '15-Day Frequency',
          freqLabel: 'Once every 15 Days',
          desc: 'Only Plant Head email IDs can be added here. Sends 15-day review: Total, Satisfied, Unsatisfied %, Top 10 complaints, and Action Taken / Pending Action status.',
          color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        };
      case 'top_management':
        return {
          title: 'D. Top Management Emails',
          badge: 'Monthly Frequency',
          freqLabel: 'Once per Month (30 Days)',
          desc: 'Only Top Management emails can be added here. Sends monthly executive review: Total, Satisfied, Unsatisfied %, Plant-wise summary breakdown, Top recurring issues, and Action compliance.',
          color: 'text-rose-700 bg-rose-50 border-rose-200',
        };
    }
  };

  const meta = getTierMeta(activeTier);
  const currentRecipients = activeRecipientsList();

  return (
    <div className="space-y-6">
      {/* Main Panel Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              <span>4-LEVEL AUTOMATED EMAIL HIERARCHY</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Automated Email Configuration
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Admin (Daily) → HR (7-Day) → Plant Head (15-Day) → Top Management (Monthly)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAllSettings}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Configurations...' : 'Save All Email Configurations'}</span>
            </button>
          </div>
        </div>

        {/* Global Dispatch Schedule Controls */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enable_multi_tier"
                checked={emailConfig.enabled}
                onChange={(e) =>
                  setEmailConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                }
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
              <label htmlFor="enable_multi_tier" className="cursor-pointer">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  Enable Automated Email Dispatch
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Automatically calculate metrics and dispatch scheduled emails for each level
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>IST Dispatch Time:</span>
              </label>
              <input
                type="time"
                value={emailConfig.scheduled_time || DEFAULT_SCHEDULED_TIME}
                onChange={(e) =>
                  setEmailConfig((prev) => ({ ...prev, scheduled_time: e.target.value }))
                }
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* 4 Separate Email Configuration Sections (Tabs) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-slate-200 pb-3">
          {(['admin', 'hr', 'plant_head', 'top_management'] as EmailTier[]).map((tier) => {
            const tMeta = getTierMeta(tier);
            const count =
              tier === 'admin'
                ? emailConfig.admin_emails?.length || 0
                : tier === 'hr'
                ? emailConfig.hr_emails?.length || 0
                : tier === 'plant_head'
                ? emailConfig.plant_head_emails?.length || 0
                : emailConfig.top_management_emails?.length || 0;

            const isActive = activeTier === tier;

            return (
              <button
                key={tier}
                type="button"
                onClick={() => setActiveTier(tier)}
                className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                    isActive ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tMeta.badge}
                  </span>
                  <span className={`text-xs font-black ${isActive ? 'text-white' : 'text-slate-900'}`}>
                    {count}
                  </span>
                </div>
                <div className="text-xs font-extrabold truncate">{tMeta.title}</div>
              </button>
            );
          })}
        </div>

        {/* Active Section Header & Description */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900">{meta.title}</h3>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${meta.color}`}>
                {meta.freqLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">{meta.desc}</p>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add {meta.title.split('.')[1]?.trim() || 'Email'}</span>
          </button>
        </div>

        {/* Recipients Table (Required Columns: Email ID | Plant Access | Frequency | Status | Edit | Delete) */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Email ID</th>
                  <th className="py-3 px-4">Plant Access</th>
                  <th className="py-3 px-3">Frequency</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {currentRecipients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      No recipients configured in this section yet. Click "Add" above to register an email ID.
                    </td>
                  </tr>
                ) : (
                  currentRecipients.map((item) => {
                    // Determine plant display names
                    const hasAll = item.plant_ids?.includes('all');
                    let plantLabel = 'All Plants (Corporate)';
                    if (!hasAll && item.plant_ids?.length) {
                      const names = item.plant_ids
                        .map((id) => {
                          const p = plants.find((pl) => pl.id === id || pl.code === id);
                          return p ? p.name : id;
                        })
                        .filter(Boolean);
                      plantLabel = names.join(', ') || 'Assigned Plant';
                    }

                    const isTesting = testingRecipientId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Email ID & Name */}
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900 font-mono text-[11px] flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.email}</span>
                          </div>
                          {item.name && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{item.name}</div>
                          )}
                        </td>

                        {/* Plant Access */}
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{plantLabel}</span>
                          </div>
                        </td>

                        {/* Frequency */}
                        <td className="py-3 px-3">
                          <span className="text-[11px] font-bold text-slate-700 font-mono">
                            {meta.freqLabel}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            item.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {item.status}
                          </span>
                        </td>

                        {/* Actions (Test | Edit | Delete) */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Test Email Button */}
                            <button
                              type="button"
                              onClick={() => handleSendTestEmailForRecipient(item)}
                              disabled={isTesting}
                              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                              title="Send instant test email"
                            >
                              <Send className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                              <span>{isTesting ? 'Sending...' : 'Test'}</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Edit recipient"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-600" />
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => setDeletingRecipient(item)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete recipient"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add / Edit Recipient Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    {editingRecipient ? `Edit ${meta.title}` : `Add ${meta.title}`}
                  </h3>
                  <p className="text-[11px] text-slate-400">{meta.freqLabel}</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipient} className="p-6 space-y-4 text-xs">
              
              {/* Role lock notice */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-900 font-medium">
                <strong>Enforced Role:</strong> This email will be configured strictly for <strong>{meta.title}</strong> with <strong>{meta.freqLabel}</strong>. Cross-tier addition is restricted.
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Corporate Email ID *
                </label>
                <input
                  type="email"
                  placeholder="e.g. employee@pgel.in"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono font-bold focus:border-emerald-500 shadow-2xs"
                  required
                />
              </div>

              {/* Recipient Name / Title */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Designation / Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma (Plant Head)"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:border-emerald-500 shadow-2xs"
                />
              </div>

              {/* Plant Access Mapping */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Plant-Level Access Mapping *</span>
                  {activeTier === 'admin' && (
                    <span className="text-amber-700 font-bold text-[10px]">Strictly 1 Plant required</span>
                  )}
                </label>

                {activeTier === 'admin' ? (
                  // Admin: Mandatory Single Plant
                  <select
                    value={recipientPlantIds[0] || ''}
                    onChange={(e) => setRecipientPlantIds([e.target.value])}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    <option value="">Select Plant Access</option>
                    {plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  // HR, Plant Head, Top Management: Multi-plant selection
                  <div className="space-y-1.5 max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {activeTier === 'top_management' && (
                      <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer font-bold text-slate-800">
                        <input
                          type="checkbox"
                          checked={recipientPlantIds.includes('all')}
                          onChange={() => togglePlantSelection('all')}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>🌐 All PG Group Plants (Corporate Multi-Plant)</span>
                      </label>
                    )}

                    {plants.map((p) => {
                      const isChecked = recipientPlantIds.includes(p.id) || recipientPlantIds.includes('all');
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer font-medium text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={recipientPlantIds.includes('all')}
                            onChange={() => togglePlantSelection(p.id)}
                            className="w-4 h-4 accent-emerald-600 rounded disabled:opacity-50"
                          />
                          <span>🏢 {p.display_name || p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Recipient will receive ONLY feedbacks belonging to these assigned plants.
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-[11px] font-black uppercase text-slate-700">Status:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientStatus('active')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      recipientStatus === 'active'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientStatus('inactive')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      recipientStatus === 'inactive'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-xs cursor-pointer"
                >
                  {editingRecipient ? 'Update Recipient' : 'Save Recipient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Recipient Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingRecipient)}
        title="Remove Email Recipient"
        message={`Are you sure you want to remove ${deletingRecipient?.email} from the ${activeTier.toUpperCase()} recipient list?`}
        confirmText="Yes, Remove"
        isDanger={true}
        onConfirm={handleDeleteRecipientConfirm}
        onClose={() => setDeletingRecipient(null)}
      />
    </div>
  );
};
