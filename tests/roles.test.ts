import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from '@supabase/supabase-js'

import {
  __resetSupabaseClientGetterForTesting,
  __setSupabaseClientGetterForTesting,
  fetchManagedUsers,
  updateUserRole,
} from '../src/lib/roles.ts'

function createSession(): Session {
  return { access_token: 'token' } as Session
}

test('fetchManagedUsers surfaces HTTP failures from the edge function', async t => {
  __setSupabaseClientGetterForTesting(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: 'Function invocation failed with status 500', name: 'FunctionsHttpError' },
      }),
    },
  }))
  t.after(__resetSupabaseClientGetterForTesting)

  await assert.rejects(async () => fetchManagedUsers(createSession()), error => {
    assert.equal((error as Error).message, 'Function invocation failed with status 500')
    return true
  })
})

test('fetchManagedUsers reports connectivity issues with the fallback message', async t => {
  __setSupabaseClientGetterForTesting(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: 'Fetch failed because the server could not be reached', name: 'FunctionsFetchError' },
      }),
    },
  }))
  t.after(__resetSupabaseClientGetterForTesting)

  await assert.rejects(async () => fetchManagedUsers(createSession()), error => {
    assert.equal(
      (error as Error).message,
      'Unable to reach the Supabase user-management function. Confirm it is deployed and that your network can access it.',
    )
    return true
  })
})

test('updateUserRole surfaces HTTP failures from the edge function', async t => {
  __setSupabaseClientGetterForTesting(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: 'Update failed due to validation error', name: 'FunctionsHttpError' },
      }),
    },
  }))
  t.after(__resetSupabaseClientGetterForTesting)

  await assert.rejects(
    async () => updateUserRole(createSession(), { action: 'grant', email: 'user@example.com', role: 'admin' }),
    error => {
      assert.equal((error as Error).message, 'Update failed due to validation error')
      return true
    },
  )
})

test('updateUserRole reports connectivity issues with the fallback message', async t => {
  __setSupabaseClientGetterForTesting(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: 'Fetch failed because the server could not be reached', name: 'FunctionsFetchError' },
      }),
    },
  }))
  t.after(__resetSupabaseClientGetterForTesting)

  await assert.rejects(
    async () => updateUserRole(createSession(), { action: 'grant', email: 'user@example.com', role: 'admin' }),
    error => {
      assert.equal(
        (error as Error).message,
        'Unable to reach the Supabase user-management function. Confirm it is deployed and that your network can access it.',
      )
      return true
    },
  )
})
