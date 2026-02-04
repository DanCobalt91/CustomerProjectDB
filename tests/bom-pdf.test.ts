import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateBomPdf } from '../src/lib/signOff'

test('generateBomPdf returns a valid PDF data URL', async () => {
  const dataUrl = await generateBomPdf({
    businessName: 'Test Company',
    businessLogo: null,
    projectNumber: 'P-1234',
    customerName: 'Sample Customer',
    createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    rows: [
      { partNumber: 'PN-1', quantity: '2', description: 'Widget', designations: 'A1' },
    ],
  })

  assert.ok(dataUrl.startsWith('data:application/pdf;base64,'))
  const base64 = dataUrl.split(',', 2)[1]
  const bytes = Buffer.from(base64, 'base64')
  assert.ok(bytes.subarray(0, 8).toString('ascii').startsWith('%PDF-1.'))
})
