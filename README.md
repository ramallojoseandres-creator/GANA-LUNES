# GANA-LUNES (Ganadores.io)

Sitio estático: casino, deportes, hipismo y panel admin. Backend en Supabase.

**Repositorio:** https://github.com/ramallojoseandres-creator/GANA-LUNES

---

## Origen — Editor PDF

App en `pdf-editor/`: edita PDFs preservando (y descargando) las fuentes originales.

```bash
npm run pdf:dev      # desarrollo
npm run pdf:build    # build de producción → pdf-editor/dist
```

Detalles: [pdf-editor/README.md](pdf-editor/README.md)

---

## Otra PC con Cursor (inicio rápido)

### 1. Requisitos

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18 o superior
- [Cursor](https://cursor.com/)

### 2. Clonar y abrir

```powershell
git clone https://github.com/ramallojoseandres-creator/GANA-LUNES.git
cd GANA-LUNES
cursor .
```

En Mac/Linux usa `cursor .` o **File → Open Folder** en Cursor.

### 3. Probar en local

```powershell
npm run serve
```

Abre http://127.0.0.1:8766/ y navega con el menú (no escribas `/deportes` a mano en local).

Alternativa sin npm:

```powershell
python -m http.server 8766
```

### 4. Editar UI (deportes, boleta, admin)

No edites `assets/index-DZfj7dy3.js` a mano. Cambia los fuentes en `scripts/` y aplica parches:

```powershell
npm run patch
npm run check
```

| Archivo | Qué modifica |
|---------|----------------|
| `scripts/nq-source.js` | Página deportes + hipismo |
| `scripts/wq-mq-source.js` | Boleta y nav móvil |
| `scripts/admin-source.js` | Panel `/admin` |
| `scripts/patch-stake-ui.mjs` | Inserta deportes/boleta en el bundle |
| `scripts/patch-admin.mjs` | Inserta admin en el bundle |

Estilos custom: `assets/ganadores-deportes.css` y bloque inline en `index.html`.

### 5. Supabase (admin y apuestas)

Ejecuta en **Supabase → SQL Editor**:

`supabase/admin-dashboard.sql`

Solo la primera vez o cuando se actualicen las funciones RPC.

### 6. Subir al hosting

Sube toda la carpeta (incluye `.htaccess`). Archivos críticos:

- `index.html`
- `assets/index-DZfj7dy3.js`
- `assets/ganadores-deportes.css`
- `.htaccess`

### 7. Git (guardar cambios)

```powershell
git add .
git commit -m "Describe tu cambio"
git push
```

---

Guía detallada de mantenimiento: [MANUAL-MANTENIMIENTO.md](MANUAL-MANTENIMIENTO.md)
