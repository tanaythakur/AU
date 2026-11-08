import { useState } from 'react'
import { ConfirmDialog, useToast } from '@/components/ui'
import { deleteStudent, membershipsOf, setStudentStatus } from '@/services/store'

/**
 * One dialog for removing a student.
 *  - No memberships/payments  -> permanent DELETE (e.g. added by mistake).
 *  - Has history              -> ARCHIVE (hidden from lists, all payments and reports stay intact; can be restored).
 *  - Already archived         -> RESTORE.
 * `student` = the student row (null = closed). onDone(kind) runs after success: 'deleted' | 'archived' | 'restored'.
 */
export default function StudentRemoveDialog({ student, onClose, onDone }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!student) return null

  const hasHistory = membershipsOf(student.id).length > 0
  const mode = student.status === 'archived' ? 'restore' : hasHistory ? 'archive' : 'delete'
  const copy = {
    delete: {
      title: 'Delete this student permanently?',
      message: `${student.full_name} has no membership or payment history, so they will be removed completely. This cannot be undone (the deletion is recorded in the audit log).`,
      label: 'Delete permanently', tone: 'danger',
    },
    archive: {
      title: 'Archive this student?',
      message: `${student.full_name} has membership and payment history, which can never be deleted. Archiving hides them from the student list and pickers. All payments and reports stay exactly as they are, and you can restore them any time.`,
      label: 'Archive student', tone: 'danger',
    },
    restore: {
      title: 'Restore this student?',
      message: `${student.full_name} will appear in the active student list again.`,
      label: 'Restore student', tone: 'primary',
    },
  }[mode]

  const run = async () => {
    setBusy(true)
    try {
      if (mode === 'delete') await deleteStudent(student.id)
      else await setStudentStatus(student.id, mode === 'archive' ? 'archived' : 'active')
      toast.success({ delete: 'Student deleted.', archive: 'Student archived.', restore: 'Student restored.' }[mode])
      onClose()
      onDone?.({ delete: 'deleted', archive: 'archived', restore: 'restored' }[mode])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog open onClose={onClose} onConfirm={run} loading={busy} title={copy.title} message={copy.message} confirmLabel={copy.label} tone={copy.tone} />
}
