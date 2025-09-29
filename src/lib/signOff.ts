import {
  CUSTOMER_SIGN_OFF_DECISIONS,
  type CustomerSignOffDecision,
  type CustomerSignOffSignatureDimensions,
  type CustomerSignOffSignatureStroke,
} from '../types'

export const CUSTOMER_SIGN_OFF_OPTION_COPY: Record<
  CustomerSignOffDecision,
  { title: string; description: string }
> = {
  option1: {
    title: 'Option 1 — Completed without issues',
    description:
      'Installation was completed successfully with no outstanding issues and the system is running/ready to run. I authorise invoicing of the Final Acceptance within 10 days unless Cobalt are notified in writing of any further issues.',
  },
  option2: {
    title: 'Option 2 — Completed with outstanding issues',
    description:
      'Installation was completed and the system is running/ready to run, but there are outstanding issues that have been agreed with the Installation Engineer that require resolving. A plan will be agreed to ensure these points are addressed and the system will be invoiced 10 days from completion or within 60 days from today as per Cobalt Systems standard terms.',
  },
  option3: {
    title: 'Option 3 — Installation incomplete',
    description:
      'Installation is not complete and the line cannot be run. Cobalt Systems will complete any additional work required and return to complete the installation at an agreed upon date.',
  },
}

export const CUSTOMER_SIGN_OFF_OPTIONS = CUSTOMER_SIGN_OFF_DECISIONS.map(value => ({
  value,
  ...CUSTOMER_SIGN_OFF_OPTION_COPY[value],
}))

type Rgb = [number, number, number]

export type CustomerSignOffPdfInput = {
  projectNumber: string
  customerName: string
  lineReference?: string
  machineSerialNumbers?: string[]
  toolSerialNumbers?: string[]
  cobaltOrderNumber?: string
  customerOrderNumber?: string
  salespersonName?: string
  startDate?: string
  proposedCompletionDate?: string
  signedByName: string
  signedByPosition: string
  decision: CustomerSignOffDecision
  snags: string[]
  signaturePaths: CustomerSignOffSignatureStroke[]
  signatureDimensions: CustomerSignOffSignatureDimensions
  completedAt: string
}

export type OnsiteReportPdfInput = {
  projectNumber: string
  customerName: string
  siteAddress?: string
  reportDate: string
  arrivalTime?: string
  departureTime?: string
  engineerName: string
  customerContact?: string
  workSummary: string
  materialsUsed?: string
  additionalNotes?: string
  signedByName: string
  signedByPosition?: string
  signaturePaths: CustomerSignOffSignatureStroke[]
  signatureDimensions: CustomerSignOffSignatureDimensions
  createdAt: string
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function createTextMeasurer() {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      return (text: string, fontSize: number, isBold: boolean) => {
        const pxFontSize = fontSize * (96 / 72)
        context.font = `${isBold ? '600 ' : ''}${pxFontSize}px Helvetica`
        return context.measureText(text).width * (72 / 96)
      }
    }
  }
  return (text: string, fontSize: number, isBold: boolean) =>
    text.length * fontSize * (isBold ? 0.62 : 0.6)
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  isBold: boolean,
  measure: (text: string, fontSize: number, isBold: boolean) => number,
): string[] {
  const lines: string[] = []
  const paragraphs = text.split(/\r?\n/)

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let current = words.shift() as string
    for (const word of words) {
      const candidate = `${current} ${word}`
      if (measure(candidate, fontSize, isBold) <= maxWidth) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    lines.push(current)
  }

  return lines
}

function formatNumber(value: number): string {
  if (Math.abs(value) < 1e-6) {
    return '0'
  }
  const fixed = value.toFixed(2)
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed
}

