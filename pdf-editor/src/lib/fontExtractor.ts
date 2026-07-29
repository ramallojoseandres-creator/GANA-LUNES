import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import type { PdfFont } from '../types'

function bytesEqualAt(buf: Uint8Array, offset: number, sig: number[]): boolean {
  if (offset + sig.length > buf.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false
  }
  return true
}

export function detectFormat(data: Uint8Array): PdfFont['format'] {
  if (data.length < 4) return 'unknown'
  if (bytesEqualAt(data, 0, [0x00, 0x01, 0x00, 0x00])) return 'ttf'
  if (bytesEqualAt(data, 0, [0x4f, 0x54, 0x54, 0x4f])) return 'otf'
  if (bytesEqualAt(data, 0, [0x74, 0x72, 0x75, 0x65])) return 'ttf'
  if (bytesEqualAt(data, 0, [0x74, 0x79, 0x70, 0x31])) return 'ttf'
  if (bytesEqualAt(data, 0, [0x77, 0x4f, 0x46, 0x46])) return 'woff'
  if (data[0] === 0x01 && data[1] === 0x00) return 'cff'
  return 'unknown'
}

function extensionFor(format: PdfFont['format']): string {
  switch (format) {
    case 'ttf':
      return 'ttf'
    case 'otf':
      return 'otf'
    case 'woff':
      return 'woff'
    case 'cff':
      return 'cff'
    default:
      return 'bin'
  }
}

function decodePdfName(raw: string): string {
  return raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
}

function cleanFontName(name: string): string {
  const decoded = decodePdfName(name)
  const plus = decoded.indexOf('+')
  const base = plus >= 0 && plus <= 7 ? decoded.slice(plus + 1) : decoded
  return base.replace(/^\/+/, '').trim() || 'EmbeddedFont'
}

function findAscii(haystack: Uint8Array, needle: string, from = 0): number {
  const n = needle.length
  outer: for (let i = from; i <= haystack.length - n; i++) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

function readStreamAfterDict(buf: Uint8Array, dictStart: number): Uint8Array | null {
  const streamKw = findAscii(buf, 'stream', dictStart)
  if (streamKw < 0 || streamKw - dictStart > 8000) return null

  let dataStart = streamKw + 6
  if (buf[dataStart] === 0x0d) dataStart++
  if (buf[dataStart] === 0x0a) dataStart++

  const dictSlice = buf.subarray(dictStart, streamKw)
  const ascii = String.fromCharCode(...dictSlice.subarray(0, Math.min(dictSlice.length, 4000)))
  const lengthMatch = /\/Length\s+(\d+)/.exec(ascii)

  if (lengthMatch) {
    const len = parseInt(lengthMatch[1], 10)
    if (len > 0 && dataStart + len <= buf.length) {
      return buf.subarray(dataStart, dataStart + len)
    }
  }

  const end = findAscii(buf, 'endstream', dataStart)
  if (end < 0) return null
  let dataEnd = end
  if (buf[dataEnd - 1] === 0x0a) dataEnd--
  if (buf[dataEnd - 1] === 0x0d) dataEnd--
  if (dataEnd <= dataStart) return null
  return buf.subarray(dataStart, dataEnd)
}

async function inflateFlate(data: Uint8Array): Promise<Uint8Array> {
  if (!(data.length > 2 && data[0] === 0x78)) return data
  const tryMethod = async (method: 'deflate' | 'deflate-raw') => {
    const ds = new DecompressionStream(method)
    const copy = new Uint8Array(data)
    const stream = new Blob([copy]).stream().pipeThrough(ds)
    const ab = await new Response(stream).arrayBuffer()
    return new Uint8Array(ab)
  }
  try {
    return await tryMethod('deflate')
  } catch {
    try {
      return await tryMethod('deflate-raw')
    } catch {
      return data
    }
  }
}

function nearbyFontName(buf: Uint8Array, around: number): string {
  const start = Math.max(0, around - 2500)
  const end = Math.min(buf.length, around + 400)
  const text = String.fromCharCode(...buf.subarray(start, end))
  const base = text.match(/\/BaseFont\s*\/([^\s/[\]()<>]+)/)
  if (base) return cleanFontName(base[1])
  const name = text.match(/\/Name\s*\/([^\s/[\]()<>]+)/)
  if (name) return cleanFontName(name[1])
  return `Font_${around}`
}

function nearbySubtype(buf: Uint8Array, around: number): string {
  const start = Math.max(0, around - 2500)
  const end = Math.min(buf.length, around + 400)
  const text = String.fromCharCode(...buf.subarray(start, end))
  const m = text.match(/\/Subtype\s*\/([^\s/[\]()<>]+)/)
  return m ? m[1] : 'Embedded'
}

function fingerprint(data: Uint8Array): string {
  const head = data.subarray(0, 16)
  const tail = data.subarray(Math.max(0, data.length - 8))
  return `${data.length}:${Array.from(head).join(',')}:${Array.from(tail).join(',')}`
}

/** Read full font name from TrueType/OpenType `name` table. */
function readTrueTypeFamilyName(data: Uint8Array): string | null {
  if (data.length < 12) return null
  const format = detectFormat(data)
  if (format !== 'ttf' && format !== 'otf') return null
  try {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const numTables = dv.getUint16(4)
    let nameOffset = -1
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16
      const tag = String.fromCharCode(data[o], data[o + 1], data[o + 2], data[o + 3])
      if (tag === 'name') {
        nameOffset = dv.getUint32(o + 8)
        break
      }
    }
    if (nameOffset < 0 || nameOffset + 6 > data.length) return null
    const count = dv.getUint16(nameOffset + 2)
    const storage = dv.getUint16(nameOffset + 4)
    const names: Partial<Record<number, string>> = {}
    for (let i = 0; i < count; i++) {
      const r = nameOffset + 6 + i * 12
      if (r + 12 > data.length) break
      const platformID = dv.getUint16(r)
      const nameID = dv.getUint16(r + 6)
      const length = dv.getUint16(r + 8)
      const offset = dv.getUint16(r + 10)
      const start = nameOffset + storage + offset
      if (start + length > data.length) continue
      if (![1, 4, 6].includes(nameID) || names[nameID]) continue
      let str = ''
      if (platformID === 0 || platformID === 3) {
        for (let j = 0; j + 1 < length; j += 2) {
          const c = dv.getUint16(start + j)
          if (c) str += String.fromCharCode(c)
        }
      } else {
        for (let j = 0; j < length; j++) str += String.fromCharCode(data[start + j])
      }
      if (str.trim()) names[nameID] = str.trim()
    }
    return names[4] || names[1] || names[6] || null
  } catch {
    return null
  }
}

