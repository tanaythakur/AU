# Cricket Academy & Sports Arena Management System
## UI/UX Design System & Frontend Handoff Specification

**Target Audience:** Single Admin User (Phase 1)
**Product Goal:** Internal business management (Students, Memberships, Arena, Inventory, Financials)
**Design Persona:** Premium, professional sports-business SaaS. Communicates trust, operational efficiency, and financial clarity.

---

## 1. Colour Palette Exploration & Recommendation

### Option A: Premium Cricket Green + Dark Navy
*   **Primary:** `#16A34A` (Green 600)
*   **Secondary:** `#0F172A` (Slate 900)
*   **Accent:** `#F59E0B` (Amber 500)
*   **Background:** `#F8FAFC` (Slate 50)
*   **Surface:** `#FFFFFF` (White)

### Option B: Modern Sports Performance + Graphite
*   **Primary:** `#2563EB` (Blue 600)
*   **Secondary:** `#334155` (Slate 700)
*   **Accent:** `#10B981` (Emerald 500)
*   **Background:** `#F3F4F6` (Gray 100)
*   **Surface:** `#FFFFFF` (White)

### Option C: Luxury Sports Club + Forest Green
*   **Primary:** `#065F46` (Emerald 800)
*   **Secondary:** `#1F2937` (Gray 800)
*   **Accent:** `#D97706` (Amber 600)
*   **Background:** `#FAFAFA` (Neutral 50)
*   **Surface:** `#FFFFFF` (White)

### Selected Recommendation: Option A (Refined)
**Why:** Option A perfectly balances the domain context (Cricket/Grass/Turf = Green) with premium B2B SaaS aesthetics (Dark Navy/Slate). It avoids the trap of making everything green by relying heavily on Navy for structure and typography, reserving Green for primary actions, KPI positive indicators, and active states.

### Final Colour Tokens (Implementation Ready)

**Base & Surfaces**
*   `--color-background`: `#F8FAFC` (Main app background)
*   `--color-surface`: `#FFFFFF` (Cards, sidebars, modals)
*   `--color-sidebar`: `#0F172A` (Dark sidebar for premium feel)

**Primary & Secondary**
*   `--color-primary`: `#16A34A`
*   `--color-primary-hover`: `#15803D`
*   `--color-primary-active`: `#14532D`
*   `--color-secondary`: `#0F172A` (Text, headers, dark buttons)
*   `--color-accent`: `#0EA5E9` (For secondary highlights, e.g., charts)

**Typography & Borders**
*   `--color-text-primary`: `#0F172A` (Headings, primary body)
*   `--color-text-secondary`: `#475569` (Labels, captions, breadcrumbs)
*   `--color-text-tertiary`: `#94A3B8` (Placeholders, disabled text)
*   `--color-border-light`: `#F1F5F9` (Dividers)
*   `--color-border-default`: `#E2E8F0` (Inputs, cards)
*   `--color-border-heavy`: `#CBD5E1` (Active inputs)

**Semantic / Status**
*   `--color-success`: `#10B981` (Status: Active, Paid)
*   `--color-success-bg`: `#D1FAE5`
*   `--color-warning`: `#F59E0B` (Status: Expiring, Pending)
*   `--color-warning-bg`: `#FEF3C7`
*   `--color-danger`: `#EF4444` (Status: Expired, Unpaid, Delete)
*   `--color-danger-bg`: `#FEE2E2`
*   `--color-info`: `#3B82F6` (Status: Ongoing)
*   `--color-info-bg`: `#DBEAFE`

**Rules for Use:** 
*   **KPI Cards:** White surface, slate text, green/red purely for the +/- indicator. Do NOT use colored card backgrounds.
*   **Buttons:** Primary action gets `--color-primary`. Secondary actions get white background with `--color-border-default` and `--color-text-primary`.
*   **Badges:** Use the `-bg` token for the background and the solid semantic color for the text (e.g., Active badge: bg `#D1FAE5`, text `#065F46`).

---

