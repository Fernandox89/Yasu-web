// Pestaña "Resultados": historial de llamadas analizadas en este navegador, con filtros, orden y CSV.
(function () {
  "use strict";

  const H = window.VGHistorial;
  const $ = (id) => document.getElementById(id);
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `${Math.round(x * 100)} %`;
  const fecha = (iso) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  const etiqueta = (esIA) => `<span class="etiqueta ${esIA ? "ia" : "humano"}">${esIA ? "IA" : "Humano"}</span>`;

  const ui = { filtro: "todas", texto: "", lote: "", orden: { col: "fecha", dir: -1 } };
  let registros = [];

  function cargar() {
    registros = H.leer();
    pintarLotes();
    pintar();
  }

  function pintar() {
    pintarKpis();
    pintarTabla();
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
    const tarjetas = [
      ["Analizadas", base.length, `${decididas.length} con decisión · ${base.length - decididas.length} sin decisión o error`],
      ["Dijo IA", ia, decididas.length ? `${pct(ia / decididas.length)} de las decididas` : "—"],
      ["Dijo humano", decididas.length - ia, decididas.length ? `${pct((decididas.length - ia) / decididas.length)} de las decididas` : "—"],
      ["Aciertos", conEtiqueta.length ? `${aciertos}/${conEtiqueta.length}` : "—",
        conEtiqueta.length ? `${pct(aciertos / conEtiqueta.length)} de las que tienen etiqueta` : "suelta el manifest.csv en Analizar para medirlo"],
    ];
    $("kpisRes").innerHTML = tarjetas.map(([titulo, valor, sub]) =>
      `<div class="tarjeta kpi"><span>${titulo}</span><b>${valor}</b><small>${escapar(sub)}</small></div>`).join("");
  }

  function pintarTabla() {
    const lista = ordenados(filtrados());
    $("tituloTabla").textContent = `Historial (${lista.length} de ${registros.length})`;
    $("btnCsv").disabled = !lista.length;
    $("btnBorrar").disabled = !registros.length;
    for (const th of document.querySelectorAll("th.ordenable")) {
      th.setAttribute("aria-sort", th.dataset.col === ui.orden.col ? (ui.orden.dir === 1 ? "ascending" : "descending") : "none");
    }

    if (!lista.length) {
      const texto = registros.length
        ? "Ninguna llamada coincide con la búsqueda o el filtro."
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
  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => {
      ui.filtro = chip.dataset.filtro;
      for (const c of document.querySelectorAll(".chip")) c.setAttribute("aria-pressed", String(c === chip));
      pintarTabla();
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
    H.descargarCsv(ordenados(filtrados()), `voiceguard_historial_${new Date().toISOString().slice(0, 10)}.csv`);
  });
  $("btnBorrar").addEventListener("click", () => {
    if (!confirm("¿Borrar todo el historial de llamadas de este navegador? No se puede deshacer.")) return;
    H.borrar();
    cargar();
  });

  // Si Analizar está abierta en otra pestaña, se actualiza solo
  window.addEventListener("storage", (e) => { if (e.key === H.CLAVE) cargar(); });

  cargar();
})();
