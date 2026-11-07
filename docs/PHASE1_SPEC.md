# Cricket Academy & Sports Arena Management System

## Phase 1 --- Product Requirements, Database Design, Architecture & UI Design Brief

**Business:** Cricket Academy & Sports Arena, Chhindwara, Madhya
Pradesh\
**Product type:** Admin-only web management application\
**Phase:** 1 --- Core academy and business operations\
**Technology:** React, Tailwind CSS, Supabase (PostgreSQL, Auth,
Storage)

------------------------------------------------------------------------

## 1. Product vision

Build a single, secure web application that lets the academy owner
manage the day-to-day operations and finances of the cricket academy
from one place.

The system should maintain a continuously updated source of truth for:

-   Student registrations and profiles.
-   Membership plans, validity, renewals and outstanding fees.
-   Payments and payment history.
-   Arena customers and practice contracts (record keeping in Phase 1;
    full slot booking can be Phase 2).
-   Inventory purchases, stock issues, damaged/lost items and current
    stock.
-   Business expenses and recurring expenses.
-   Monthly collections, expenses, operating surplus, admissions and
    renewals.
-   Searchable records and downloadable reports.

The owner should not need to maintain separate Excel sheets manually.
Every record entered in the application should update the relevant
lists, totals and reports.

## 2. Phase 1 scope and access

### Included

-   One admin account and one admin role.
-   Admin login and logout.
-   Dashboard with date/month filters.
-   Student management.
-   Membership plan and membership-history management.
-   Payment collection and payment history.
-   Renewal and expiry tracking.
-   Arena customer and contract records.
-   Inventory item and stock-movement management.
-   Expense and expense-category management.
-   Monthly and date-range reports.
-   CSV export for important tables/reports.
-   Receipt or payment-record print view (PDF generation can be added if
    needed).
-   Supabase Row Level Security (RLS).

### Explicitly not included in Phase 1

-   Student/customer login or portal.
-   Coach or staff login.
-   Public registration.
-   Online customer self-booking.
-   Automated WhatsApp/SMS messages.
-   Attendance and batch scheduling.
-   Full calendar-based turf/ground slot booking and conflict
    management.
-   Online payment gateway integration.
-   Multi-branch management.

Design the data model so these can be added later without rebuilding the
core system.

## 3. Main navigation

Use a persistent left sidebar on desktop and a responsive navigation
pattern on mobile.

1.  Dashboard
2.  Students
3.  Memberships
4.  Payments
5.  Arena Customers & Contracts
6.  Inventory
7.  Expenses
8.  Reports
9.  Settings

Top bar: - Current page title and breadcrumb. - Global search (optional
in first release). - Current date. - Admin profile menu and logout.

## 4. Functional requirements by module

### 4.1 Dashboard

The dashboard is the owner's daily overview.

**Summary cards** - Total money collected in the selected month. - Total
expenses paid in the selected month. - Operating surplus for the
selected month. - Active academy memberships. - New admissions in the
selected month. - Memberships expiring in the next 7 days. -
Overdue/expired memberships. - Arena/contract income received in the
selected month.

**Charts** - Monthly collections vs expenses (last 6 or 12 months). -
Revenue split: academy fees, arena/contract income and other income. -
Admissions and renewals by month.

**Action lists** - Memberships expiring soon. - Recently added
students. - Recent payments. - Recent expenses. - Low-stock inventory
alerts.

**Date controls** - This month (default). - Last month. - Last 3
months. - This year. - Custom date range.

Every dashboard number must be calculated from database records, not
hardcoded or manually entered.

### 4.2 Students

Admin can add, view, edit, archive and search student profiles.

**Student fields** - Student ID: generated automatically, unique and
readable (example: STU-00001). - Full name (required). -
Father's/mother's/guardian's name. - Primary mobile number (required). -
Alternate mobile number. - Gender. - Date of birth. -
Address/locality. - Admission date. - Profile photo (optional). -
Notes. - Record status: active or archived. - Created at / updated at.

**Student list** - Search by name, student ID or mobile number. - Filter
by gender, active/archived status and admission date. - Show current
membership status and expiry date. - Quick actions: View, Edit, Add
Membership, Record Payment.

Do not delete a student who has payment or membership history. Archive
the profile instead.

### 4.3 Membership plans

Admin can create and edit the plans offered by the academy.

Default plan durations: - Monthly --- 1 calendar month. - Quarterly ---
3 calendar months. - Half-yearly --- 6 calendar months. - Annual --- 12
calendar months. - Custom --- admin specifies duration/end date when
needed.

