// Lectura de archivos WAV en el navegador: cabecera, muestras por canal, base64 y resumen para dibujar.
(function (raiz) {
  "use strict";

  const FORMATOS = { 1: "PCM", 3: "float", 6: "A-law", 7: "μ-law" };

  function texto(buffer, inicio, n) {
    return String.fromCharCode(...new Uint8Array(buffer, inicio, n));
  }

  // Lee la cabecera: formato, canales, frecuencia, bits, duración y dónde empiezan los datos.
  function leerWav(buffer) {
    if (buffer.byteLength < 12 || texto(buffer, 0, 4) !== "RIFF" || texto(buffer, 8, 4) !== "WAVE") {
      throw new Error("No es un archivo WAV (falta la cabecera RIFF/WAVE)");
    }
    const v = new DataView(buffer);
    let fmt = null, datos = null, o = 12;
    while (o + 8 <= buffer.byteLength && !(fmt && datos)) {
      const id = texto(buffer, o, 4), tam = v.getUint32(o + 4, true), ini = o + 8;
      if (id === "fmt ") {
        let formato = v.getUint16(ini, true);
        if (formato === 0xfffe && tam >= 40) formato = v.getUint16(ini + 24, true);   // WAVE_FORMAT_EXTENSIBLE
        fmt = { formato, canales: v.getUint16(ini + 2, true), sr: v.getUint32(ini + 4, true),
                bloque: v.getUint16(ini + 12, true), bits: v.getUint16(ini + 14, true) };
      } else if (id === "data") {
        datos = { inicio: ini, bytes: Math.min(tam, buffer.byteLength - ini) };
      }
      o = ini + tam + (tam % 2);
    }
    if (!fmt || !datos) throw new Error("WAV incompleto: falta el bloque fmt o data");
    const muestras = Math.floor(datos.bytes / fmt.bloque);
    return { ...fmt, nombreFormato: FORMATOS[fmt.formato] || `código ${fmt.formato}`, muestras,
             duracion: muestras / fmt.sr, datos };
  }

  // Avisos si el audio no tiene la forma que pide el reto.
  function revisarFormato(info) {
    const avisos = [];
    if (info.canales !== 2) avisos.push(`Se esperaba estéreo (2 canales) y tiene ${info.canales}.`);
    if (info.sr !== 8000) avisos.push(`Se esperaba 8000 Hz y tiene ${info.sr} Hz.`);
    return avisos;
  }

  function ulaw(u) {
    u = ~u & 0xff;
    const signo = u & 0x80, exp = (u >> 4) & 0x07, man = u & 0x0f;
    const m = (((man << 3) + 0x84) << exp) - 0x84;
    return (signo ? -m : m) / 32768;
  }
  function alaw(a) {
    a ^= 0x55;
    const signo = a & 0x80, exp = (a >> 4) & 0x07, man = a & 0x0f;
    const m = exp === 0 ? (man << 4) + 8 : ((man << 4) + 0x108) << (exp - 1);
    return (signo ? m : -m) / 32768;
  }
  const TABLA_ULAW = Float32Array.from({ length: 256 }, (_, i) => ulaw(i));
  const TABLA_ALAW = Float32Array.from({ length: 256 }, (_, i) => alaw(i));

  // Devuelve un Float32Array por canal con valores entre -1 y 1.
  function decodificar(buffer, info) {
    const { canales: nc, muestras, bits, formato } = info;
    const salida = Array.from({ length: nc }, () => new Float32Array(muestras));
    const ini = info.datos.inicio;
    if (formato === 1 && bits === 16 && ini % 2 === 0) {                              // caso del reto: rápido
      const pcm = new Int16Array(buffer, ini, muestras * nc);
      for (let i = 0; i < muestras; i++) for (let c = 0; c < nc; c++) salida[c][i] = pcm[i * nc + c] / 32768;
      return salida;
    }
    const v = new DataView(buffer), paso = info.bloque / nc;
    const leer = formato === 1 && bits === 16 ? (o) => v.getInt16(o, true) / 32768
      : formato === 1 && bits === 8 ? (o) => (v.getUint8(o) - 128) / 128
      : formato === 1 && bits === 24 ? (o) => (v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608
      : formato === 1 && bits === 32 ? (o) => v.getInt32(o, true) / 2147483648
      : formato === 3 && bits === 32 ? (o) => v.getFloat32(o, true)
      : formato === 3 && bits === 64 ? (o) => v.getFloat64(o, true)
      : formato === 7 ? (o) => TABLA_ULAW[v.getUint8(o)]
      : formato === 6 ? (o) => TABLA_ALAW[v.getUint8(o)]
      : null;
    if (!leer) throw new Error(`Formato no soportado: ${info.nombreFormato} de ${bits} bits`);
    for (let i = 0, o = ini; i < muestras; i++) for (let c = 0; c < nc; c++, o += paso) salida[c][i] = leer(o);
    return salida;
  }

  // WAV completo en base64, por pedazos para no saturar la memoria.
  function aBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    if (typeof btoa !== "function") return Buffer.from(bytes).toString("base64");
    let binario = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binario);
  }

  // Mínimo y máximo por columna de píxeles, escalados al pico del canal.
  function resumenOnda(x, puntos) {
    const min = new Float32Array(puntos), max = new Float32Array(puntos);
    let pico = 1e-9;
    for (let i = 0; i < x.length; i++) pico = Math.max(pico, Math.abs(x[i]));
    const porPunto = x.length / puntos;
    for (let p = 0; p < puntos; p++) {
      let a = 1, b = -1;
      const fin = Math.min(x.length, Math.floor((p + 1) * porPunto));
      for (let i = Math.floor(p * porPunto); i < fin; i++) { if (x[i] < a) a = x[i]; if (x[i] > b) b = x[i]; }
      min[p] = a > b ? 0 : a / pico;
      max[p] = a > b ? 0 : b / pico;
    }
    return { min, max };
  }

  const api = { leerWav, revisarFormato, decodificar, aBase64, resumenOnda };
  raiz.VGWav = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
