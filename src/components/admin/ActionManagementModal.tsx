import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, Clock, Layers, UserCheck, 
  Building2, Calendar, FileText, Sparkles, Send, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { FeedbackEntry, Plant, ActionStatus, ActionTakenEntry } from '../../types/database';
import { saveAction, updateAction } from '../../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedFeedbacks: FeedbackEntry[];
  plants: Plant[];
  adminName?: string;
  existingAction?: ActionTakenEntry | null;
  onActionSaved: (action: ActionTakenEntry) => void;
}

export const ActionManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedFeedbacks,
  plants,
  adminName = 'Canteen Administrator',
  existingAction = null,
  onActionSaved,
}) => {
  const [issueTitle, setIssueTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [responsibleDept, setResponsibleDept] = useState('HR & Administration');
  const [responsiblePerson, setResponsiblePerson] = useState(adminName);
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<ActionStatus>('Action Taken');
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingAction) {
      setIssueTitle(existingAction.issue_title);
      setActionDescription(existingAction.action_description);
      setResponsibleDept(existingAction.responsible_dept || 'HR & Administration');
      setResponsiblePerson(existingAction.responsible_person || adminName);
      setActionDate(existingAction.action_date || new Date().toISOString().split('T')[0]);
      setStatus(existingAction.status || 'Action Taken');
      setSelectedPlantId(existingAction.plant_id || '');
      setAuditNote('');
    } else if (selectedFeedbacks.length > 0) {
      // Suggest common issue title based on remarks or lowest scores
      const primaryPlant = selectedFeedbacks[0].plant_id || '';
      setSelectedPlantId(primaryPlant);

      const sampleRemarks = selectedFeedbacks
        .map((f) => f.remark?.trim())
        .filter(Boolean);

      if (sampleRemarks.length > 0) {
        setIssueTitle(sampleRemarks[0] || 'Canteen Food Quality & Service Improvement');
      } else {
        setIssueTitle('Corrective Action for Canteen Feedback');
      }

      setActionDescription('');
      setResponsibleDept('HR & Administration');
      setResponsiblePerson(adminName);
      setActionDate(new Date().toISOString().split('T')[0]);
      setStatus('Action Taken');
      setAuditNote('');
    }
  }, [existingAction, selectedFeedbacks, adminName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!issueTitle.trim()) {
      toast.error('Please enter an issue / feedback title.');
      return;
    }

    if (!actionDescription.trim()) {
      toast.error('Please enter the description of Action Taken.');
      return;
    }

    const plant = plants.find((p) => p.id === selectedPlantId);
    const plantName = plant ? plant.display_name || plant.name : undefined;

    setIsSubmitting(true);
    try {
      if (existingAction) {
        // Update existing action
        const updated = await updateAction(
          existingAction.id,
          {
            issue_title: issueTitle.trim(),
            action_description: actionDescription.trim(),
            responsible_dept: responsibleDept.trim(),
            responsible_person: responsiblePerson.trim(),
            action_date: actionDate,
            status,
            plant_id: selectedPlantId,
            plant_name: plantName,
          },
          adminName,
          auditNote.trim() || `Status updated to ${status}`
        );
        toast.success('Action Taken updated successfully with audit trail!');
        onActionSaved(updated);
      } else {
        // Create new grouped action
        const created = await saveAction({
          issue_title: issueTitle.trim(),
          plant_id: selectedPlantId,
          plant_name: plantName,
          feedback_ids: selectedFeedbacks.map((f) => f.id),
          complaint_count: selectedFeedbacks.length,
          action_description: actionDescription.trim(),
          responsible_person: responsiblePerson.trim(),
          responsible_dept: responsibleDept.trim(),
          action_date: actionDate,
          status,
          created_by: adminName,
          note: auditNote.trim() || `Initial action logged against ${selectedFeedbacks.length} feedback(s)`,
        });
        toast.success(`Action successfully assigned to ${selectedFeedbacks.length} complaint(s)!`);
        onActionSaved(created);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save action');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">
                {existingAction ? 'Edit Action Taken & Update Audit' : 'Record Action Taken on Grouped Complaints'}
              </h2>
              <p className="text-xs text-slate-400">
                {existingAction
                  ? `Linked to ${existingAction.complaint_count || existingAction.feedback_ids?.length || 1} complaint(s)`
                  : `Assign common corrective action to ${selectedFeedbacks.length} selected feedback(s)`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Complaints Chip Preview */}
        {!existingAction && selectedFeedbacks.length > 0 && (
          <div className="bg-rose-50/70 border-b border-rose-100 p-3.5 px-6">
            <div className="text-[11px] font-black uppercase text-rose-800 tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Grouping {selectedFeedbacks.length} Selected Grievance(s)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {selectedFeedbacks.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 text-[11px] bg-white border border-rose-200 rounded-lg px-2 py-0.5 font-medium text-slate-700 shadow-2xs"
                >
                  <span className="font-bold text-rose-700">{f.overall_rating}★</span>
                  <span className="truncate max-w-[200px]">{f.remark || `${f.meal_type} Complaint`}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {/* Issue Title / Summary */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Issue / Feedback Summary *
            </label>
            <input
              type="text"
              placeholder="e.g. Food taste too spicy & portion size inadequate during lunch"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs"
              required
            />
          </div>

          {/* Plant & Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Plant Location *</span>
              </label>
              <select
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs cursor-pointer"
                required
              >
                <option value="">Select Plant</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Action Status *</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ActionStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs cursor-pointer"
              >
                <option value="Action Taken">✅ Action Taken (Resolved)</option>
                <option value="Closed">🔒 Closed</option>
                <option value="In Progress">⏳ In Progress</option>
                <option value="Pending">⚠️ Pending Review</option>
              </select>
            </div>
          </div>

          {/* Action Taken Description */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Action Taken / Resolution Plan *
            </label>
            <textarea
              rows={3}
              placeholder="Describe the specific corrective action taken with the catering vendor or kitchen team..."
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:border-emerald-500 shadow-2xs leading-relaxed"
              required
            />
          </div>

          {/* Responsible Department & Person */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Responsible Department *
              </label>
              <input
                type="text"
                placeholder="e.g. HR & Admin, Catering Contractor"
                value={responsibleDept}
                onChange={(e) => setResponsibleDept(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Responsible Officer / Lead *
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma (Plant HR)"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs"
                required
              />
            </div>
          </div>

          {/* Action Date & Audit Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Action Implementation Date</span>
              </label>
              <input
                type="date"
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:border-emerald-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Audit Note / Change Reason</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Vendor penalty issued & menu spices revised"
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:border-emerald-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Audit Trail History (if editing) */}
          {existingAction && existingAction.audit_trail && existingAction.audit_trail.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2 mt-2">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                Audit Trail History ({existingAction.audit_trail.length} records)
              </span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {existingAction.audit_trail.map((entry, idx) => (
                  <div key={idx} className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                    <div>
                      <strong className="text-slate-900">{entry.updated_by}</strong>: {entry.note || entry.new_status}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(entry.updated_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : existingAction ? 'Update Action Taken' : 'Save & Link Action'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