Plan fields: - Plan name. - Duration in months (or custom duration). -
Standard price. - Description. - Active/inactive status.

Plan prices must be editable. Do not hardcode fees in the frontend.

### 4.4 Memberships

A student can have multiple membership records over time. A renewal
creates a new membership record; it must not overwrite the previous
membership.

**Membership fields** - Student. - Plan. - Start date. - End date
(calculated from the selected plan, but editable by admin with
confirmation). - Plan price at the time of sale (snapshot). - Discount,
if any. - Final payable amount. - Amount paid (derived from linked
successful payments). - Balance due. - Status: upcoming, active,
expired, cancelled. - Notes. - Created at.

**Business rules** - Store the plan price on the membership so changing
a plan's future price does not alter old records. - Calculate end dates
consistently using calendar months, not a fixed 30-day approximation. -
Show the membership as active when today is on/after start date and
on/before end date, unless cancelled. - A membership with unpaid balance
can still be active; payment status and membership validity are separate
concepts. - Prevent accidental overlapping memberships for the same
student. If overlap is intentionally allowed, show a clear warning and
require admin confirmation. - Renewals must preserve the previous
membership and its payments. - Allow partial payment and multiple
payment entries against one membership. - Do not treat an expired
membership as renewed until a new membership record is created.

### 4.5 Payments

Payments are financial transactions. Never store payment history only as
a single editable amount on the student or membership record.

**Payment fields** - Payment ID / receipt number (generated uniquely). -
Student (optional for non-student/arena payments). - Membership
(optional). - Arena customer/contract (optional). - Amount. - Payment
date and time. - Payment method: cash, UPI, bank transfer, card,
other. - Transaction/reference number (optional). - Payment status:
completed, pending, failed, refunded. - Notes. - Created at.

**Payment features** - Record full or partial payment. - Record multiple
payments for one membership. - Show amount payable, amount received and
balance due. - Payment history on student profile. - Search/filter by
date, payment method, status and student. - Print-friendly receipt
view. - Refunds should be recorded as separate refund transactions or a
controlled reversal; do not silently delete the original payment. - Only
completed payments count as money received in cash collection reports.

### 4.6 Arena customers and contracts

Phase 1 should allow the admin to maintain records of people/teams who
use the indoor turf, outdoor pitches or ground, even before a full
booking calendar is built.

Customer types: - Individual practice customer. - Team. -
Monthly/long-term contract customer. - Other.

Fields: - Customer/Team ID. - Customer or team name. - Contact person. -
Mobile number. - Customer type. - Facility: indoor turf, outdoor pitch,
ground, other. - Contract type/description. - Contract start date. -
Contract end date (optional). - Agreed fee. - Payment terms/notes. -
Status: active, completed, cancelled. - Notes.

Payments for these customers should be linked to the customer/contract
and included in collections reports. Do not mix these records with
academy student memberships.

Full hourly slot booking, availability and double-booking prevention are
Phase 2.

### 4.7 Inventory

Track stock movement instead of manually overwriting stock numbers.

**Inventory item fields** - Item ID. - Item name (cricket balls, tennis
balls, stumps, cones, nets, grip, first-aid supplies, cleaning supplies,
etc.). - Category. - Unit (piece, pack, box, pair, litre, etc.). -
Opening quantity (for initial stock setup). - Reorder/low-stock
threshold. - Active/inactive status. - Notes.

**Inventory transaction types** - Opening stock. - Purchase/stock in. -
Issued/stock out. - Damaged. - Lost. - Return to stock. - Stock
adjustment (admin-only with mandatory reason).

Transaction fields: - Item. - Transaction type. - Quantity. -
Transaction date. - Unit cost (where applicable). - Total cost (where
applicable). - Supplier (optional). - Issued to / received from
(optional). - Purpose/reason. - Notes.

**Stock calculation**

Available stock = opening stock + stock in + returns + positive
adjustments - issued - damaged - lost - negative adjustments.

-   Every movement creates a transaction row.
-   Never delete or edit a movement without an auditable correction
    process.
-   Show current stock, low-stock warning and full movement history.
-   Purchases should also be reflected in expenses/cost reporting
    without double-counting. Choose one source of truth: preferably
    create a purchase/expense record and a linked stock-in transaction
    in one database transaction.

**Important distinction** - Cash expense is recorded when money is
paid. - Inventory consumption/damage is a stock movement. - Do not
subtract the same purchase twice from the operating cash report. - For a
more accurate accrual profit report, inventory consumed can be accounted
for separately in a later accounting enhancement.

