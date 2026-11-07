import { Navigate, Route, Routes } from 'react-router-dom'
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
import ExpensesPage from '@/features/expenses/ExpensesPage'
import ReportsPage from '@/features/reports/ReportsPage'
import SettingsPage from '@/features/settings/SettingsPage'
import { Button, EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'
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
          <Route path="expenses" element={<ExpensesPage />} />
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
