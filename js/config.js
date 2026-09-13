// Configuración de la página. Para conectar la API solo hay que tocar este archivo
// (o escribir la dirección en "Conexión con la API", que se guarda solo en ese navegador).
window.VG_CONFIG = {
  // Dirección de la API, sin "/" al final. Vacío = modo local.
  // Si la página está en GitHub Pages (HTTPS), la API también debe ir por HTTPS y permitir CORS.
  API_URL: "",
  RUTA_DETECT: "/detect",

  // Nombre del campo con el WAV en base64 en el JSON que se manda a la API (por confirmar con quien la haga).
  CAMPO_AUDIO: "audio_base64",

  // Cuántos audios se analizan a la vez.
  PROCESOS_EN_PARALELO: 2,

  // Modo local: curva calibrada con train (277 llamadas) y medida en validación (71 llamadas).
  REGLA_LOCAL: { umbral_s: 1.2, escala_s: 2.95, aciertos_val: "60/71" },
};