### 4.8 Expenses

Admin can add, edit (with audit trail) and view business expenses.

Fields: - Expense ID. - Expense title. - Category. - Amount. - Expense
date. - Payment date (if different). - Payment method. - Paid
to/vendor. - Description. - Receipt/bill attachment (optional). -
Recurring expense indicator. - Status: paid, unpaid. - Notes.

Suggested categories: - Coach salaries. - Electricity. - Water. -
Rent/land lease. - Ground maintenance. - Turf maintenance. - Equipment
and inventory purchases. - Repairs. - Cleaning. - Internet/phone. -
Marketing. - Travel/transport. - Miscellaneous.

Recurring expense templates can be included if straightforward, but
automatic recurring posting is not mandatory for the first release.

### 4.9 Reports

Reports must support month selection and custom date ranges.

Required reports: - Collections by date and payment method. -
Collections by income source (academy, arena/contract, other). -
Expenses by category. - Monthly operating cash summary. - Admissions by
month. - Renewals by month. - Active/expired/expiring memberships. -
Outstanding membership balances. - Arena contract income. - Inventory
stock and movement history.

Exports: - CSV for student list, payments, expenses, inventory movements
and reports. - Print-friendly report page.

### 4.10 Settings

-   Admin profile.
-   Academy name, address, phone and logo.
-   Currency: INR (₹).
-   Time zone: Asia/Kolkata.
-   Membership plan configuration.
-   Expense category configuration.
-   Inventory category configuration.
-   Receipt numbering configuration (if needed).

## 5. Financial definitions and calculations

Financial reporting must use clearly named metrics.

### 5.1 Cash collected

Total of completed incoming payment transactions within the selected
date range, less refunds recorded in that range.

This is a cash collection metric, not necessarily accounting revenue
earned during that month.

### 5.2 Expenses paid

Total of expense payments marked paid within the selected date range. If
the system records expenses only once they are paid, use the expense
date as the paid date and make that convention clear.

### 5.3 Operating cash surplus

Operating cash surplus = cash collected - expenses paid.

Label this **Operating Cash Surplus**, not simply "Net Profit", because
it may not include depreciation, unpaid bills, tax, inventory
consumption timing or other accounting adjustments.

### 5.4 Outstanding fees

For each membership:

Balance due = final payable amount - completed payments linked to that
membership.

Do not include failed/pending payments in amount received.

### 5.5 Revenue earned vs cash received

A 12-month membership paid in full in November creates ₹12,000 cash
received in November, but the entire amount should not automatically be
described as revenue earned in November. Phase 1 should prioritize cash
collection reporting and clearly label it. Revenue recognition by
service period can be added later.

### 5.6 Monthly report example

For a selected month: - Academy membership collections. - Arena/contract
collections. - Other collections. - Total cash collected. - Expenses
paid by category. - Total expenses paid. - Operating cash surplus. - New
admissions. - Renewals. - Active memberships at month end. - Memberships
expiring next month. - Outstanding fees at report date.

## 6. Suggested Supabase database schema

Use PostgreSQL with UUID primary keys, `timestamptz` for audit
timestamps and `date` for business dates.

The following is the recommended logical schema. Exact SQL migrations
should be created and tested before frontend integration.

### 6.1 Tables

#### `profiles`

-   `id uuid primary key references auth.users(id)`
-   `full_name text`
-   `role text not null default 'admin'`
-   `created_at timestamptz`
-   `updated_at timestamptz`

Even with one admin, use a profile table and an explicit role. Do not
trust a role supplied by the browser.

#### `students`

-   `id uuid primary key`
-   `student_code text unique not null`
-   `full_name text not null`
-   `guardian_name text`
-   `mobile text not null`
-   `alternate_mobile text`
-   `gender text`
-   `date_of_birth date`
-   `address text`
-   `admission_date date not null`
-   `photo_path text`
-   `notes text`
-   `status text not null default 'active'`
-   `created_at timestamptz`
-   `updated_at timestamptz`
-   `created_by uuid references profiles(id)`

#### `membership_plans`

-   `id uuid primary key`
-   `name text not null`
-   `duration_months integer`
-   `standard_price numeric(12,2) not null`
-   `description text`
-   `is_active boolean not null default true`
-   `created_at timestamptz`
-   `updated_at timestamptz`

Custom-duration plans may use a separate duration-days field or a
controlled custom end date on the membership. Avoid ambiguous duration
logic.

#### `memberships`