## 2. Typography System

**Font Family:** `Inter`, sans-serif (Highly readable, excellent for data density).

**Typography Scale:**
*   `Display`: 30px, SemiBold (600), Line Height 36px, Tracking -0.02em (Page Titles)
*   `H1`: 24px, SemiBold (600), Line Height 32px (Modal titles, Section headers)
*   `H2`: 20px, Medium (500), Line Height 28px (Card titles)
*   `H3`: 18px, Medium (500), Line Height 28px (Sub-sections)
*   `Body Large`: 16px, Regular (400), Line Height 24px (Main input text)
*   `Body Regular`: 14px, Regular (400), Line Height 20px (Standard UI text, tables)
*   `Body Small`: 13px, Regular (400), Line Height 20px (Secondary data)
*   `Caption`: 12px, Medium (500), Line Height 16px (Labels, small badges)
*   `KPI Number`: 36px, Bold (700), Line Height 40px, Tracking -0.02em (Dashboard numbers)

---

## 3. Design Tokens (Spacing, Radius, Shadows)

**Spacing Scale (Base 4px)**
*   `2px`, `4px`, `8px`, `12px`, `16px` (base padding), `24px` (component gap), `32px` (section gap), `48px`.

**Border Radius**
*   `radius-sm`: `4px` (Checkboxes, small tags)
*   `radius-md`: `6px` (Buttons, inputs, dropdowns)
*   `radius-lg`: `12px` (Cards, Modals)
*   `radius-full`: `9999px` (Avatars, Status Badges)

**Shadows**
*   `shadow-sm`: `0 1px 2px 0 rgb(15 23 42 / 0.05)` (Buttons, inputs)
*   `shadow-card`: `0 4px 6px -1px rgb(15 23 42 / 0.05), 0 2px 4px -2px rgb(15 23 42 / 0.05)` (Cards)
*   `shadow-dropdown`: `0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)` (Modals, Popovers)

**Layout**
*   `sidebar-width`: `256px`
*   `sidebar-collapsed`: `80px`
*   `topbar-height`: `64px`
*   `content-padding`: `32px` (Desktop), `16px` (Mobile)
*   `content-max-width`: `1440px`
*   `grid-gap`: `24px`

---

## 4. Application Layout (App Shell)

### Sidebar (Left, Fixed, `--color-sidebar` #0F172A)
*   **Header:** Height 64px. White Academy Logo placeholder (32x32) + Academy Name (16px SemiBold, White).
*   **Nav Items:**
    *   Layout: Flex row, 12px gap, 12px padding, 6px radius, margin x 12px.
    *   Default state: Text `#94A3B8`, Icon `#94A3B8`.
    *   Hover state: Background `#1E293B`, Text `#F8FAFC`.
    *   Active state: Background `#16A34A`, Text `#FFFFFF`, Icon `#FFFFFF`.
*   **Footer:** Admin Profile (Avatar, Name, "Admin" subtitle) + Logout Icon button.

### Topbar (Top, Fixed, Height 64px, White, Bottom Border)
*   **Left:** Breadcrumbs (e.g., `Students / Add New Student`). 14px, Text Secondary, last item Text Primary SemiBold.
*   **Right:** Global Date/Month selector (if applicable to context), Settings Icon, User Avatar.

---

## 5. Screen-by-Screen UI Specifications

### Screen 1: Login
*   **Layout:** Centered card on `--color-background` screen.
*   **Card:** 400px width, `radius-lg`, `shadow-card`, White.
*   **Content:** Academy Logo, "Welcome Back" (H1), "Enter your credentials" (Body Small).
*   **Forms:** Email (FormInput), Password (FormInput).
*   **Actions:** "Sign In" (PrimaryButton, 100% width).

