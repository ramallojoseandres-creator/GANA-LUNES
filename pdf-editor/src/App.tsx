import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  cssFamilyForFont,
  extractFontsFromPdf,
  fontDownloadName,
  fontMime,
  registerFontFaces,
} from './lib/fontExtractor'
import { exportEditedPdf } from './lib/pdfExporter'
import {
  buildPageSnapshots,
  extractPageText,
  loadPdfDocument,
  renderPageToCanvas,
  toScreenItems,
} from './lib/pdfLoader'
import type {
  DocumentState,
  HighlightMark,
  TextItemEdit,
  ToolMode,
} from './types'
import './App.css'

type Phase = 'landing' | 'loading' | 'editor'

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [error, setError] = useState<string | null>(null)
  const [docState, setDocState] = useState<DocumentState | null>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(1.35)
  const [tool, setTool] = useState<ToolMode>('edit')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [panel, setPanel] = useState<'pages' | 'fonts' | 'help'>('fonts')
  const [dragOver, setDragOver] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const unregisterFonts = useRef<(() => void) | null>(null)

  const pageItems = useMemo(() => {
    if (!docState) return []
    const page = docState.pages[pageIndex]
    if (!page) return []
    const raw = docState.items.filter((i) => i.pageIndex === pageIndex && !i.deleted)
    return toScreenItems(raw, page.height, scale)
  }, [docState, pageIndex, scale])

  const pageHighlights = useMemo(
    () => docState?.highlights.filter((h) => h.pageIndex === pageIndex) ?? [],
    [docState, pageIndex],
  )

  const dirtyCount = useMemo(() => {
    if (!docState) return 0
    return docState.items.filter(
      (i) => i.deleted || i.isNew || i.text !== i.original,
    ).length
  }, [docState])

  const openFile = useCallback(async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Sube un archivo PDF válido.')
      return
    }
    setError(null)
    setPhase('loading')
    setBusy('Leyendo documento y fuentes…')
    try {
      const bytes = await file.arrayBuffer()
      const [fonts, doc] = await Promise.all([
        extractFontsFromPdf(bytes),
        loadPdfDocument(bytes),
      ])
      setBusy('Renderizando páginas…')
      const pages = await buildPageSnapshots(doc, 0.18)
      setBusy('Extrayendo texto editable…')
      const allItems: TextItemEdit[] = []
      for (let i = 0; i < doc.numPages; i++) {
        const page = await doc.getPage(i + 1)
        const items = await extractPageText(page, i)
        allItems.push(...items)
      }

      unregisterFonts.current?.()
      unregisterFonts.current = registerFontFaces(fonts)

      setPdfDoc(doc)
      setDocState({
        fileName: file.name,
        bytes,
        pageCount: doc.numPages,
        pages,
        fonts,
        items: allItems,
        highlights: [],
      })
      setPageIndex(0)
      setScale(1.35)
      setTool('edit')
      setSelectedId(null)
      setPanel(fonts.length ? 'fonts' : 'pages')
      setPhase('editor')
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF.')
      setPhase('landing')
    } finally {
      setBusy(null)
    }
  }, [])

  const openDemo = useCallback(async () => {
    setBusy('Cargando demo…')
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/contrato-demo.pdf`)
      if (!res.ok) throw new Error('No se encontró el PDF de demo')
      const blob = await res.blob()
      const file = new File([blob], 'contrato-demo.pdf', { type: 'application/pdf' })
      await openFile(file)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'No se pudo cargar la demo')
      setBusy(null)
    }
  }, [openFile])

  useEffect(() => {
    return () => unregisterFonts.current?.()
  }, [])

  // Render current page canvas
  useEffect(() => {
    let cancelled = false
    async function draw() {
      if (!pdfDoc || !canvasRef.current || phase !== 'editor') return
      const page = await pdfDoc.getPage(pageIndex + 1)
      if (cancelled) return
      await renderPageToCanvas(page, canvasRef.current, scale)
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, pageIndex, scale, phase])

  const updateItem = useCallback((id: string, patch: Partial<TextItemEdit>) => {
    setDocState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      }
    })
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    updateItem(selectedId, { deleted: true, text: '' })
    setSelectedId(null)
  }, [selectedId, updateItem])

  const addTextAt = useCallback(
    (screenX: number, screenY: number) => {
      if (!docState) return
      const page = docState.pages[pageIndex]
      if (!page) return
      const pdfX = screenX / scale
      const fontSize = 14
      const pdfY = page.height - screenY / scale - fontSize * 0.2
      const id = uid('new')
      const item: TextItemEdit = {
        id,
        pageIndex,
        original: '',
        text: 'Texto nuevo',
        x: pdfX,
        y: pdfY,
        width: 120,
        height: fontSize,
        fontSize,
        fontName: docState.fonts[0]?.name || 'Helvetica',
        baseFontName: docState.fonts[0]?.baseName || 'Helvetica',
        color: '#111111',
        screenX,
        screenY,
        screenWidth: 140,
        screenHeight: 22,
        transform: [1, 0, 0, 1, pdfX, pdfY],
        isNew: true,
      }
      setDocState((prev) => (prev ? { ...prev, items: [...prev.items, item] } : prev))
      setSelectedId(id)
      setTool('edit')
    },
    [docState, pageIndex, scale],
  )

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (tool === 'add-text') {
        addTextAt(x, y)
        return
      }
      if (tool === 'highlight' && docState) {
        const page = docState.pages[pageIndex]
        if (!page) return
        const mark: HighlightMark = {
          id: uid('hl'),
          pageIndex,
          x: x / scale,
          y: y / scale,
          width: 120,
          height: 18,
          color: '#F5D76E',
        }
        setDocState((prev) =>
          prev ? { ...prev, highlights: [...prev.highlights, mark] } : prev,
        )
        return
      }
      if (tool === 'erase') {
        // erase nearest text
        let best: TextItemEdit | null = null
        let bestDist = Infinity
        for (const it of pageItems) {
          const cx = it.screenX + it.screenWidth / 2
          const cy = it.screenY + it.screenHeight / 2
          const d = Math.hypot(cx - x, cy - y)
          if (d < bestDist && d < 48) {
            best = it
            bestDist = d
          }
        }
        if (best) updateItem(best.id, { deleted: true, text: '' })
      }
    },
    [tool, addTextAt, docState, pageIndex, scale, pageItems, updateItem],
  )

  const downloadFont = useCallback((fontId: string) => {
    const font = docState?.fonts.find((f) => f.id === fontId)
    if (!font) return
    const blob = new Blob([new Uint8Array(font.data)], { type: fontMime(font) })
    saveAs(blob, fontDownloadName(font))
  }, [docState])

  const downloadAllFonts = useCallback(async () => {
    if (!docState?.fonts.length) return
    setBusy('Empaquetando fuentes…')
    try {
      const zip = new JSZip()
      const folder = zip.folder('fuentes')!
      for (const font of docState.fonts) {
        folder.file(fontDownloadName(font), font.data)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const base = docState.fileName.replace(/\.pdf$/i, '')
      saveAs(blob, `${base}-fuentes.zip`)
    } finally {
      setBusy(null)
    }
  }, [docState])

  const exportPdf = useCallback(async () => {
    if (!docState) return
    setBusy('Exportando PDF con fuentes originales…')
    try {
      const out = await exportEditedPdf(
        docState.bytes,
        docState.items,
        docState.highlights,
        docState.fonts,
      )
      const blob = new Blob([new Uint8Array(out)], { type: 'application/pdf' })
      const base = docState.fileName.replace(/\.pdf$/i, '')
      saveAs(blob, `${base}-editado.pdf`)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setBusy(null)
    }
  }, [docState])

  const resetApp = useCallback(() => {
    unregisterFonts.current?.()
    unregisterFonts.current = null
    void pdfDoc?.cleanup()
    setPdfDoc(null)
    setDocState(null)
    setPhase('landing')
    setSelectedId(null)
    setError(null)
  }, [pdfDoc])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void openFile(file)
    },
    [openFile],
  )

  if (phase === 'landing' || phase === 'loading') {
    return (
      <div className="shell landing">
        <div className="grain" aria-hidden />
        <header className="topbar landing-top">
          <div className="brand">
            <span className="brand-mark" aria-hidden />
            <span className="brand-name">Origen</span>
          </div>
          <p className="top-note">Edición PDF con fidelidad tipográfica</p>
        </header>

        <main className="hero">
          <div className="hero-copy">
            <h1 className="hero-brand">Origen</h1>
            <p className="hero-line">
              Edita el PDF. La fuente se queda.
            </p>
            <p className="hero-sub">
              Extrae tipografías embebidas, edita texto en su lugar y exporta un
              documento que sigue viéndose original.
            </p>
            <div className="hero-cta">
              <button
                type="button"
                className="btn primary"
                disabled={phase === 'loading'}
                onClick={() => fileInputRef.current?.click()}
              >
                {phase === 'loading' ? 'Abriendo…' : 'Abrir PDF'}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={phase === 'loading'}
                onClick={() => void openDemo()}
              >
                Probar demo
              </button>
            </div>
            {error && <p className="error-banner">{error}</p>}
            {busy && <p className="busy-banner">{busy}</p>}
          </div>

          <div
            className={`dropzone ${dragOver ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
          >
            <div className="drop-visual" aria-hidden>
              <div className="sheet s1" />
              <div className="sheet s2" />
              <div className="sheet s3">
                <span className="sheet-rule" />
                <span className="sheet-rule short" />
                <span className="sheet-rule" />
                <span className="sheet-glyph">Aa</span>
              </div>
            </div>
            <p className="drop-title">Suelta tu PDF aquí</p>
            <p className="drop-sub">o haz clic para elegir un archivo</p>
          </div>
        </main>

        <section id="features" className="features">
          <h2>Una sola promesa: que parezca el original</h2>
          <div className="feature-row">
            <article>
              <h3>Fuentes del documento</h3>
              <p>
                Detecta tipografías embebidas (TTF/OTF) y las usa al editar y al
                exportar. También puedes descargarlas una a una o en ZIP.
              </p>
            </article>
            <article>
              <h3>Edición en su lugar</h3>
              <p>
                Haz clic en cualquier texto, cámbialo y conserva posición, tamaño
                y familia. Borra, resalta o añade líneas nuevas.
              </p>
            </article>
            <article>
              <h3>Exportación fiel</h3>
              <p>
                El PDF de salida cubre el texto anterior y redibuja con la fuente
                original siempre que sea posible.
              </p>
            </article>
          </div>
        </section>

        <footer className="landing-foot">
          <span>Origen</span>
          <span>Todo ocurre en tu navegador — el PDF no se sube a ningún servidor.</span>
        </footer>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openFile(f)
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  if (!docState) return null

  const selected = docState.items.find((i) => i.id === selectedId) ?? null
  const pageMeta = docState.pages[pageIndex]

  return (
    <div className="shell editor">
      <div className="grain" aria-hidden />
      <header className="editor-bar">
        <div className="bar-left">
          <button type="button" className="brand compact" onClick={resetApp} title="Cerrar">
            <span className="brand-mark" aria-hidden />
            <span className="brand-name">Origen</span>
          </button>
          <div className="file-pill">
            <span className="file-name">{docState.fileName}</span>
            <span className="file-meta">
              {docState.pageCount} pág · {docState.fonts.length} fuentes
              {dirtyCount ? ` · ${dirtyCount} cambios` : ''}
            </span>
          </div>
        </div>

        <div className="tools" role="toolbar" aria-label="Herramientas">
          {(
            [
              ['edit', 'Editar'],
              ['add-text', 'Añadir'],
              ['erase', 'Borrar'],
              ['highlight', 'Resaltar'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`tool ${tool === id ? 'on' : ''}`}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bar-right">
          <div className="zoom">
            <button type="button" onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}>−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((s) => Math.min(2.6, +(s + 0.15).toFixed(2)))}>+</button>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!docState.fonts.length}
            onClick={() => void downloadAllFonts()}
          >
            Descargar fuentes
          </button>
          <button type="button" className="btn primary sm" onClick={() => void exportPdf()}>
            Exportar PDF
          </button>
        </div>
      </header>

      {error && <div className="error-banner floating">{error}</div>}
      {busy && <div className="busy-banner floating">{busy}</div>}

      <div className="editor-body">
        <aside className="side left">
          <div className="side-tabs">
            <button type="button" className={panel === 'pages' ? 'on' : ''} onClick={() => setPanel('pages')}>
              Páginas
            </button>
            <button type="button" className={panel === 'fonts' ? 'on' : ''} onClick={() => setPanel('fonts')}>
              Fuentes
            </button>
            <button type="button" className={panel === 'help' ? 'on' : ''} onClick={() => setPanel('help')}>
              Guía
            </button>
          </div>

          {panel === 'pages' && (
            <div className="thumbs">
              {docState.pages.map((p) => (
                <button
                  key={p.index}
                  type="button"
                  className={`thumb ${p.index === pageIndex ? 'on' : ''}`}
                  onClick={() => setPageIndex(p.index)}
                >
                  {p.thumbUrl && <img src={p.thumbUrl} alt={`Página ${p.index + 1}`} />}
                  <span>{p.index + 1}</span>
                </button>
              ))}
            </div>
          )}

          {panel === 'fonts' && (
            <div className="font-list">
              {!docState.fonts.length && (
                <p className="muted">
                  Este PDF no trae fuentes embebidas descargables (o están comprimidas de forma no estándar).
                  Aun así puedes editar; al exportar se usarán fuentes estándar equivalentes.
                </p>
              )}
              {docState.fonts.map((f) => (
                <div key={f.id} className="font-card">
                  <div
                    className="font-preview"
                    style={{ fontFamily: cssFamilyForFont(f.id, docState.fonts) }}
                  >
                    Ag
                  </div>
                  <div className="font-info">
                    <strong title={f.name}>{f.baseName}</strong>
                    <span>
                      {f.format.toUpperCase()} · {formatBytes(f.size)} · {f.subtype}
                    </span>
                  </div>
                  <button type="button" className="btn ghost xs" onClick={() => downloadFont(f.id)}>
                    Descargar
                  </button>
                </div>
              ))}
              {!!docState.fonts.length && (
                <button type="button" className="btn ghost block" onClick={() => void downloadAllFonts()}>
                  Descargar todas (.zip)
                </button>
              )}
            </div>
          )}

          {panel === 'help' && (
            <div className="help">
              <h3>Flujo rápido</h3>
              <ol>
                <li>Elige <strong>Editar</strong> y haz clic en un texto.</li>
                <li>Reescribe; Origen mantiene tamaño y fuente.</li>
                <li>En <strong>Fuentes</strong>, descarga las tipografías del PDF.</li>
                <li>Pulsa <strong>Exportar PDF</strong> para guardar el original editado.</li>
              </ol>
              <p className="muted">
                Privacidad: el archivo no sale de tu dispositivo. Todo el proceso es local.
              </p>
            </div>
          )}
        </aside>

        <main className="canvas-wrap">
          <div className="page-nav">
            <button
              type="button"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((p) => p - 1)}
            >
              ←
            </button>
            <span>
              Página {pageIndex + 1} / {docState.pageCount}
            </span>
            <button
              type="button"
              disabled={pageIndex >= docState.pageCount - 1}
              onClick={() => setPageIndex((p) => p + 1)}
            >
              →
            </button>
          </div>

          <div
            className={`page-stage tool-${tool}`}
            style={{
              width: pageMeta ? pageMeta.width * scale : undefined,
              height: pageMeta ? pageMeta.height * scale : undefined,
            }}
            onClick={onCanvasClick}
          >
            <canvas ref={canvasRef} className="page-canvas" />

            {pageHighlights.map((h) => (
              <div
                key={h.id}
                className="hl-box"
                style={{
                  left: h.x * scale,
                  top: h.y * scale,
                  width: h.width * scale,
                  height: h.height * scale,
                  background: h.color,
                }}
              />
            ))}

            {pageItems.map((it) => {
              const family = cssFamilyForFont(it.baseFontName, docState.fonts)
              const active = selectedId === it.id
              const dirty = it.text !== it.original || !!it.isNew
              const showText = dirty || active
              return (
                <div
                  key={it.id}
                  className={`text-box ${active ? 'active' : ''} ${dirty ? 'dirty' : ''} ${showText ? 'show-text' : ''}`}
                  style={{
                    left: it.screenX,
                    top: it.screenY,
                    width: Math.max(it.screenWidth + (dirty ? it.fontSize * scale * 0.5 : 0), 24),
                    minHeight: it.screenHeight,
                    fontSize: Math.max(it.fontSize * scale * 0.92, 9),
                    fontFamily: family,
                    color: it.color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (tool === 'erase') {
                      updateItem(it.id, { deleted: true, text: '' })
                      return
                    }
                    setSelectedId(it.id)
                    setTool('edit')
                  }}
                >
                  {active && tool === 'edit' ? (
                    <textarea
                      autoFocus
                      value={it.text}
                      spellCheck={false}
                      onChange={(e) => updateItem(it.id, { text: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        /* keep selection */
                      }}
                      style={{
                        fontSize: Math.max(it.fontSize * scale * 0.92, 9),
                        fontFamily: family,
                        color: it.color,
                      }}
                    />
                  ) : (
                    <span className="text-ghost">{it.text}</span>
                  )}
                </div>
              )
            })}
          </div>
        </main>

        <aside className="side right inspector">
          <h3>Inspector</h3>
          {!selected && (
            <p className="muted">Selecciona un texto en la página para ver tipografía y posición.</p>
          )}
          {selected && (
            <div className="inspector-form">
              <label>
                Texto
                <textarea
                  value={selected.text}
                  rows={4}
                  onChange={(e) => updateItem(selected.id, { text: e.target.value })}
                />
              </label>
              <label>
                Fuente del documento
                <select
                  value={selected.baseFontName}
                  onChange={(e) =>
                    updateItem(selected.id, {
                      baseFontName: e.target.value,
                      fontName: e.target.value,
                    })
                  }
                >
                  <option value={selected.baseFontName}>{selected.baseFontName}</option>
                  {docState.fonts.map((f) => (
                    <option key={f.id} value={f.baseName}>
                      {f.baseName}
                    </option>
                  ))}
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times-Roman">Times-Roman</option>
                  <option value="Courier">Courier</option>
                </select>
              </label>
              <label>
                Tamaño
                <input
                  type="number"
                  min={4}
                  max={96}
                  step={0.5}
                  value={Number(selected.fontSize.toFixed(1))}
                  onChange={(e) =>
                    updateItem(selected.id, { fontSize: parseFloat(e.target.value) || 12 })
                  }
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={selected.color.startsWith('#') ? selected.color : '#111111'}
                  onChange={(e) => updateItem(selected.id, { color: e.target.value })}
                />
              </label>
              <div className="inspector-actions">
                <button type="button" className="btn ghost sm" onClick={deleteSelected}>
                  Eliminar texto
                </button>
                {docState.fonts.some(
                  (f) =>
                    f.baseName === selected.baseFontName ||
                    selected.baseFontName.includes(f.baseName),
                ) && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      const f = docState.fonts.find(
                        (x) =>
                          x.baseName === selected.baseFontName ||
                          selected.baseFontName.includes(x.baseName),
                      )
                      if (f) downloadFont(f.id)
                    }}
                  >
                    Descargar esta fuente
                  </button>
                )}
              </div>
              <dl className="meta-grid">
                <div>
                  <dt>Original</dt>
                  <dd>{selected.original || '—'}</dd>
                </div>
                <div>
                  <dt>PDF font</dt>
                  <dd>{selected.fontName}</dd>
                </div>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