-   `id uuid primary key`
-   `student_id uuid not null references students(id)`
-   `plan_id uuid references membership_plans(id)`
-   `plan_name_snapshot text not null`
-   `duration_months_snapshot integer`
-   `start_date date not null`
-   `end_date date not null`
-   `base_price numeric(12,2) not null`
-   `discount_amount numeric(12,2) not null default 0`
-   `final_amount numeric(12,2) not null`
-   `status text not null default 'active'`
-   `notes text`
-   `created_at timestamptz`
-   `updated_at timestamptz`
-   `created_by uuid references profiles(id)`

Payment totals and balance should be calculated from payment records,
not maintained as independently editable duplicate values.

#### `arena_customers`

-   `id uuid primary key`
-   `customer_code text unique not null`
-   `name text not null`
-   `contact_person text`
-   `mobile text`
-   `customer_type text not null`
-   `created_at timestamptz`
-   `updated_at timestamptz`

#### `arena_contracts`

-   `id uuid primary key`
-   `customer_id uuid not null references arena_customers(id)`
-   `facility_type text not null`
-   `contract_name text`
-   `description text`
-   `start_date date`
-   `end_date date`
-   `agreed_amount numeric(12,2)`
-   `status text not null default 'active'`
-   `notes text`
-   `created_at timestamptz`
-   `updated_at timestamptz`

#### `payments`

-   `id uuid primary key`
-   `receipt_number text unique not null`
-   `student_id uuid references students(id)`
-   `membership_id uuid references memberships(id)`
-   `arena_customer_id uuid references arena_customers(id)`
-   `arena_contract_id uuid references arena_contracts(id)`
-   `income_source text not null`
-   `amount numeric(12,2) not null`
-   `payment_date timestamptz not null`
-   `payment_method text not null`
-   `reference_number text`
-   `status text not null default 'completed'`
-   `notes text`
-   `created_at timestamptz`
-   `created_by uuid references profiles(id)`

Add a database constraint requiring the payment to be associated with a
valid income target and prevent invalid combinations (for example, a
student membership payment should reference the relevant student and
membership). Refund handling should be modelled explicitly and
consistently.

#### `expense_categories`

-   `id uuid primary key`
-   `name text unique not null`
-   `is_active boolean not null default true`

#### `expenses`

-   `id uuid primary key`
-   `expense_code text unique not null`
-   `title text not null`
-   `category_id uuid references expense_categories(id)`
-   `amount numeric(12,2) not null`
-   `expense_date date not null`
-   `paid_at timestamptz`
-   `payment_method text`
-   `paid_to text`
-   `description text`
-   `receipt_path text`
-   `status text not null default 'paid'`
-   `recurring boolean not null default false`
-   `notes text`
-   `created_at timestamptz`
-   `updated_at timestamptz`
-   `created_by uuid references profiles(id)`

#### `inventory_categories`

-   `id uuid primary key`
-   `name text unique not null`
-   `is_active boolean not null default true`

#### `inventory_items`

-   `id uuid primary key`
-   `item_code text unique not null`
-   `name text not null`
-   `category_id uuid references inventory_categories(id)`
-   `unit text not null`
-   `opening_quantity numeric(12,2) not null default 0`
-   `reorder_level numeric(12,2) not null default 0`
-   `is_active boolean not null default true`
-   `notes text`
-   `created_at timestamptz`
-   `updated_at timestamptz`

#### `inventory_transactions`

-   `id uuid primary key`
-   `item_id uuid not null references inventory_items(id)`
-   `transaction_type text not null`
-   `quantity numeric(12,2) not null`
-   `unit_cost numeric(12,2)`
-   `total_cost numeric(12,2)`
-   `transaction_date timestamptz not null`
-   `supplier text`
-   `issued_to text`
-   `purpose text`
-   `reason text`
-   `linked_expense_id uuid references expenses(id)`
-   `notes text`
-   `created_at timestamptz`
-   `created_by uuid references profiles(id)`

Use positive quantities and let `transaction_type` determine whether the
quantity adds to or subtracts from stock. Enforce valid transaction
types with a database check constraint.

### 6.2 Relationships

-   One student → many memberships.
-   One membership → many payments.
-   One arena customer → many contracts.
-   One arena customer/contract → many payments.
-   One inventory item → many inventory transactions.
-   One expense category → many expenses.
-   One admin profile → many created records.

### 6.3 Database views or RPC functions

Create database views or secure RPC functions for: - Current stock per
inventory item. - Membership payment totals and outstanding balances. -
Active, expired and expiring memberships. - Dashboard summary for a
selected date range. - Collections grouped by month/source/payment
method. - Expenses grouped by month/category.