function appendTextLine(
  builder: { content: string },
  text: string,
  x: number,
  y: number,
  fontKey: 'F1' | 'F2',
  fontSize: number,
  color: Rgb,
) {
  const [r, g, b] = color
  builder.content +=
    `BT\n/${fontKey} ${formatNumber(fontSize)} Tf\n${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} rg\n1 0 0 1 ${formatNumber(
      x,
    )} ${formatNumber(y)} Tm\n(${escapePdfText(text)}) Tj\nET\n`
}

function drawRectangle(
  builder: { content: string },
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Rgb,
  stroke: Rgb,
) {
  const [fr, fg, fb] = fill
  const [sr, sg, sb] = stroke
  builder.content += `${formatNumber(fr)} ${formatNumber(fg)} ${formatNumber(fb)} rg\n`
  builder.content += `${formatNumber(sr)} ${formatNumber(sg)} ${formatNumber(sb)} RG\n1 w\n`
  builder.content += `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re B\n`
}

function drawSignaturePaths(
  builder: { content: string },
  strokes: CustomerSignOffSignatureStroke[],
  dimensions: CustomerSignOffSignatureDimensions,
  box: { x: number; y: number; width: number; height: number },
) {
  if (!strokes.length || dimensions.width <= 0 || dimensions.height <= 0) {
    return
  }

  const padding = 12
  const availableWidth = Math.max(box.width - padding * 2, 1)
  const availableHeight = Math.max(box.height - padding * 2, 1)
  const scale = Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height)
  const offsetX = box.x + padding + (availableWidth - dimensions.width * scale) / 2
  const offsetY = box.y + padding + (availableHeight - dimensions.height * scale) / 2

  builder.content += `${formatNumber(0.07)} ${formatNumber(0.07)} ${formatNumber(0.07)} RG\n1.5 w\n`

  for (const stroke of strokes) {
    if (!stroke || stroke.length < 2) {
      continue
    }
    const start = stroke[0]
    const startX = offsetX + start.x * scale
    const startY = offsetY + (dimensions.height - start.y) * scale
    builder.content += `${formatNumber(startX)} ${formatNumber(startY)} m\n`
    for (let index = 1; index < stroke.length; index += 1) {
      const point = stroke[index]
      const x = offsetX + point.x * scale
      const y = offsetY + (dimensions.height - point.y) * scale
      builder.content += `${formatNumber(x)} ${formatNumber(y)} l\n`
    }
    builder.content += 'S\n'
  }
}

type PdfObject =
  | { type: 'value'; content: string }
  | { type: 'stream'; content: Uint8Array }

