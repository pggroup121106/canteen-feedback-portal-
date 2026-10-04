import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, CheckCircle2, AlertTriangle, RefreshCw, Send, 
  Building2, Search, Filter, Clock, Check, X, ShieldAlert,
  ArrowUpRight, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { EmailDeliveryLog, Plant, EmailTier } from '../../types/database';
import { fetchEmailLogs, triggerMultiTierTestEmail } from '../../lib/supabase';

interface Props {
  plants: Plant[];
}

export const EmailLogsView: React.FC<Props> = ({ plants }) => {
  const [logs, setLogs] = useState<EmailDeliveryLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [plantFilter, setPlantFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Test Email Trigger State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testTier, setTestTier] = useState<EmailTier>('admin');
  const [testEmail, setTestEmail] = useState('');
  const [testPlantId, setTestPlantId] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchEmailLogs(tierFilter, plantFilter);
      setLogs(data);
    } catch (e) {
      toast.error('Failed to load email delivery logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [tierFilter, plantFilter]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const email = (log.recipient_email || '').toLowerCase();
        const plant = (log.plant_name || '').toLowerCase();
        const subj = (log.subject || '').toLowerCase();
        return email.includes(q) || plant.includes(q) || subj.includes(q);
      }
      return true;
    });
  }, [logs, statusFilter, searchQuery]);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) {
      toast.error('Please enter a destination email address');
      return;
    }

    setIsSendingTest(true);
    try {
      await triggerMultiTierTestEmail({
        tier: testTier,
        email: testEmail.trim(),
        plant_id: testPlantId || undefined,
      });
      toast.success(`Test ${testTier.toUpperCase()} email dispatched to ${testEmail}!`);
      setIsTestModalOpen(false);
      // Reload logs after 1.5 seconds
      setTimeout(loadLogs, 1500);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch test email');
    } finally {
      setIsSendingTest(false);
    }
  };

  const getTierBadge = (tier: EmailTier) => {
    switch (tier) {
      case 'admin':
        return { label: 'Admin (Daily)', bg: 'bg-sky-50 text-sky-800 border-sky-200' };
      case 'hr':
        return { label: 'HR (7-Day)', bg: 'bg-purple-50 text-purple-800 border-purple-200' };
      case 'plant_head':
        return { label: 'Plant Head (15-Day)', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'top_management':
        return { label: 'Top Management (Monthly)', bg: 'bg-rose-50 text-rose-800 border-rose-200' };
      default:
        return { label: tier, bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const successCount = logs.filter((l) => l.status === 'success').length;
  const failureCount = logs.filter((l) => l.status === 'failed').length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 mb-2">
            <Mail className="w-3.5 h-3.5 text-blue-600" />
            <span>EMAIL DISPATCH &amp; DELIVERY AUDIT</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Email Delivery &amp; Transmission Logs
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time delivery verification for Daily Admin, 7-Day HR, 15-Day Plant Head, and Monthly Management emails.
          </p>
        </div>

        {/* Quick Stats & Actions */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-base font-black text-emerald-800">{successCount}</div>
            <div className="text-[10px] font-extrabold text-emerald-700 uppercase">Delivered</div>
          </div>
          {failureCount > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-center">
              <div className="text-base font-black text-rose-800">{failureCount}</div>
              <div className="text-[10px] font-extrabold text-rose-700 uppercase">Failed</div>
            </div>
          )}
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>Send Test Email</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search recipient email, plant, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 font-medium"
            />
          </div>

          {/* Tier Selector */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">All Email Levels</option>
            <option value="admin">Admin Emails (Daily)</option>
            <option value="hr">HR Emails (7-Day)</option>
            <option value="plant_head">Plant Head Emails (15-Day)</option>
            <option value="top_management">Top Management (Monthly)</option>
          </select>

          {/* Plant Selector */}
          <select
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">All Plants</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="success">✅ Delivered (Success)</option>
            <option value="failed">❌ Failed Delivery</option>
          </select>
        </div>

        <button
          onClick={loadLogs}
          disabled={isLoading}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Refresh Logs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">No Email Dispatch Logs</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Dispatches triggered by the automated scheduled cron or via "Send Test Email" will be recorded here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Timestamp (IST)</th>
                  <th className="py-3.5 px-3">Level / Tier</th>
                  <th className="py-3.5 px-4">Recipient</th>
                  <th className="py-3.5 px-3">Plant Access</th>
                  <th className="py-3.5 px-3">Reporting Period</th>
                  <th className="py-3.5 px-3 text-center">Feedbacks</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredLogs.map((log) => {
                  const isSuccess = log.status === 'success';
                  const tierBadge = getTierBadge(log.tier);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* Tier Badge */}
                      <td className="py-3.5 px-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border ${tierBadge.bg}`}>
                          {tierBadge.label}
                        </span>
                      </td>

                      {/* Recipient */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 font-mono text-[11px]">{log.recipient_email}</div>
                        {log.recipient_name && (
                          <div className="text-[10px] text-slate-400">{log.recipient_name}</div>
                        )}
                      </td>

                      {/* Plant */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{log.plant_name}</span>
                        </div>
                      </td>

                      {/* Period */}
                      <td className="py-3.5 px-3 text-slate-600 font-medium text-[11px]">
                        {log.reporting_period}
                      </td>

                      {/* Feedback counts */}
                      <td className="py-3.5 px-3 text-center font-mono">
                        <span className="font-black text-slate-900">{log.feedbacks_count}</span>
                        <div className="text-[9px] text-slate-400">
                          <span className="text-emerald-600 font-bold">{log.satisfied_count}S</span> /{' '}
                          <span className="text-rose-600 font-bold">{log.unsatisfied_count}U</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Delivered</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200 cursor-help"
                            title={log.error_message || 'SMTP delivery failed'}
                          >
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Test Email Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Send className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white">Send Management Test Email</h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendTestEmail} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Select Email Level / Format *
                </label>
                <select
                  value={testTier}
                  onChange={(e) => setTestTier(e.target.value as EmailTier)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:border-emerald-500 cursor-pointer"
                >
                  <option value="admin">Level 1: Admin Email (Daily Format)</option>
                  <option value="hr">Level 2: HR Email (7-Day Format + Actions)</option>
                  <option value="plant_head">Level 3: Plant Head Email (15-Day Format + Actions)</option>
                  <option value="top_management">Level 4: Top Management Email (Monthly Format + Actions)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Send Test To (Email Address) *
                </label>
                <input
                  type="email"
                  placeholder="e.g. software.2040@pgel.in"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono font-bold focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Plant Scope
                </label>
                <select
                  value={testPlantId}
                  onChange={(e) => setTestPlantId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">All Assigned Plants</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingTest}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingTest ? 'Sending...' : 'Dispatch Test Email'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