Do not calculate important financial totals only in React. Keep business
calculations in SQL views/RPCs where practical so reports remain
consistent.

## 7. Supabase security

-   Enable RLS on every table exposed through the Supabase API.
-   Disable public sign-up in Supabase Auth.
-   Only the authorized admin user should read/write business data.
-   Use an allowlisted admin user ID or a protected role claim
    maintained by a trusted process.
-   Do not let a user make themselves admin by editing their profile
    row.
-   Never put the Supabase service-role key in the React application.
-   Use the anon/publishable key in the client with RLS enabled.
-   Store student photos and expense receipts in private Storage
    buckets.
-   Use signed URLs or authenticated access for private files.
-   Keep database credentials and secrets out of source control.
-   Add audit fields (`created_at`, `updated_at`, `created_by`) to
    important records.

For the initial single-admin release, an explicit allowlisted admin UUID
is a simple secure policy. If more users are introduced later, move to
role-based access with carefully controlled role assignment.

## 8. Recommended React architecture

Use a feature-oriented structure:

``` text
src/
  app/
    App.jsx
    router.jsx
    providers.jsx
  components/
    layout/
      AppShell.jsx
      Sidebar.jsx
      Topbar.jsx
    common/
      PageHeader.jsx
      DataTable.jsx
      ConfirmDialog.jsx
      EmptyState.jsx
      LoadingState.jsx
      FormField.jsx
  features/
    auth/
    dashboard/
    students/
    memberships/
    payments/
    arena/
    inventory/
    expenses/
    reports/
    settings/
  lib/
    supabaseClient.js
  services/
  hooks/
  utils/
  styles/
  main.jsx
```

Recommended libraries: - React + Vite. - Tailwind CSS. - React Router. -
Supabase JavaScript client. - React Hook Form + Zod. - TanStack Query
for server state, caching and invalidation. - Recharts for charts. -
Lucide React for icons. - A date utility such as date-fns. - A table
solution appropriate to the project size (a reusable table or TanStack
Table).

Keep Supabase queries in feature services/hooks rather than scattering
database calls throughout UI components.

## 9. Important user flows

### Flow A: New student admission

1.  Admin opens Students.
2.  Clicks Add Student.
3.  Enters student and guardian details.
4.  Saves the student.
5.  Opens Add Membership.
6.  Selects plan and start date.
7.  System calculates end date and payable amount.
8.  Admin enters amount received and payment method.
9.  System creates the membership and payment safely.
10. Student list, active membership count, collections and dashboard
    update.

### Flow B: Partial payment

1.  Admin opens a membership.
2.  Records the amount received.
3.  System adds a payment transaction.
4.  System recalculates paid amount and balance.
5.  Membership remains active if its dates are valid.
6.  Outstanding balance appears in the relevant report.

### Flow C: Renewal

1.  Dashboard shows an upcoming expiry.
2.  Admin opens the student's profile.
3.  Reviews past memberships and payment history.
4.  Clicks Renew.
5.  System creates a new membership record.
6.  Admin records payment (full or partial).
7.  Old membership remains in history.
8.  Expiry and renewal reports update.

### Flow D: Inventory issue/damage

1.  Admin opens Inventory.
2.  Selects an item.
3.  Chooses Issue, Damaged, Lost, Purchase or Return.
4.  Enters quantity, date and reason/person.
5.  System writes a stock movement.
6.  Available stock and low-stock warning update.

### Flow E: Add expense

1.  Admin opens Expenses.
2.  Adds title, category, amount, date and payment details.
3.  Attaches a bill if available.
4.  Saves the expense.
5.  Expense list, category totals and dashboard update.

## 10. UI/UX design direction

### Visual personality

The application should feel like a modern sports facility business
platform: professional, energetic, clean and trustworthy. Avoid a
generic school ERP look and avoid an overly playful sports website
aesthetic.

Suggested design direction: - Dark navy/charcoal sidebar. - Light
neutral main canvas. - White cards with subtle borders. -
Cricket-inspired green as the primary accent. - Amber for upcoming
renewals/low stock. - Red for overdue, damaged or failed states. - Clear
typography and generous spacing. - Strong table readability. -
Consistent status chips and form layouts. - Responsive desktop-first
design, usable on tablets and mobile.

Suggested palette (adjust during design): - Navy: `#101B2D` - Deep navy:
`#17263B` - Cricket green: `#16834A` - Light green: `#E8F5ED` -
Background: `#F5F7FA` - Main text: `#172033` - Muted text: `#667085` -
Border: `#E4E7EC` - Warning: `#D97706` - Danger: `#DC2626`

