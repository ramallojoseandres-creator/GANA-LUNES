import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { HighlightMark, PdfFont, TextItemEdit } from '../types'

function parseCssColor(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (m) {
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 }
  }
  if (color.startsWith('#') && color.length === 7) {
    return {
      r: parseInt(color.slice(1, 3), 16) / 255,
      g: parseInt(color.slice(3, 5), 16) / 255,
      b: parseInt(color.slice(5, 7), 16) / 255,
    }
  }
  return { r: 0.07, g: 0.07, b: 0.07 }
}

function pickStandard(baseName: string): StandardFonts {
  const n = baseName.toLowerCase()
  if (n.includes('courier')) {
    if (n.includes('bold') && n.includes('oblique')) return StandardFonts.CourierBoldOblique
    if (n.includes('bold')) return StandardFonts.CourierBold
    if (n.includes('oblique') || n.includes('italic')) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (n.includes('helvetica') || n.includes('arial') || n.includes('sans')) {
    if (n.includes('bold') && (n.includes('oblique') || n.includes('italic')))
      return StandardFonts.HelveticaBoldOblique
    if (n.includes('bold')) return StandardFonts.HelveticaBold
    if (n.includes('oblique') || n.includes('italic')) return StandardFonts.HelveticaOblique
    return StandardFonts.Helvetica
  }
  if (n.includes('bold') && (n.includes('italic') || n.includes('oblique')))
    return StandardFonts.TimesRomanBoldItalic
  if (n.includes('bold')) return StandardFonts.TimesRomanBold
  if (n.includes('italic') || n.includes('oblique')) return StandardFonts.TimesRomanItalic
  return StandardFonts.TimesRoman
}

async function tryEmbedFont(doc: PDFDocument, font: PdfFont) {
  try {
    return await doc.embedFont(font.data, { subset: true })
  } catch {
    try {
      return await doc.embedFont(font.data, { subset: false })
    } catch {
      return null
    }
  }
}

function matchFont(fonts: PdfFont[], baseName: string): PdfFont | undefined {
  const clean = baseName.replace(/^.*\+/, '')
  return (
    fonts.find((f) => f.baseName === clean || f.name === clean) ||
    fonts.find(
      (f) =>
        f.baseName.toLowerCase().includes(clean.toLowerCase()) ||
        clean.toLowerCase().includes(f.baseName.toLowerCase()),
    )
  )
}

/**
 * Export an edited PDF: white-out changed/deleted text, redraw with original fonts when possible.
 */
export async function exportEditedPdf(
  originalBytes: ArrayBuffer,
  items: TextItemEdit[],
  highlights: HighlightMark[],
  fonts: PdfFont[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalBytes.slice(0), {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  doc.registerFontkit(fontkit)
  const pages = doc.getPages()

  const embedded = new Map<string, Awaited<ReturnType<typeof tryEmbedFont>>>()
  const standardCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>()

  async function fontFor(baseName: string) {
    const matched = matchFont(fonts, baseName)
    if (matched) {
      if (!embedded.has(matched.id)) {
        embedded.set(matched.id, await tryEmbedFont(doc, matched))
      }
      const emb = embedded.get(matched.id)
      if (emb) return emb
    }
    for (const f of fonts) {
      if (!embedded.has(f.id)) embedded.set(f.id, await tryEmbedFont(doc, f))
      const emb = embedded.get(f.id)
      if (emb && /sans|serif|dejavu|roboto|noto|arial|times/i.test(baseName + f.baseName)) {
        return emb
      }
    }
    const std = pickStandard(baseName)
    if (!standardCache.has(std)) {
      standardCache.set(std, await doc.embedFont(std))
    }
    return standardCache.get(std)!
  }

  for (const h of highlights) {
    const page = pages[h.pageIndex]
    if (!page) continue
    const { height } = page.getSize()
    const c = parseCssColor(h.color)
    page.drawRectangle({
      x: h.x,
      y: height - h.y - h.height,
      width: h.width,
      height: h.height,
      color: rgb(c.r, c.g, c.b),
      opacity: 0.35,
      borderWidth: 0,
    })
  }

  for (const item of items) {
    const changed = item.deleted || item.isNew || item.text !== item.original
    if (!changed) continue
    const page = pages[item.pageIndex]
    if (!page) continue

    const padX = 1.5
    const padY = 2
    const boxH = Math.max(item.fontSize * 1.25, item.height * 1.1)
    const rectY = item.y - item.fontSize * 0.22

    if (!item.isNew) {
      page.drawRectangle({
        x: item.x - padX,
        y: rectY - padY,
        width:
          Math.max(item.width, item.fontSize * Math.max(item.original.length, 1) * 0.5) +
          padX * 2,
        height: boxH + padY * 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      })
    }

    if (item.deleted) continue

    const font = await fontFor(item.baseFontName)
    const color = parseCssColor(item.color)
    page.drawText(item.text, {
      x: item.x,
      y: item.y,
      size: item.fontSize || 12,
      font,
      color: rgb(color.r, color.g, color.b),
    })
  }

  return doc.save({ updateFieldAppearances: false })
}
