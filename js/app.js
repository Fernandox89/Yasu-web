// Página "Analizar": recibe audios (archivos, carpetas o .zip), los analiza y muestra el resultado.
(function () {
  "use strict";

  const C = window.VG_CONFIG, W = window.VGWav, A = window.VGAnalisis;
  const $ = (id) => document.getElementById(id);
  const CLAVE_API = "vg_api_url";
  const H = window.VGHistorial;   // historial que muestra la pestaña Resultados
  const estado = { items: [], etiquetas: new Map(), seleccionado: null, corriendo: false };

  // ---------- Utilidades ----------
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const leerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardarLocal = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* navegador sin almacenamiento */ } };
  const mensaje = (t) => { $("mensaje").textContent = t; };
  const pct = (x) => `${Math.round(x * 100)} %`;
  const etiquetaReal = (it) => estado.etiquetas.get(it.nombre.replace(/\.wav$/i, "")) || null;

  // "local" guardado en el navegador fuerza el modo local aunque config.js tenga API_URL.
  function urlApi() {
    const guardada = leerLocal(CLAVE_API);
    if (guardada === "local") return "";
    return (guardada || C.API_URL || "").trim().replace(/\/+$/, "");
  }

  function pintarModo() {
    const url = urlApi();
    if (url) {
      const mixto = location.protocol === "https:" && url.startsWith("http:");
      $("avisoModo").innerHTML = `<span aria-hidden="true">🔌</span><div><span class="modo">Modo API</span> · cada audio se manda a <code>${escapar(url + C.RUTA_DETECT)}</code> y responde el modelo.${mixto ? " <b>Ojo:</b> esta página va por HTTPS y la API por HTTP; el navegador bloqueará la llamada. La API necesita HTTPS." : ""}</div>`;
    } else {
      $("avisoModo").innerHTML = `<span aria-hidden="true">💻</span><div><span class="modo">Modo local</span> · la API aún no está conectada. El audio <b>no sale de tu navegador</b>: se decide con la latencia de quien llama (${escapar(C.REGLA_LOCAL.aciertos_val)} aciertos en validación). El modelo completo responde cuando se conecte la API.</div>`;
    }
    $("inApi").value = url;
  }

  // ---------- Entrada de archivos ----------
  const zona = $("zona");
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("activa"); }));
  ["dragleave", "dragend"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("activa")));
  zona.addEventListener("drop", async (e) => {
    e.preventDefault();
    zona.classList.remove("activa");
    recibir(await archivosDeArrastre(e.dataTransfer));
  });
  zona.addEventListener("click", (e) => { if (!e.target.closest("button")) $("inArchivos").click(); });
  zona.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("inArchivos").click(); } });
  $("btnArchivos").addEventListener("click", () => $("inArchivos").click());
  $("btnCarpeta").addEventListener("click", () => $("inCarpeta").click());
  for (const id of ["inArchivos", "inCarpeta"]) {
    $(id).addEventListener("change", (e) => { recibir([...e.target.files]); e.target.value = ""; });
  }
  // Si sueltan un archivo fuera de la zona, que el navegador no lo abra
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  // Archivos sueltos o carpetas completas (se recorren por dentro).
  async function archivosDeArrastre(dt) {
    const entradas = [...(dt.items || [])].map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entradas.length) return [...dt.files];
    const archivos = [];
    const recorrer = async (entrada) => {
      if (entrada.isFile) { archivos.push(await new Promise((ok, mal) => entrada.file(ok, mal))); return; }
      const lector = entrada.createReader();
      for (;;) {
        const lote = await new Promise((ok, mal) => lector.readEntries(ok, mal));
        if (!lote.length) break;
        for (const e of lote) await recorrer(e);
      }
    };
    for (const e of entradas) await recorrer(e);
    return archivos;
  }

  async function recibir(archivos) {
    const nuevos = [];
    let manifiestos = 0;
    try {
      for (const f of archivos) {
        const n = f.name.toLowerCase();
        if (n.endsWith(".wav")) nuevos.push({ nombre: f.name, leer: () => f.arrayBuffer() });
        else if (n.endsWith(".csv")) { if (leerManifiesto(await f.text())) manifiestos++; }
        else if (n.endsWith(".zip")) {
          const contenido = await abrirZip(f);
          nuevos.push(...contenido.wavs);
          for (const t of contenido.csvs) if (leerManifiesto(t)) manifiestos++;
        }
      }
    } catch (err) {
      mensaje(`No se pudo leer: ${err.message}`);
      return;
    }

    if (manifiestos) H.actualizarEtiquetas(estado.etiquetas);   // por si los audios ya estaban en el historial

    if (!nuevos.length) {
      mensaje(manifiestos ? `Etiquetas cargadas (${estado.etiquetas.size}). Ahora suelta los audios.` : "No encontré archivos .wav.");
      if (manifiestos) { repintarTabla(); actualizarResumen(); }
      return;
    }
    const lote = Date.now().toString(36);   // todo lo que se suelta junto forma un lote
    for (const n of nuevos) estado.items.push({ id: estado.items.length, lote, ...n, estado: "en cola" });
    mensaje(`${nuevos.length} audio(s) agregados${estado.etiquetas.size ? ` · ${estado.etiquetas.size} etiquetas del manifest` : ""}.`);
    $("lote").classList.remove("oculto");
    repintarTabla();
    if (nuevos.length === 1) seleccionar(estado.items[estado.items.length - 1]);
    procesarCola();
  }

  // manifest.csv del dataset: anon_id -> label (human / synthetic)
  function leerManifiesto(textoCsv) {
    const lineas = textoCsv.trim().split(/\r?\n/);
    const cabecera = (lineas.shift() || "").split(",").map((s) => s.trim());
    const iId = cabecera.indexOf("anon_id"), iEtiqueta = cabecera.indexOf("label");
    if (iId < 0 || iEtiqueta < 0) return false;
    for (const linea of lineas) {
      const c = linea.split(",");
      if (c[iId] && c[iEtiqueta]) estado.etiquetas.set(c[iId].trim(), c[iEtiqueta].trim());
    }
    return true;
  }

  // .zip: se abre con JSZip (se descarga solo si hace falta) y cada audio se descomprime al analizarlo.
  let promesaJSZip = null;
  function cargarJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!promesaJSZip) {
      promesaJSZip = new Promise((ok, mal) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
        s.onload = () => ok(window.JSZip);
        s.onerror = () => { promesaJSZip = null; mal(new Error("no se pudo cargar el lector de .zip (¿sin internet?)")); };
        document.head.appendChild(s);
      });
    }
    return promesaJSZip;
  }
  async function abrirZip(archivo) {
    mensaje(`Abriendo ${archivo.name}… (con el dataset completo es más rápido soltar la carpeta descomprimida)`);
    const zip = await (await cargarJSZip()).loadAsync(archivo);
    const wavs = [], csvs = [];
    for (const [ruta, entrada] of Object.entries(zip.files)) {
      if (entrada.dir || ruta.includes("__MACOSX/")) continue;
      const nombre = ruta.split("/").pop(), n = nombre.toLowerCase();
      if (n.endsWith(".wav")) wavs.push({ nombre, leer: () => entrada.async("arraybuffer") });
      else if (n.endsWith(".csv")) csvs.push(await entrada.async("string"));
    }
    return { wavs, csvs };
  }

  // ---------- Análisis ----------
  async function procesarCola() {
    if (estado.corriendo) return;
    estado.corriendo = true;
    const siguiente = () => {
      const it = estado.items.find((i) => i.estado === "en cola");
      if (it) { it.estado = "analizando"; repintarFila(it); }
      return it;
    };
    const trabajador = async () => {
      for (let it = siguiente(); it; it = siguiente()) {
        await analizar(it);
        if (!H.agregar(registroDe(it))) mensaje("No se pudo guardar el historial en este navegador.");
        repintarFila(it);
        actualizarResumen();
        if (it === estado.seleccionado) pintarDetalle(it);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, C.PROCESOS_EN_PARALELO) }, trabajador));
    estado.corriendo = false;
    actualizarResumen();
  }

  async function analizar(it) {
    try {
      const buffer = await it.leer();
      it.info = W.leerWav(buffer);
      it.avisos = W.revisarFormato(it.info);
      const url = urlApi();
      it.resultado = url
        ? await llamarApi(url, buffer, it)
        : A.reglaLocal(W.decodificar(buffer, it.info), it.info.sr, C.REGLA_LOCAL);
      it.estado = "listo";
    } catch (err) {
      it.estado = "error";
      it.error = err.message || String(err);
    }
  }

  // Misma petición y mismas reglas que el juez de Altur (scripts/check_endpoint.py).
  async function llamarApi(url, buffer, it) {
    const limite = (C.TIEMPO_LIMITE_S || 30) * 1000;
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), limite);
    let respuesta, j;
    try {
      respuesta = await fetch(url + C.RUTA_DETECT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: it.nombre.replace(/\.wav$/i, ""),
          [C.CAMPO_AUDIO]: W.aBase64(buffer),
          sample_rate: it.info.sr,
          channels: it.info.canales,
        }),
        signal: control.signal,
      });
      if (!respuesta.ok) throw new Error(`la API respondió HTTP ${respuesta.status} (el juez lo cuenta como incorrecta)`);
      j = await respuesta.json();
    } catch (e) {
      if (e.name === "AbortError") throw new Error(`la API no respondió en ${limite / 1000} s (el juez lo cuenta como incorrecta)`);
      if (e instanceof SyntaxError) throw new Error("la respuesta de la API no es JSON");
      if (e.message.startsWith("la API")) throw e;
      throw new Error("no se pudo conectar con la API (revisa la dirección, HTTPS y CORS)");
    } finally {
      clearTimeout(reloj);
    }
    if (!j || typeof j.is_synthetic !== "boolean") throw new Error("la respuesta de la API no trae is_synthetic booleano");
    if (j.confidence != null && !(typeof j.confidence === "number" && j.confidence >= 0 && j.confidence <= 1)) {
      throw new Error("confidence debe ser un número entre 0 y 1");
    }
    return { is_synthetic: j.is_synthetic, confidence: typeof j.confidence === "number" ? j.confidence : null, modo: "api" };
  }

  // Lo que se guarda en el historial por cada llamada (sin audio: solo el resultado)
  function registroDe(it) {
    const r = it.resultado || {}, info = it.info, real = etiquetaReal(it);
    const decidido = it.estado === "listo" && r.is_synthetic != null;
    return {
      id: `${it.lote}-${it.id}`, lote: it.lote, fecha: new Date().toISOString(), archivo: it.nombre,
      duracion_s: info ? +info.duracion.toFixed(2) : null, canales: info ? info.canales : null, sr: info ? info.sr : null,
      is_synthetic: decidido ? r.is_synthetic : null,
      confidence: decidido && r.confidence != null ? +r.confidence.toFixed(4) : null,
      latencia_mediana_s: r.latencia_mediana_s != null ? +r.latencia_mediana_s.toFixed(3) : null,
      turnos_llamador: r.turnos_llamador ?? null, turnos_agente: r.turnos_agente ?? null,
      real, acierto: real && decidido ? (real === "synthetic") === r.is_synthetic : null,
      modo: r.modo || (urlApi() ? "api" : "local"), error: it.error || null,
    };
  }

  // ---------- Tabla ----------
  function celdas(it) {
    const r = it.resultado, i = it.info, real = etiquetaReal(it);
    const etiqueta = (esIA) => `<span class="etiqueta ${esIA ? "ia" : "humano"}">${esIA ? "IA" : "Humano"}</span>`;
    let resultado;
    if (it.estado === "listo") resultado = r.is_synthetic === null ? `<span class="suave">sin decisión</span>` : etiqueta(r.is_synthetic);
    else if (it.estado === "error") resultado = `<span class="mal" title="${escapar(it.error)}">error</span>`;
    else resultado = `<span class="suave">${it.estado}…</span>`;
    const decidido = it.estado === "listo" && r.is_synthetic !== null;
    const acierto = real && decidido
      ? ((real === "synthetic") === r.is_synthetic ? `<span class="ok" title="Acertó">✓</span>` : `<span class="mal" title="Falló">✗</span>`)
      : "";
    return `<td>${escapar(it.nombre)}</td>
      <td>${i ? `${i.duracion.toFixed(1)} s` : "—"}</td>
      <td>${i ? `${i.canales} can · ${i.sr} Hz` : "—"}</td>
      <td>${resultado}</td>
      <td>${decidido && r.confidence != null ? pct(r.confidence) : "—"}</td>
      <td>${r && r.latencia_mediana_s != null ? `${r.latencia_mediana_s.toFixed(2)} s` : "—"}</td>
      <td>${real ? etiqueta(real === "synthetic") : `<span class="suave">—</span>`}</td>
      <td>${acierto}</td>`;
  }
  function repintarTabla() {
    $("filas").innerHTML = estado.items.map((it) => `<tr data-id="${it.id}">${celdas(it)}</tr>`).join("");
    marcarSeleccion();
  }
  function repintarFila(it) {
    const tr = $("filas").querySelector(`tr[data-id="${it.id}"]`);
    if (tr) tr.innerHTML = celdas(it);
  }
  $("filas").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) seleccionar(estado.items[Number(tr.dataset.id)]);
  });

  function actualizarResumen() {
    const total = estado.items.length;
    const listos = estado.items.filter((i) => i.estado === "listo");
    const errores = estado.items.filter((i) => i.estado === "error").length;
    const hechos = listos.length + errores;
    $("barraProgreso").style.width = total ? `${(100 * hechos) / total}%` : "0";
    $("loteTitulo").textContent = `Resultados (${hechos}/${total})`;

    const decididos = listos.filter((i) => i.resultado.is_synthetic !== null);
    const ia = decididos.filter((i) => i.resultado.is_synthetic).length;
    const conEtiqueta = decididos.filter((i) => etiquetaReal(i));
    const matriz = { ia_bien: 0, ia_como_humano: 0, humano_bien: 0, humano_como_ia: 0 };
    for (const it of conEtiqueta) {
      const esIA = etiquetaReal(it) === "synthetic", dijoIA = it.resultado.is_synthetic;
      if (esIA && dijoIA) matriz.ia_bien++;
      else if (esIA) matriz.ia_como_humano++;
      else if (dijoIA) matriz.humano_como_ia++;
      else matriz.humano_bien++;
    }
    const aciertos = matriz.ia_bien + matriz.humano_bien;

    let texto = `${decididos.length} decididas: ${ia} IA y ${decididos.length - ia} humanas`;
    if (listos.length > decididos.length) texto += ` · ${listos.length - decididos.length} sin decisión`;
    if (errores) texto += ` · ${errores} con error`;
    if (conEtiqueta.length) texto += ` · con etiqueta: ${aciertos}/${conEtiqueta.length} aciertos (${pct(aciertos / conEtiqueta.length)})`;
    $("resumenLote").textContent = total ? texto : "";
    $("btnExportar").disabled = !listos.length;
  }

  // ---------- Detalle de una llamada ----------
  function seleccionar(it) {
    estado.seleccionado = it;
    marcarSeleccion();
    pintarDetalle(it);
  }
  function marcarSeleccion() {
    for (const tr of $("filas").querySelectorAll("tr[data-id]")) {
      tr.classList.toggle("seleccionada", !!estado.seleccionado && Number(tr.dataset.id) === estado.seleccionado.id);
    }
  }

  let ultimoDibujo = 0;
  async function pintarDetalle(it) {
    $("detalle").classList.remove("oculto");
    $("detNombre").textContent = it.nombre;
    const r = it.resultado, info = it.info, v = $("detVeredicto");
    const decidido = it.estado === "listo" && r.is_synthetic !== null;
    if (decidido) {
      v.className = `veredicto ${r.is_synthetic ? "ia" : "humano"}`;
      v.textContent = r.is_synthetic ? "Es IA" : "Es humano";
    } else {
      v.className = "veredicto pendiente";
      v.textContent = it.estado === "listo" ? "Sin decisión" : it.estado === "error" ? "Error" : "Analizando…";
    }
    const conf = decidido && r.confidence != null ? r.confidence : null;
    $("detConf").style.width = conf == null ? "0" : `${Math.round(conf * 100)}%`;
    $("detConfTexto").textContent = conf == null ? "Confianza —" : `Confianza ${pct(conf)} · ${r.modo === "local" ? "regla local" : "modelo"}`;
    $("detLat").textContent = r && r.latencia_mediana_s != null ? `${r.latencia_mediana_s.toFixed(2)} s` : "—";
    $("detTurnos").textContent = r && r.turnos_llamador != null ? `${r.turnos_llamador} / ${r.turnos_agente}` : "—";
    $("detFormato").textContent = info ? `${info.duracion.toFixed(1)} s · ${info.canales} canal(es) · ${info.sr} Hz · ${info.nombreFormato} ${info.bits} bits` : "";
    const avisos = [...(it.avisos || []), ...(it.error ? [it.error] : []), ...(r && r.nota ? [r.nota] : [])];
    $("detAvisos").innerHTML = avisos.map((a) => `<div class="aviso" style="margin-top: 12px"><span aria-hidden="true">⚠️</span><div>${escapar(a)}</div></div>`).join("");

    const turno = ++ultimoDibujo, lienzo = $("detOnda");
    if (!info) { prepararLienzo(lienzo); return; }
    try {
      const canales = W.decodificar(await it.leer(), info);
      if (turno === ultimoDibujo) dibujarOnda(lienzo, canales, info.sr);
    } catch (e) {
      prepararLienzo(lienzo);
    }
  }

  function prepararLienzo(lienzo) {
    const dpr = window.devicePixelRatio || 1, ancho = lienzo.clientWidth || 800, alto = lienzo.clientHeight || 170;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    const ctx = lienzo.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    return { ctx, ancho, alto };
  }

  // Dos filas (canal 0 arriba, canal 1 abajo), cada una escalada a su pico, con la voz detectada de fondo.
  function dibujarOnda(lienzo, canales, sr) {
    const { ctx, ancho, alto } = prepararLienzo(lienzo);
    const css = getComputedStyle(document.documentElement), color = (v) => css.getPropertyValue(v).trim();
    const colores = [color("--humano"), color("--texto-suave")];
    const filas = Math.min(2, canales.length), altoFila = alto / filas, segundos = canales[0].length / sr;
    for (let c = 0; c < filas; c++) {
      const y0 = altoFila * c, centro = y0 + altoFila / 2, amplitud = altoFila / 2 - 6;
      ctx.fillStyle = color("--acento-suave");
      for (const [a, b] of A.tramosVoz(canales[c], sr)) {
        const x0 = (a / segundos) * ancho, x1 = (b / segundos) * ancho;
        ctx.fillRect(x0, y0 + 3, Math.max(1, x1 - x0), altoFila - 6);
      }
      const { min, max } = W.resumenOnda(canales[c], Math.max(1, Math.floor(ancho)));
      ctx.strokeStyle = colores[c];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let p = 0; p < min.length; p++) {
        ctx.moveTo(p + 0.5, centro - max[p] * amplitud);
        ctx.lineTo(p + 0.5, centro - min[p] * amplitud + 0.5);
      }
      ctx.stroke();
    }
    if (filas === 2) {
      ctx.strokeStyle = color("--borde");
      ctx.beginPath();
      ctx.moveTo(0, altoFila);
      ctx.lineTo(ancho, altoFila);
      ctx.stroke();
    }
  }

  // ---------- Botones ----------
  $("btnExportar").addEventListener("click", () => {
    const cabecera = ["archivo", "duracion_s", "canales", "sr", "is_synthetic", "confidence", "latencia_mediana_s", "real", "acierto", "modo", "error"];
    const filas = estado.items.map((it) => {
      const r = it.resultado || {}, real = etiquetaReal(it);
      const acierto = real && r.is_synthetic != null ? (real === "synthetic") === r.is_synthetic : "";
      return [it.nombre, it.info ? it.info.duracion.toFixed(2) : "", it.info ? it.info.canales : "", it.info ? it.info.sr : "",
              r.is_synthetic ?? "", r.confidence != null ? r.confidence.toFixed(4) : "",
              r.latencia_mediana_s != null ? r.latencia_mediana_s.toFixed(3) : "", real || "", acierto, r.modo || "", it.error || ""];
    });
    const csv = [cabecera, ...filas].map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    enlace.download = `voiceguard_resultados_${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  });

  $("btnLimpiar").addEventListener("click", () => {
    if (estado.corriendo) { mensaje("Espera a que termine el análisis en curso."); return; }
    estado.items = [];
    estado.seleccionado = null;
    $("filas").innerHTML = "";
    $("lote").classList.add("oculto");
    $("detalle").classList.add("oculto");
    mensaje("");
    actualizarResumen();
  });

  $("btnGuardarApi").addEventListener("click", () => {
    const valor = $("inApi").value.trim();
    if (valor && !/^https?:\/\/\S+$/i.test(valor)) { mensaje("La dirección debe empezar con http:// o https://"); return; }
    guardarLocal(CLAVE_API, valor || null);
    pintarModo();
    mensaje(valor ? "API guardada en este navegador." : "Se usará la dirección de config.js (si tiene).");
  });
  $("btnQuitarApi").addEventListener("click", () => {
    guardarLocal(CLAVE_API, "local");
    pintarModo();
    mensaje("Modo local activado en este navegador.");
  });

  // Acceso desde la consola del navegador, útil para probar sin arrastrar archivos:
  //   VoiceGuard.analizarBuffer(arrayBuffer, "llamada.wav")
  //   VoiceGuard.recibir([archivoWav, archivoManifest])
  window.VoiceGuard = {
    estado,
    recibir,
    analizarBuffer: (buffer, nombre = "audio.wav") => recibir([new File([buffer], nombre, { type: "audio/wav" })]),
  };

  pintarModo();
})();
