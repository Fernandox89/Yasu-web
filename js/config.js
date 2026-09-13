// Configuración de la página. Para conectar la API solo hay que tocar este archivo
// (o escribir la dirección en "Conexión con la API", que se guarda solo en ese navegador).
// En el servidor de Vultr la página y la API viven juntas: se usa la misma dirección de la página.
// En GitHub Pages, en localhost o abriendo el archivo directo, no hay API y se usa el modo local.
const VG_MISMO_SERVIDOR = !location.hostname.endsWith("github.io") && !["localhost", "127.0.0.1", ""].includes(location.hostname);

window.VG_CONFIG = {
  // Dirección de la API, sin "/" al final. Vacío = modo local.
  API_URL: VG_MISMO_SERVIDOR ? location.origin : "",
  RUTA_DETECT: "/detect",

  // Igual que el juez: si la API tarda más, cuenta como respuesta incorrecta.
  TIEMPO_LIMITE_S: 30,

  // Nombre del campo con el WAV en base64 en el JSON que se manda a la API (por confirmar con quien la haga).
  CAMPO_AUDIO: "audio_base64",

  // Cuántos audios se analizan a la vez.
  PROCESOS_EN_PARALELO: 2,

  // Modo local: curva calibrada con train (277 llamadas) y medida en validación (71 llamadas).
  REGLA_LOCAL: { umbral_s: 1.2, escala_s: 2.95, aciertos_val: "60/71" },
};
