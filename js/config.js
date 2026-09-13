// Configuración de la página. Para conectar la API solo hay que tocar este archivo
// (o escribir la dirección en "Conexión con la API", que se guarda solo en ese navegador).
// La API corre en Railway, aparte de la página. Con API_URL vacío se usa el modo local.

window.VG_CONFIG = {
  // Dirección de la API en Railway, sin "/" al final. Vacío = modo local.
  API_URL: "https://voiceguard-web-production.up.railway.app",
  RUTA_DETECT: "/detect",

  // Servicio aparte que lee de MongoDB lo que guardó la API (Resultados → Todo el equipo). Vacío = sin historial del equipo.
  HISTORIAL_URL: "https://voiceguard-historial-production.up.railway.app",

  // Igual que el juez: si la API tarda más, cuenta como respuesta incorrecta.
  TIEMPO_LIMITE_S: 30,

  // Nombre del campo con el WAV en base64 en el JSON que se manda a la API (por confirmar con quien la haga).
  CAMPO_AUDIO: "audio_base64",

  // Cuántos audios se analizan a la vez.
  PROCESOS_EN_PARALELO: 2,

  // Modo local: curva calibrada con train (277 llamadas) y medida en validación (71 llamadas).
  REGLA_LOCAL: { umbral_s: 1.2, escala_s: 2.95, aciertos_val: "60/71" },
};
