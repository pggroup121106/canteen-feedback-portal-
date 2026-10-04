import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, Filter, CheckSquare, Square, Wrench, Search, 
  Building2, Utensils, Clock, ChevronDown, CheckCircle2, MessageSquare,
  Sparkles, Layers, ArrowRight, User
} from 'lucide-react';
import { FeedbackEntry, Plant, ActionTakenEntry } from '../../types/database';

interface Props {
  feedbacks: FeedbackEntry[];
  plants: Plant[];
  onOpenActionModal: (selectedFeedbacks: FeedbackEntry[]) => void;
  actions?: ActionTakenEntry[];
}

export const UnsatisfiedFeedbackView: React.FC<Props> = ({
  feedbacks,
  plants,
  onOpenActionModal,
  actions = [],
}) => {
  const [selectedPlant, setSelectedPlant] = useState<string>('all');
  const [selectedMeal, setSelectedMeal] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<Set<string>>(new Set());
  const [actionFilter, setActionFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  // Filter ONLY Unsatisfied Feedbacks (Rating <= 2 or marked as unsatisfied)
  const unsatisfiedFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      const isUnsatisfied = f.satisfaction_status === 'unsatisfied' || (Number(f.overall_rating) || 0) <= 2;
      if (!isUnsatisfied) return false;

      if (selectedPlant !== 'all' && f.plant_id !== selectedPlant && f.plant_code !== selectedPlant) {
        return false;
      }

      if (selectedMeal !== 'all' && f.meal_type !== selectedMeal) {
        return false;
      }

      if (actionFilter === 'pending' && f.action_status === 'resolved') {
        return false;
      }
      if (actionFilter === 'resolved' && f.action_status !== 'resolved') {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const remark = (f.remark || '').toLowerCase();
        const emp = (f.employee_name || '').toLowerCase();
        const id = (f.employee_id || '').toLowerCase();
        const plant = (f.plant_name || f.plant_display_name || '').toLowerCase();
        return remark.includes(q) || emp.includes(q) || id.includes(q) || plant.includes(q);
      }

      return true;
    });
  }, [feedbacks, selectedPlant, selectedMeal, searchQuery, actionFilter]);

  const toggleSelectAll = () => {
    if (selectedFeedbackIds.size === unsatisfiedFeedbacks.length) {
      setSelectedFeedbackIds(new Set());
    } else {
      setSelectedFeedbackIds(new Set(unsatisfiedFeedbacks.map((f) => f.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedFeedbackIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedFeedbackIds(next);
  };

  const handleGroupActionClick = () => {
    const selectedList = feedbacks.filter((f) => selectedFeedbackIds.has(f.id));
    if (selectedList.length === 0) return;
    onOpenActionModal(selectedList);
  };

  const pendingCount = unsatisfiedFeedbacks.filter((f) => f.action_status !== 'resolved').length;
  const resolvedCount = unsatisfiedFeedbacks.filter((f) => f.action_status === 'resolved').length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-rose-200/80 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>UNSATISFIED FEEDBACK &amp; ISSUE CLUSTERING</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Unsatisfied Employee Feedbacks
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review grievances (ratings ≤ 2), select multiple related complaints, and group them under a single Action Taken.
          </p>
        </div>

        {/* Action Taken Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-center">
            <div className="text-lg font-black text-amber-800">{pendingCount}</div>
            <div className="text-[10px] font-extrabold text-amber-700 uppercase">Pending Action</div>
          </div>
          <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-lg font-black text-emerald-800">{resolvedCount}</div>
            <div className="text-[10px] font-extrabold text-emerald-700 uppercase">Action Recorded</div>
          </div>
        </div>
      </div>

      {/* Filter & Group Action Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search remarks, employee, plant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-rose-400 font-medium"
            />
          </div>

          {/* Plant filter */}
          <select
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">🏢 All Plants ({plants.length})</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.name}
              </option>
            ))}
          </select>

          {/* Meal Filter */}
          <select
            value={selectedMeal}
            onChange={(e) => setSelectedMeal(e.target.value)}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
          >
            <option value="all">🍱 All Meals</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Snacks">Snacks</option>
          </select>

          {/* Status Filter */}
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-bold">
            <button
              onClick={() => setActionFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                actionFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              All ({unsatisfiedFeedbacks.length})
            </button>
            <button
              onClick={() => setActionFilter('pending')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                actionFilter === 'pending' ? 'bg-amber-100 text-amber-900 shadow-2xs font-extrabold' : 'text-slate-500'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setActionFilter('resolved')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                actionFilter === 'resolved' ? 'bg-emerald-100 text-emerald-900 shadow-2xs font-extrabold' : 'text-slate-500'
              }`}
            >
              Action Taken
            </button>
          </div>
        </div>

        {/* Group Action Trigger Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {selectedFeedbackIds.size > 0 && selectedFeedbackIds.size === unsatisfiedFeedbacks.length ? (
              <CheckSquare className="w-4 h-4 text-rose-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>Select All ({unsatisfiedFeedbacks.length})</span>
          </button>

          <button
            onClick={handleGroupActionClick}
            disabled={selectedFeedbackIds.size === 0}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-xs transition-all disabled:cursor-not-allowed"
          >
            <Layers className="w-4 h-4" />
            <span>Group &amp; Add Action Taken ({selectedFeedbackIds.size})</span>
          </button>
        </div>
      </div>

      {/* Feedbacks Grid / List */}
      {unsatisfiedFeedbacks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">No Unsatisfied Feedback Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Great news! No complaints match your selected filters. Either all ratings are positive or filters need adjustment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {unsatisfiedFeedbacks.map((item) => {
            const isSelected = selectedFeedbackIds.has(item.id);
            const isResolved = item.action_status === 'resolved';

            return (
              <div
                key={item.id}
                onClick={() => toggleSelectOne(item.id)}
                className={`bg-white border rounded-2xl p-4.5 transition-all cursor-pointer relative shadow-2xs ${
                  isSelected
                    ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectOne(item.id);
                      }}
                      className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-rose-600" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </button>

                    <div>
                      <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.plant_display_name || item.plant_name || 'Plant'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-2 mt-0.5">
                        <span>{item.meal_type}</span>
                        <span>•</span>
                        <span>{item.shift}</span>
                        <span>•</span>
                        <span>{new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rating Badge */}
                  <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                    {item.overall_rating || 1} / 5 ★
                  </span>
                </div>

                {/* Specific Remark */}
                <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    "{item.remark || 'No textual remark left by employee'}"
                  </p>
                  
                  {/* Employee Info if available */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-200/60 font-medium">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {item.employee_name || 'Anonymous Employee'}
                      {item.employee_id ? ` (${item.employee_id})` : ''}
                    </span>
                    <span className="uppercase text-[9px] font-black text-slate-400">{item.submitted_from || 'Kiosk'}</span>
                  </div>
                </div>

                {/* Parameter Scores */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {item.food_taste !== undefined && item.food_taste <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Taste: {item.food_taste}★
                    </span>
                  )}
                  {item.food_quality !== undefined && item.food_quality <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Quality: {item.food_quality}★
                    </span>
                  )}
                  {item.food_quantity !== undefined && item.food_quantity <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Portion: {item.food_quantity}★
                    </span>
                  )}
                  {item.hygiene !== undefined && item.hygiene <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Hygiene: {item.hygiene}★
                    </span>
                  )}
                  {item.staff_behaviour !== undefined && item.staff_behaviour <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Staff: {item.staff_behaviour}★
                    </span>
                  )}
                  {item.service_speed !== undefined && item.service_speed <= 2 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      Speed: {item.service_speed}★
                    </span>
                  )}
                </div>

                {/* Action Status Footer */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  {isResolved ? (
                    <div className="flex items-center gap-1.5 text-emerald-700 font-extrabold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Action Taken: {item.action_taken || 'Resolved'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-amber-700 font-extrabold text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pending Corrective Action</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenActionModal([item]);
                    }}
                    className="text-[11px] font-extrabold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isResolved ? 'Edit Action' : 'Take Action'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