Use a consistent 8px spacing system, medium corner radii and restrained
shadows. Use icons sparingly and consistently.

### Required screens

1.  Login.
2.  Dashboard.
3.  Students list.
4.  Add/edit student form.
5.  Student profile with memberships and payment history.
6.  Membership list.
7.  Add/renew membership form.
8.  Payments list and payment entry.
9.  Arena customers list.
10. Arena customer/contract detail and form.
11. Inventory overview.
12. Inventory item detail and movement form.
13. Expenses list and add/edit expense form.
14. Reports with filters and charts.
15. Settings.

### Dashboard layout

-   Sidebar on left.
-   Top header with page title, selected month/date filter and admin
    menu.
-   Four primary KPI cards: cash collected, expenses paid, operating
    cash surplus, active memberships.
-   Secondary KPI row: new admissions, renewals due, overdue
    memberships, low-stock items.
-   Revenue vs expense chart.
-   Revenue source breakdown.
-   Expiring memberships table.
-   Recent payments and expenses.
-   Low-stock list.

Do not overload the dashboard. Prioritize information the owner needs
every day.

### Tables and forms

Every data-list screen should include: - Page title and concise
description. - Primary action button (e.g. Add Student). - Search. -
Useful filters. - Sortable columns where appropriate. - Pagination. -
Empty, loading and error states. - Confirmation for destructive or
irreversible actions. - Clear success/error feedback.

Forms should: - Be divided into logical sections. - Clearly mark
required fields. - Validate on submit and show field-level errors. - Use
dropdowns for fixed categories. - Show calculated values (membership end
date, balance due, current stock) before saving. - Prevent accidental
duplicate submissions.

## 11. Copy-paste UI design prompt

Use the following prompt in your preferred AI UI design tool. Replace
the product name if you decide on a brand name.

------------------------------------------------------------------------

**PROMPT START**

Design a complete, high-fidelity web application UI for a product called
**Cricket Academy & Sports Arena Management**. This is an internal,
admin-only business management dashboard for a cricket academy and
sports facility in Chhindwara, India.

### Product context

The business offers: - Cricket coaching for boys and girls. - Indoor
cricket turf practice. - Outdoor cricket pitches and ground practice. -
Individual and team practice arrangements. - Monthly and long-term
practice contracts.

This is **Phase 1**. Only one admin/owner uses the application. There
are no student accounts, customer portals, coach accounts or staff
accounts in this phase. The admin manually enters and manages all
records.

### Design goals

Create a polished, production-quality SaaS dashboard. It should look
like a premium sports facility management product, not a public sports
website, school ERP or generic accounting template.

Use: - React-friendly component patterns. - Tailwind CSS-friendly
layouts. - Desktop-first responsive design, adapting elegantly to tablet
and mobile. - Dark navy sidebar, light neutral workspace and
cricket-green primary accents. - Clear typography, high contrast, subtle
borders, restrained shadows and consistent spacing. - INR currency
formatting (₹). - Indian date conventions where appropriate (DD MMM
YYYY). - Lucide-style line icons. - Realistic but clearly fictional
sample data.

Suggested colors: - Sidebar: #101B2D or #17263B. - Primary accent:
#16834A. - Workspace: #F5F7FA. - Cards: #FFFFFF. - Main text: #172033. -
Muted text: #667085. - Borders: #E4E7EC. - Warning: #D97706. - Danger:
#DC2626.

### Application shell

Create: - Fixed/collapsible left sidebar. - Academy logo/name at the
top. - Navigation: Dashboard, Students, Memberships, Payments, Arena
Customers & Contracts, Inventory, Expenses, Reports, Settings. - Top bar
with current page title, breadcrumb, date filter and admin
profile/logout menu. - Main content area with consistent max-width and
spacing.

### Screen 1: Login

A clean admin login screen with academy branding, email and password
fields, show-password control, forgot-password link and sign-in button.
No public sign-up option.

### Screen 2: Dashboard

Create a visually balanced owner dashboard.

Top KPI cards: 1. Cash Collected --- ₹1,25,000. 2. Expenses Paid ---
₹40,000. 3. Operating Cash Surplus --- ₹85,000. 4. Active Memberships
--- 86.

Secondary metrics: - New Admissions --- 12. - Renewals Due in 7 Days ---
8. - Expired Memberships --- 4. - Low-stock Items --- 3.

