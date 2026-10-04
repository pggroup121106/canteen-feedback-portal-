import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, Clock, AlertTriangle, Layers, Building2, User, 
  Calendar, Search, Filter, Edit, Trash2, History, ChevronRight, ShieldCheck,
  Check, X
} from 'lucide-react';
import { toast } from 'sonner';
import { ActionTakenEntry, Plant, ActionStatus } from '../../types/database';
import { deleteAction } from '../../lib/supabase';
import { ConfirmModal } from '../common/ConfirmModal';

interface Props {
  actions: ActionTakenEntry[];
  plants: Plant[];
  onEditAction: (action: ActionTakenEntry) => void;
  onRefreshActions: () => void;
  currentAdminRole?: string;
}

export const ActionTakenHistoryView: React.FC<Props> = ({
  actions,
  plants,
  onEditAction,
  onRefreshActions,
  currentAdminRole,
}) => {
  const [selectedPlant, setSelectedPlant] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ActionStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAuditAction, setSelectedAuditAction] = useState<ActionTakenEntry | null>(null);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);

  const filteredActions = useMemo(() => {
    return actions.filter((act) => {
      if (selectedPlant !== 'all' && act.plant_id !== selectedPlant) {
        return false;
      }
      if (statusFilter !== 'all' && act.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (act.issue_title || '').toLowerCase();
        const desc = (act.action_description || '').toLowerCase();
        const person = (act.responsible_person || '').toLowerCase();
        const dept = (act.responsible_dept || '').toLowerCase();
        return title.includes(q) || desc.includes(q) || person.includes(q) || dept.includes(q);
      }
      return true;
    });
  }, [actions, selectedPlant, statusFilter, searchQuery]);

  const handleDeleteConfirm = async () => {
    if (!deletingActionId) return;
    try {
      await deleteAction(deletingActionId);
      toast.success('Action record removed successfully');
      setDeletingActionId(null);
      onRefreshActions();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete action');
    }
  };

  const getStatusBadge = (status: ActionStatus) => {
    switch (status) {
      case 'Closed':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'Action Taken':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'In Progress':
        return 'bg-sky-50 text-sky-800 border-sky-300';
      case 'Pending':
      default:
        return 'bg-amber-50 text-amber-800 border-amber-300';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>ACTION MANAGEMENT &amp; RESOLUTION HISTORY</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Action Taken Audit History
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete audit trail of corrective measures taken against employee complaints, responsible departments, and compliance statuses.
          </p>
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <div className="text-base font-black text-slate-900">{actions.length}</div>
            <div className="text-[10px] font-extrabold text-slate-500 uppercase">Total Actions</div>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-base font-black text-emerald-800">
              {actions.filter((a) => a.status === 'Action Taken' || a.status === 'Closed').length}
            </div>
            <div className="text-[10px] font-extrabold text-emerald-700 uppercase">Resolved</div>
          </div>
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
              placeholder="Search action, department, officer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-medium"
            />
          </div>

          {/* Plant Selector */}
          <select
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">🏢 All Plants</option>
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
            <option value="Action Taken">✅ Action Taken</option>
            <option value="In Progress">⏳ In Progress</option>
            <option value="Pending">⚠️ Pending</option>
            <option value="Closed">🔒 Closed</option>
          </select>
        </div>
      </div>

      {/* Actions Table */}
      {filteredActions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">No Action Records Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Actions created from the "Unsatisfied Feedback" section or Email reports will appear here with full audit history.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Issue / Grievance</th>
                  <th className="py-3.5 px-3 text-center">Grouped</th>
                  <th className="py-3.5 px-4">Corrective Action Taken</th>
                  <th className="py-3.5 px-3">Responsible Dept. &amp; Lead</th>
                  <th className="py-3.5 px-3">Date</th>
                  <th className="py-3.5 px-3 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Audit &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredActions.map((act) => {
                  const plant = plants.find((p) => p.id === act.plant_id);
                  const plantName = plant ? plant.display_name || plant.name : act.plant_name || 'Plant';

                  return (
                    <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Issue Title */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <div className="font-extrabold text-slate-900 truncate" title={act.issue_title}>
                          {act.issue_title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{plantName}</span>
                        </div>
                      </td>

                      {/* Complaint Count */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                          <Layers className="w-3 h-3" />
                          <span>{act.complaint_count || (act.feedback_ids ? act.feedback_ids.length : 1)}</span>
                        </span>
                      </td>

                      {/* Action Description */}
                      <td className="py-3.5 px-4 max-w-[260px]">
                        <div className="line-clamp-2 text-slate-700 font-medium" title={act.action_description}>
                          {act.action_description}
                        </div>
                      </td>

                      {/* Dept & Person */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900">{act.responsible_dept || 'HR'}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{act.responsible_person || 'Admin'}</div>
                      </td>

                      {/* Action Date */}
                      <td className="py-3.5 px-3 text-slate-500 text-[11px] font-mono">
                        {act.action_date || act.created_at?.split('T')[0] || '-'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider ${getStatusBadge(act.status)}`}>
                          {act.status}
                        </span>
                      </td>

                      {/* Audit & Edit Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Audit Trail Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedAuditAction(act)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="View Audit Trail"
                          >
                            <History className="w-4 h-4 text-sky-600" />
                          </button>

                          {/* Edit Action Button */}
                          <button
                            type="button"
                            onClick={() => onEditAction(act)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit Action"
                          >
                            <Edit className="w-4 h-4 text-emerald-600" />
                          </button>

                          {/* Delete Action Button */}
                          <button
                            type="button"
                            onClick={() => setDeletingActionId(act.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Action"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {selectedAuditAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-sm font-black text-white">Action Audit Trail</h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-[300px]">
                    {selectedAuditAction.issue_title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditAction(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto space-y-3 text-xs">
              <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                Change Log Timeline ({selectedAuditAction.audit_trail?.length || 1} records)
              </div>

              {selectedAuditAction.audit_trail && selectedAuditAction.audit_trail.length > 0 ? (
                <div className="space-y-2 border-l-2 border-slate-200 pl-3 ml-2">
                  {selectedAuditAction.audit_trail.map((entry, idx) => (
                    <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="font-bold text-slate-900">{entry.updated_by}</span>
                        <span>{new Date(entry.updated_at).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-slate-800 font-medium">
                        {entry.note || `Status: ${entry.new_status}`}
                      </div>
                      {entry.previous_status && entry.new_status && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          {entry.previous_status} → <strong className="text-emerald-700">{entry.new_status}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No audit trail logs recorded yet.</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setSelectedAuditAction(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingActionId)}
        title="Delete Action Record"
        message="Are you sure you want to delete this Action Taken record? Linked feedbacks will be unlinked and return to pending status."
        confirmText="Yes, Delete Action"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingActionId(null)}
      />
    </div>
  );
};
