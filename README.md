# LA Signs & Graphics CC — Internal Operations System

A production-grade internal business operations system for **LA Signs & Graphics CC**, Windhoek, Namibia.

---

## Tech Stack

- **Frontend**: Next.js 14, TailwindCSS, Framer Motion, TanStack Table, React Hook Form + Zod
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Hosting**: Vercel
- **PDF**: jsPDF (A5 job cards, side-by-side A4 landscape)

---

## Features

### Core Modules
| Module | Description |
|--------|-------------|
| **Clients** | Full CRUD, bulk import (JSON/CSV/TXT), phone search with Namibian number normalization |
| **Quotes** | LA-Q0001 numbering, VAT, lock/unlock, PDF export, email |
| **Job Cards** | LA-J0001 numbering, worker assignment, A5 PDF (2 copies A4 landscape) |
| **Retail** | Self-contained Shoprite/Checkers/Usave system, price-hidden worker PDFs |
| **Messaging** | Direct/group/job chats, emoji, unread badges, realtime |
| **Staff Panel** | Floating panel, jobs by worker, urgent jobs first, daily updates |

### User Roles
- **Admin**: Damion, Alida — full access including delete, lock, staff management
- **Staff**: Nicole, Geraldo, Bets-Mari, Michelle — view, create, edit

---

## Setup

### 1. Clone and Install

```bash
git clone <your-repo>
cd la-signs-ops
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **anon key**

### 3. Run Database Migration

In the Supabase SQL Editor, paste and run the entire contents of:
```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, functions, triggers, RLS policies, and seeds retail branches.

### 4. Create User Accounts

In Supabase → Authentication → Users → Invite User:

| Name | Email | Role |
|------|-------|------|
| Damion | damion@lasigns.com.na | admin |
| Alida | alida@lasigns.com.na | admin |
| Nicole | nicole@lasigns.com.na | staff |
| Geraldo | geraldo@lasigns.com.na | staff |
| Bets-Mari | betsm@lasigns.com.na | staff |
| Michelle | michelle@lasigns.com.na | staff |

After creating users, update the `profiles` table to set `role = 'admin'` for Damion and Alida:
```sql
UPDATE profiles SET role = 'admin' 
WHERE email IN ('damion@lasigns.com.na', 'alida@lasigns.com.na');

-- Set full names
UPDATE profiles SET full_name = 'Damion' WHERE email = 'damion@lasigns.com.na';
UPDATE profiles SET full_name = 'Alida' WHERE email = 'alida@lasigns.com.na';
UPDATE profiles SET full_name = 'Nicole' WHERE email = 'nicole@lasigns.com.na';
UPDATE profiles SET full_name = 'Geraldo' WHERE email = 'geraldo@lasigns.com.na';
UPDATE profiles SET full_name = 'Bets-Mari' WHERE email = 'betsm@lasigns.com.na';
UPDATE profiles SET full_name = 'Michelle' WHERE email = 'michelle@lasigns.com.na';
```

### 5. Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Important Architecture Notes

### Retail Isolation
Retail jobs are stored in the same `job_cards` table but with `is_retail = true`. Every query on the normal Jobs page includes `.eq('is_retail', false)` and every query on the Retail page includes `.eq('is_retail', true)`. This ensures retail jobs **never** appear in the normal job cards list.

### Phone Number Normalization
The system normalizes Namibian phone numbers for search:
- `+264 81 447 6486` → stored as-is
- Search `0814476486` → strips non-digits, converts `264` prefix to `0`, matches perfectly

### Job Card PDF
- A5 size, printed 2 copies side-by-side on A4 landscape
- Includes: client, job number, title, status, worker, line items, totals, signature lines, sales rep
- Worker PDF (retail email): prices hidden
- Admin/download PDF: prices shown

### Quote Numbering
- Format: `LA-Q0001`, `LA-Q0002`, etc.
- Persistent counter in `app_settings` table, atomic increment via PostgreSQL function

### Retail Job Numbering
- Format: `0450-2026` (number-year)
- Editable, auto-generated if left blank
- Counter starts at 449 (next = 0450)

---

## Known Bugs Fixed (Do Not Reintroduce)

1. ✅ `CREATE POLICY IF NOT EXISTS` — not used (direct CREATE POLICY)
2. ✅ `created_by` FK — nullable with `ON DELETE SET NULL`
3. ✅ Ambiguous profile joins — explicit join aliases
4. ✅ Accidental modal closes — `preventOutsideClose={true}` on all edit forms
5. ✅ Greeting shows email — uses `profile.full_name` only, never email
6. ✅ Phone search after first digit — debounced, normalized comparison
7. ✅ Retail jobs in normal jobs — `is_retail` filter on every query
8. ✅ Emoji unicode escaping — uses `emoji-picker-react` properly
9. ✅ Chat/jobs panel overlap — positioned separately (right: 16px vs right: 332px)
10. ✅ Profile auto-creation — trigger on `auth.users` INSERT

---

## File Structure

```
src/
├── app/
│   ├── login/page.tsx          # Auth
│   ├── dashboard/page.tsx      # Overview + stats
│   ├── clients/page.tsx        # Client CRUD + import
│   ├── quotes/page.tsx         # Quote system
│   ├── job-cards/page.tsx      # Job card system
│   ├── retail/page.tsx         # Retail system (isolated)
│   ├── messaging/page.tsx      # Messaging hub
│   ├── staff/page.tsx          # Staff management (admin)
│   └── settings/page.tsx       # System settings (admin)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        # Auth wrapper + layout
│   │   ├── Sidebar.tsx         # Navigation
│   │   └── PageHeader.tsx      # Page titles + greeting
│   ├── ui/                     # Shared UI components
│   ├── staff/StaffJobsPanel.tsx # Floating staff panel
│   └── messaging/MessagingWindow.tsx # Floating chat
├── lib/
│   ├── supabase/               # Supabase clients
│   ├── utils/                  # phone, import, general utils
│   └── pdf/generator.ts        # PDF generation
├── stores/                     # Zustand state
└── types/index.ts              # All TypeScript types
```
 