### Screen 2: Dashboard (Priority Screen)
*   **Layout:** Standard shell.
*   **Header:** Page Title "Dashboard", top-right Month/Year picker.
*   **Primary KPI Cards (Grid, 4 cols):**
    1.  **Total Cash Collected:** 💼 Icon, Currency formatted, Green positive trend badge (+5%).
    2.  **Total Expenses Paid:** 📉 Icon, Currency formatted, Red negative trend badge.
    3.  **Operating Cash Surplus:** 🏛️ Icon, Currency formatted (Primary Text).
    4.  **Active Memberships:** 👥 Icon, Integer.
*   **Charts Row (Grid, 2 cols, 60/40 split):**
    *   *Left (60%):* "Monthly Cash Flow" (Bar Chart, Green for Collections, Navy for Expenses).
    *   *Right (40%):* "Revenue Breakdown" (Donut Chart: Turf vs Coaching vs Memberships).
*   **Tables Row (Grid, 2 cols, 50/50 split):**
    *   *Left:* "Expiring Memberships" (DataTable: Name, Expiry Date, Action Button "Renew").
    *   *Right:* "Low Inventory Alerts" (DataTable: Item Name, Current Stock, Action "Restock").
*   **Quick Actions (Top right below header):** "Record Payment", "Add Expense", "New Admission" (SecondaryButtons).

### Screen 3: Students List
*   **Header:** "Students" + "Add Student" (PrimaryButton).
*   **Filters Row:** SearchInput (by name/phone), FilterDropdown (Status: Active/Inactive), FilterDropdown (Batch).
*   **DataTable:** ID, Name, Phone, Batch, Membership Status (StatusBadge), Actions (IconButton: Edit, View).
*   **Pagination:** Bottom right.

### Screen 4: Add/Edit Student
*   **Layout:** standard shell, "Back" breadcrumb.
*   **Content:** 2-column form inside a White Card.
*   **Sections:** Personal Details, Contact Information, Medical Notes.
*   **Actions:** "Cancel" (Secondary), "Save Student" (Primary).

### Screen 5: Student Profile
*   **Layout:** Left Column (30%) Profile Card; Right Column (70%) Tabs.
*   **Profile Card:** Avatar, Name, ID, Active StatusBadge, Contact details.
*   **Tabs:** "Membership History", "Payment Ledger", "Attendance" (placeholder).
*   **Content:** DataTables within active tab.

### Screen 6: Memberships
*   **Header:** "Memberships" + "New Membership" (PrimaryButton).
*   **DataTable:** Student Name, Plan Type, Start Date, End Date, Status (Active/Expired/Expiring Soon), Payment Status.

### Screen 7: Add/Renew Membership
*   **Form:** Select Student (Searchable Dropdown), Select Plan (FormSelect), Start Date, Calculated End Date (Readonly), Base Amount, Discount, Total Payable.
*   **Payment Checkbox:** "Record initial payment now" (Expands payment method fields if checked).

### Screen 8: Payments
*   **Header:** "Payment Ledger" + "Record Payment" (Primary).
*   **DataTable:** Receipt No, Date, Student/Customer Name, Category (Coaching/Turf), Amount, Method (UPI/Cash/Bank), Status.

### Screen 9: Record Payment
*   **Modal/Page Form:** Payer Type (Student/Arena Customer/Other), Select Payer, Amount, Payment Method (Dropdown), Reference No (Input), Date (DatePicker), Notes (Textarea).

### Screen 10: Arena Customers & Contracts
*   **Header:** "Arena Booking & Customers" + "New Contract".
*   **DataTable:** Customer/Team Name, Contact, Booking Type (Hourly/Monthly), Next Slot, Status.

### Screen 11: Customer/Contract Details
*   **Layout:** Similar to Student Profile. Details on left, Booking History and Payment Ledger on right tabs.

### Screen 12: Inventory Dashboard
*   **Cards (3 cols):** Total Items, Low Stock Items, Total Value.
*   **DataTable:** Item Code, Name, Category (Equipment, Merchandise), Stock In, Stock Out, Current Balance, StatusBadge (In Stock, Low, Out).
*   **Actions:** "Stock In/Out" (Primary), "Add Item" (Secondary).

