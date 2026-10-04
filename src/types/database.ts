export type MealType = string;
export type ShiftType = string;
export type AdminRole = 'super_admin' | 'it_admin' | 'hr_admin';
export type LanguageCode = 'en' | 'hi';

export interface ShiftConfig {
  id: string;
  name: string; // e.g. "Morning Shift"
  start_time: string; // e.g. "06:00"
  end_time: string; // e.g. "14:00"
  category: 'Day' | 'Night'; // Day (Lunch) vs Night (Dinner)
  display_label?: string; // e.g. "Morning Shift (06:00 - 14:00)"
}

export interface Plant {
  id: string;
  name: string; // Plant Name
  code: string; // Plant Code
  location: string; // Location
  display_name: string; // Custom Display Name shown everywhere
  is_active: boolean;
  notification_email?: string; // Plant-Specific HR / Contractor Alert Email
  to_emails?: string[]; // Plant-Specific TO Recipients for Daily Digest
  cc_emails?: string[]; // Plant-Specific CC Recipients for Daily Digest
  created_at?: string;
}

export interface PlantDigestRecipients {
  to_emails: string[];
  cc_emails: string[];
}

export interface FeedbackEntry {
  id: string;
  language: LanguageCode;
  plant_id: string;
  plant_name?: string;
  plant_code?: string;
  plant_location?: string;
  plant_display_name?: string;
  meal_type: MealType;
  shift: ShiftType;
  food_taste: number;
  food_quality: number;
  food_quantity?: number;
  service_speed?: number;
  staff_behaviour: number;
  hygiene: number;
  overall_rating: number;
  remark?: string;
  employee_name?: string;
  employee_id?: string;
  email?: string;
  phone?: string;
  device_info?: string;
  browser?: string;
  submitted_from?: string;
  created_at: string;
  // Grievance, Media & Corrective Action Fields
  satisfaction_status?: 'satisfied' | 'unsatisfied';
  images?: string[];
  video_url?: string;
  action_status?: 'pending' | 'resolved';
  action_taken?: string;
  action_by?: string;
  action_at?: string;
  action_evidence_url?: string;
}

export interface AdminProfile {
  id: string;
  employee_id?: string;
  email: string;
  full_name: string;
  role: AdminRole;
  location?: string;
  plant_id?: string;
  created_at?: string;
}

export interface DailyDigestConfig {
  enabled: boolean;
  to_emails: string[];
  cc_emails: string[];
  scheduled_time: string; // e.g. "20:00" (IST)
  unsatisfied_threshold_alert: number; // e.g. 20 (%)
  plant_recipients?: Record<string, PlantDigestRecipients>;
  last_sent_at?: string;
}

export interface SystemSettings {
  id?: string;
  company_name: string;
  company_logo_url: string;
  enable_english: boolean;
  enable_hindi: boolean;
  meal_types: MealType[];
  shifts: (string | ShiftConfig)[];
  theme_mode: 'light' | 'dark';
  notification_email?: string;
  enable_email_alerts?: boolean;
  daily_digest?: DailyDigestConfig;
  email_tiers?: MultiTierEmailConfig;
}

export type EmailTier = 'admin' | 'hr' | 'plant_head' | 'top_management';
export type EmailFrequency = 'daily' | '7_days' | '15_days' | 'monthly';

export interface EmailRecipientConfig {
  id: string;
  tier: EmailTier;
  email: string;
  name?: string;
  plant_ids: string[]; // ['plant-1'] or ['plant-1', 'plant-2'] or ['all']
  frequency: EmailFrequency;
  status: 'active' | 'inactive';
  created_at?: string;
  last_sent_at?: string;
}

export interface MultiTierEmailConfig {
  enabled: boolean;
  admin_emails: EmailRecipientConfig[];
  hr_emails: EmailRecipientConfig[];
  plant_head_emails: EmailRecipientConfig[];
  top_management_emails: EmailRecipientConfig[];
  scheduled_time?: string; // e.g. "20:00" IST
}

export type ActionStatus = 'Pending' | 'In Progress' | 'Action Taken' | 'Closed';

export interface ActionAuditLog {
  updated_by: string;
  updated_at: string;
  previous_status?: ActionStatus;
  new_status?: ActionStatus;
  note?: string;
}

export interface ActionTakenEntry {
  id: string;
  issue_title: string;
  plant_id: string;
  plant_name?: string;
  feedback_ids: string[];
  complaint_count: number;
  action_description: string;
  responsible_person: string;
  responsible_dept: string;
  action_date: string; // YYYY-MM-DD
  status: ActionStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  note?: string;
  audit_trail: ActionAuditLog[];
}

export interface EmailDeliveryLog {
  id: string;
  timestamp: string; // ISO
  tier: EmailTier;
  recipient_email: string;
  recipient_name?: string;
  plant_id: string;
  plant_name: string;
  reporting_period: string; // e.g. "2026-09-28 to 2026-10-04"
  feedbacks_count: number;
  satisfied_count: number;
  unsatisfied_count: number;
  status: 'success' | 'failed';
  error_message?: string;
  message_id?: string;
  subject: string;
}

export interface FeedbackFilterOptions {
  search?: string;
  startDate?: string;
  endDate?: string;
  plantId?: string;
  mealType?: string;
  shift?: string;
  minRating?: number;
  language?: string;
  satisfactionStatus?: 'all' | 'satisfied' | 'unsatisfied';
  actionStatus?: 'all' | 'pending' | 'resolved';
}

export interface DashboardStats {
  todayCount: number;
  weeklyCount: number;
  monthlyCount: number;
  averageRating: number;
  happyPercentage: number;
  poorCount: number;
  totalRemarks: number;
  satisfactionScore: number;
  actionsTakenCount: number;
  pendingActionsCount: number;
}


