# Manual de mantenimiento — Ganadores.io (hosting estático)

Guía sencilla para entender qué es cada pieza, qué subir al hosting y qué hacer cuando algo falla.

---

## 1. ¿Qué es el “bundle”?

El **bundle** es el archivo JavaScript compilado que hace funcionar toda la web:

| Archivo | Qué es |
|---------|--------|
| `assets/index-DZfj7dy3.js` | **El bundle.** Toda la app (React): casino, deportes, hipismo, login, boleta, etc. Viene minificado en una sola línea gigante. |
| `assets/index-DlklJDrC.css` | Estilos base del build original (Ant Design, layout). |
| `assets/ganadores-deportes.css` | Estilos extra que añadimos (Stake + Royal para deportes/hipismo). |
| `index.html` | Página que carga esos archivos. |
| `.htaccess` | Reglas del servidor para que rutas como `/deportes` no den 404 (SPA). |

**Analogía:** `index.html` es la puerta; el **bundle** es el motor entero de la web empaquetado en un solo `.js`.

No edites el bundle a mano. Si hay que cambiar la UI de deportes/hipismo, se usan los scripts en `scripts/` (ver sección 5).

---

## 2. ¿Qué subo al hosting?

Sube **toda la carpeta** tal cual, manteniendo la estructura:

```
ganadores-web-lista (1)/
├── index.html
├── .htaccess
├── assets/
│   ├── index-DZfj7dy3.js
│   ├── index-DlklJDrC.css
│   └── ganadores-deportes.css
├── images/
├── dino-assets/
└── (resto de carpetas)
```

**Importante:** el hosting debe ser Apache (o compatible con `.htaccess`). Sin `.htaccess`, al entrar directo a `/deportes` verás 404; hay que entrar primero por `/` o configurar rewrite en el panel.

El zip de despliegue (si te lo generaron) se llama algo como:
`ganadores-web-lista-DEPLOY-YYYYMMDD.zip` en tu carpeta **Downloads**.

---

## 3. De dónde salen los datos (deportes y caballos)

La web **no** trae cuotas dentro del bundle. Lee todo desde **Supabase**:

- URL: `https://kpdcerqbifimiouboqtm.supabase.co`
- Tabla: `live_odds`

Quién **escribe** en esa tabla:

| Origen | Qué sincroniza |
|--------|----------------|
| **Railway** (`112233` en Downloads) | Deportes Altenar/Triunfo + **caballos** BetPredator, cada ~5 min |
| Script local viejo (`ganadores-odds`) | Solo si lo tienes corriendo en la Mac (ya no hace falta si Railway está activo) |

Si en la web no hay partidos o caballos, **casi siempre** el problema es Supabase vacío o el cron de Railway parado — no el bundle roto.

---

## 4. Síntomas y qué hacer

### Pantalla en blanco al abrir la web

1. Abre la consola del navegador (F12 → Consola).
2. Si ves `SyntaxError` o `Illegal return` → el bundle JS está corrupto.
3. **Solución:** restaurar el bundle bueno desde un zip de backup y volver a aplicar el parche (sección 5).

Comprobar en terminal:

```bash
cd "/Users/joseramallo/Downloads/ganadores-web-lista (1)"
node --check assets/index-DZfj7dy3.js
```

- Sin salida = OK  
- Error = bundle roto

---

### `/deportes` da 404 en el servidor

- Falta `.htaccess` o el hosting no lo soporta.
- En local con `python3 -m http.server` es normal: entra por `http://127.0.0.1:8766/` y navega con los botones.
- En producción, sube `.htaccess` o activa “rewrite a index.html” en cPanel.

---

### Deportes cargan pero caballos no / cuotas viejas

1. Revisa Supabase → tabla `live_odds` → filtra `sport = horses`.
2. Si no hay filas nuevas, revisa **Railway** (proyecto `112233`):
   ```bash
   cd ~/Downloads/112233
   node scripts/sync-horses.mjs
   ```
