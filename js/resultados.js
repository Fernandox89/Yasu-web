// Pestaña "Resultados": historial de llamadas analizadas, con filtros, orden y CSV.
// Dos fuentes: "Este navegador" (localStorage) y "Todo el equipo" (lo que guardó la API en MongoDB,
// leído desde el servicio del historial en HISTORIAL_URL de js/config.js).
(function () {
  "use strict";

  const H = window.VGHistorial;
  const C = window.VG_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `${Math.round(x * 100)} %`;
  const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—");
  const etiqueta = (esIA) => `<span class="etiqueta ${esIA ? "ia" : "humano"}">${esIA ? "IA" : "Humano"}</span>`;

  const CLAVE_FUENTE = "vg_resultados_fuente";
  const URL_HISTORIAL = String(C.HISTORIAL_URL || "").trim().replace(/\/+$/, "");
  const LIMITE_EQUIPO = 1000;

  function fuenteGuardada() {
    try {
      return localStorage.getItem(CLAVE_FUENTE) === "equipo" && URL_HISTORIAL ? "equipo" : "local";
    } catch (e) {
      return "local";
    }
  }

  const ui = { fuente: fuenteGuardada(), filtro: "todas", texto: "", lote: "", orden: { col: "fecha", dir: -1 } };
  const equipo = { cargando: false, error: "", total: 0 };
  let registros = [];
  let peticion = 0;   // si se cambia de fuente mientras carga, se ignora la respuesta vieja

  async function cargar() {
    const esta = ++peticion;
    pintarFuente();
    if (ui.fuente === "equipo") {
      registros = [];
      Object.assign(equipo, { cargando: true, error: "", total: 0 });
      pintarLotes();
      pintar();
      try {
        const lista = await leerEquipo();
        if (esta !== peticion) return;
        registros = lista;
      } catch (e) {
        if (esta !== peticion) return;
        equipo.error = e.name === "TimeoutError" ? "el servicio tardó demasiado"
          : e instanceof TypeError ? "no se pudo conectar con el servicio del historial" : e.message;
      }
      equipo.cargando = false;
    } else {
      registros = H.leer();
    }
    pintarLotes();
    pintar();
  }

  // Lo que guardó la API en MongoDB, con la misma forma que los registros de este navegador
  async function leerEquipo() {
    const r = await fetch(`${URL_HISTORIAL}/historial?limite=${LIMITE_EQUIPO}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`el servicio respondió ${r.status}`);
    const j = await r.json();
    equipo.total = j.total || 0;
    return (j.llamadas || []).map((l) => ({
      fecha: l.fecha, lote: "", archivo: l.call_id || "(sin nombre)",
      duracion_s: null, canales: null, sr: null,
      is_synthetic: l.is_synthetic, confidence: l.confidence, latencia_mediana_s: l.latencia_mediana_s,
      turnos_llamador: null, turnos_agente: null, real: null, acierto: null, modo: "api", error: null,
    }));
  }

  function pintar() {
    pintarKpis();
    pintarTabla();
  }

  function pintarFuente() {
    const esEquipo = ui.fuente === "equipo";
    for (const b of document.querySelectorAll(".chip[data-fuente]")) b.setAttribute("aria-pressed", String(b.dataset.fuente === ui.fuente));
    $("subtituloRes").innerHTML = esEquipo
      ? "Llamadas que la API guardó en la base de datos, de todo el equipo."
      : `Todo lo que se ha analizado desde la pestaña <a href="index.html">Analizar</a> en este navegador.`;
    $("avisoRes").innerHTML = esEquipo
      ? `<span aria-hidden="true">🗄️</span><div>Se muestran las <b>${LIMITE_EQUIPO} más recientes</b> como máximo. Solo lectura: desde aquí no se borra nada. La base no guarda duración, turnos ni la etiqueta real. Vuelve a tocar <b>Todo el equipo</b> para actualizar.</div>`
      : `<span aria-hidden="true">💾</span><div>El historial de este navegador se guarda <b>solo aquí</b> y no se sube a ningún lado. Lo que se analiza con la API también queda en la base de datos: elige <b>Todo el equipo</b> para verlo.</div>`;
    $("selLote").style.display = esEquipo ? "none" : "";
    $("btnBorrar").style.display = esEquipo ? "none" : "";
    if (esEquipo) ui.lote = "";
  }

  // Cada vez que se sueltan audios en Analizar se crea un lote.
  function pintarLotes() {
    const inicio = new Map(), cuantos = new Map();
    for (const r of registros) {
      if (!inicio.has(r.lote) || r.fecha < inicio.get(r.lote)) inicio.set(r.lote, r.fecha);
      cuantos.set(r.lote, (cuantos.get(r.lote) || 0) + 1);
    }
    const lotes = [...inicio.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1));
    if (ui.lote && !inicio.has(ui.lote)) ui.lote = "";
    $("selLote").innerHTML = `<option value="">Todos los lotes (${lotes.length})</option>` +
      lotes.map(([lote, f]) => `<option value="${escapar(lote)}">${escapar(fecha(f))} · ${cuantos.get(lote)} llamada(s)</option>`).join("");
    $("selLote").value = ui.lote;
  }

  const delLote = () => registros.filter((r) => !ui.lote || r.lote === ui.lote);

  function filtrados() {
    const texto = ui.texto.trim().toLowerCase();
    return delLote().filter((r) => {
      if (texto && !r.archivo.toLowerCase().includes(texto)) return false;
      switch (ui.filtro) {
        case "ia": return r.is_synthetic === true;
        case "humano": return r.is_synthetic === false;
        case "aciertos": return r.acierto === true;
        case "fallos": return r.acierto === false;
        case "sin": return r.is_synthetic == null;
        default: return true;
      }
    });
  }

  function ordenados(lista) {
    const { col, dir } = ui.orden;
    const valor = (r) => (col === "resultado" ? H.textoResultado(r) : r[col]);
    return [...lista].sort((a, b) => {
      const x = valor(a), y = valor(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;           // los vacíos siempre al final
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }

  function pintarKpis() {
    const base = delLote();
    const decididas = base.filter((r) => r.is_synthetic != null);
    const ia = decididas.filter((r) => r.is_synthetic).length;
    const conEtiqueta = decididas.filter((r) => r.acierto != null);
    const aciertos = conEtiqueta.filter((r) => r.acierto).length;
    const sinEtiqueta = ui.fuente === "equipo" ? "la base no guarda la etiqueta real" : "suelta el manifest.csv en Analizar para medirlo";
    const tarjetas = [
      ["Analizadas", base.length, `${decididas.length} con decisión · ${base.length - decididas.length} sin decisión o error`],
      ["Dijo IA", ia, decididas.length ? `${pct(ia / decididas.length)} de las decididas` : "—"],
      ["Dijo humano", decididas.length - ia, decididas.length ? `${pct((decididas.length - ia) / decididas.length)} de las decididas` : "—"],
      ["Aciertos", conEtiqueta.length ? `${aciertos}/${conEtiqueta.length}` : "—",
        conEtiqueta.length ? `${pct(aciertos / conEtiqueta.length)} de las que tienen etiqueta` : sinEtiqueta],
    ];
    $("kpisRes").innerHTML = tarjetas.map(([titulo, valor, sub]) =>
      `<div class="tarjeta kpi"><span>${titulo}</span><b>${valor}</b><small>${escapar(sub)}</small></div>`).join("");
  }

  function pintarTabla() {
    const esEquipo = ui.fuente === "equipo";
    const lista = ordenados(filtrados());
    const enBase = esEquipo && equipo.total > registros.length ? ` · ${equipo.total} en la base` : "";
    $("tituloTabla").textContent = `${esEquipo ? "Historial del equipo" : "Historial"} (${lista.length} de ${registros.length}${enBase})`;
    $("btnCsv").disabled = !lista.length;
    $("btnBorrar").disabled = esEquipo || !registros.length;
    for (const th of document.querySelectorAll("th.ordenable")) {
      th.setAttribute("aria-sort", th.dataset.col === ui.orden.col ? (ui.orden.dir === 1 ? "ascending" : "descending") : "none");
    }

    if (!lista.length) {
      let texto;
      if (esEquipo && equipo.cargando) texto = "Cargando el historial del equipo…";
      else if (esEquipo && equipo.error) texto = `No se pudo leer el historial del equipo: ${escapar(equipo.error)}.`;
      else if (registros.length) texto = "Ninguna llamada coincide con la búsqueda o el filtro.";
      else texto = esEquipo
        ? "Todavía no hay llamadas guardadas en la base de datos."
        : `Todavía no hay llamadas analizadas. Ve a <a href="index.html">Analizar</a> y suelta audios.`;
      $("filasRes").innerHTML = `<tr><td colspan="11" class="vacio">${texto}</td></tr>`;
      return;
    }

    $("filasRes").innerHTML = lista.map((r) => {
      const resultado = r.is_synthetic == null
        ? `<span class="${r.error ? "mal" : "suave"}" title="${escapar(r.error || "")}">${r.error ? "error" : "sin decisión"}</span>`
        : etiqueta(r.is_synthetic);
      const confianza = r.is_synthetic != null && r.confidence != null
        ? `<span class="barra-mini"><i style="width: ${Math.round(r.confidence * 100)}%"></i></span>${pct(r.confidence)}`
        : "—";
      const acierto = r.acierto == null ? "" : r.acierto ? `<span class="ok" title="Acertó">✓</span>` : `<span class="mal" title="Falló">✗</span>`;
      return `<tr>
        <td>${escapar(fecha(r.fecha))}</td>
        <td>${escapar(r.archivo)}</td>
        <td>${r.duracion_s != null ? `${r.duracion_s.toFixed(1)} s` : "—"}</td>
        <td>${r.canales != null ? `${r.canales} can · ${r.sr} Hz` : "—"}</td>
        <td>${resultado}</td>
        <td>${confianza}</td>
        <td>${r.latencia_mediana_s != null ? `${r.latencia_mediana_s.toFixed(2)} s` : "—"}</td>
        <td>${r.turnos_llamador != null ? `${r.turnos_llamador} / ${r.turnos_agente}` : "—"}</td>
        <td>${r.real ? etiqueta(r.real === "synthetic") : `<span class="suave">—</span>`}</td>
        <td>${acierto}</td>
        <td>${r.modo === "api" ? "API" : "local"}</td>
      </tr>`;
    }).join("");
  }

  // ---------- Controles ----------
  $("buscar").addEventListener("input", (e) => { ui.texto = e.target.value; pintarTabla(); });
  $("selLote").addEventListener("change", (e) => { ui.lote = e.target.value; pintar(); });
  for (const chip of document.querySelectorAll(".chip[data-filtro]")) {
    chip.addEventListener("click", () => {
      ui.filtro = chip.dataset.filtro;
      for (const c of document.querySelectorAll(".chip[data-filtro]")) c.setAttribute("aria-pressed", String(c === chip));
      pintarTabla();
    });
  }
  for (const boton of document.querySelectorAll(".chip[data-fuente]")) {
    if (boton.dataset.fuente === "equipo" && !URL_HISTORIAL) {
      boton.disabled = true;
      boton.title = "Falta HISTORIAL_URL en js/config.js";
    }
    boton.addEventListener("click", () => {
      ui.fuente = boton.dataset.fuente;
      try { localStorage.setItem(CLAVE_FUENTE, ui.fuente); } catch (e) { /* navegador sin almacenamiento */ }
      cargar();
    });
  }
  for (const th of document.querySelectorAll("th.ordenable")) {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      ui.orden = { col, dir: ui.orden.col === col ? -ui.orden.dir : col === "fecha" ? -1 : 1 };
      pintarTabla();
    });
  }
  $("btnCsv").addEventListener("click", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    H.descargarCsv(ordenados(filtrados()), `voiceguard_historial_${ui.fuente === "equipo" ? "equipo_" : ""}${hoy}.csv`);
  });
  $("btnBorrar").addEventListener("click", () => {
    if (!confirm("¿Borrar todo el historial de llamadas de este navegador? No se puede deshacer.")) return;
    H.borrar();
    cargar();
  });

  // Si Analizar está abierta en otra pestaña, se actualiza solo
  window.addEventListener("storage", (e) => { if (e.key === H.CLAVE && ui.fuente === "local") cargar(); });

  cargar();
})();
