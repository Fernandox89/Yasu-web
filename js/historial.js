// Historial de llamadas analizadas. Se guarda solo en este navegador (localStorage), no se sube a ningún lado.
// Cuando exista la API con la base de datos, este es el único archivo que hay que cambiar para leer y escribir ahí.
(function (raiz) {
  "use strict";

  const CLAVE = "vg_historial_v1";
  const MAXIMO = 5000;   // registros guardados como máximo (los más viejos se descartan)

  function leer() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE) || "[]");
      return Array.isArray(datos) ? datos : [];
    } catch (e) {
      return [];
    }
  }

  function guardar(registros) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(registros.slice(-MAXIMO)));
      return true;
    } catch (e) {
      return false;   // navegador sin almacenamiento o sin espacio
    }
  }

  function agregar(registro) {
    const registros = leer();
    registros.push(registro);
    return guardar(registros);
  }

  // Si el manifest.csv llega después de los audios, completa la etiqueta real y el acierto.
  function actualizarEtiquetas(etiquetas) {
    const registros = leer();
    let cambios = 0;
    for (const r of registros) {
      const real = etiquetas.get(r.archivo.replace(/\.wav$/i, ""));
      if (real && r.real !== real) {
        r.real = real;
        r.acierto = r.is_synthetic == null ? null : (real === "synthetic") === r.is_synthetic;
        cambios++;
      }
    }
    if (cambios) guardar(registros);
    return cambios;
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (e) { /* nada que borrar */ }
  }

  const COLUMNAS_CSV = ["fecha", "lote", "archivo", "duracion_s", "canales", "sr", "resultado", "is_synthetic", "confidence",
                        "latencia_mediana_s", "turnos_llamador", "turnos_agente", "real", "acierto", "modo", "error"];

  function textoResultado(r) {
    if (r.is_synthetic == null) return r.error ? "error" : "sin decisión";
    return r.is_synthetic ? "IA" : "Humano";
  }

  function descargarCsv(registros, nombreArchivo) {
    const valor = (r, c) => (c === "resultado" ? textoResultado(r) : r[c] ?? "");
    const csv = [COLUMNAS_CSV, ...registros.map((r) => COLUMNAS_CSV.map((c) => valor(r, c)))]
      .map((fila) => fila.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));   // ﻿: acentos bien en Excel
    enlace.download = nombreArchivo;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  }

  raiz.VGHistorial = { CLAVE, leer, agregar, actualizarEtiquetas, borrar, textoResultado, descargarCsv };
})(window);
