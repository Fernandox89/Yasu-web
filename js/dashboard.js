// Pestaña "Dashboard": métricas del modelo (data/metricas.json) y resultados de la sesión en este navegador.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const pct = (x, d = 1) => `${(x * 100).toFixed(d)} %`;
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Marcas del eje solo de 0 a 1, aunque la escala tenga un pequeño margen
  const marcasCeroAUno = (eje) => { eje.ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => ({ value })); };
  const matrizHtml = (z) => `<div></div><div class="cab">Dijo IA</div><div class="cab">Dijo humano</div>
    <div class="cab">Era IA</div><div class="celda bien">${z.ia_bien}</div><div class="celda malc">${z.ia_como_humano}</div>
    <div class="cab">Era humano</div><div class="celda malc">${z.humano_como_ia}</div><div class="celda bien">${z.humano_bien}</div>`;

  pintarSesion();
  fetch("data/metricas.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(pintar)
    .catch((e) => {
      $("dsSub").textContent = "No se pudieron cargar las métricas.";
      $("kpis").innerHTML = `<div class="tarjeta">Error al leer <code>data/metricas.json</code> (${escapar(e.message)}). Si abriste el archivo con doble clic, sírvelo con <code>python -m http.server</code>.</div>`;
    });

  function pintar(m) {
    const v = m.val;
    $("dsSub").textContent = `${m.modelo.tipo} con ${m.modelo.rasgos} rasgos · entrenado con ${m.modelo.llamadas_entrenamiento} llamadas · probado con ${v.total} · actualizado ${m.actualizado}`;

    const rango = m.val_rango ? `En ${m.val_rango.particiones} particiones: ${m.val_rango.min}–${m.val_rango.max} (media ${m.val_rango.media})` : "";
    const kpis = [
      ["Aciertos", `${v.aciertos}/${v.total}`, `${pct(v.exactitud)} de exactitud`, rango],
      ["AUC", v.auc.toFixed(3), "1 = separa perfecto · 0.5 = azar", ""],
      ["Exactitud balanceada", pct(v.exactitud_balanceada), "promedio entre IAs y humanos", ""],
      ["Brier", v.brier.toFixed(3), "error de la confianza · 0 = perfecta", ""],
    ];
    $("kpis").innerHTML = kpis.map(([titulo, valor, sub, extra]) =>
      `<div class="tarjeta kpi"><span>${titulo}</span><b>${valor}</b><small>${sub}</small>${extra ? `<small>${escapar(extra)}</small>` : ""}</div>`).join("");

    const z = v.matriz;
    $("matriz").innerHTML = matrizHtml(z);
    $("matrizNota").textContent = `Detectó ${z.ia_bien} de ${z.ia_bien + z.ia_como_humano} IAs y reconoció ${z.humano_bien} de ${z.humano_bien + z.humano_como_ia} personas.`;

    $("detallesModelo").innerHTML = [
      ["Dataset", `${m.dataset.llamadas} llamadas (${m.dataset.humanas} humanas, ${m.dataset.ia} de IA)`],
      ["Train / val", `${m.dataset.train} / ${m.dataset.val}`],
      ["Árboles usados", m.modelo.arboles],
      ["Parámetros", Object.entries(m.modelo.parametros).map(([k, x]) => `${k}=${x}`).join(", ")],
      ["Regla local", m.regla_local ? `${m.regla_local.aciertos}/${v.total} aciertos · AUC ${m.regla_local.auc}` : "—"],
    ].map(([k, x]) => `<dt>${k}</dt><dd>${escapar(x)}</dd>`).join("");
    $("notas").innerHTML = (m.notas || []).map((n) => `<li>${escapar(n)}</li>`).join("");

    if (!window.Chart) {
      for (const id of ["gRoc", "gHist", "gImp", "gEsc"]) {
        $(id).parentElement.innerHTML = `<p class="suave">No se pudo cargar la librería de gráficas (¿sin internet?).</p>`;
      }
      return;
    }
    Chart.defaults.color = color("--texto-suave");
    Chart.defaults.borderColor = color("--borde");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const rejilla = { color: color("--borde") };
    const acento = color("--acento"), ia = color("--ia"), humano = color("--humano"), gris = color("--texto-suave");

    new Chart($("gRoc"), {
      type: "scatter",
      data: {
        datasets: [
          { label: "Modelo", data: v.roc.map(([x, y]) => ({ x, y })), showLine: true, borderColor: acento, backgroundColor: acento, pointRadius: 0, borderWidth: 2.5 },
          { label: "Azar", data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], showLine: true, borderColor: gris, borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        // Margen de 0.03 para que una curva pegada a los bordes (AUC cerca de 1) no quede tapada por los ejes
        scales: {
          x: { min: -0.03, max: 1.03, afterBuildTicks: marcasCeroAUno, title: { display: true, text: "Humanos marcados como IA" }, grid: rejilla },
          y: { min: -0.03, max: 1.03, afterBuildTicks: marcasCeroAUno, title: { display: true, text: "IAs detectadas" }, grid: rejilla },
        },
      },
    });

    const bordes = v.histograma.bordes;
    new Chart($("gHist"), {
      type: "bar",
      data: {
        labels: bordes.slice(0, -1).map((b, i) => `${Math.round(b * 100)}–${Math.round(bordes[i + 1] * 100)} %`),
        datasets: [
          { label: "Humanas", data: v.histograma.humanas, backgroundColor: humano },
          { label: "IA", data: v.histograma.ia, backgroundColor: ia },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Probabilidad de IA" }, grid: { display: false } },
          y: { title: { display: true, text: "Llamadas" }, grid: rejilla, ticks: { precision: 0 } },
        },
      },
    });

    new Chart($("gImp"), {
      type: "bar",
      data: {
        labels: m.importancia.map((r) => r.rasgo),
        datasets: [{ label: "Peso", data: m.importancia.map((r) => +(r.peso * 100).toFixed(1)), backgroundColor: acento }],
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.x} %` } } },
        scales: { x: { title: { display: true, text: "% de la ganancia total" }, grid: rejilla }, y: { grid: { display: false } } },
      },
    });

    new Chart($("gEsc"), {
      type: "bar",
      data: {
        labels: m.escenarios.map((e) => e.nombre),
        datasets: [{ label: "Aciertos", data: m.escenarios.map((e) => e.aciertos), backgroundColor: m.escenarios.map((e) => (e.honesto ? acento : gris)) }],
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.x} de ${v.total} (${pct(c.parsed.x / v.total)})` } } },
        scales: { x: { min: 0, max: v.total, title: { display: true, text: `Aciertos de ${v.total}` }, grid: rejilla }, y: { grid: { display: false } } },
      },
    });
  }

  function pintarSesion() {
    // Resumen del historial que guarda la pestaña Analizar (js/historial.js)
    const registros = window.VGHistorial ? window.VGHistorial.leer() : [];
    const decididas = registros.filter((r) => r.is_synthetic != null);
    const conEtiqueta = decididas.filter((r) => r.acierto != null);
    const matriz = { ia_bien: 0, ia_como_humano: 0, humano_bien: 0, humano_como_ia: 0 };
    for (const r of conEtiqueta) {
      const esIA = r.real === "synthetic";
      if (esIA && r.is_synthetic) matriz.ia_bien++;
      else if (esIA) matriz.ia_como_humano++;
      else if (r.is_synthetic) matriz.humano_como_ia++;
      else matriz.humano_bien++;
    }
    const ultimo = registros[registros.length - 1];
    const s = registros.length ? {
      modo: ultimo.modo, fecha: ultimo.fecha, analizadas: decididas.length,
      ia: decididas.filter((r) => r.is_synthetic).length, humanas: decididas.filter((r) => !r.is_synthetic).length,
      sin_decision: registros.filter((r) => r.is_synthetic == null && !r.error).length, errores: registros.filter((r) => r.error).length,
      con_etiqueta: conEtiqueta.length, aciertos: conEtiqueta.filter((r) => r.acierto).length, matriz,
    } : null;
    if (!s || !(s.analizadas || s.errores || s.sin_decision)) {
      $("sesion").innerHTML = `<p class="suave">Aún no hay llamadas analizadas en este navegador. Ve a <a href="index.html">Analizar</a> y suelta audios; si incluyes el <code>manifest.csv</code>, aquí verás cuántas acertó.</p>`;
      return;
    }
    let html = `<dl class="detalles">
      <dt>Modo</dt><dd>${s.modo === "api" ? "API (modelo)" : "Local (regla de latencia)"}</dd>
      <dt>Analizadas</dt><dd>${s.analizadas} (${s.ia} IA · ${s.humanas} humanas)</dd>
      ${s.sin_decision ? `<dt>Sin decisión</dt><dd>${s.sin_decision}</dd>` : ""}
      ${s.errores ? `<dt>Con error</dt><dd>${s.errores}</dd>` : ""}
      <dt>Última vez</dt><dd>${escapar(new Date(s.fecha).toLocaleString("es-MX"))}</dd>
    </dl>`;
    if (s.con_etiqueta) {
      html += `<p style="margin: 14px 0 8px"><b>${s.aciertos}/${s.con_etiqueta}</b> aciertos con etiqueta (${pct(s.aciertos / s.con_etiqueta)})</p>
        <div class="matriz">${matrizHtml(s.matriz)}</div>`;
    } else {
      html += `<p class="suave" style="margin-top: 12px">Sin etiquetas: suelta también el <code>manifest.csv</code> para medir aciertos.</p>`;
    }
    html += `<p style="margin: 14px 0 0"><a href="resultados.html">Ver cada llamada en Resultados →</a></p>`;
    $("sesion").innerHTML = html;
  }
})();
