import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import LoginPage from '@/features/auth/LoginPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import StudentsPage from '@/features/students/StudentsPage'
import StudentFormPage from '@/features/students/StudentFormPage'
import StudentProfilePage from '@/features/students/StudentProfilePage'
import PaymentsPage from '@/features/payments/PaymentsPage'
import ReceiptPage from '@/features/payments/ReceiptPage'
import ArenaPage from '@/features/arena/ArenaPage'
import AccountsLayout from '@/features/accounts/AccountsLayout'
import OverviewPage from '@/features/accounts/OverviewPage'
import IncomePage from '@/features/accounts/IncomePage'
import ExpensesPage from '@/features/accounts/ExpensesPage'
import LedgerPage from '@/features/accounts/LedgerPage'
import StatementsPage from '@/features/accounts/StatementsPage'
import AuditPage from '@/features/accounts/AuditPage'
import ReportsPage from '@/features/reports/ReportsPage'
import SettingsPage from '@/features/settings/SettingsPage'
import { Button, EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'
function ExpensesRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/accounts/expenses${search}`} replace />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/new" element={<StudentFormPage />} />
          <Route path="students/:id" element={<StudentProfilePage />} />
          <Route path="students/:id/edit" element={<StudentFormPage />} />
          <Route path="memberships" element={<Navigate to="/students" replace />} />
          <Route path="inventory" element={<Navigate to="/" replace />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payments/:id/receipt" element={<ReceiptPage />} />
          <Route path="arena" element={<ArenaPage />} />
          <Route path="accounts" element={<AccountsLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="income" element={<IncomePage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="statements" element={<StatementsPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route path="expenses" element={<ExpensesRedirect />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={<EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Button as={Link} to="/">Go to dashboard</Button>} />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