Include: - Month/date-range selector. - Revenue vs expenses chart for
the last 6 months. - Revenue source breakdown: academy fees,
arena/contract income, other income. - Memberships expiring soon table
with student name, mobile, plan, expiry date and status. - Recent
payments list. - Recent expenses list. - Low-stock inventory panel. -
Quick actions: Add Student, Record Payment, Add Expense, Update
Inventory.

All sample numbers are illustrative. Label the financial metric
"Operating Cash Surplus", not audited net profit.

### Screen 3: Students

Create a searchable student directory with: - Student ID. - Student
name. - Guardian name. - Mobile number. - Gender. - Admission date. -
Current plan. - Membership expiry. - Status. - View/edit actions.

Include filters for active/archived, gender and admission date. Add
Student should open a well-designed form or side panel.

Student form fields: - Full name. - Guardian name. - Mobile and
alternate mobile. - Gender. - Date of birth. - Address. - Admission
date. - Optional profile photo. - Notes.

### Screen 4: Student profile

Create a detailed student profile page with: - Student identity and
contact details. - Current membership status and expiry. - Add
Membership / Renew Membership action. - Membership history table. -
Payment history table. - Outstanding balance. - Notes and edit profile
action.

Keep the profile history-based. Renewals create new membership records
rather than overwriting previous memberships.

### Screen 5: Memberships

Create a membership management page with tabs or filters for Active,
Expiring Soon, Expired and Upcoming.

Table columns: - Student. - Plan. - Start date. - End date. - Plan
amount. - Paid. - Balance. - Status. - Actions.

Provide Add Membership and Renew actions.

Membership plans include Monthly (1 month), Quarterly (3 months),
Half-yearly (6 months), Annual (12 months) and Custom. Prices must be
editable by the admin.

### Screen 6: Payments

Create a transaction ledger with: - Receipt number. - Date. -
Student/customer. - Income source. - Related membership/contract. -
Amount. - Payment method. - Status. - Actions.

Include filters for date range, income source, payment method and
status. Add a Record Payment action with fields for amount, date,
cash/UPI/bank/card/other, reference number and notes.

Show partial payments and outstanding balances clearly. Include a
print-friendly receipt preview.

### Screen 7: Arena Customers & Contracts

Create a separate area for non-academy customers: - Individual practice
customers. - Teams. - Monthly/long-term contract customers.

List columns: - Customer/team. - Contact person. - Mobile. - Customer
type. - Facility (indoor turf, outdoor pitch, ground). - Contract
period. - Agreed fee. - Amount received. - Balance. - Status.

Create customer and contract forms. This Phase 1 screen is for customer
and contract record keeping only; do not design a complete hourly
booking calendar yet.

### Screen 8: Inventory

Create an inventory overview with summary cards: - Total inventory
items. - Total available units (where units are comparable only within
an item). - Low-stock items. - Damaged/lost quantity this month.

Inventory table: - Item. - Category. - Unit. - Available stock. -
Reorder level. - Last movement. - Status.

Provide actions: - Add Item. - Purchase / Stock In. - Issue / Stock
Out. - Mark Damaged. - Mark Lost. - Return to Stock. - Stock Adjustment.

Show a movement history with date, item, movement type, quantity, issued
to/supplier and reason. Make stock movements auditable. Never make the
current stock look like a manually editable number.

### Screen 9: Expenses

Create an expense management page with: - Expense title. - Category. -
Date. - Amount. - Payment method. - Paid to. - Paid/unpaid status. -
Receipt attachment. - Actions.

Suggested categories: coach salaries, electricity, water, rent/land
lease, ground maintenance, turf maintenance, equipment purchases,
repairs, cleaning, internet/phone, marketing, transport and
miscellaneous.

Include month/category filters, total expenses card and Add Expense
form.

### Screen 10: Reports

Create a reporting workspace with date-range selector and export
controls.

Reports: - Cash collections by month. - Collections by income source. -
Collections by payment method. - Expenses by category. - Operating cash
surplus. - New admissions. - Renewals. - Active/expired/expiring
memberships. - Outstanding membership balances. - Arena contract
collections. - Inventory movement and current stock.

Use readable charts and tables. Provide CSV export and print-friendly
layouts.

### Screen 11: Settings

Include: - Academy name, address, phone and logo. - Admin profile. -
Membership plan setup. - Expense categories. - Inventory categories. -
Currency and time zone settings.

### Interaction and component requirements

Show realistic interactions and UI states: - Search and filters. -
Dropdowns and date pickers. - Add/edit forms. - Confirmation dialogs. -
Status badges. - Loading skeletons. - Empty states. - Validation
errors. - Success notifications. - Responsive sidebar. - Table
pagination. - Clear primary and secondary button hierarchy.

