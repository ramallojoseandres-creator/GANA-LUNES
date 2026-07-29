# Origen — Editor PDF con fuentes originales

App web profesional para editar PDFs **manteniendo las tipografías del documento**.

## Qué hace

- Abre un PDF en el navegador (nada se sube a un servidor)
- Extrae fuentes embebidas (TTF/OTF) y permite **descargarlas** una a una o en ZIP
- Edita texto en su lugar, borra, resalta o añade líneas nuevas
- Exporta un PDF que cubre el texto anterior y redibuja con la fuente original cuando es posible

## Desarrollo

```bash
cd pdf-editor
npm install
npm run dev
```

Abre la URL que muestre Vite (normalmente http://127.0.0.1:5173).

## Build

```bash
cd pdf-editor
npm run build
npm run preview
```

La salida queda en `pdf-editor/dist/`.

## Stack

- React + TypeScript + Vite
- PDF.js (render + extracción de texto)
- pdf-lib (exportación)
- JSZip + FileSaver (pack de fuentes)