function labelForFontData(data: Uint8Array, fallback: string): string {
  return readTrueTypeFamilyName(data) || fallback
}

function dedupe(fonts: PdfFont[]): PdfFont[] {
  const seen = new Set<string>()
  const out: PdfFont[] = []
  for (const f of fonts) {
    const key = fingerprint(f.data)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...f, id: `font-${out.length + 1}` })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function extractByBinaryScan(pdfBytes: ArrayBuffer): Promise<PdfFont[]> {
  const buf = new Uint8Array(pdfBytes)
  const markers = ['/FontFile3', '/FontFile2', '/FontFile'] as const
  const found: PdfFont[] = []

  for (const marker of markers) {
    let from = 0
    while (from < buf.length) {
      const idx = findAscii(buf, marker, from)
      if (idx < 0) break
      from = idx + marker.length

      let dictStart = idx
      for (let i = idx; i >= Math.max(0, idx - 1200); i--) {
        if (buf[i] === 0x3c && buf[i + 1] === 0x3c) {
          dictStart = i
          break
        }
      }

      const after = String.fromCharCode(...buf.subarray(idx, Math.min(buf.length, idx + 80)))
      const refMatch = after.match(/\/FontFile[23]?\s+(\d+)\s+(\d+)\s+R/)

      let streamData: Uint8Array | null = null

      if (refMatch) {
        const objMarker = `${refMatch[1]} ${refMatch[2]} obj`
        let objPos = findAscii(buf, objMarker, 0)
        while (objPos >= 0) {
          const localDict = findAscii(buf, '<<', objPos)
          if (localDict >= 0 && localDict - objPos < 200) {
            streamData = readStreamAfterDict(buf, localDict)
            if (streamData && streamData.length > 64) break
          }
          objPos = findAscii(buf, objMarker, objPos + objMarker.length)
        }
      }

      if (!streamData) streamData = readStreamAfterDict(buf, dictStart)
      if (!streamData || streamData.length < 64) continue

      const inflated = await inflateFlate(streamData)
      const format = detectFormat(inflated)
      if (format === 'unknown' && inflated.length < 200) continue
      const fallback = nearbyFontName(buf, idx)

      found.push({
        id: `scan-${found.length + 1}`,
        name: labelForFontData(inflated, fallback),
        baseName: labelForFontData(inflated, fallback),
        subtype: nearbySubtype(buf, idx),
        format: format === 'unknown' ? 'ttf' : format,
        data: inflated,
        size: inflated.length,
        pages: [],
      })
    }
  }

  return found
}

