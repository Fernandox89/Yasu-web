# VoiceGuard · página

Front de **VoiceGuard** (HackMTY 2026, reto Altur): detecta si quien llama es una persona o una IA.

- **Analizar** (`index.html`): suelta un WAV, varios, una carpeta o un `.zip`. Si también sueltas el `manifest.csv`, compara cada resultado con su etiqueta.
- **Resultados** (`resultados.html`): historial de cada llamada analizada en ese navegador, con búsqueda, filtros (IA, humano, aciertos, fallos), orden por columna, lotes y descarga en CSV.
- **Dashboard** (`dashboard.html`): efectividad del modelo (`data/metricas.json`) y resumen de lo analizado en ese navegador.

El historial se guarda **solo en el navegador** (`localStorage`), sin audio: únicamente el resultado de cada llamada. Cuando exista la API con MongoDB, basta con cambiar `js/historial.js` para leer y guardar ahí.

Sitio publicado: https://fernandox89.github.io/voiceguard-web/

## Correrla en tu computadora

No hay nada que instalar ni compilar: es HTML, CSS y JavaScript. Desde la carpeta del repo, en Windows, Ubuntu o Arch:

```bash
python -m http.server 8000
```

Luego abre http://localhost:8000.

Abrir el HTML con doble clic no sirve para el dashboard: el navegador bloquea que la página lea `data/metricas.json` desde archivos locales.

## Modo local y modo API

| Modo | Cuándo | Qué hace |
|---|---|---|
| **Local** | `API_URL` vacío en `js/config.js` (hoy) | Decide en el navegador con la **latencia de quien llama**: detecta la voz de cada canal por energía y mide cuánto tarda en contestar al agente. **60/71 aciertos** en validación. El audio no sale del navegador |
| **API** | Con `API_URL` en `js/config.js`, o escrita en "Conexión con la API" | Manda cada WAV a la API y muestra lo que responde el modelo |

**Contrato que espera la página:**

```
POST {API_URL}/detect
Content-Type: application/json
{"audio_base64": "<WAV completo en base64>"}      ← el nombre del campo se cambia en CAMPO_AUDIO

Respuesta:
{"is_synthetic": true, "confidence": 0.87}
```

**Para que funcione desde GitHub Pages, la API debe:**
1. Ir por **HTTPS**. La página va por HTTPS y el navegador bloquea llamadas a direcciones HTTP.
2. Permitir **CORS** desde `https://fernandox89.github.io`. En FastAPI se hace con `CORSMiddleware`.

**MongoDB:** la página nunca se conecta directo a la base. Todo lo que está aquí es público, así que una contraseña en el JavaScript quedaría expuesta. La página habla con la API y la API con MongoDB.

## API en Railway

La página se queda en GitHub Pages. En Railway corre solo la API (`POST /detect`), con su propia dirección HTTPS (`https://ALGO.up.railway.app`).

- **Por qué Railway:** es de las plataformas que sugiere Altur, cada petición puede tardar hasta 5 minutos y no documenta límite de tamaño de cuerpo. Eso importa porque las llamadas del juez pesan hasta ~12 MB en base64.
- **Por qué no Vercel:** rechaza cuerpos de más de 4.5 MB.
- **Por qué un Dockerfile y no la detección automática de Railway:** el Dockerfile fija la versión de Python y el comando de arranque. Nadie necesita instalar Docker, porque Railway construye la imagen en sus servidores.

**Paso 1 · probar la infraestructura.** `deploy/Dockerfile` levanta el servidor de ejemplo de Altur, que responde con una decisión de relleno.

El servicio de Railway está conectado a este repo desde el panel. Cada push a `main` que toque `deploy/` o `railway.json` lo vuelve a construir. `railway.json` le dice a Railway qué hacer:

- `builder: DOCKERFILE` y `dockerfilePath: deploy/Dockerfile`: sin esto, Railway ve `index.html` y sirve la página como sitio estático, no la API.
- `watchPatterns`: los cambios que solo tocan la página no reconstruyen la API.
- `sleepApplication: false`: el servicio no se duerme. Uno dormido puede responder 502 a la primera petición del juez.
- `restartPolicyType: ALWAYS`: si el proceso se cae, Railway lo vuelve a levantar.

La dirección pública se crea una sola vez, en el panel: **Settings → Networking → Generate Domain**.

Para probar como lo hará el juez, desde una computadora con el dataset de Altur:

```bash
python scripts/check_endpoint.py --url https://ALGO.up.railway.app/detect --split val --n 20
```

**Paso 2 · API real.** Cuando exista `/detect` en el repo del equipo, se despliega desde ahí con su propio Dockerfile. Para que esta página la use, la API debe permitir CORS desde GitHub Pages (ver arriba) y hay que poner su dirección en `API_URL` de `js/config.js`.

## Actualizar el dashboard

Las gráficas salen de `data/metricas.json`. Cuando el modelo cambie, se actualiza ese archivo:

| Campo | Qué es |
|---|---|
| `val` | Aciertos, AUC, exactitud balanceada, Brier, matriz de confusión, curva ROC e histograma de probabilidades en validación |
| `val_rango` | Mínimo, máximo y media de aciertos repitiendo el entrenamiento con distintas particiones |
| `importancia` | Peso de cada rasgo en el modelo |
| `escenarios` | Aciertos de cada variante (`honesto: false` se pinta en gris) |
| `regla_local` | Resultados de la regla que usa el modo local |
| `notas` | Aclaraciones que se muestran abajo del dashboard |

Solo van totales. **Nunca** datos por llamada ni identificadores.

## Estructura

```
index.html          Analizar
resultados.html     Resultados (historial)
dashboard.html      Dashboard
css/estilos.css     Estilos (modo claro y oscuro, ancho completo)
js/config.js        Dirección de la API y parámetros de la regla local
js/wav.js           Lee WAV (PCM, μ-law, A-law), base64 y forma de onda
js/analisis.js      Modo local: voz por energía, latencia y decisión
js/historial.js     Guarda y lee el historial de llamadas (hoy en localStorage)
js/app.js           Página Analizar
js/resultados.js    Página Resultados
js/dashboard.js     Dashboard
data/metricas.json  Métricas del modelo
```

Librerías externas, cargadas desde jsDelivr: Chart.js para las gráficas y JSZip, que solo se descarga si sueltas un `.zip`.

## Datos del reto

Los audios, `manifest.csv` y `turns/` de Altur **no se suben**: no se pueden redistribuir. El `.gitignore` bloquea `*.wav`, `*.zip`, `manifest.csv`, `audio/` y `turns/`. Para la demo pública se usan audios propios, como los generados con ElevenLabs.
