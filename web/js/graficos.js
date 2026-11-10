"use strict";

/**
 * Gráficos em SVG, gerados a partir dos dados reais do app.
 * Sem bibliotecas externas: funcionam offline e acompanham o tema.
 */
window.Fin = window.Fin || {};

(function (Fin) {
  const WIDTH = 640;
  const HEIGHT = 240;

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function compact(value) {
    const number = Number(value) || 0;
    const absolute = Math.abs(number);
    if (absolute >= 1000000) return `${(number / 1000000).toFixed(1).replace(".", ",")}M`;
    if (absolute >= 1000) return `${(number / 1000).toFixed(1).replace(".", ",")}k`;
    return String(Math.round(number));
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 100;
    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const scaled = value / base;
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return step * base;
  }

  /** Caminho suavizado (Catmull-Rom -> Bézier) para a linha do tempo. */
  function smoothPath(points, tension = 0.18) {
    if (points.length < 2) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index - 1] || points[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[index + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) * tension;
      const c1y = p1.y + (p2.y - p0.y) * tension;
      const c2x = p2.x - (p3.x - p1.x) * tension;
      const c2y = p2.y - (p3.y - p1.y) * tension;
      path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return path;
  }

  function emptyMessage(container, message) {
    container.innerHTML = `<div class="chart-empty"><span class="chart-empty-icon" aria-hidden="true">▤</span><p>${escapeXml(message)}</p></div>`;
  }

  /**
   * Linha/área.
   * points: [{ label, value }]
   */
  function line(container, { points, color = "#10b981", format = compact, emptyText = "Sem dados no período." }) {
    if (!container) return;
    if (!Array.isArray(points) || points.length < 2) {
      emptyMessage(container, emptyText);
      return;
    }

    const padding = { top: 18, right: 14, bottom: 28, left: 46 };
    const innerWidth = WIDTH - padding.left - padding.right;
    const innerHeight = HEIGHT - padding.top - padding.bottom;
    const values = points.map((point) => Number(point.value) || 0);
    const max = niceMax(Math.max(...values, 0));
    const min = Math.min(...values, 0);
    const span = max - min || 1;

    const xFor = (index) => padding.left + (innerWidth * index) / (points.length - 1);
    const yFor = (value) => padding.top + innerHeight - ((value - min) / span) * innerHeight;

    const coordinates = points.map((point, index) => ({
      x: xFor(index),
      y: yFor(Number(point.value) || 0),
    }));

    const gridLines = [0, 0.5, 1].map((ratio) => {
      const value = min + span * (1 - ratio);
      const y = padding.top + innerHeight * ratio;
      return `<line x1="${padding.left}" x2="${WIDTH - padding.right}" y1="${y}" y2="${y}" class="chart-grid" />
        <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${escapeXml(format(value))}</text>`;
    });

    const labelIndexes = points.length <= 4
      ? points.map((_, index) => index)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    const xLabels = labelIndexes
      .map(
        (index) =>
          `<text x="${xFor(index)}" y="${HEIGHT - 8}" text-anchor="middle" class="chart-axis">${escapeXml(points[index].label)}</text>`,
      )
      .join("");

    const path = smoothPath(coordinates);
    const area = `${path} L ${coordinates[coordinates.length - 1].x} ${padding.top + innerHeight} L ${coordinates[0].x} ${padding.top + innerHeight} Z`;
    const gradientId = `grad-${Math.random().toString(36).slice(2, 8)}`;

    const dots = coordinates
      .map((coordinate, index) => {
        const point = points[index];
        return `<circle cx="${coordinate.x}" cy="${coordinate.y}" r="4" class="chart-dot" style="stroke:${color}">
          <title>${escapeXml(point.label)}: ${escapeXml(Fin.core.money(point.value))}</title>
        </circle>`;
      })
      .join("");

    container.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Gráfico de linha" class="chart-svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      <path d="${area}" fill="url(#${gradientId})" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${xLabels}
    </svg>`;
  }

  /**
   * Barras agrupadas.
   * labels: string[]; series: [{ name, color, values: number[] }]
   */
  function bars(container, { labels, series, height = 240, format = compact, emptyText = "Sem dados no período." }) {
    if (!container) return;
    if (!Array.isArray(labels) || labels.length === 0 || !Array.isArray(series) || series.length === 0) {
      emptyMessage(container, emptyText);
      return;
    }

    const chartHeight = height || HEIGHT;
    const padding = { top: 18, right: 14, bottom: 30, left: 46 };
    const innerWidth = WIDTH - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;
    const max = niceMax(Math.max(...series.flatMap((entry) => entry.values.map((value) => Number(value) || 0))));
    const groupWidth = innerWidth / labels.length;
    const totalBars = series.length;
    const barWidth = Math.min(26, (groupWidth * 0.62) / totalBars);
    const gap = 4;

    const gridLines = [0, 0.5, 1].map((ratio) => {
      const y = padding.top + innerHeight * ratio;
      const value = max * (1 - ratio);
      return `<line x1="${padding.left}" x2="${WIDTH - padding.right}" y1="${y}" y2="${y}" class="chart-grid" />
        <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${escapeXml(format(value))}</text>`;
    });

    const groups = labels
      .map((label, index) => {
        const center = padding.left + groupWidth * index + groupWidth / 2;
        const start = center - (totalBars * barWidth + (totalBars - 1) * gap) / 2;
        const barsMarkup = series
          .map((entry, seriesIndex) => {
            const value = Number(entry.values[index]) || 0;
            const barHeight = max > 0 ? (value / max) * innerHeight : 0;
            const x = start + seriesIndex * (barWidth + gap);
            const y = padding.top + innerHeight - barHeight;
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(barHeight, 0.8).toFixed(2)}" rx="4" fill="${entry.color}" class="chart-bar">
              <title>${escapeXml(label)} · ${escapeXml(entry.name)}: ${escapeXml(Fin.core.money(value))}</title>
            </rect>`;
          })
          .join("");
        return `${barsMarkup}<text x="${center}" y="${chartHeight - 9}" text-anchor="middle" class="chart-axis">${escapeXml(label)}</text>`;
      })
      .join("");

    container.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${chartHeight}" role="img" aria-label="Gráfico de barras" class="chart-svg">
      ${gridLines.join("")}
      ${groups}
    </svg>`;
  }

  /**
   * Rosca de despesas por categoria.
   * slices: [{ label, value, color }]
   */
  function donut(container, { slices, total, centerLabel = "Total", format = Fin.core.money, emptyText = "Sem despesas no período." }) {
    if (!container) return;
    const valid = (slices || []).filter((slice) => Number(slice.value) > 0);
    const sum = Number(total) || valid.reduce((accumulator, slice) => accumulator + Number(slice.value), 0);

    const size = 220;
    const radius = 82;
    const stroke = 24;
    const circumference = 2 * Math.PI * radius;

    if (!valid.length || sum <= 0) {
      container.innerHTML = `<div class="chart-empty"><span class="chart-empty-icon" aria-hidden="true">◔</span><p>${escapeXml(emptyText)}</p></div>`;
      return;
    }

    let offset = 0;
    const segments = valid
      .map((slice) => {
        const ratio = Number(slice.value) / sum;
        const length = Math.max(circumference * ratio - 2, 0.5);
        const dash = `${length} ${circumference - length}`;
        const rotation = (offset / sum) * 360 - 90;
        offset += Number(slice.value);
        return `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${slice.color}" stroke-width="${stroke}"
          stroke-dasharray="${dash}" transform="rotate(${rotation.toFixed(2)} ${size / 2} ${size / 2})" stroke-linecap="round" class="chart-bar">
          <title>${escapeXml(slice.label)}: ${escapeXml(Fin.core.money(slice.value))}</title>
        </circle>`;
      })
      .join("");

    container.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Despesas por categoria" class="chart-svg donut-svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--chart-track)" stroke-width="${stroke}" />
      ${segments}
      <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" class="donut-value">${escapeXml(format(sum))}</text>
      <text x="${size / 2}" y="${size / 2 + 18}" text-anchor="middle" class="donut-label">${escapeXml(centerLabel)}</text>
    </svg>`;
  }

  function legend(container, slices, format = Fin.core.money) {
    if (!container) return;
    const total = slices.reduce((accumulator, slice) => accumulator + Number(slice.value || 0), 0);
    container.innerHTML = slices
      .map((slice) => {
        const share = total > 0 ? (Number(slice.value) / total) * 100 : 0;
        return `<li class="legend-item">
          <span class="legend-dot" style="background:${escapeXml(slice.color)}"></span>
          <span class="legend-label">${escapeXml(slice.label)}</span>
          <strong class="legend-value">${escapeXml(format(slice.value))}</strong>
          <span class="legend-share">${share.toFixed(0)}%</span>
        </li>`;
      })
      .join("");
  }

  Fin.charts = { line, bars, donut, legend };
})(window.Fin);