async function extractByPdfLib(pdfBytes: ArrayBuffer): Promise<PdfFont[]> {
  try {
    const doc = await PDFDocument.load(pdfBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    const found: PdfFont[] = []
    const context = doc.context as unknown as {
      enumerateIndirectObjects: () => Array<[unknown, unknown]>
      lookup: (ref: unknown) => unknown
    }

    // Collect BaseFont names near font descriptors for nicer labels
    const baseNames: string[] = []
    for (const [, obj] of context.enumerateIndirectObjects()) {
      if (!obj || typeof obj !== 'object' || !('get' in obj) || !('has' in obj)) continue
      const dict = obj as {
        has: (n: ReturnType<typeof PDFName.of>) => boolean
        get: (n: ReturnType<typeof PDFName.of>) => unknown
      }
      if (!dict.has(PDFName.of('BaseFont'))) continue
      const base = dict.get(PDFName.of('BaseFont'))
      if (base) baseNames.push(cleanFontName(String(base).replace(/^PDFName\(|\)$/g, '')))
    }

    for (const [, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue
      const dict = obj.dict
      const looksLikeFont =
        dict.has(PDFName.of('Length1')) ||
        dict.has(PDFName.of('Length2')) ||
        dict.has(PDFName.of('Length3'))

      let bytes: Uint8Array
      try {
        bytes = decodePDFRawStream(obj).decode()
      } catch {
        bytes = obj.contents
      }

      const format = detectFormat(bytes)
      if (!looksLikeFont && format === 'unknown') continue
      if (bytes.length < 100) continue
      // Accept clear font binaries even without Length* keys (pdf-lib embeds)
      if (!looksLikeFont && format === 'unknown') continue

      const subtype = dict.get(PDFName.of('Subtype'))
      const fallback = baseNames[found.length] || `Embedded_${found.length + 1}`
      const name = labelForFontData(bytes, fallback)
      found.push({
        id: `lib-${found.length + 1}`,
        name,
        baseName: name,
        subtype: subtype
          ? String(subtype).replace(/^PDFName\(|\)$/g, '').replace(/^\//, '')
          : 'Embedded',
        format: format === 'unknown' ? 'ttf' : format,
        data: bytes,
        size: bytes.length,
        pages: [],
      })
    }

    return found
  } catch {
    return []
  }
}

/**
 * Extract embedded font programs (FontFile / FontFile2 / FontFile3) from a PDF.
 */
export async function extractFontsFromPdf(pdfBytes: ArrayBuffer): Promise<PdfFont[]> {
  const [scan, lib] = await Promise.all([
    extractByBinaryScan(pdfBytes),
    extractByPdfLib(pdfBytes),
  ])
  return dedupe([...scan, ...lib])
}

export function fontDownloadName(font: PdfFont): string {
  const safe = font.baseName.replace(/[^\w.-]+/g, '_')
  return `${safe}.${extensionFor(font.format)}`
}

export function fontMime(font: PdfFont): string {
  switch (font.format) {
    case 'ttf':
      return 'font/ttf'
    case 'otf':
      return 'font/otf'
    case 'woff':
      return 'font/woff'
    default:
      return 'application/octet-stream'
  }
}

/** Register extractable fonts as CSS @font-face for faithful on-screen editing. */
export function registerFontFaces(fonts: PdfFont[]): () => void {
  const urls: string[] = []
  const style = document.createElement('style')
  style.id = 'origen-font-faces'
  const rules: string[] = []

  for (const font of fonts) {
    if (font.format === 'cff' || font.format === 'unknown') continue
    const copy = new Uint8Array(font.data)
    const blob = new Blob([copy], { type: fontMime(font) })
    const url = URL.createObjectURL(blob)
    urls.push(url)
    const family = `Origen_${font.id}`
    const fmt = font.format === 'otf' ? 'opentype' : font.format
    rules.push(
      `@font-face{font-family:'${family}';src:url('${url}') format('${fmt}');font-display:block;}`,
    )
  }

  style.textContent = rules.join('\n')
  document.head.appendChild(style)

  return () => {
    style.remove()
    urls.forEach((u) => URL.revokeObjectURL(u))
  }
}

export function cssFamilyForFont(fontId: string | undefined, fonts: PdfFont[]): string {
  if (!fontId) return 'Georgia, "Times New Roman", serif'
  const hit = fonts.find((f) => f.id === fontId || f.name === fontId || f.baseName === fontId)
  if (hit && hit.format !== 'cff' && hit.format !== 'unknown') {
    return `'Origen_${hit.id}', Georgia, serif`
  }
  const byName = fonts.find(
    (f) =>
      f.baseName === fontId ||
      f.name === fontId ||
      fontId.includes(f.baseName) ||
      f.baseName.includes(fontId.replace(/^.*\+/, '')),
  )
  if (byName && byName.format !== 'cff' && byName.format !== 'unknown') {
    return `'Origen_${byName.id}', Georgia, serif`
  }
  return 'Georgia, "Times New Roman", serif'
}
