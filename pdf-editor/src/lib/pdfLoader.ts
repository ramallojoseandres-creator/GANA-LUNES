import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { PageSnapshot, TextItemEdit } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const loadingTask = pdfjs.getDocument({
    data: data.slice(0),
    useSystemFonts: true,
  })
  return loadingTask.promise
}

function baseFontName(fontName: string): string {
  const plus = fontName.indexOf('+')
  return plus >= 0 && plus <= 7 ? fontName.slice(plus + 1) : fontName
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<{ width: number; height: number }> {
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2d context')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const task = page.render({ canvasContext: ctx, viewport, canvas })
  await task.promise
  return { width: viewport.width, height: viewport.height }
}

/**
 * Extract text in PDF user space. Screen coords are filled later via toScreenItems.
 */
export async function extractPageText(
  page: PDFPageProxy,
  pageIndex: number,
): Promise<TextItemEdit[]> {
  const textContent = await page.getTextContent({ includeMarkedContent: false })
  const items: TextItemEdit[] = []

  for (let i = 0; i < textContent.items.length; i++) {
    const raw = textContent.items[i]
    if (!('str' in raw)) continue
    const item = raw as {
      str: string
      transform: number[]
      width: number
      height: number
      fontName: string
    }
    if (!item.str) continue

    const fontSize =
      Math.hypot(item.transform[2], item.transform[3]) ||
      item.height ||
      12

    const pdfX = item.transform[4]
    const pdfY = item.transform[5]
    // Approximate advance width in PDF units
    const advance =
      item.width ||
      Math.max(fontSize * item.str.length * 0.5, fontSize * 0.4)

    items.push({
      id: `p${pageIndex}-t${i}`,
      pageIndex,
      original: item.str,
      text: item.str,
      x: pdfX,
      y: pdfY,
      width: advance,
      height: fontSize,
      fontSize,
      fontName: item.fontName,
      baseFontName: baseFontName(item.fontName),
      color: '#111111',
      screenX: 0,
      screenY: 0,
      screenWidth: 0,
      screenHeight: 0,
      transform: item.transform,
    })
  }

  return items
}

/** Map PDF-space items to viewport/screen overlays for the current scale. */
export function toScreenItems(
  items: TextItemEdit[],
  pageHeight: number,
  scale: number,
): TextItemEdit[] {
  return items.map((it) => {
    const screenHeight = Math.max(it.fontSize * scale * 1.2, 12)
    const screenWidth = Math.max(it.width * scale, it.fontSize * scale * 0.35)
    // PDF origin bottom-left → screen top-left
    const screenX = it.x * scale
    const screenY = (pageHeight - it.y - it.fontSize * 0.15) * scale - screenHeight * 0.75
    return {
      ...it,
      screenX,
      screenY: Math.max(0, screenY),
      screenWidth,
      screenHeight,
    }
  })
}

export async function buildPageSnapshots(
  doc: PDFDocumentProxy,
  thumbScale = 0.2,
): Promise<PageSnapshot[]> {
  const pages: PageSnapshot[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    await renderPageToCanvas(page, canvas, thumbScale)
    pages.push({
      index: i - 1,
      width: viewport.width,
      height: viewport.height,
      thumbUrl: canvas.toDataURL('image/jpeg', 0.72),
    })
  }
  return pages
}

export { pdfjs }
