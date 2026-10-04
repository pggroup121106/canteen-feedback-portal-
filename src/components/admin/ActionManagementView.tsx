import React, { useState } from 'react';
import { 
  Layers, CheckCircle2, AlertTriangle, Clock, Plus, Filter,
  Building2, History, ChevronRight, UserCheck, Sparkles
} from 'lucide-react';
import { FeedbackEntry, Plant, ActionTakenEntry } from '../../types/database';
import { UnsatisfiedFeedbackView } from './UnsatisfiedFeedbackView';
import { ActionTakenHistoryView } from './ActionTakenHistoryView';
import { ActionManagementModal } from './ActionManagementModal';

interface Props {
  feedbacks: FeedbackEntry[];
  plants: Plant[];
  actions: ActionTakenEntry[];
  adminName?: string;
  onRefreshActions: () => void;
  onUpdateFeedbackEntry?: (updated: FeedbackEntry) => void;
}

export const ActionManagementView: React.FC<Props> = ({
  feedbacks,
  plants,
  actions,
  adminName = 'Canteen Administrator',
  onRefreshActions,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'grouping' | 'history'>('grouping');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFeedbacks, setSelectedFeedbacks] = useState<FeedbackEntry[]>([]);
  const [editingAction, setEditingAction] = useState<ActionTakenEntry | null>(null);

  const handleOpenActionModal = (feedbacksToGroup: FeedbackEntry[]) => {
    setSelectedFeedbacks(feedbacksToGroup);
    setEditingAction(null);
    setIsModalOpen(true);
  };

  const handleEditAction = (action: ActionTakenEntry) => {
    setEditingAction(action);
    setSelectedFeedbacks([]);
    setIsModalOpen(true);
  };

  const handleActionSaved = () => {
    onRefreshActions();
  };

  const totalUnsatisfied = feedbacks.filter(
    (f) => f.satisfaction_status === 'unsatisfied' || (Number(f.overall_rating) || 0) <= 2
  ).length;

  const totalResolvedActions = actions.filter(
    (a) => a.status === 'Action Taken' || a.status === 'Closed'
  ).length;

  const pendingActions = actions.filter((a) => a.status === 'Pending' || a.status === 'In Progress').length;

  return (
    <div className="space-y-5">
      {/* Top Navigation Tabs for Action Management */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('grouping')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'grouping'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Group Complaints &amp; Assign Action ({totalUnsatisfied})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Action Taken History &amp; Audit ({actions.length})</span>
          </button>
        </div>

        <button
          onClick={() => {
            const unsatisfied = feedbacks.filter(
              (f) => f.satisfaction_status === 'unsatisfied' || (Number(f.overall_rating) || 0) <= 2
            );
            handleOpenActionModal(unsatisfied.slice(0, 5));
          }}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>New Corrective Action</span>
        </button>
      </div>

      {/* Render Selected View */}
      {activeSubTab === 'grouping' ? (
        <UnsatisfiedFeedbackView
          feedbacks={feedbacks}
          plants={plants}
          actions={actions}
          onOpenActionModal={handleOpenActionModal}
        />
      ) : (
        <ActionTakenHistoryView
          actions={actions}
          plants={plants}
          onEditAction={handleEditAction}
          onRefreshActions={onRefreshActions}
        />
      )}

      {/* Action Create / Edit Modal */}
      <ActionManagementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedFeedbacks={selectedFeedbacks}
        plants={plants}
        adminName={adminName}
        existingAction={editingAction}
        onActionSaved={handleActionSaved}
      />
    </div>
  );
};
