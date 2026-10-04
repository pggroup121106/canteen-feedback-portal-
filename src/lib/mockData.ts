import { Plant, FeedbackEntry, SystemSettings, AdminProfile } from '../types/database';

export const INITIAL_PLANTS: Plant[] = [
  {
    "id": "plant-1",
    "name": "PG TECHNOPLAST",
    "code": "2040",
    "location": "BHIWADI",
    "display_name": "BHIWADI — PGTL (2040)",
    "is_active": true,
    "notification_email": "canteen.pgtl@pgel.in"
  },
  {
    "id": "plant-2",
    "name": "NEXT GENERATION MANUFACTURING",
    "code": "4020",
    "location": "BHIWADI",
    "display_name": "BHIWADI — NGM (4020)",
    "is_active": true,
    "notification_email": "canteen.ngm@pgel.in"
  },
  {
    "id": "plant-3",
    "name": "PG ELECTROPLAST LTD",
    "code": "PGEL",
    "location": "SUPA",
    "display_name": "SUPA — PGEL (Unit-I)",
    "is_active": true,
    "notification_email": "canteen.supa.pgel@pgel.in"
  },
  {
    "id": "plant-4",
    "name": "PG TECHNOPLAST",
    "code": "PGTL",
    "location": "SUPA",
    "display_name": "SUPA — PGTL (Unit-II)",
    "is_active": true,
    "notification_email": "canteen.supa.pgtl@pgel.in"
  },
  {
    "id": "plant-5",
    "name": "NEXT GENERATION MANUFACTURING",
    "code": "NGM",
    "location": "SUPA",
    "display_name": "SUPA — NGM (Unit-III)",
    "is_active": true,
    "notification_email": "canteen.supa.ngm@pgel.in"
  }
];

export const INITIAL_SETTINGS: SystemSettings = {
  company_name: 'PG Electroplast Ltd',
  company_logo_url: '/pg-logo.png',
  enable_english: true,
  enable_hindi: true,
  meal_types: ['Lunch', 'Dinner'],
  shifts: [
    'Day Shift (06:00 AM - 06:00 PM)',
    'Night Shift (06:00 PM - 06:00 AM)'
  ],
  theme_mode: 'light',
  notification_email: 'verify.software2040@pgel.in',
  enable_email_alerts: true,
  daily_digest: {
    enabled: true,
    to_emails: ['software.2040@pgel.in'],
    cc_emails: ['verify.software2040@pgel.in'],
    scheduled_time: '20:00',
    unsatisfied_threshold_alert: 20,
  },
  email_tiers: {
    enabled: true,
    scheduled_time: '20:00',
    admin_emails: [
      {
        id: 'cfg-adm-1',
        tier: 'admin',
        email: 'software.2040@pgel.in',
        name: 'IT / Operations Admin',
        plant_ids: ['plant-1'],
        frequency: 'daily',
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: 'cfg-adm-2',
        tier: 'admin',
        email: 'canteen.ngm@pgel.in',
        name: 'NGM Canteen Admin',
        plant_ids: ['plant-2'],
        frequency: 'daily',
        status: 'active',
        created_at: new Date().toISOString(),
      }
    ],
    hr_emails: [
      {
        id: 'cfg-hr-1',
        tier: 'hr',
        email: 'hr.bhiwadi@pgel.in',
        name: 'HR Plant Lead',
        plant_ids: ['plant-1'],
        frequency: '7_days',
        status: 'active',
        created_at: new Date().toISOString(),
      }
    ],
    plant_head_emails: [
      {
        id: 'cfg-ph-1',
        tier: 'plant_head',
        email: 'planthead.2040@pgel.in',
        name: 'Plant Head (PGTL 2040)',
        plant_ids: ['plant-1'],
        frequency: '15_days',
        status: 'active',
        created_at: new Date().toISOString(),
      }
    ],
    top_management_emails: [
      {
        id: 'cfg-tm-1',
        tier: 'top_management',
        email: 'management@pgel.in',
        name: 'Executive Management',
        plant_ids: ['all'],
        frequency: 'monthly',
        status: 'active',
        created_at: new Date().toISOString(),
      }
    ]
  },
};

export const DEMO_ADMINS: AdminProfile[] = [
  {
    id: 'admin-it-1',
    email: 'software.2040@pgel.in',
    full_name: 'IT Admin',
    role: 'super_admin',
  },
];

export const INITIAL_FEEDBACKS: FeedbackEntry[] = [];
