export type ToolMode = 'select' | 'edit' | 'add-text' | 'erase' | 'highlight'

export interface PdfFont {
  id: string
  name: string
  baseName: string
  subtype: string
  format: 'ttf' | 'otf' | 'woff' | 'cff' | 'unknown'
  data: Uint8Array
  size: number
  pages: number[]
}

export interface TextItemEdit {
  id: string
  pageIndex: number
  original: string
  text: string
  /** PDF user-space coords (origin bottom-left) */
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
  baseFontName: string
  color: string
  /** Screen-space (origin top-left) for overlays */
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  transform: number[]
  deleted?: boolean
  isNew?: boolean
}

export interface HighlightMark {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface PageSnapshot {
  index: number
  width: number
  height: number
  thumbUrl?: string
}

export interface DocumentState {
  fileName: string
  bytes: ArrayBuffer
  pageCount: number
  pages: PageSnapshot[]
  fonts: PdfFont[]
  items: TextItemEdit[]
  highlights: HighlightMark[]
}
