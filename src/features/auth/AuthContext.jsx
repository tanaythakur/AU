import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { friendlyError, resetData } from '@/services/dataLoader'

/*
 * Real Supabase Auth (email + password). No public registration: accounts are created by the project owner
 * (Supabase Dashboard) and the database only lets the allow-listed admin email exist (see migration 0002).
 * After a session exists we ALSO check the database says this user is the admin; the route guard is a convenience,
 * the real protection is Row Level Security on every table.
 */
const AuthContext = createContext(null)
const NOT_AUTHORIZED = 'This account is not authorized to use this application.'

async function fetchAdmin(session) {
  const { data, error } = await supabase.from('profiles').select('id, email, full_name, role').eq('id', session.user.id).maybeSingle()
  if (error) throw error
  if (!data || data.role !== 'admin') return null
  return { id: data.id, email: data.email, full_name: data.full_name || 'Academy Admin', role: data.role }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, notice: '' })
  const userId = useRef(null)
  const manualSignOut = useRef(false)

  useEffect(() => {
    let alive = true
    const set = (next) => { if (alive) setState(next) }

    const apply = async (session, notice = '') => {
      if (!session) {
        userId.current = null
        resetData()
        return set({ loading: false, user: null, notice })
      }
      if (session.user.id === userId.current) return // same user (token refresh / tab refocus): nothing to do
      try {
        const admin = await fetchAdmin(session)
        if (!admin) {
          await supabase.auth.signOut().catch(() => {})
          userId.current = null
          resetData()
          return set({ loading: false, user: null, notice: NOT_AUTHORIZED })
        }
        userId.current = session.user.id
        set({ loading: false, user: admin, notice: '' })
      } catch (e) {
        set({ loading: false, user: null, notice: friendlyError(e).message })
      }
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return
      // Never await Supabase calls inside this callback (it can deadlock the client): defer.
      setTimeout(() => {
        const expired = event === 'SIGNED_OUT' && userId.current && !manualSignOut.current
        apply(session, expired ? 'Your session has ended. Please sign in again.' : '')
        manualSignOut.current = false
      }, 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (error.status === 429 || /rate limit|too many/i.test(error.message)) throw new Error('Too many attempts. Please wait a minute and try again.')
      if (/invalid login credentials/i.test(error.message)) throw new Error('Invalid email or password. Please check and try again.')
      if (/email not confirmed/i.test(error.message)) throw new Error('This email is not confirmed yet. Confirm the user in the Supabase dashboard.')
      throw friendlyError(error)
    }
    const admin = await fetchAdmin(data.session).catch(async (e) => { await supabase.auth.signOut().catch(() => {}); throw friendlyError(e) })
    if (!admin) {
      await supabase.auth.signOut().catch(() => {})
      throw new Error(NOT_AUTHORIZED)
    }
    userId.current = data.session.user.id
    setState({ loading: false, user: admin, notice: '' })
  }, [])

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    await supabase.auth.signOut().catch(() => {})
    userId.current = null
    resetData()
    setState({ loading: false, user: null, notice: '' })
  }, [])

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
