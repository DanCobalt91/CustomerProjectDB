import assert from 'node:assert/strict'
import test from 'node:test'

import { isSupabaseEdgeFunctionUnavailable } from '../src/lib/supabaseErrors.ts'

test('identifies FunctionsFetchError connectivity failures', () => {
  const error = new Error('Fetch failed because the server could not be reached')
  error.name = 'FunctionsFetchError'

  assert.equal(isSupabaseEdgeFunctionUnavailable(error), true)
})

test('does not treat HTTP failures as connectivity issues', () => {
  const error = new Error('Function invocation failed with status 500')
  error.name = 'FunctionsHttpError'

  assert.equal(isSupabaseEdgeFunctionUnavailable(error), false)
})
