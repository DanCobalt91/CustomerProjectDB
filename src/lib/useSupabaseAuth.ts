import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'

type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in' | 'error'

type AuthState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; user: User }
  | { status: 'error'; message: string }

type AuthResult = {
  status: AuthStatus
  session: Session | null
  user: User | null
  error: string | null
  signIn(email: string, password: string): Promise<{ error: string | null }>
  signUp(email: string, password: string): Promise<{ error: string | null; confirmationRequired: boolean }>
  signOut(): Promise<{ error: string | null }>
}

export function useSupabaseAuth(enabled: boolean): AuthResult {
  const supabaseEnabled = enabled && isSupabaseConfigured()
  const [state, setState] = useState<AuthState>(() => (supabaseEnabled ? { status: 'loading' } : { status: 'disabled' }))

  useEffect(() => {
    if (!supabaseEnabled) {
      setState({ status: 'disabled' })
      return
    }

    const client = getSupabaseClient()
    let mounted = true

    setState({ status: 'loading' })

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setState({ status: 'error', message: error.message })
          return
        }
        const session = data.session
        if (session) {
          setState({ status: 'signed-in', session, user: session.user })
        } else {
          setState({ status: 'signed-out' })
        }
      })
      .catch(error => {
        if (!mounted) return
        const message = error instanceof Error ? error.message : 'Unknown authentication error.'
        setState({ status: 'error', message })
      })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      if (session) {
        setState({ status: 'signed-in', session, user: session.user })
      } else {
        setState({ status: 'signed-out' })
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabaseEnabled])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseEnabled) {
      return { error: 'Supabase is not enabled.' }
    }

    const client = getSupabaseClient()
    const { error } = await client.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }, [supabaseEnabled])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabaseEnabled) {
      return { error: 'Supabase is not enabled.', confirmationRequired: false }
    }

    const client = getSupabaseClient()
    const { data, error } = await client.auth.signUp({ email, password })
    return { error: error ? error.message : null, confirmationRequired: !data.session }
  }, [supabaseEnabled])

  const signOut = useCallback(async () => {
    if (!supabaseEnabled) {
      return { error: 'Supabase is not enabled.' }
    }

    const client = getSupabaseClient()
    const { error } = await client.auth.signOut()
    return { error: error ? error.message : null }
  }, [supabaseEnabled])

  const status: AuthStatus = useMemo(() => {
    if (!supabaseEnabled) return 'disabled'
    return state.status
  }, [state.status, supabaseEnabled])

  const session = state.status === 'signed-in' ? state.session : null
  const user = state.status === 'signed-in' ? state.user : null
  const error = state.status === 'error' ? state.message : null

  return { status, session, user, error, signIn, signUp, signOut }
}
