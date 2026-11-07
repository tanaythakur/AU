import { createContext, useContext, useMemo, useState } from 'react'

/*
 * Demo auth (UI phase): any email/password signs in and a flag is kept in localStorage.
 * TODO(supabase): replace with supabase.auth.signInWithPassword / onAuthStateChange and
 * verify the admin role from the `profiles` table.
 */
const AuthContext = createContext(null)
const KEY = 'cricket_admin_session'
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(read)
  const value = useMemo(
    () => ({
      user,
      signIn: async (email) => {
        const u = { email, full_name: 'Academy Admin', role: 'admin' }
        try {
          localStorage.setItem(KEY, JSON.stringify(u))
        } catch {
          /* storage blocked */
        }
        setUser(u)
      },
      signOut: () => {
        try {
          localStorage.removeItem(KEY)
        } catch {
          /* storage blocked */
        }
        setUser(null)
      },
    }),
    [user],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