Use reusable design components for KPI cards, data tables, forms,
badges, modals, page headers, filters and chart panels.

### Important constraints

-   This is an admin-only application, not a public website.
-   Do not include student, parent, coach or staff login.
-   Do not include public registration.
-   Do not include a customer self-booking portal.
-   Do not include full hourly booking management in Phase 1.
-   Do not use fake live integrations or imply that sample data is real.
-   Prioritize clarity, speed of data entry, financial accuracy and easy
    daily operation.
-   Make the result realistic enough that a React + Tailwind developer
    can implement it screen by screen.

Deliver a consistent multi-screen design system and high-fidelity
screens for all listed pages.

**PROMPT END**

------------------------------------------------------------------------

## 12. Development order

Build in this order to avoid rework:

1.  Create React + Vite project and install dependencies.
2.  Configure Tailwind CSS and global design tokens.
3.  Create Supabase project and environment variables.
4.  Create database migrations, constraints, indexes and RLS policies.
5.  Implement admin authentication and protected routes.
6.  Build application shell, sidebar and responsive layout.
7.  Build student CRUD and profile.
8.  Build plans and memberships, including date/renewal rules.
9.  Build payment transactions and receipt view.
10. Build arena customer/contract records.
11. Build inventory movements and stock calculations.
12. Build expense management.
13. Build reports and dashboard queries.
14. Add CSV exports, validation, error handling and audit details.
15. Test all financial and membership edge cases before launch.

## 13. Acceptance checklist

Phase 1 is ready only when these tests pass:

### Access and security

-   [ ] Admin can log in and log out.
-   [ ] Unauthenticated users cannot open protected pages.
-   [ ] Public sign-up is disabled.
-   [ ] Business data is inaccessible to unauthorized users.
-   [ ] Service-role key is not exposed in frontend code.

### Students and memberships

-   [ ] Admin can create, edit, search and archive a student.
-   [ ] Student code is unique.
-   [ ] Admin can create each supported plan.
-   [ ] Membership end date is calculated correctly for calendar months.
-   [ ] A student can have multiple historical memberships.
-   [ ] Renewal creates a new membership and preserves old history.
-   [ ] Expiring and expired memberships are correctly identified.
-   [ ] Overlapping memberships trigger a warning.

### Payments and finance

-   [ ] Full and partial payments work.
-   [ ] Multiple payments can be linked to one membership.
-   [ ] Outstanding balance is calculated correctly.
-   [ ] Pending/failed payments do not count as collected cash.
-   [ ] Refunds are represented transparently.
-   [ ] Monthly cash collections match the payment ledger.
-   [ ] Expenses paid match the expense ledger.
-   [ ] Operating cash surplus equals collections minus expenses paid.
-   [ ] Arena collections are included in the correct source.
-   [ ] The dashboard and reports use the same calculation rules.

### Inventory

-   [ ] Stock-in increases available stock.
-   [ ] Issue, damage and loss reduce available stock.
-   [ ] Return increases available stock.
-   [ ] Movement history is preserved.
-   [ ] Low-stock warning works.
-   [ ] Inventory purchase is not double-counted in expenses.

### Usability and reporting

-   [ ] Search and filters work.
-   [ ] Loading, empty and error states exist.
-   [ ] Important lists can be exported to CSV.
-   [ ] Forms validate required fields.
-   [ ] Destructive actions require confirmation.
-   [ ] Dashboard updates after creating a student, payment, expense or
    stock movement.
-   [ ] Layout works on desktop, tablet and mobile.

## 14. Decisions to confirm before implementation

The requirements above provide a complete starting specification.
Confirm these business settings before finalizing production migrations:

1.  Academy name and logo.
2.  Actual price of monthly, 3-month, 6-month and 12-month plans.
3.  Whether membership validity starts on the payment date or a
    separately selected start date.
4.  Whether partial payments are allowed (recommended: yes).
5.  Whether arena customers can pay in installments (recommended: yes).
6.  Whether contract customers are billed once, monthly or by custom
    schedule.
7.  Initial inventory opening quantities and reorder thresholds.
8.  Whether expenses are entered when incurred, when paid, or both
    (recommended: store expense date and paid date separately).
9.  Whether the admin needs a second-factor login or only email/password
    with strong account security.

**Recommended implementation principle:** Keep the first release small,
secure and financially consistent. Build reliable records and
calculations first; add booking calendars, attendance, staff roles and
automated messaging in later phases.
