import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { Button, FormField, InlineAlert, Input, useToast } from '@/components/ui'
import { BRAND } from '@/data/mock'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  useDocumentTitle('Sign in')
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [show, setShow] = useState(false)
  const [authError, setAuthError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  if (user) return <Navigate to="/" replace />

  const onSubmit = async ({ email, password }) => {
    setAuthError('')
    if (password.length < 6) {
      setAuthError('Invalid email or password. Please check and try again.')
      return
    }
    await signIn(email)
    navigate(location.state?.from || '/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-sidebar text-body-lg font-bold text-white">CA</div>
          <p className="text-body-lg font-semibold text-text-primary">{BRAND.name}</p>
          <p className="text-body-sm text-text-secondary">{BRAND.tagline}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-8 shadow-card">
          <h1 className="text-h1 text-text-primary">Welcome back</h1>
          <p className="mt-1 text-body-sm text-text-secondary">Sign in to the admin dashboard.</p>

          {authError && <InlineAlert tone="danger" className="mt-4">{authError}</InlineAlert>}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="admin@academy.in"
                error={errors.email}
                {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' } })}
              />
            </FormField>
            <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  error={errors.password}
                  {...register('password', { required: 'Password is required' })}
                />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-text-tertiary hover:text-text-primary">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>
            <div className="flex justify-end">
              <button type="button" onClick={() => toast.info('Password reset will be available once Supabase Auth is connected.')} className="text-body-sm font-medium text-primary hover:text-primary-hover">
                Forgot password?
              </button>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
          </form>
        </div>
        <p className="mt-6 text-center text-caption text-text-secondary">Authorised administrator access only. Demo mode: any email with a 6+ character password.</p>
      </div>
    </div>
  )
}
