// Modo local: decide en el navegador con la latencia de quien llama, sin mandar el audio a ningún lado.
// 1) En cada canal busca la voz por energía: tramas de 256 ms cada 64 ms, voz si está a menos de 30 dB
//    del momento más fuerte del canal; pausas menores a 0.5 s se unen (igual que src/tools/vad.py del equipo).
// 2) Latencia = cuando el agente termina y quien llama empieza a hablar; se usa la mediana.
// 3) Probabilidad de IA con una curva calibrada en train (ver REGLA_LOCAL en js/config.js).
(function (raiz) {
  "use strict";

  const TRAMA_S = 0.256, SALTO_S = 0.064, TOP_DB = 30, MAX_PAUSA_S = 0.5;
  const LATENCIA_MIN_S = -3, LATENCIA_MAX_S = 8;

  // Tramos de voz [inicio_s, fin_s] de un canal.
  function tramosVoz(x, sr) {
    const trama = Math.round(TRAMA_S * sr), salto = Math.round(SALTO_S * sr);
    if (x.length < trama) return [];
    const n = 1 + Math.floor((x.length - trama) / salto);
    const acumulado = new Float64Array(x.length + 1);
    for (let i = 0; i < x.length; i++) acumulado[i + 1] = acumulado[i] + x[i] * x[i];
    const rms = new Float64Array(n);
    let maximo = 0;
    for (let i = 0; i < n; i++) {
      rms[i] = Math.sqrt((acumulado[i * salto + trama] - acumulado[i * salto]) / trama);
      if (rms[i] > maximo) maximo = rms[i];
    }
    if (maximo <= 0) return [];

    const crudos = [];
    let inicio = -1;
    for (let i = 0; i < n; i++) {
      const voz = 20 * Math.log10(Math.max(rms[i], 1e-12) / maximo) > -TOP_DB;
      if (voz && inicio < 0) inicio = i;
      if (!voz && inicio >= 0) { crudos.push([inicio * salto / sr, (i * salto + trama) / sr]); inicio = -1; }
    }
    if (inicio >= 0) crudos.push([inicio * salto / sr, Math.min(x.length, n * salto + trama) / sr]);

    const unidos = [];
    for (const [a, b] of crudos) {
      const ultimo = unidos[unidos.length - 1];
      if (ultimo && a - ultimo[1] < MAX_PAUSA_S) ultimo[1] = Math.max(ultimo[1], b);
      else unidos.push([a, b]);
    }
    return unidos;
  }

  function mediana(valores) {
    const s = [...valores].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Mediana de lo que tarda quien llama (canal 0) en hablar después de que termina el agente (canal 1).
  function latenciaMediana(tramosLlama, tramosAgente) {
    const eventos = tramosLlama.map(([a, b]) => [a, b, 0]).concat(tramosAgente.map(([a, b]) => [a, b, 1]))
      .sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const latencias = [];
    for (let i = 1; i < eventos.length; i++) {
      if (eventos[i - 1][2] === 1 && eventos[i][2] === 0) latencias.push(eventos[i][0] - eventos[i - 1][1]);
    }
    return latencias.length ? mediana(latencias) : null;
  }

  // Misma forma de respuesta que la API ({is_synthetic, confidence}) más datos para mostrar.
  function reglaLocal(canales, sr, regla) {
    if (canales.length < 2) {
      return { is_synthetic: null, confidence: null, latencia_mediana_s: null, turnos_llamador: null, turnos_agente: null,
               modo: "local", nota: "El modo local necesita audio estéreo: canal 0 = quien llama, canal 1 = agente." };
    }
    const tramosLlama = tramosVoz(canales[0], sr), tramosAgente = tramosVoz(canales[1], sr);
    const latencia = latenciaMediana(tramosLlama, tramosAgente);
    const base = { latencia_mediana_s: latencia, turnos_llamador: tramosLlama.length, turnos_agente: tramosAgente.length, modo: "local" };
    if (latencia === null) {
      return { ...base, is_synthetic: null, confidence: null, nota: "No se encontró ninguna respuesta de quien llama después del agente." };
    }
    const acotada = Math.min(Math.max(latencia, LATENCIA_MIN_S), LATENCIA_MAX_S);
    const probIA = 1 / (1 + Math.exp(-(acotada - regla.umbral_s) / regla.escala_s));
    return { ...base, is_synthetic: probIA >= 0.5, confidence: Math.max(probIA, 1 - probIA), prob_ia: probIA };
  }

  const api = { tramosVoz, latenciaMediana, reglaLocal };
  raiz.VGAnalisis = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