### Screen 13: Inventory Item Details
*   **Content:** Item metadata card. Table of historical stock movements (Date, Type [In/Out], Quantity, Remarks, User).

### Screen 14: Stock Movement Form
*   **Modal:** Select Item, Movement Type (Radio: In/Out), Quantity, Date, Remarks.

### Screen 15: Expenses
*   **Header:** "Expenses" + "Add Expense".
*   **Filters:** DateRangePicker, Category Dropdown.
*   **DataTable:** Date, Category (Maintenance, Salary, Utilities), Payee, Amount, Method, Receipt (Link/Icon).

### Screen 16: Add/Edit Expense
*   **Form:** Date, Category, Amount, Payee Name, Payment Method, Description, Attach Receipt (File Input).

### Screen 17: Reports
*   **Layout:** Tabbed interface (Financial, Operational, Inventory).
*   **Financial Tab:** Date range selector. Aggregated view of Collections vs Expenses. Export to CSV/PDF buttons.

### Screen 18: Settings
*   **Layout:** Vertical Tabs on left (Academy Profile, Plans & Pricing, Expense Categories, System).
*   **Content:** Simple forms to update list values and basic academy details.

---

## 6. Reusable Component Specifications

*   **AppSidebar & AppTopbar:** As defined in Layout.
*   **PageHeader:** Flex container, `h-16`, items-center, justify-between. `mb-6`.
*   **StatCard:** `bg-white`, `rounded-lg`, `p-6`, `border border-slate-200`. Title: 14px text-slate-500. Value: 30px text-slate-900 font-semibold.
*   **ChartCard:** Same base as StatCard, min-height `320px`.
*   **DataTable:** 
    *   Header row: `bg-slate-50`, `text-xs text-slate-500 uppercase font-medium`.
    *   Cells: `py-3 px-4`, `border-b border-slate-200`, `text-sm text-slate-700`.
    *   Hover: `hover:bg-slate-50`.
*   **SearchInput:** Leading search icon, `h-10`, `rounded-md`, `border-slate-300`, focus ring `ring-2 ring-primary/20 border-primary`.
*   **StatusBadge:** 
    *   Active/Paid: `bg-emerald-100 text-emerald-800`
    *   Pending/Warning: `bg-amber-100 text-amber-800`
    *   Expired/Danger: `bg-red-100 text-red-800`
    *   Size: `px-2.5 py-0.5`, `text-xs font-medium`, `rounded-full`.
*   **PrimaryButton:** `bg-primary`, `text-white`, `h-10 px-4`, `rounded-md`, `font-medium text-sm`, `hover:bg-primary-hover`, `transition-colors`.
*   **SecondaryButton:** `bg-white`, `border border-slate-300`, `text-slate-700`, `h-10 px-4`, `rounded-md`, `hover:bg-slate-50`.
*   **FormInput/FormSelect:** `h-10`, `w-full`, `rounded-md`, `border-slate-300`, `text-sm`. Label above input (13px, text-slate-700, mb-1).
*   **Modal:** Overlay `bg-slate-900/50`. Content box `bg-white`, `rounded-lg`, `shadow-dropdown`, max-width `md:max-w-lg`, centered.
*   **EmptyState:** Centered flex column, large gray icon (e.g., FolderX), 16px font-medium title, 14px text-slate-500 subtitle, optional PrimaryButton.

---

## 7. Charts and Data Visualisation (Recharts)

*   **Monthly Collections vs Expenses:** 
    *   Type: `BarChart` (Grouped or Stacked).
    *   Colors: Collections (`#16A34A`), Expenses (`#0F172A`).
*   **Revenue Source Distribution:** 
    *   Type: `PieChart` (Donut variant, innerRadius 60).
    *   Colors: `#16A34A`, `#0EA5E9`, `#F59E0B`, `#8B5CF6`.
*   **Chart Defaults:**
    *   Gridlines: Dashed, `#E2E8F0`.
    *   Axis Text: 12px, `#94A3B8`.
    *   Tooltip: White background, slate border, shadow-md, rounded-md, text-sm.