function buildPdf(objects: PdfObject[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let offset = 0

  const header = encoder.encode('%PDF-1.4\n')
  chunks.push(header)
  offset += header.length

  objects.forEach((object, index) => {
    offsets.push(offset)
    const id = index + 1
    if (object.type === 'value') {
      const body = encoder.encode(`${id} 0 obj\n${object.content}\nendobj\n`)
      chunks.push(body)
      offset += body.length
    } else {
      const start = encoder.encode(`${id} 0 obj\n<< /Length ${object.content.length} >>\nstream\n`)
      const end = encoder.encode('\nendstream\nendobj\n')
      chunks.push(start, object.content, end)
      offset += start.length + object.content.length + end.length
    }
  })

  const xrefOffset = offset
  const xrefHeader = encoder.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  chunks.push(xrefHeader)
  offset += xrefHeader.length

  const xrefEntries = objects
    .map((_, index) => `${offsets[index + 1].toString().padStart(10, '0')} 00000 n \n`)
    .join('')
  const xrefBody = encoder.encode(xrefEntries)
  chunks.push(xrefBody)
  offset += xrefBody.length

  const trailer = encoder.encode(
    `trailer\n<< /Size ${objects.length + 1} /Root ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  )
  chunks.push(trailer)

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const pdfBytes = new Uint8Array(totalLength)
  let position = 0
  for (const chunk of chunks) {
    pdfBytes.set(chunk, position)
    position += chunk.length
  }

  return pdfBytes
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize)
      binary += String.fromCharCode(...Array.from(chunk))
    }
    return btoa(binary)
  }

  const potentialBuffer = (globalThis as {
    Buffer?: { from(input: Uint8Array): { toString(encoding: string): string } }
  }).Buffer
  if (potentialBuffer) {
    return potentialBuffer.from(bytes).toString('base64')
  }

  throw new Error('No base64 encoder available')
}

export async function generateCustomerSignOffPdf(data: CustomerSignOffPdfInput): Promise<string> {
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 48
  const contentWidth = pageWidth - margin * 2

  const headingColor: Rgb = [0.1, 0.13, 0.2]
  const labelColor: Rgb = [0.4, 0.45, 0.55]
  const bodyColor: Rgb = [0.1, 0.13, 0.2]
  const accentColor: Rgb = [0.15, 0.18, 0.26]
  const bulletColor: Rgb = [0.3, 0.2, 0.2]

  const measure = createTextMeasurer()
  const builder = { content: '' }
  let cursor = pageHeight - margin

  const wrap = (text: string, width: number, size: number, isBold: boolean) =>
    wrapText(text, width, size, isBold, measure)

  const formatList = (items?: string[]): string => {
    if (!items || items.length === 0) {
      return 'Not provided'
    }
    return items.join(', ')
  }

  const formatDateValue = (value?: string): string => {
    if (!value) {
      return 'Not provided'
    }
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) {
      return value
    }
    return new Date(parsed).toLocaleDateString()
  }

  const drawHeading = (text: string, size: number, gap: number) => {
    cursor -= size
    appendTextLine(builder, text, margin, cursor, 'F2', size, headingColor)
    cursor -= gap
  }

  const drawLabelValue = (label: string, value: string) => {
    const labelSize = 11
    const valueSize = 12
    cursor -= labelSize
    appendTextLine(builder, label.toUpperCase(), margin, cursor, 'F2', labelSize, labelColor)
    cursor -= 4
    const lines = value ? wrap(value, contentWidth, valueSize, false) : ['—']
    for (let index = 0; index < lines.length; index += 1) {
      cursor -= valueSize
      appendTextLine(builder, lines[index], margin, cursor, 'F1', valueSize, bodyColor)
      cursor -= 4
    }
    cursor -= 8
  }

  drawHeading('Customer Sign Off', 24, 24)
  drawLabelValue('Customer', data.customerName)
  drawLabelValue('Project', data.projectNumber)
  const completedDisplay = new Date(data.completedAt).toLocaleString()
  drawLabelValue('Completed', completedDisplay)

  drawHeading('Project Information', 16, 16)
  drawLabelValue('Line No/Name', data.lineReference ?? 'Not provided')
  drawLabelValue('Machine Serial Numbers', formatList(data.machineSerialNumbers))
  drawLabelValue('Tool Serial Numbers', formatList(data.toolSerialNumbers))
  drawLabelValue('Cobalt Order Number', data.cobaltOrderNumber ?? 'Not provided')
  drawLabelValue('Customer Order Number', data.customerOrderNumber ?? 'Not provided')
  drawLabelValue('Salesperson', data.salespersonName ?? 'Not provided')
  drawLabelValue('Project Start Date', formatDateValue(data.startDate))
  drawLabelValue('Proposed Completion', formatDateValue(data.proposedCompletionDate))

  const optionCopy = CUSTOMER_SIGN_OFF_OPTION_COPY[data.decision]
  drawHeading('Acceptance Statement', 16, 16)
  const titleLines = wrap(optionCopy.title, contentWidth, 13, true)
  for (let index = 0; index < titleLines.length; index += 1) {
    cursor -= 13
    appendTextLine(builder, titleLines[index], margin, cursor, 'F2', 13, accentColor)
    cursor -= index === titleLines.length - 1 ? 10 : 4
  }

  const descriptionLines = wrap(optionCopy.description, contentWidth, 12, false)
  for (let index = 0; index < descriptionLines.length; index += 1) {
    cursor -= 12
    appendTextLine(builder, descriptionLines[index], margin, cursor, 'F1', 12, bodyColor)
    cursor -= index === descriptionLines.length - 1 ? 16 : 4
  }

  if (data.snags.length > 0) {
    drawHeading('Snag List', 16, 12)
    for (const snag of data.snags) {
      const lines = wrap(snag, contentWidth - 18, 12, false)
      for (let index = 0; index < lines.length; index += 1) {
        cursor -= 12
        const prefix = index === 0 ? '• ' : '  '
        appendTextLine(builder, `${prefix}${lines[index]}`, margin, cursor, 'F1', 12, bulletColor)
        cursor -= 4
      }
      cursor -= 4
    }
  }

  cursor -= 12
  drawHeading('Authorisation', 16, 20)

  const signatureBoxHeight = 120
  const signatureBoxTop = cursor
  const signatureBoxBottom = signatureBoxTop - signatureBoxHeight

  drawRectangle(
    builder,
    margin,
    signatureBoxBottom,
    contentWidth,
    signatureBoxHeight,
    [0.96, 0.97, 0.99],
    [0.8, 0.82, 0.86],
  )

  drawSignaturePaths(builder, data.signaturePaths, data.signatureDimensions, {
    x: margin,
    y: signatureBoxBottom,
    width: contentWidth,
    height: signatureBoxHeight,
  })

  cursor = signatureBoxBottom - 24
  const signedBy = `${data.signedByName} — ${data.signedByPosition}`
  drawLabelValue('Signed by', signedBy)

  const contentStream = builder.content
  const contentBytes = new TextEncoder().encode(contentStream)

  const objects: PdfObject[] = []
  objects.push({ type: 'value', content: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' })
  objects.push({ type: 'value', content: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>' })
  objects.push({ type: 'stream', content: contentBytes })

  const predictedPagesId = objects.length + 2
  const pageObject =
    `<< /Type /Page /Parent ${predictedPagesId} 0 R /MediaBox [0 0 ${formatNumber(pageWidth)} ${formatNumber(
      pageHeight,
    )}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents 3 0 R >>`
  objects.push({ type: 'value', content: pageObject })
  objects.push({ type: 'value', content: `<< /Type /Pages /Kids [4 0 R] /Count 1 >>` })
  objects.push({ type: 'value', content: '<< /Type /Catalog /Pages 5 0 R >>' })

  const pdfBytes = buildPdf(objects)
  const base64 = encodeBase64(pdfBytes)
  return `data:application/pdf;base64,${base64}`
}

export async function generateOnsiteReportPdf(data: OnsiteReportPdfInput): Promise<string> {
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 48
  const contentWidth = pageWidth - margin * 2

  const headingColor: Rgb = [0.1, 0.13, 0.2]
  const labelColor: Rgb = [0.4, 0.45, 0.55]
  const bodyColor: Rgb = [0.1, 0.13, 0.2]
  const accentColor: Rgb = [0.15, 0.18, 0.26]

  const measure = createTextMeasurer()
  const builder = { content: '' }
  let cursor = pageHeight - margin

  const wrap = (text: string, width: number, size: number, isBold: boolean) =>
    wrapText(text, width, size, isBold, measure)

  const drawHeading = (text: string, size: number, gap: number) => {
    cursor -= size
    appendTextLine(builder, text, margin, cursor, 'F2', size, headingColor)
    cursor -= gap
  }

  const drawLabelValue = (label: string, value?: string) => {
    const labelSize = 11
    const valueSize = 12
    cursor -= labelSize
    appendTextLine(builder, label.toUpperCase(), margin, cursor, 'F2', labelSize, labelColor)
    cursor -= 4
    const content = value && value.trim() ? value : 'Not provided'
    const lines = wrap(content, contentWidth, valueSize, false)
    for (let index = 0; index < lines.length; index += 1) {
      cursor -= valueSize
      appendTextLine(builder, lines[index], margin, cursor, 'F1', valueSize, bodyColor)
      cursor -= 4
    }
    cursor -= 8
  }

  const drawTextBlock = (title: string, value?: string) => {
    drawHeading(title, 16, 12)
    const content = value && value.trim() ? value : 'Not provided'
    const lines = wrap(content, contentWidth, 12, false)
    for (let index = 0; index < lines.length; index += 1) {
      cursor -= 12
      appendTextLine(builder, lines[index], margin, cursor, 'F1', 12, bodyColor)
      cursor -= 4
    }
    cursor -= 8
  }

  const formatReportDate = (value?: string): string => {
    if (!value) {
      return 'Not provided'
    }
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) {
      return value
    }
    return new Date(parsed).toLocaleDateString()
  }

  const formatTimeValue = (value?: string): string => {
    if (!value) {
      return 'Not provided'
    }
    return value
  }

  drawHeading('Onsite Report', 24, 24)
  drawLabelValue('Customer', data.customerName)
  drawLabelValue('Project', data.projectNumber)
  drawLabelValue('Site Address', data.siteAddress)
  drawLabelValue('Created', new Date(data.createdAt).toLocaleString())

  drawHeading('Visit Details', 16, 16)
  drawLabelValue('Report Date', formatReportDate(data.reportDate))
  drawLabelValue('Engineer', data.engineerName)
  drawLabelValue('Arrival Time', formatTimeValue(data.arrivalTime))
  drawLabelValue('Departure Time', formatTimeValue(data.departureTime))
  drawLabelValue('Customer Contact', data.customerContact)

  drawTextBlock('Work Summary', data.workSummary)
  drawTextBlock('Materials Used', data.materialsUsed)
  drawTextBlock('Additional Notes', data.additionalNotes)

  cursor -= 12
  drawHeading('Customer Sign Off', 16, 20)

  const signatureBoxHeight = 120
  const signatureBoxTop = cursor
  const signatureBoxBottom = signatureBoxTop - signatureBoxHeight

  drawRectangle(
    builder,
    margin,
    signatureBoxBottom,
    contentWidth,
    signatureBoxHeight,
    [0.96, 0.97, 0.99],
    [0.8, 0.82, 0.86],
  )

  drawSignaturePaths(builder, data.signaturePaths, data.signatureDimensions, {
    x: margin,
    y: signatureBoxBottom,
    width: contentWidth,
    height: signatureBoxHeight,
  })

  cursor = signatureBoxBottom - 24
  const signedBy = data.signedByPosition
    ? `${data.signedByName} — ${data.signedByPosition}`
    : data.signedByName
  drawLabelValue('Signed By', signedBy)
  drawLabelValue('Signed At', new Date(data.createdAt).toLocaleString())

  const contentStream = builder.content
  const contentBytes = new TextEncoder().encode(contentStream)

  const objects: PdfObject[] = []
  objects.push({ type: 'value', content: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' })
  objects.push({ type: 'value', content: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>' })
  objects.push({ type: 'stream', content: contentBytes })

  const predictedPagesId = objects.length + 2
  const pageObject =
    `<< /Type /Page /Parent ${predictedPagesId} 0 R /MediaBox [0 0 ${formatNumber(pageWidth)} ${formatNumber(
      pageHeight,
    )}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents 3 0 R >>`
  objects.push({ type: 'value', content: pageObject })
  objects.push({ type: 'value', content: `<< /Type /Pages /Kids [4 0 R] /Count 1 >>` })
  objects.push({ type: 'value', content: '<< /Type /Catalog /Pages 5 0 R >>' })

  const pdfBytes = buildPdf(objects)
  const base64 = encodeBase64(pdfBytes)
  return `data:application/pdf;base64,${base64}`
}