3. Si falla login BetPredator o captcha, es tema del script en Railway, no del hosting.

---

### Cambiaste el bundle por uno nuevo de un build de Vite

Cuando regeneres la app desde el repo fuente (`pruebasabado-main` o similar), el nombre del JS puede cambiar (ej. `index-XXXXX.js`). Entonces:

1. Actualiza `index.html` con el nuevo nombre del `.js`.
2. Vuelve a ejecutar el parche Stake (sección 5).
3. Comprueba con `node --check`.

---

## 5. Reparar o reaplicar el parche del bundle

Los cambios de UI deportes/hipismo viven en:

```
scripts/
├── nq-source.js          → Página deportes + hipismo (componente NQ)
├── wq-mq-source.js         → Boleta (wQ) + nav móvil (KQ)
├── patch-stake-ui.mjs      → Inserta lo anterior en el bundle
└── patch-deportes-ui.mjs   → Parche viejo; ya NO hace falta si usas nq-source.js
```

### Procedimiento estándar (bundle roto o build nuevo)

```bash
cd "/Users/joseramallo/Downloads/ganadores-web-lista (1)"

# 1) Restaurar bundle limpio (backup en zip)
unzip -p "../ganadores-web-lista (1).zip" "assets/index-DZfj7dy3.js" \
  > assets/index-DZfj7dy3.js

# 2) Aplicar parche Stake/Royal
node scripts/patch-stake-ui.mjs

# 3) Verificar sintaxis
node --check assets/index-DZfj7dy3.js && echo "OK"

# 4) Probar en local
python3 -m http.server 8766
# Abrir http://127.0.0.1:8766/ → Deportes
```

### Errores que ya conocemos (no repetir)

| Error | Causa | Evitar |
|-------|--------|--------|
| URLs rotas `fetch(\`https:` | Minificador que borraba `//` | Ya corregido en `patch-stake-ui.mjs` |
| `MQ already declared` | Nav móvil se llamaba `MQ` (choca con Ant Design) | El nav móvil se llama **`KQ`** |

---

## 6. Probar en local antes de subir

```bash
cd "/Users/joseramallo/Downloads/ganadores-web-lista (1)"
python3 -m http.server 8766
```

- Home: http://127.0.0.1:8766/
- Deportes: entra desde el menú (no escribas `/deportes` a mano en local sin rewrite)

Checklist rápido:

- [ ] Home carga (no pantalla blanca)
- [ ] Deportes muestra partidos y cuotas
- [ ] Hipismo muestra carreras W/P/S
- [ ] Nav inferior visible en móvil
- [ ] Boleta abre al pulsar cuota

---

## 7. Mapa de carpetas del proyecto

| Carpeta / repo | Para qué sirve |
|----------------|----------------|
| **GitHub:** `ramallojoseandres-creator/GANA-LUNES` | Código del sitio (clonar en otra PC con Cursor) |
| Este proyecto (`GANA-LUNES`) | **Lo que subes al hosting** |
| `Downloads/112233` | Cron Railway → Supabase (deportes + caballos) |
| `ganadores-odds` (repo viejo) | Scraper local antiguo; no es lo de Railway |
| `Downloads/pruebasabado-main` | Código fuente React (si algún día recompilas) |

### Clonar en otra PC

```powershell
git clone https://github.com/ramallojoseandres-creator/GANA-LUNES.git
cd GANA-LUNES
cursor .
npm run serve
```

Ver también `README.md` en la raíz del repo.

---

## 8. Contacto rápido con Cursor / IA

Si algo crashea, dile al asistente:

1. Qué ves (pantalla blanca, sin caballos, 404, etc.)
2. Si corriste `node --check` y qué error dio
3. Si Supabase tiene datos en `live_odds`
4. Si Railway está desplegado

Y pide: *“Restaura el bundle desde el zip y reaplica patch-stake-ui”* si la consola muestra `SyntaxError`.

---

*Última actualización: junio 2026 — parche Stake/Royal, nav móvil `KQ`, sync caballos en Railway.*