---

## 8. Tailwind CSS Implementation Setup

### 8.1 CSS Variables (`index.css`)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 248 250 252; /* #F8FAFC */
    --surface: 255 255 255;
    
    --primary: 22 163 74; /* #16A34A */
    --primary-hover: 21 128 61;
    --sidebar: 15 23 42; /* #0F172A */
    
    --text-main: 15 23 42;
    --text-muted: 71 85 105;
    
    --border: 226 232 240;
    
    --success: 16 185 129;
    --warning: 245 158 11;
    --danger: 239 68 68;
  }
  
  body {
    @apply bg-[rgb(var(--background))] text-[rgb(var(--text-main))] font-sans antialiased;
  }
}
```

### 8.2 Tailwind Configuration (`tailwind.config.js`)
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "rgb(var(--primary))",
          hover: "rgb(var(--primary-hover))",
        },
        sidebar: "rgb(var(--sidebar))",
        surface: "rgb(var(--surface))",
        success: "rgb(var(--success))",
        warning: "rgb(var(--warning))",
        danger: "rgb(var(--danger))",
        border: "rgb(var(--border))",
        text: {
          main: "rgb(var(--text-main))",
          muted: "rgb(var(--text-muted))",
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgb(15 23 42 / 0.05), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
```

### 8.3 Recommended Folder Structure
```text
src/
├── assets/          # Images, static icons
├── components/
│   ├── ui/          # Reusable tokens (Buttons, Inputs, Badges, Modals, Cards)
│   ├── layout/      # AppSidebar, AppTopbar, MainLayout
│   └── shared/      # PageHeaders, DataTables, StatCards
├── pages/           # Screen implementations (Dashboard, Students, etc.)
├── hooks/           # Custom React hooks
├── services/        # Supabase API calls
├── utils/           # Formatters (currency, dates)
└── App.tsx          # Router configuration
```

---

## 9. Responsive Design Guidelines

*   **Desktop (`lg`, `xl`, 1024px+):** Sidebar fixed left (256px). Content full width remaining. Cards display in 3 or 4 columns.
*   **Tablet (`md`, 768px - 1023px):** Sidebar collapses to icons only (80px). KPI cards wrap to 2 columns. Tables remain normal but might truncate secondary text.
*   **Mobile (`< 768px):** 
    *   **Sidebar:** Hidden by default. Accessed via a Hamburger menu in Topbar (slides in from left).
    *   **Layout:** 16px padding.
    *   **KPI Cards:** Stacked into 1 column.
    *   **DataTables:** Wrap in a `overflow-x-auto` container to allow horizontal scrolling without breaking the page layout. Action buttons should be pinned to the right if possible, or collapsed under an ellipsis menu.
    *   **Forms:** Switch from multi-column grid layouts to single-column stacked inputs.

---

## 10. Developer Handoff Instructions (For Claude Code)

1.  **Initialize:** Create Vite React app. Install Tailwind, Lucide React, Recharts, React Router Dom, Supabase Client, and React Hook Form.
2.  **Tokens:** Apply the CSS variables and `tailwind.config.js` exactly as specified above.
3.  **Components First:** Build the `components/ui` library first. Do not proceed to screens until Button, Input, Select, Badge, Card, and Table base styles are verified.
4.  **Layout Shell:** Implement `MainLayout.tsx` utilizing `AppSidebar` and `AppTopbar`. Use `<Outlet />` for page injection.
5.  **Mock Data:** Use fictional, realistic Indian names, INR currency (`₹`), and dates for initial UI build before connecting Supabase. Use "Operating Cash Surplus" strictly as requested.
6.  **Icons:** Use `lucide-react`. Ensure stroke width is `2` or `1.5` consistently.
7.  **Stick to Specs:** Do not invent new colors. Use `text-text-muted` or `text-slate-500` for secondary text. Do not use gradients or glassmorphism. Keep it flat, clean, and data-focused.