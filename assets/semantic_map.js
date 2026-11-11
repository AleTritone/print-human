(function () {
    "use strict";

    const CONFIG = window.__PRINT_HUMAN_MAP_CONFIG__;
    const gd = document.getElementById("{plot_id}");

    if (!CONFIG || !gd) {
        return;
    }

    const nodes = CONFIG.nodes || [];
    const edges = CONFIG.edges || [];
    const anchors = CONFIG.anchors || [];
    const colors = CONFIG.colors || {};
    const siteUrl = CONFIG.siteUrl || "";
    const methodology = CONFIG.methodology || {};
    const localizedCopy = CONFIG.copy || {};
    const initialWidth = CONFIG.initialWidth || 2.44;
    const brainPaths = CONFIG.brainPaths || [];
    const brainPathTransform = CONFIG.brainPathTransform || "";

    function accentRgba(alpha) {
        const value = String(colors.primary || colors.text || "#FFFFFF").trim();
        const match = value.match(/^#([0-9a-fA-F]{6})$/);
        if (!match) {
            return value;
        }
        const hex = match[1];
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const brainViewBox = CONFIG.brainViewBox || {
        minX: 0,
        minY: 0,
        width: 1000,
        height: 800,
    };

    const brainBounds = CONFIG.brainBounds || {
        xRadius: 1.08,
        yRadius: 0.86,
    };

    const nodesByTag = new Map(
        nodes.map((node) => [
            node.tag,
            node,
        ])
    );

    let selectedTag = null;
    let activeInfoNode = null;
    let activeInfoSelected = false;
    let activeMethodologyTopic = null;
    let currentLanguage = (() => {
        try {
            return localStorage.getItem("print-human-map-language") === "it"
                ? "it"
                : "en";
        } catch (error) {
            return "en";
        }
    })();

    function currentCopy() {
        return localizedCopy[currentLanguage]
            || localizedCopy.en
            || localizedCopy.it
            || {};
    }

    function mapCopy(path, fallback = "") {
        const parts = String(path).split(".");
        let value = currentCopy();

        for (const part of parts) {
            if (!value || typeof value !== "object" || !(part in value)) {
                return fallback;
            }
            value = value[part];
        }

        return typeof value === "string" ? value : fallback;
    }

    function copyTemplate(value, variables = {}) {
        return String(value || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
            Object.prototype.hasOwnProperty.call(variables, key)
                ? String(variables[key])
                : match
        ));
    }

    function topicCopy(topic) {
        const copy = currentCopy();
        return copy && copy.topics && copy.topics[topic]
            ? copy.topics[topic]
            : {};
    }

    function syncLanguagePreference(nextLanguage) {
        const normalized = nextLanguage === "it" ? "it" : "en";

        if (normalized === currentLanguage) {
            return;
        }

        currentLanguage = normalized;

        if (activeInfoNode) {
            showNodeInfo(activeInfoNode, activeInfoSelected);
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key === "print-human-map-language") {
            syncLanguagePreference(event.newValue);
        }
    });

    window.addEventListener("print-human-languagechange", (event) => {
        syncLanguagePreference(event && event.detail ? event.detail.language : "en");
    });

    let overlayFrame = null;
    let responsiveTimer = null;
    let neuralManager = null;
    let ambientManager = null;

    const state = {
        detail: 3,
        tagEdges: false,
        anchorEdges: false,
        axes: false,
    };

    gd.style.position = "relative";


    // Generic helpers


    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function isMobile() {
        return window
            .matchMedia("(max-width: 760px)")
            .matches;
    }


    function hasHover() {
        return window
            .matchMedia("(hover: hover) and (pointer: fine)")
            .matches;
    }


    function numberOr(value, fallback) {
        const numeric = Number(value);

        return Number.isFinite(numeric)
            ? numeric
            : fallback;
    }


    function fallbackAttractionRaw(node) {
        const items = Array.isArray(node.semanticNeighbors)
            ? node.semanticNeighbors
            : [];

        return items.reduce(
            (total, item) =>
                total
                + Math.max(
                    numberOr(
                        item.affinity,
                        item.semantic
                    ),
                    0
                ),
            0
        );
    }


    const fallbackAttractionMaximum = Math.max(
        ...nodes.map(
            (node) => fallbackAttractionRaw(node)
        ),
        1e-9
    );


    function attractionStrengthForNode(node) {
        const supplied = Number(
            node.attractionStrength
        );

        if (Number.isFinite(supplied)) {
            return Math.min(
                Math.max(supplied, 0),
                1
            );
        }

        return Math.min(
            Math.max(
                fallbackAttractionRaw(node)
                / fallbackAttractionMaximum,
                0
            ),
            1
        );
    }


    function attractionVisualForNode(node) {
        const supplied = Number(
            node.attractionVisual
        );

        if (Number.isFinite(supplied)) {
            return Math.min(
                Math.max(supplied, 0),
                1
            );
        }

        const exponent = numberOr(
            methodology.pillow_attraction_visual_exponent,
            0.72
        );

        return Math.pow(
            attractionStrengthForNode(node),
            exponent
        );
    }


    function labelPillowStyle(node) {
        const pull = attractionVisualForNode(node);
        const whiteTop = (0.025 + 0.32 * pull).toFixed(3);
        const whiteMid = (0.010 + 0.13 * pull).toFixed(3);
        const greenMid = (0.030 + 0.10 * pull).toFixed(3);
        const border = (0.54 + 0.38 * pull).toFixed(3);
        const glow = (0.025 + 0.15 * pull).toFixed(3);
        const inset = (0.035 + 0.20 * pull).toFixed(3);
        const glowRadius = (7 + 14 * pull).toFixed(1);

        return {
            pull,
            background: `
                radial-gradient(
                    ellipse at 50% 14%,
                    rgba(248, 251, 255, ${whiteTop}) 0%,
                    ${accentRgba(whiteMid)} 30%,
                    ${accentRgba(greenMid)} 53%,
                    rgba(13, 17, 23, .91) 84%
                ),
                linear-gradient(
                    180deg,
                    rgba(22, 27, 34, .94),
                    rgba(13, 17, 23, .96)
                )
            `,
            borderColor: `${accentRgba(border)}`,
            boxShadow: `
                inset 0 1px 0 rgba(248, 251, 255, ${inset}),
                inset 0 -7px 15px rgba(0, 0, 0, .18),
                0 0 ${glowRadius}px ${accentRgba(glow)},
                0 4px 14px rgba(0, 0, 0, .38)
            `,
            textColor: pull >= 0.72
                ? "#E6EDF3"
                : colors.primary,
        };
    }


    function percentText(value) {
        return `${Math.round(numberOr(value, 0) * 100)}%`;
    }


    function infoButton(topic, label) {
        const helpText = `${mapCopy("explanation_prefix")}: ${label}`;

        return `
            <button
                type="button"
                class="semantic-info-button"
                data-info-topic="${escapeHtml(topic)}"
                aria-expanded="false"
                aria-controls="semantic-method-box-host"
                aria-label="${escapeHtml(helpText)}"
                data-tooltip="${escapeHtml(helpText)}"
            >${escapeHtml(label)}</button>
        `;
    }


    function intensityExplanationVisual(node, intensity, copy) {
        const recurrence = Math.max(0, Math.min(1, numberOr(intensity.frequency, 0)));
        const connections = Math.max(0, Math.min(1, numberOr(intensity.degree, 0)));
        const activation = Math.max(
            0,
            Math.min(
                1,
                numberOr(
                    intensity.activation,
                    Math.sqrt(recurrence * connections)
                )
            )
        );
        const value = numberOr(node.weight, 1 + 4 * activation);

        const left = 38;
        const right = 182;
        const top = 18;
        const bottom = 104;
        const chartWidth = right - left;
        const chartHeight = bottom - top;
        const x = left + recurrence * chartWidth;
        const y = bottom - connections * chartHeight;

        const scaleLines = [1, 2, 3, 4, 5]
            .map((index) => copyTemplate(copy[`scale_${index}`], {
                label: intensityLabel(index),
            }))
            .filter(Boolean)
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join("");

        const variableDefinitions = [
            copy.rx_definition,
            copy.rmax_definition,
            copy.cx_definition,
            copy.cmax_definition,
        ]
            .filter(Boolean)
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("");

        return `
            ${copy.normalization_intro ? `<p class="semantic-intensity-note">${escapeHtml(copy.normalization_intro)}</p>` : ""}
            <div class="semantic-intensity-equations semantic-intensity-equations--normalization" aria-label="${escapeHtml(copy.title || "")}">
                <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
                    <mi>R</mi><mo>=</mo><mfrac><msub><mi>r</mi><mi>x</mi></msub><msub><mi>r</mi><mtext>max</mtext></msub></mfrac>
                </math>
                <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
                    <mi>C</mi><mo>=</mo><mfrac><msub><mi>c</mi><mi>x</mi></msub><msub><mi>c</mi><mtext>max</mtext></msub></mfrac>
                </math>
            </div>
            ${copy.where_title ? `<p class="semantic-intensity-note semantic-intensity-where">${escapeHtml(copy.where_title)}</p>` : ""}
            ${variableDefinitions ? `<ul class="semantic-intensity-definitions semantic-intensity-definitions--compact">${variableDefinitions}</ul>` : ""}
            ${copy.formula_note ? `<p class="semantic-intensity-note">${escapeHtml(copy.formula_note)}</p>` : ""}
            <div class="semantic-intensity-equations" aria-label="${escapeHtml(copy.title || "")}">
                <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
                    <mi>A</mi><mo>=</mo><msqrt><mrow><mi>R</mi><mo>·</mo><mi>C</mi></mrow></msqrt>
                </math>
                <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
                    <mi>I</mi><mo>=</mo><mn>1</mn><mo>+</mo><mn>4</mn><mi>A</mi>
                </math>
            </div>
            <div class="semantic-intensity-legend">
                <span>${escapeHtml(copy.legend_recurrence || "")}</span>
                <span>${escapeHtml(copy.legend_connections || "")}</span>
                <span>${escapeHtml(copy.legend_activation || "")}</span>
                <span>${escapeHtml(copy.legend_intensity || "")}</span>
            </div>
            <div class="semantic-intensity-layout">
                <div class="semantic-intensity-chart-wrap">
                    <svg
                        class="semantic-intensity-chart"
                        viewBox="0 0 220 140"
                        role="img"
                        aria-label="${escapeHtml(`${copy.legend_recurrence || ""}; ${copy.legend_connections || ""}`)}"
                    >
                        <defs>
                            <linearGradient id="semantic-intensity-field" x1="0" y1="1" x2="1" y2="0">
                                <stop offset="0%" stop-color="rgba(139,148,158,0.02)"></stop>
                                <stop offset="58%" stop-color="rgba(139,148,158,0.04)"></stop>
                                <stop offset="100%" stop-color="${accentRgba(.16)}"></stop>
                            </linearGradient>
                        </defs>
                        <rect x="${left}" y="${top}" width="${chartWidth}" height="${chartHeight}" rx="5" fill="url(#semantic-intensity-field)"></rect>
                        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" class="semantic-intensity-axis"></line>
                        <line x1="${left}" y1="${bottom}" x2="${left}" y2="${top}" class="semantic-intensity-axis"></line>
                        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${top}" class="semantic-intensity-guide"></line>
                        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" class="semantic-intensity-point-halo"></circle>
                        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.8" class="semantic-intensity-point"></circle>
                        <text x="${left}" y="119" text-anchor="middle" class="semantic-intensity-tick">0</text>
                        <text x="${right}" y="119" text-anchor="middle" class="semantic-intensity-tick">1</text>
                        <text x="${left - 8}" y="${top + 4}" text-anchor="end" class="semantic-intensity-tick">1</text>
                        <text x="${(left + right) / 2}" y="136" text-anchor="middle" class="semantic-intensity-axis-label">${escapeHtml(copy.axis_x || "R")}</text>
                        <text x="17" y="${(top + bottom) / 2 + 3}" text-anchor="middle" class="semantic-intensity-axis-label">${escapeHtml(copy.axis_y || "C")}</text>
                    </svg>
                </div>
                <div class="semantic-intensity-values">
                    <div><span>${escapeHtml(copy.value_recurrence || "R")}</span><strong>${recurrence.toFixed(2)}</strong></div>
                    <div><span>${escapeHtml(copy.value_connections || "C")}</span><strong>${connections.toFixed(2)}</strong></div>
                    <div><span>${escapeHtml(copy.value_activation || "A")}</span><strong>${activation.toFixed(2)}</strong></div>
                    <div class="is-result"><span>${escapeHtml(copy.value_intensity || "I")}</span><strong>${value.toFixed(2)} / 5</strong></div>
                    ${copy.footer ? `<p class="semantic-intensity-values-note semantic-intensity-small-note">${escapeHtml(copy.footer)}</p>` : ""}
                </div>
            </div>
            <div class="semantic-intensity-scale semantic-intensity-small-note">
                ${copy.scale_title ? `<div class="semantic-intensity-scale-title semantic-intensity-lead">${escapeHtml(copy.scale_title)}</div>` : ""}
                ${scaleLines}
            </div>
        `;
    }

    function methodologyContent(topic, node) {
        const copy = topicCopy(topic);
        if (topic !== "intensity") {
            return window.PrintHumanMapExplanations.render(topic, node, {
                nodes, edges, colors, methodology,
                copy: currentCopy(),
                postCount: CONFIG.postCount,
                layoutEdges: CONFIG.layoutEdges,
            });
        }

        const intensity = node.intensityComponents || {};
        const definitions = [copy.recurrence_definition, copy.connections_definition]
            .filter(Boolean)
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("");
        return {
            title: copy.title,
            body: `
                ${copy.intro ? `<p class="semantic-intensity-lead">${escapeHtml(copy.intro)}</p>` : ""}
                ${definitions ? `<ul class="semantic-intensity-definitions">${definitions}</ul>` : ""}
                ${intensityExplanationVisual(node, intensity, copy)}
            `,
        };
    }


    function renderMethodologyBox(info, node, topic) {
        const host = info.querySelector(
            "#semantic-method-box-host"
        );
        if (!host) return;
        activeMethodologyTopic = topic || null;
        host.dataset.topic = topic || "";
        host.style.display = topic ? "block" : "none";
        info.querySelectorAll(".semantic-info-button").forEach((button) => {
            button.setAttribute("aria-expanded", String(button.dataset.infoTopic === topic));
        });
        if (!topic) {
            host.innerHTML = "";
            return;
        }
        const content = methodologyContent(topic, node);
        host.innerHTML = `
                    <div class="semantic-method-box">
                        <div class="semantic-method-header">
                            <strong>${escapeHtml(content.title)}</strong>
                            <button
                                type="button"
                                class="semantic-method-close"
                                aria-label="${mapCopy("close_explanation")}"
                            >×</button>
                        </div>
                        <div class="semantic-method-body">${content.body}</div>
                    </div>
                `;
        host.querySelector(".semantic-method-close").addEventListener("click", (event) => {
            event.stopPropagation();
            renderMethodologyBox(info, node, null);
        });
    }


    function bindMethodologyButtons(info, node) {
        info.querySelectorAll(".semantic-info-button").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const topic = button.dataset.infoTopic || "";
                renderMethodologyBox(info, node, activeMethodologyTopic === topic ? null : topic);
                if (!activeMethodologyTopic) return;
                info.querySelector("#semantic-method-box-host").scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        });
        // Recompute the open explanation when the selection or language changes.
        if (activeMethodologyTopic) renderMethodologyBox(info, node, activeMethodologyTopic);
    }


    function intensityLabel(value) {
        // Classification uses the displayed two-decimal value.
        const intensity = Number(numberOr(value, 1).toFixed(2));

        if (intensity < 2) {
            return mapCopy("labels.minimum");
        }

        if (intensity < 3) {
            return mapCopy("labels.weak");
        }

        if (intensity < 4) {
            return mapCopy("labels.moderate");
        }

        if (intensity < 5) {
            return mapCopy("labels.strong");
        }

        return mapCopy("labels.maximum");
    }


    function importanceLabel(value) {
        return window.PrintHumanMapExplanations.qualitativeLabel("importance", value, currentCopy());
    }


    function injectResponsiveStyles() {
        const style = document.createElement("style");

        style.textContent = `
            html,
            body {
                box-sizing:border-box;
                min-width:0;
                max-width:100%;
                background:#0D1117;
                color-scheme:dark;
                scrollbar-width:thin;
                scrollbar-color:${accentRgba(.26)} transparent;
            }

            html {
                overflow-x:hidden;
                overflow-y:auto;
                scrollbar-gutter:stable;
            }

            body {
                margin:0;
                padding:0;
                overflow-x:clip;
            }

            html::-webkit-scrollbar,
            body::-webkit-scrollbar {
                width:6px;
                height:0;
                background:transparent;
            }

            html::-webkit-scrollbar-track,
            body::-webkit-scrollbar-track {
                background:transparent;
            }

            html::-webkit-scrollbar-thumb,
            body::-webkit-scrollbar-thumb {
                border-radius:999px;
                background:${accentRgba(.26)};
            }

            html::-webkit-scrollbar-thumb:hover,
            body::-webkit-scrollbar-thumb:hover {
                background:${accentRgba(.44)};
            }

            html::-webkit-scrollbar-button,
            body::-webkit-scrollbar-button {
                display:none;
                width:0;
                height:0;
            }

            .js-plotly-plot {
                min-width:0;
                max-width:100%;
            }

            #semantic-map-controls label {
                display:flex;
                align-items:center;
                gap:5px;
                cursor:pointer;
                white-space:nowrap;
            }

            #semantic-map-info::-webkit-scrollbar {
                width:5px;
            }

            #semantic-map-info::-webkit-scrollbar-thumb {
                background:rgba(139, 148, 158, .22);
                border-radius:999px;
            }

            .semantic-resonance-arrow {
                display:inline-block;
                width:15px;
                text-align:center;
                transform-origin:50% 50%;
                line-height:1;
            }

            .semantic-info-button {
                position:relative;
                display:inline;
                margin:0;
                padding:0 0 1px 0;
                border:0;
                border-bottom:1px dotted rgba(139, 148, 158, .52);
                border-radius:0;
                background:transparent;
                color:inherit;
                font:inherit;
                line-height:inherit;
                cursor:help;
                vertical-align:baseline;
                text-align:left;
            }

            .semantic-info-button:hover,
            .semantic-info-button:focus-visible {
                border-bottom-color:${accentRgba(.90)};
                color:${colors.primary};
                outline:none;
            }

            .semantic-info-button::after {
                content:attr(data-tooltip);
                position:absolute;
                left:0;
                bottom:calc(100% + 7px);
                z-index:40;
                width:max-content;
                max-width:300px;
                padding:6px 8px;
                border:1px solid ${accentRgba(.72)};
                border-radius:6px;
                background:rgb(11, 16, 22);
                color:${colors.primary};
                box-shadow:0 8px 22px rgba(0, 0, 0, .30);
                font:500 10px/1.35 JetBrains Mono, Fira Code, IBM Plex Mono, monospace;
                white-space:normal;
                opacity:0;
                visibility:hidden;
                transform:translateY(3px);
                transition:opacity .14s ease, transform .14s ease, visibility .14s ease;
                pointer-events:none;
            }

            .semantic-info-button:hover::after,
            .semantic-info-button:focus-visible::after {
                opacity:1;
                visibility:visible;
                transform:translateY(0);
            }

            .semantic-language-switch {
                display:inline-flex;
                align-items:center;
                gap:2px;
                padding:2px;
                border:1px solid rgba(139, 148, 158, .14);
                border-radius:6px;
                background:rgba(13, 17, 23, .38);
            }

            .semantic-language-button {
                min-width:28px;
                padding:2px 5px;
                border:0;
                border-radius:4px;
                background:transparent;
                color:#8B949E;
                font:600 8px/1.3 JetBrains Mono, Fira Code, IBM Plex Mono, monospace;
                cursor:pointer;
            }

            .semantic-language-button.is-active {
                background:${accentRgba(.12)};
                color:${colors.primary};
            }

            .semantic-info-hint {
                margin:-2px 0 9px 0;
                color:#6E7681;
                font-size:8px;
                line-height:1.35;
            }

            #semantic-method-box-host {
                display:none;
                margin:0 0 10px 0;
            }

            .semantic-method-box {
                --semantic-explain-accent:${colors.primary};
                padding:10px 11px;
                border:1px solid ${accentRgba(.26)};
                border-radius:8px;
                background:rgba(22, 27, 34, .97);
                box-shadow:0 8px 26px rgba(0, 0, 0, .32);
                color:#C9D1D9;
                font-size:9px;
                line-height:1.55;
            }

            .semantic-method-header {
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:12px;
                margin-bottom:7px;
                color:${colors.primary};
                font-size:10px;
            }

            .semantic-method-close {
                border:0;
                background:transparent;
                color:#8B949E;
                font:inherit;
                font-size:14px;
                cursor:pointer;
                line-height:1;
            }

            .semantic-method-body p {
                margin:0 0 7px 0;
            }

            .semantic-method-body p:last-child {
                margin-bottom:0;
            }

            .semantic-intensity-lead {
                margin:0 0 8px 0 !important;
                color:#C9D1D9 !important;
                font-size:9px !important;
                font-weight:400 !important;
                line-height:1.55 !important;
                white-space:pre-line;
            }

            .semantic-method-formula {
                margin:7px 0;
                padding:7px 8px;
                border-left:2px solid ${accentRgba(.50)};
                background:rgba(13, 17, 23, .68);
                color:#E6EDF3;
                font-variant-numeric:tabular-nums;
                overflow-wrap:anywhere;
            }

            .semantic-method-table {
                display:grid;
                grid-template-columns:minmax(0, 1fr) auto;
                gap:3px 10px;
                margin:7px 0;
                color:#8B949E;
                font-variant-numeric:tabular-nums;
            }

            .semantic-method-table span:nth-child(even) {
                color:#E6EDF3;
                text-align:right;
            }

            .semantic-intensity-layout {
                display:grid;
                grid-template-columns:minmax(0, 380px) minmax(150px, 220px);
                gap:18px;
                align-items:center;
                max-width:620px;
                margin:10px 0 10px 0;
            }

            .semantic-intensity-chart-wrap {
                width:100%;
                max-width:380px;
                min-width:0;
                padding:8px 10px 6px 8px;
                box-sizing:border-box;
                border:1px solid rgba(139, 148, 158, .12);
                border-radius:7px;
                background:rgba(13, 17, 23, .42);
            }

            .semantic-intensity-chart {
                display:block;
                width:100%;
                height:auto;
                overflow:visible;
            }

            .semantic-intensity-axis {
                stroke:#8B949E;
                stroke-width:1;
                opacity:.72;
            }

            .semantic-intensity-guide {
                stroke:${accentRgba(.34)};
                stroke-width:1;
                stroke-dasharray:3 4;
            }

            .semantic-intensity-point-halo {
                fill:${accentRgba(.10)};
                stroke:${accentRgba(.22)};
                stroke-width:.8;
            }

            .semantic-intensity-point {
                fill:${colors.primary};
                stroke:#F4F7FB;
                stroke-width:.9;
            }

            .semantic-intensity-axis-label,
            .semantic-intensity-tick {
                fill:#8B949E;
                font-family:JetBrains Mono, Fira Code, IBM Plex Mono, monospace;
            }

            .semantic-intensity-axis-label {
                font-size:8.5px;
                fill:#C9D1D9;
            }

            .semantic-intensity-tick {
                font-size:7.5px;
                fill:#8B949E;
            }

            .semantic-intensity-values {
                display:grid;
                gap:6px;
                font-variant-numeric:tabular-nums;
            }

            .semantic-intensity-values > div {
                display:grid;
                grid-template-columns:minmax(0, 1fr) auto;
                gap:10px;
                align-items:baseline;
                padding-bottom:4px;
                border-bottom:1px solid rgba(139, 148, 158, .10);
                color:#8B949E;
            }

            .semantic-intensity-values strong {
                color:#E6EDF3;
                font-weight:600;
            }

            .semantic-intensity-values .is-result {
                margin-top:3px;
                padding:6px 0;
                border-top:1px solid ${accentRgba(.24)};
                border-bottom:0;
            }

            .semantic-intensity-values .is-result span,
            .semantic-intensity-values .is-result strong {
                color:${colors.primary};
            }

            .semantic-intensity-values-note {
                margin:7px 0 0 0 !important;
                padding-top:7px;
                border-top:1px solid rgba(139, 148, 158, .12);
                color:#8B949E !important;
                font-size:8px !important;
                line-height:1.5 !important;
            }

            .semantic-intensity-equations {
                display:flex;
                flex-wrap:wrap;
                gap:10px 26px;
                align-items:center;
                justify-content:center;
                margin:8px 0 5px 0;
                padding:10px 12px;
                border-left:2px solid ${accentRgba(.50)};
                background:rgba(13, 17, 23, .68);
                color:#E6EDF3;
            }

            .semantic-intensity-equations math {
                font-size:18px;
                color:#E6EDF3;
            }

            .semantic-intensity-equations--normalization math {
                font-size:18px;
            }

            .semantic-intensity-where {
                margin-top:4px !important;
                margin-bottom:3px !important;
                text-transform:lowercase;
            }

            .semantic-intensity-legend {
                display:flex;
                flex-wrap:wrap;
                gap:4px 14px;
                margin:0 0 8px 0;
                color:#8B949E;
                font-size:8px;
            }

            .semantic-intensity-definitions {
                margin:5px 0 10px 18px;
                padding:0;
                color:#C9D1D9;
                font-size:9px;
                line-height:1.55;
            }

            .semantic-intensity-definitions--compact {
                margin-top:4px;
                margin-bottom:10px;
            }

            .semantic-intensity-definitions li {
                margin:3px 0;
                padding-left:2px;
            }

            .semantic-intensity-note {
                margin:8px 0 6px 0 !important;
                color:#C9D1D9 !important;
                font-size:9px !important;
                line-height:1.55 !important;
                white-space:pre-line;
            }

            .semantic-intensity-scale {
                display:grid;
                gap:4px;
                margin:11px 0 7px 0;
                color:#C9D1D9;
                font-variant-numeric:tabular-nums;
                font-size:9px;
                line-height:1.55;
            }

            .semantic-intensity-footer {
                margin:5px 0 0 0 !important;
                color:#8B949E !important;
                font-size:8px !important;
            }

            .semantic-intensity-scale-title {
                margin-bottom:5px !important;
                color:#C9D1D9 !important;
                font-weight:400 !important;
                text-transform:none;
            }

            @media (max-width: 620px) {
                .semantic-intensity-layout {
                    grid-template-columns:1fr;
                    max-width:420px;
                }

                .semantic-intensity-chart-wrap {
                    max-width:360px;
                }

                .semantic-intensity-values {
                    grid-template-columns:1fr 1fr;
                    gap:6px 12px;
                }
            }

            .semantic-method-subtitle {
                margin:9px 0 5px 0;
                color:${colors.primary};
            }

            .semantic-method-breakdown {
                display:grid;
                gap:5px;
            }

            .semantic-method-breakdown-row {
                display:flex;
                flex-wrap:wrap;
                gap:3px 8px;
                padding:5px 6px;
                border:1px solid rgba(139, 148, 158, .12);
                border-radius:5px;
                background:rgba(13, 17, 23, .48);
                color:#8B949E;
                font-variant-numeric:tabular-nums;
            }

            .semantic-method-breakdown-row strong {
                width:100%;
                color:#E6EDF3;
                font-weight:600;
            }

            ${window.PrintHumanMapExplanations.styles}

            .semantic-map-label {
                transition:
                    background .20s ease,
                    border-color .20s ease,
                    box-shadow .20s ease,
                    color .20s ease,
                    opacity .20s ease;
            }

            .semantic-map-label.is-selected {
                border-color:${accentRgba(.92)} !important;
                color:${colors.primary} !important;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .34),
                    inset 0 -7px 15px rgba(0, 0, 0, .16),
                    0 0 22px ${accentRgba(.28)},
                    0 4px 16px rgba(0, 0, 0, .42) !important;
            }

            #semantic-map-ui {
                width:min(100%, 920px);
                min-width:0;
                margin:14px auto 0 auto;
                display:grid;
                grid-template-columns:minmax(0, 1fr);
                gap:10px;
                box-sizing:border-box;
                padding:0 10px 18px 10px;
            }

            #semantic-map-controls {
                position:static !important;
                min-width:0;
                max-width:none !important;
                width:100% !important;
                box-sizing:border-box;
                background:rgb(11, 16, 22) !important;
                backdrop-filter:none !important;
                box-shadow:0 8px 22px rgba(0, 0, 0, .18) !important;
            }

            #semantic-map-info {
                position:static !important;
                min-width:0;
                width:100% !important;
                max-width:none !important;
                max-height:none !important;
                box-sizing:border-box;
                padding:14px 16px !important;
                border:1px solid ${colors.border} !important;
                border-radius:10px !important;
                background:rgb(11, 16, 22) !important;
                backdrop-filter:none !important;
                -webkit-backdrop-filter:none !important;
                text-shadow:none !important;
                box-shadow:0 10px 28px rgba(0, 0, 0, .28) !important;
            }

            @media (max-width:760px) {
                #semantic-map-ui {
                    margin-top:8px;
                    gap:8px;
                    padding:0 6px 12px 6px;
                }

                #semantic-map-controls {
                    padding:8px 9px !important;
                    gap:7px !important;
                    border-radius:9px !important;
                    font-size:11px !important;
                }

                #semantic-map-search {
                    flex:1 1 145px;
                    width:auto !important;
                    min-width:0;
                }

                #semantic-map-info {
                    padding:12px !important;
                    font-size:11px !important;
                }

                .semantic-map-label {
                    font-size:12px !important;
                    padding:6px 8px !important;
                }
            }
        `;

        document.head.appendChild(style);
    }


    // Plot coordinates


    function currentRanges() {
        return {
            x: gd._fullLayout.xaxis.range,
            y: gd._fullLayout.yaxis.range,
        };
    }


    function nodeInView(node, ranges) {
        const minX = Math.min(ranges.x[0], ranges.x[1]);
        const maxX = Math.max(ranges.x[0], ranges.x[1]);
        const minY = Math.min(ranges.y[0], ranges.y[1]);
        const maxY = Math.max(ranges.y[0], ranges.y[1]);

        return (
            node.x >= minX
            && node.x <= maxX
            && node.y >= minY
            && node.y <= maxY
        );
    }


    function nodesInView() {
        const ranges = currentRanges();

        return nodes.filter(
            (node) => nodeInView(node, ranges)
        );
    }


    function zoomDetailLevel() {
        const range = gd._fullLayout.xaxis.range;
        const width = Math.abs(range[1] - range[0]);
        const zoom = initialWidth / width;

        if (zoom < 1.30) {
            return 0;
        }

        if (zoom < 1.95) {
            return 1;
        }

        if (zoom < 3.00) {
            return 2;
        }

        return 3;
    }


    function getDetailLevel() {
        const visibleCount = nodesInView().length;
        const zoomLevel = zoomDetailLevel();

        let densityLevel;

        if (visibleCount <= 20) {
            densityLevel = 3;
        } else if (visibleCount <= 42) {
            densityLevel = 2;
        } else if (visibleCount <= 78) {
            densityLevel = 1;
        } else {
            densityLevel = 0;
        }

        return Math.min(
            Math.max(densityLevel, zoomLevel),
            3
        );
    }


    function dataToPixel(x, y) {
        const xAxis = gd._fullLayout.xaxis;
        const yAxis = gd._fullLayout.yaxis;

        return {
            x: xAxis._offset + xAxis.l2p(x),
            y: yAxis._offset + yAxis.l2p(y),
        };
    }


    // Labels


    function createLabelLayer() {
        const existing = document.getElementById(
            "semantic-map-label-layer"
        );

        if (existing) {
            existing.remove();
        }

        const layer = document.createElement("div");

        layer.id = "semantic-map-label-layer";

        layer.style.cssText = `
            position:absolute;
            inset:0;
            z-index:90;
            pointer-events:none;
            overflow:hidden;
        `;

        gd.appendChild(layer);

        nodes.forEach((node) => {
            const label = document.createElement("div");

            label.className = "semantic-map-label";
            label.dataset.tag = node.tag;

            const pillow = labelPillowStyle(node);

            label.dataset.attraction =
                attractionStrengthForNode(node).toFixed(3);

            label.style.cssText = `
                position:absolute;
                display:none;
                align-items:center;
                gap:6px;
                padding:5px 8px;
                border:1px solid ${pillow.borderColor};
                border-radius:999px;
                background:${pillow.background};
                color:${pillow.textColor};
                font-family:JetBrains Mono, Fira Code, IBM Plex Mono, monospace;
                font-size:11px;
                line-height:1;
                white-space:nowrap;
                box-shadow:${pillow.boxShadow};
                backdrop-filter:blur(7px);
                -webkit-backdrop-filter:blur(7px);
                transform:translate(-50%, -145%);
                pointer-events:auto;
                cursor:pointer;
            `;

            label.innerHTML = `
                <span>
                    ${escapeHtml(node.tag)}
                </span>

                <span
                    style="
                        color:${colors.muted};
                        padding:2px 5px;
                        border-radius:999px;
                        background:rgba(139, 148, 158, .13);
                    "
                >
                    ${numberOr(node.weight, 0).toFixed(2)}
                </span>
            `;

            label.addEventListener(
                "click",
                (event) => {
                    event.stopPropagation();
                    selectTag(node);
                }
            );

            if (hasHover()) {
                label.addEventListener(
                    "mouseenter",
                    () => {
                        if (!selectedTag) {
                            showNodeInfo(
                                node,
                                false
                            );
                        }
                    }
                );

                label.addEventListener(
                    "mouseleave",
                    () => {
                        if (!selectedTag) {
                            hideInfoPanel();
                        }
                    }
                );
            }

            layer.appendChild(label);
        });

        return layer;
    }


    const labelLayer = createLabelLayer();


    function expandedRect(rect, padding) {
        return {
            left: rect.left - padding,
            right: rect.right + padding,
            top: rect.top - padding,
            bottom: rect.bottom + padding,
        };
    }


    function rectanglesOverlap(a, b) {
        return !(
            a.right < b.left
            || a.left > b.right
            || a.bottom < b.top
            || a.top > b.bottom
        );
    }


    function anchorRectangles() {
        const result = [];

        const labels = new Set(
            anchors.map(
                (anchor) => anchor.label
            )
        );

        const textPoints = Array.from(
            gd.querySelectorAll(
                ".scatterlayer .textpoint"
            )
        );

        textPoints.forEach((element) => {
            const text = (
                element.textContent
                ||
                ""
            ).trim();

            if (!labels.has(text)) {
                return;
            }

            result.push(
                expandedRect(
                    element.getBoundingClientRect(),
                    6
                )
            );
        });

        return result;
    }


    function localDensity(
        node,
        visibleNodes
    ) {
        const origin = dataToPixel(
            node.x,
            node.y
        );

        const radius = isMobile()
            ? 105
            : 120;

        let count = 0;

        visibleNodes.forEach((other) => {
            if (other.tag === node.tag) {
                return;
            }

            const target = dataToPixel(
                other.x,
                other.y
            );

            const distance = Math.hypot(
                target.x - origin.x,
                target.y - origin.y
            );

            if (distance < radius) {
                count += 1;
            }
        });

        return count;
    }


    function updateLabels() {
        const detail = getDetailLevel();

        state.detail = detail;

        const ranges = currentRanges();

        const visibleNodes = nodes.filter(
            (node) =>
                nodeInView(
                    node,
                    ranges
                )
        );

        const candidates = [];

        nodes.forEach((node) => {
            const label = labelLayer.querySelector(
                '[data-tag="'
                +
                CSS.escape(node.tag)
                +
                '"]'
            );

            if (!label) {
                return;
            }

            const isSelected =
                !!selectedTag
                && selectedTag === node.tag;

            label.classList.toggle(
                "is-selected",
                isSelected
            );

            const density = localDensity(
                node,
                visibleNodes
            );

            const densityBonus =
                density <= 2
                    ? 2
                    : density <= 5
                        ? 1
                        : 0;

            const effectiveLevel = Math.min(
                3,
                detail + densityBonus
            );

            const eligible =
                isSelected
                    ? true
                    : Number(node.level)
                        <=
                        effectiveLevel;

            const inView = nodeInView(
                node,
                ranges
            );

            if (!eligible || !inView) {
                label.style.display =
                    "none";

                return;
            }

            const pixel = dataToPixel(
                node.x,
                node.y
            );

            label.style.left =
                pixel.x
                +
                "px";

            label.style.top =
                pixel.y
                +
                "px";

            label.style.display =
                "flex";

            label.style.opacity =
                "0.98";

            candidates.push({
                node,
                label,
                density,
                selected: isSelected,
            });
        });

        candidates.sort(
            (a, b) => {
                if (a.selected !== b.selected) {
                    return a.selected ? -1 : 1;
                }

                const densityDifference =
                    a.density
                    -
                    b.density;

                if (
                    Math.abs(
                        densityDifference
                    )
                    >=
                    3
                ) {
                    return densityDifference;
                }

                return (
                    Number(
                        b.node.priority
                    )
                    -
                    Number(
                        a.node.priority
                    )
                );
            }
        );

        const occupied =
            anchorRectangles();

        candidates.forEach((item) => {
            const rect = expandedRect(
                item.label.getBoundingClientRect(),
                isMobile()
                    ? 4
                    : 3
            );

            const collision =
                occupied.some(
                    (other) =>
                        rectanglesOverlap(
                            rect,
                            other
                        )
                );

            // Small maps display all labels; larger maps filter collisions.
            const allowCollisionSuppression =
                nodes.length > 14;

            if (
                allowCollisionSuppression
                && collision
                && !item.selected
            ) {
                item.label.style.display =
                    "none";

                return;
            }

            occupied.push(rect);
        });

        const detailElement =
            document.getElementById(
                "semantic-map-detail"
            );

        if (detailElement) {
            detailElement.textContent =
                `detail ${detail + 1}/4 · ${visibleNodes.length} ${mapCopy("labels.ideas", "ideas")}`;
        }
    }


    // Visual modules


    function initializeVisualModules() {
        if (
            window.PrintHumanNeural
            &&
            typeof window
                .PrintHumanNeural
                .create
            ===
            "function"
        ) {
            neuralManager =
                window
                    .PrintHumanNeural
                    .create({
                        gd,
                        nodes,
                        edges,
                        colors,
                        brainPaths,
                        brainPathTransform,
                        brainViewBox,
                        brainBounds,
                        dataToPixel,
                    });

        } else {
            console.warn(
                "print(human): "
                +
                "semantic_map_neural.js "
                +
                "not loaded"
            );
        }

        if (
            window.PrintHumanAmbient
            &&
            typeof window
                .PrintHumanAmbient
                .create
            ===
            "function"
        ) {
            ambientManager =
                window
                    .PrintHumanAmbient
                    .create({
                        gd,
                        brainPaths,
                        brainPathTransform,
                        brainViewBox,
                        brainBounds,
                        colors,
                        dataToPixel,
                    });

        } else {
            console.warn(
                "print(human): "
                +
                "semantic_map_ambient.js "
                +
                "not loaded"
            );
        }
    }


    function drawSelectedNeuralNetwork() {
        if (!neuralManager) {
            return null;
        }

        if (!selectedTag) {
            neuralManager.clear();
            return null;
        }

        neuralManager.draw(
            selectedTag
        );

        return (
            neuralManager.activeTree
            ||
            null
        );
    }


    function clearNeuralNetwork() {
        if (neuralManager) {
            neuralManager.clear();
        }
    }


    function redrawVisualModules() {
        if (ambientManager) {
            ambientManager.redraw();
        }

        if (neuralManager) {
            neuralManager.redraw();
        }
    }


    // Controls


    function createControls() {
        const controls =
            document.createElement(
                "div"
            );

        controls.id =
            "semantic-map-controls";

        controls.style.cssText = `
            position:absolute;

            left:18px;
            bottom:18px;

            z-index:110;

            display:flex;
            gap:10px;
            align-items:center;
            flex-wrap:wrap;

            max-width:
                calc(100% - 36px);

            padding:
                10px 12px;

            border:
                1px solid
                ${colors.border};

            border-radius:
                10px;

            background:
                rgba(
                    22,
                    27,
                    34,
                    .90
                );

            color:
                ${colors.text};

            font-family:
                JetBrains Mono,
                Fira Code,
                IBM Plex Mono,
                monospace;

            font-size:
                12px;

            backdrop-filter:
                blur(7px);
        `;

        controls.innerHTML = `
            <input
                id="semantic-map-search"
                type="text"
                placeholder="${escapeHtml(mapCopy("search_placeholder"))}"
                style="
                    width:150px;
                    height:30px;

                    box-sizing:
                        border-box;

                    border:
                        1px solid
                        ${colors.border};

                    border-radius:
                        7px;

                    background:
                        rgba(
                            13,
                            17,
                            23,
                            .88
                        );

                    color:
                        ${colors.text};

                    padding:
                        0 9px;

                    font:
                        inherit;
                "
            >

            <span
                id="semantic-map-detail"
                style="
                    color:
                        ${colors.primary};
                "
            >
                ${escapeHtml(mapCopy("controls.detail"))}
            </span>

            <label>
                <input
                    id="semantic-map-tag-edges"
                    type="checkbox"
                >
                ${escapeHtml(mapCopy("controls.links"))}
            </label>
        `;

        let uiHost = document.getElementById(
            "semantic-map-ui"
        );

        if (!uiHost) {
            uiHost = document.createElement("div");
            uiHost.id = "semantic-map-ui";
            gd.insertAdjacentElement("afterend", uiHost);
        }

        uiHost.appendChild(
            controls
        );

        const info =
            document.createElement(
                "div"
            );

        info.id =
            "semantic-map-info";

        info.style.cssText = `
            position:absolute;

            right:
                18px;

            top:
                72px;

            z-index:
                120;

            display:
                none;

            width:
                270px;

            max-height:
                70%;

            overflow-y:
                auto;

            overflow-x:
                hidden;

            max-width:
                calc(100% - 36px);

            padding:
                10px 5px
                10px 13px;

            border:
                none;

            border-radius:
                0;

            background:
                rgb(
                    11,
                    16,
                    22
                );

            color:
                ${colors.text};

            font-family:
                JetBrains Mono,
                Fira Code,
                IBM Plex Mono,
                monospace;

            font-size:
                11px;

            line-height:
                1.48;

            box-shadow:
                none;

            backdrop-filter:
                blur(12px);

            -webkit-backdrop-filter:
                blur(12px);

            text-shadow:
                0 1px 2px
                rgba(
                    13,
                    17,
                    23,
                    .88
                );

            pointer-events:
                auto;
        `;

        // Place selected-idea details between the map and controls.
        uiHost.insertBefore(
            info,
            controls
        );

        document
            .getElementById(
                "semantic-map-tag-edges"
            )
            .addEventListener(
                "change",
                (event) => {
                    state.tagEdges =
                        event.target.checked;

                    applyVisibility();
                }
            );

        const search =
            document.getElementById(
                "semantic-map-search"
            );

        search.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key
                    ===
                    "Enter"
                ) {
                    focusTag(
                        search.value
                    );
                }
            }
        );
    }


    // Info rows


    function formatSignedValue(value) {
        const numeric = numberOr(
            value,
            0
        );

        return (
            numeric > 0
                ? "+"
                : ""
        )
        +
        numeric.toFixed(2);
    }


    function connectionLabel(value) {
        return window.PrintHumanMapExplanations.qualitativeLabel("connections", value, currentCopy());
    }


    function echoLabel(value) {
        return window.PrintHumanMapExplanations.qualitativeLabel("echoes", value, currentCopy());
    }


    function formatAnchorRows(node) {
        const items =
            Array.isArray(
                node.anchors
            )
                ? node.anchors
                : [];

        if (!items.length) {
            return `
                <div
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    none
                </div>
            `;
        }

        return items
            .map(
                (item) => `
                    <div
                        style="
                            display:grid;

                            grid-template-columns:
                                minmax(0, 1fr)
                                auto;

                            align-items:
                                baseline;

                            column-gap:
                                8px;
                        "
                    >
                        <span
                            style="
                                color:
                                    ${colors.text};

                                overflow:
                                    hidden;

                                text-overflow:
                                    ellipsis;

                                white-space:
                                    nowrap;
                            "
                        >
                            ${escapeHtml(
                                item.name
                            )}
                        </span>

                        <span
                            style="
                                color:
                                    ${colors.muted};

                                display:flex;

                                align-items:
                                    baseline;

                                gap:
                                    4px;

                                white-space:
                                    nowrap;

                                font-variant-numeric:
                                    tabular-nums;
                            "
                        >
                            <span>
                                affinity
                            </span>

                            <span>
                                ${numberOr(
                                    item.similarity,
                                    0
                                ).toFixed(2)}
                            </span>

                            <span
                                style="
                                    opacity:
                                        .65;

                                    margin:
                                        0 2px;
                                "
                            >
                                |
                            </span>

                            <span>
                                pull
                            </span>

                            <span>
                                ${formatSignedValue(
                                    item.relevance
                                )}
                            </span>
                        </span>
                    </div>
                `
            )
            .join("");
    }


    function formatSemanticNeighborRows(node) {
        const items =
            Array.isArray(
                node.semanticNeighbors
            )
                ? node.semanticNeighbors
                : [];

        if (!items.length) {
            return `
                <div
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    none
                </div>
            `;
        }

        return items
            .slice(0, 5)
            .map(
                (item) => `
                    <div
                        style="
                            display:grid;
                            grid-template-columns:
                                minmax(0, 1fr)
                                auto;
                            align-items:baseline;
                            column-gap:12px;
                        "
                    >
                        <span
                            style="
                                overflow:hidden;
                                text-overflow:ellipsis;
                                white-space:nowrap;
                            "
                        >
                            ${escapeHtml(item.tag)}
                        </span>

                        <span
                            style="
                                color:${colors.muted};
                                font-variant-numeric:tabular-nums;
                                white-space:nowrap;
                            "
                        >
                            ${numberOr(
                                item.affinity,
                                item.semantic
                            ).toFixed(2)}
                        </span>
                    </div>
                `
            )
            .join("");
    }


    function formatNeighborRows(node) {
        const items =
            Array.isArray(
                node.neighbors
            )
                ? node.neighbors
                : [];

        if (!items.length) {
            return `
                <div
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    none
                </div>
            `;
        }

        return items
            .map(
                (item) => `
                    <div
                        style="
                            display:grid;

                            grid-template-columns:
                                minmax(0, 1fr)
                                auto;

                            align-items:
                                baseline;

                            column-gap:
                                12px;
                        "
                    >
                        <span
                            style="
                                overflow:
                                    hidden;

                                text-overflow:
                                    ellipsis;

                                white-space:
                                    nowrap;
                            "
                        >
                            ${escapeHtml(
                                item.tag
                            )}
                        </span>

                        <span
                            style="
                                display:flex;

                                align-items:
                                    baseline;

                                gap:
                                    5px;

                                white-space:
                                    nowrap;
                            "
                        >
                            <span
                                style="
                                    color:
                                        ${colors.text};
                                "
                            >
                                ${connectionLabel(
                                    item.strength
                                )}
                            </span>

                            <span
                                style="
                                    color:
                                        ${colors.muted};

                                    font-variant-numeric:
                                        tabular-nums;
                                "
                            >
                                (${numberOr(
                                    item.strength,
                                    0
                                ).toFixed(2)})
                            </span>
                        </span>
                    </div>
                `
            )
            .join("");
    }


    function formatContextRows(node) {
        const items =
            Array.isArray(
                node.context
            )
                ? node.context
                : [];

        if (!items.length) {
            return `
                <div
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    none
                </div>
            `;
        }

        return items
            .slice(
                0,
                5
            )
            .map(
                (item) => `
                    <div
                        style="
                            display:grid;

                            grid-template-columns:
                                minmax(0, 1fr)
                                auto;

                            align-items:
                                baseline;

                            column-gap:
                                12px;
                        "
                    >
                        <span
                            style="
                                overflow:
                                    hidden;

                                text-overflow:
                                    ellipsis;

                                white-space:
                                    nowrap;
                            "
                        >
                            ${escapeHtml(
                                item.tag
                            )}
                        </span>

                        <span
                            style="
                                display:flex;

                                align-items:
                                    baseline;

                                gap:
                                    5px;

                                white-space:
                                    nowrap;
                            "
                        >
                            <span
                                style="
                                    color:
                                        ${colors.text};
                                "
                            >
                                ${echoLabel(
                                    item.weight
                                )}
                            </span>

                            <span
                                style="
                                    color:
                                        ${colors.muted};

                                    font-variant-numeric:
                                        tabular-nums;
                                "
                            >
                                (${numberOr(
                                    item.weight,
                                    0
                                ).toFixed(2)})
                            </span>
                        </span>
                    </div>
                `
            )
            .join("");
    }


    // Neural flow diagram


    function resonanceMagnitude(relation) {
        if (
            !relation
            ||
            !relation.edge
        ) {
            return 0;
        }

        return Math.max(
            -1,
            Math.min(
                1,
                numberOr(
                    relation.edge.strength,
                    0
                )
            )
        );
    }


    function resonanceVector(relation) {
        const parent =
            nodesByTag.get(
                relation.parent
            );

        const child =
            nodesByTag.get(
                relation.child
            );

        const magnitude =
            resonanceMagnitude(
                relation
            );

        if (
            !parent
            ||
            !child
        ) {
            return {
                x: 0,
                y: 0,
                magnitude,
                angle: 0,
            };
        }

        const parentPixel =
            dataToPixel(
                parent.x,
                parent.y
            );

        const childPixel =
            dataToPixel(
                child.x,
                child.y
            );

        let dx =
            childPixel.x
            -
            parentPixel.x;

        let dy =
            childPixel.y
            -
            parentPixel.y;

        const length =
            Math.max(
                Math.hypot(
                    dx,
                    dy
                ),
                0.000001
            );

        dx /=
            length;

        dy /=
            length;

        if (
            magnitude
            <
            0
        ) {
            dx *=
                -1;

            dy *=
                -1;
        }

        return {
            x:
                dx
                *
                Math.abs(
                    magnitude
                ),

            y:
                dy
                *
                Math.abs(
                    magnitude
                ),

            magnitude,

            angle:
                Math.atan2(
                    dy,
                    dx
                )
                *
                180
                /
                Math.PI,
        };
    }


    function resonanceDepthOpacity(depth) {
        if (
            depth
            <=
            1
        ) {
            return 0.96;
        }

        if (
            depth
            ===
            2
        ) {
            return 0.72;
        }

        return 0.52;
    }


    function formatResonanceValue(value) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "–";
        }

        if (
            value
            <
            0
        ) {
            return (
                "−"
                +
                Math.abs(
                    value
                ).toFixed(2)
            );
        }

        return value.toFixed(
            2
        );
    }


    function formatNeuralResonanceDiagram() {
        if (
            !neuralManager
            ||
            !neuralManager.activeTree
        ) {
            return "";
        }

        const tree =
            neuralManager.activeTree;

        const treeEdges =
            Array.isArray(
                tree.treeEdges
            )
                ? tree.treeEdges
                : [];

        if (
            !tree.rootTag
            ||
            !treeEdges.length
        ) {
            return "";
        }

        const childrenByParent =
            new Map();

        treeEdges.forEach(
            (relation) => {
                if (
                    !childrenByParent.has(
                        relation.parent
                    )
                ) {
                    childrenByParent.set(
                        relation.parent,
                        []
                    );
                }

                childrenByParent
                    .get(
                        relation.parent
                    )
                    .push(
                        relation
                    );
            }
        );

        childrenByParent.forEach(
            (relations) => {
                relations.sort(
                    (a, b) => (
                        Math.abs(
                            resonanceMagnitude(
                                b
                            )
                        )
                        -
                        Math.abs(
                            resonanceMagnitude(
                                a
                            )
                        )
                    )
                );
            }
        );

        const rows =
            [];

        function visit(
            parentTag,
            depth
        ) {
            const children =
                childrenByParent.get(
                    parentTag
                )
                ||
                [];

            children.forEach(
                (relation) => {
                    const relationDepth =
                        numberOr(
                            relation.depth,
                            depth
                        );

                    const vector =
                        resonanceVector(
                            relation
                        );

                    const opacity =
                        resonanceDepthOpacity(
                            relationDepth
                        );

                    const indent =
                        relationDepth
                        *
                        14;

                    rows.push(`
                        <div
                            style="
                                display:grid;

                                grid-template-columns:
                                    minmax(0, 1fr)
                                    auto
                                    18px;

                                align-items:
                                    center;

                                column-gap:
                                    7px;

                                min-height:
                                    20px;

                                padding-left:
                                    ${indent}px;

                                opacity:
                                    ${opacity};
                            "
                        >
                            <span
                                style="
                                    overflow:
                                        hidden;

                                    text-overflow:
                                        ellipsis;

                                    white-space:
                                        nowrap;

                                    color:
                                        ${colors.text};
                                "
                            >
                                ${escapeHtml(
                                    relation.child
                                )}
                            </span>

                            <span
                                style="
                                    color:
                                        ${colors.muted};

                                    font-variant-numeric:
                                        tabular-nums;

                                    white-space:
                                        nowrap;
                                "
                            >
                                ${formatResonanceValue(
                                    vector.magnitude
                                )}
                            </span>

                            <span
                                class="
                                    semantic-resonance-arrow
                                "

                                style="
                                    color:
                                        ${
                                            colors.neural
                                            ||
                                            colors.text
                                        };

                                    transform:
                                        rotate(
                                            ${vector.angle.toFixed(2)}deg
                                        );
                                "
                            >
                                →
                            </span>
                        </div>
                    `);

                    visit(
                        relation.child,
                        relationDepth
                        +
                        1
                    );
                }
            );
        }

        visit(
            tree.rootTag,
            1
        );

        return `
            <div
                style="
                    margin-top:
                        13px;

                    padding-top:
                        9px;

                    border-top:
                        1px solid
                        rgba(
                            139,
                            148,
                            158,
                            .14
                        );
                "
            >
                <div
                    style="
                        display:flex;

                        align-items:
                            baseline;

                        justify-content:
                            space-between;

                        gap:
                            12px;

                        width:
                            100%;

                        margin-bottom:
                            7px;

                        white-space:
                            nowrap;
                    "
                >
                    <span
                        style="
                            color:
                                ${colors.primary};

                            font-size:
                                10px;
                        "
                    >
                        ${infoButton("flow", mapCopy("topics.flow.title"))}
                    </span>

                    <span
                        style="
                            color:
                                ${colors.muted};

                            font-size:
                                9px;
                        "
                    >
                        ${escapeHtml(mapCopy("topics.flow.diagram_hint"))}
                    </span>
                </div>

                <div
                    style="
                        color:
                            ${colors.text};

                        font-weight:
                            600;

                        margin-bottom:
                            3px;
                    "
                >
                    ${escapeHtml(
                        tree.rootTag
                    )}
                </div>

                <div>
                    ${rows.join("")}
                </div>
            </div>
        `;
    }


    // Info panel


    function showNodeInfo(
        node,
        selected
    ) {
        const info =
            document.getElementById(
                "semantic-map-info"
            );

        if (!info) {
            return;
        }

        activeInfoNode = node;
        activeInfoSelected = selected;

        const postCount =
            Array.isArray(
                node.posts
            )
                ? node.posts.length
                : 0;

        const systemCores =
            Array.isArray(
                node.systemCoreTags
            )
                ? node.systemCoreTags
                : [];

        const rawSystemLabel =
            typeof node.systemLabel === "string"
            && node.systemLabel.trim()
                ? node.systemLabel.trim()
                : (
                    systemCores.length
                        ? systemCores.join(" / ")
                        : mapCopy("labels.unresolved")
                );

        const systemLabel = rawSystemLabel.replace(
            /\s+field$/i,
            ""
        );

        const resonanceDiagram =
            selected
                ? formatNeuralResonanceDiagram()
                : "";

        const postsAction =
            selected
                ? `
                    <button
                        id="semantic-map-related-posts"

                        type="button"

                        style="
                            padding:
                                2px 6px;

                            border:
                                1px solid
                                rgba(
                                    113,
                                    199,
                                    166,
                                    .28
                                );

                            border-radius:
                                5px;

                            background:
                                rgba(
                                    113,
                                    199,
                                    166,
                                    .045
                                );

                            color:
                                ${colors.primary};

                            font:
                                inherit;

                            font-size:
                                9px;

                            line-height:
                                1.2;

                            cursor:
                                pointer;

                            white-space:
                                nowrap;
                        "
                    >
                        ${escapeHtml(mapCopy("view_traces"))}
                    </button>
                `
                : "";

        info.innerHTML = `
            <div
                style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:10px;
                    margin-bottom:8px;
                "
            >
                <div
                    style="
                        color:${colors.primary};
                        font-size:14px;
                        font-weight:600;
                    "
                >
                    ${escapeHtml(node.tag)}
                </div>

            </div>

            <div class="semantic-info-hint">
                ${mapCopy("info_hint")}
            </div>

            <div id="semantic-method-box-host"></div>

            <div
                style="
                    display:grid;

                    grid-template-columns:
                        minmax(0, 1fr)
                        auto;

                    align-items:
                        baseline;

                    gap:
                        3px 12px;

                    margin-bottom:
                        10px;

                    font-size:
                        10px;
                "
            >
                <span
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    ${infoButton("intensity", mapCopy("buttons.intensity"))}
                </span>

                <span
                    style="
                        display:flex;

                        align-items:
                            baseline;

                        justify-content:
                            flex-end;

                        gap:
                            5px;

                        justify-self:
                            end;

                        text-align:
                            right;

                        white-space:
                            nowrap;
                    "
                >
                    <span
                        style="
                            color:
                                ${colors.text};
                        "
                    >
                        ${intensityLabel(
                            node.weight
                        )}
                    </span>

                    <span
                        style="
                            color:
                                ${colors.muted};
                        "
                    >
                        (${numberOr(
                            node.weight,
                            0
                        ).toFixed(2)})
                    </span>
                </span>

                <span
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    ${infoButton("circuit", mapCopy("buttons.circuit"))}
                </span>

                <span
                    style="
                        color:
                            ${colors.text};

                        justify-self:
                            end;

                        text-align:
                            right;
                    "
                >
                    ${escapeHtml(
                        systemLabel
                    )}
                </span>

                <span
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    ${infoButton("importance", mapCopy("buttons.importance"))}
                </span>

                <span
                    style="
                        display:flex;

                        align-items:
                            baseline;

                        justify-content:
                            flex-end;

                        gap:
                            5px;

                        justify-self:
                            end;

                        text-align:
                            right;

                        white-space:
                            nowrap;
                    "
                >
                    <span
                        style="
                            color:
                                ${colors.text};
                        "
                    >
                        ${importanceLabel(
                            node.priority
                        )}
                    </span>

                    <span
                        style="
                            color:
                                ${colors.muted};
                        "
                    >
                        (${numberOr(
                            node.priority,
                            0
                        ).toFixed(2)})
                    </span>
                </span>

                <span
                    style="
                        color:
                            ${colors.muted};
                    "
                >
                    ${infoButton("traces", mapCopy("buttons.traces"))}
                </span>

                <span
                    style="
                        color:
                            ${colors.text};

                        justify-self:
                            end;

                        text-align:
                            right;
                    "
                >
                    ${postCount}
                </span>

                <span
                    style="
                        justify-self:
                            start;

                        margin-top:
                            2px;
                    "
                >
                    ${postsAction}
                </span>

                <span></span>
            </div>

            <div
                style="
                    padding-top:
                        8px;

                    border-top:
                        1px solid
                        rgba(
                            139,
                            148,
                            158,
                            .12
                        );
                "
            >
                <div
                    style="
                        color:
                            ${colors.primary};

                        margin-bottom:
                            3px;

                        font-size:
                            10px;
                    "
                >
                    ${infoButton("pull", mapCopy("buttons.pull"))}
                </div>

                <div
                    style="
                        margin-bottom:
                            9px;

                        font-size:
                            10px;
                    "
                >
                    ${formatSemanticNeighborRows(
                        node
                    )}
                </div>

                <div
                    style="
                        color:
                            ${colors.primary};

                        margin-bottom:
                            3px;

                        font-size:
                            10px;
                    "
                >
                    ${infoButton("connections", mapCopy("buttons.connections"))}
                </div>

                <div
                    style="
                        margin-bottom:
                            9px;

                        font-size:
                            10px;
                    "
                >
                    ${formatNeighborRows(
                        node
                    )}
                </div>

                <div
                    style="
                        color:
                            ${colors.primary};

                        margin-bottom:
                            3px;

                        font-size:
                            10px;
                    "
                >
                    ${infoButton("echoes", mapCopy("buttons.echoes"))}
                </div>

                <div
                    style="
                        font-size:
                            10px;
                    "
                >
                    ${formatContextRows(
                        node
                    )}
                </div>
            </div>

            ${resonanceDiagram}
        `;

        info.style.display =
            "block";

        bindMethodologyButtons(
            info,
            node
        );

        if (selected) {
            const button =
                document.getElementById(
                    "semantic-map-related-posts"
                );

            if (button) {
                button.addEventListener(
                    "click",
                    (event) => {
                        event.stopPropagation();

                        window.open(
                            relatedUrl(
                                node.tag
                            ),
                            "_blank",
                            "noopener,noreferrer"
                        );
                    }
                );
            }
        }
    }


    function refreshSelectedInfo() {
        if (!selectedTag) {
            return;
        }

        const node =
            nodesByTag.get(
                selectedTag
            );

        if (node) {
            showNodeInfo(
                node,
                true
            );
        }
    }


    function hideInfoPanel() {
        if (selectedTag) {
            refreshSelectedInfo();
            return;
        }

        const info =
            document.getElementById(
                "semantic-map-info"
            );

        if (info) {
            info.style.display =
                "none";

            info.innerHTML =
                "";
        }
    }


    // Plotly traces


    function findTrace(layer) {
        return gd.data.findIndex(
            (trace) =>
                (
                    trace.meta
                    ||
                    {}
                ).layer
                ===
                layer
        );
    }


    function hideTrace(layer) {
        const index =
            findTrace(
                layer
            );

        if (index < 0) {
            return;
        }

        Plotly.restyle(
            gd,
            {
                x: [[]],
                y: [[]],
                visible: false,
            },
            [
                index,
            ]
        );
    }


    function updateHighlight(node) {
        const selectedIndex =
            findTrace(
                "highlight"
            );

        if (
            selectedIndex
            >=
            0
        ) {
            Plotly.restyle(
                gd,
                {
                    x: [[
                        node.x,
                    ]],

                    y: [[
                        node.y,
                    ]],

                    visible:
                        true,
                },
                [
                    selectedIndex,
                ]
            );
        }

        hideTrace(
            "neighbor-highlight"
        );
    }


    // Selection


    function relatedUrl(tag) {
        return (
            siteUrl
            +
            "/?tag="
            +
            encodeURIComponent(
                tag
            )
        );
    }


    function selectTag(node) {
        selectedTag =
            node.tag;

        updateHighlight(
            node
        );

        drawSelectedNeuralNetwork();

        showNodeInfo(
            node,
            true
        );

        updateLabels();
    }


    function clearSelection() {
        activeMethodologyTopic = null;
        selectedTag =
            null;

        clearNeuralNetwork();

        hideTrace(
            "highlight"
        );

        hideTrace(
            "neighbor-highlight"
        );

        hideInfoPanel();

        updateLabels();
    }


    // Search


    function findTag(query) {
        const normalized =
            String(
                query
                ||
                ""
            )
                .trim()
                .toLowerCase();

        if (!normalized) {
            return null;
        }

        return (
            nodes.find(
                (node) =>
                    node.tag
                        .toLowerCase()
                    ===
                    normalized
            )

            ||

            nodes.find(
                (node) =>
                    node.tag
                        .toLowerCase()
                        .startsWith(
                            normalized
                        )
            )

            ||

            nodes.find(
                (node) =>
                    node.tag
                        .toLowerCase()
                        .includes(
                            normalized
                        )
            )

            ||

            null
        );
    }


    function focusTag(query) {
        const node =
            findTag(
                query
            );

        if (!node) {
            return;
        }

        const widths = [
            1.65,
            1.15,
            0.72,
            0.42,
        ];

        const width =
            widths[
                Math.min(
                    Number(
                        node.level
                    ),
                    3
                )
            ];

        const height =
            width
            *
            1.02;

        Plotly.relayout(
            gd,
            {
                "xaxis.range": [
                    node.x
                    -
                    width
                    /
                    2,

                    node.x
                    +
                    width
                    /
                    2,
                ],

                "yaxis.range": [
                    node.y
                    -
                    height
                    /
                    2,

                    node.y
                    +
                    height
                    /
                    2,
                ],
            }
        ).then(
            () => {
                selectTag(
                    node
                );

                applyVisibility();
            }
        );
    }


    // Visibility


    function applyVisibility() {
        const detail =
            getDetailLevel();

        state.detail =
            detail;

        const show =
            [];

        const hide =
            [];

        gd.data.forEach(
            (
                trace,
                index
            ) => {
                const meta =
                    trace.meta
                    ||
                    {};

                const layer =
                    meta.layer;

                if (
                    layer
                    ===
                    "node"
                ) {
                    (
                        Number(
                            meta.visibilityLevel
                            ||
                            0
                        )
                        <=
                        detail
                            ? show
                            : hide
                    ).push(
                        index
                    );

                } else if (
                    layer
                    ===
                    "tag-edge"
                ) {
                    (
                        state.tagEdges
                        &&
                        detail >= 1
                            ? show
                            : hide
                    ).push(
                        index
                    );

                } else if (
                    layer
                    ===
                    "anchor-edge"
                ) {
                    (
                        state.anchorEdges
                            ? show
                            : hide
                    ).push(
                        index
                    );

                } else if (
                    layer
                    ===
                    "axis"
                ) {
                    (
                        state.axes
                            ? show
                            : hide
                    ).push(
                        index
                    );
                }
            }
        );

        const jobs =
            [];

        if (show.length) {
            jobs.push(
                Plotly.restyle(
                    gd,
                    {
                        visible:
                            true,
                    },
                    show
                )
            );
        }

        if (hide.length) {
            jobs.push(
                Plotly.restyle(
                    gd,
                    {
                        visible:
                            false,
                    },
                    hide
                )
            );
        }

        Promise
            .all(
                jobs
            )
            .then(
                scheduleOverlayUpdate
            );
    }


    // Overlay lifecycle


    function scheduleOverlayUpdate() {
        if (overlayFrame) {
            cancelAnimationFrame(
                overlayFrame
            );
        }

        overlayFrame =
            requestAnimationFrame(
                () => {
                    updateLabels();

                    redrawVisualModules();

                    refreshSelectedInfo();
                }
            );
    }


    function bindBackgroundDeselect() {
        const background =
            gd.querySelector(
                ".nsewdrag"
            );

        if (
            !background
            ||
            background
                .dataset
                .semanticBound
            ===
            "1"
        ) {
            return;
        }

        background
            .dataset
            .semanticBound =
            "1";

        background.addEventListener(
            "click",
            clearSelection
        );
    }


    // Responsive layout


    function applyResponsiveLayout() {
        if (responsiveTimer) {
            clearTimeout(
                responsiveTimer
            );
        }

        responsiveTimer =
            window.setTimeout(
                () => {
                    if (!gd.isConnected) {
                        return;
                    }

                    if (isMobile()) {
                        const height =
                            Math.max(
                                640,

                                Math.min(
                                    820,

                                    window.innerHeight
                                    *
                                    0.82
                                )
                            );

                        Plotly.relayout(
                            gd,
                            {
                                height,

                                "margin.l":
                                    18,

                                "margin.r":
                                    18,

                                "margin.t":
                                    62,

                                "margin.b":
                                    46,

                                "title.font.size":
                                    17,
                            }
                        ).then(
                            scheduleOverlayUpdate
                        );

                    } else {
                        Plotly.relayout(
                            gd,
                            {
                                height:
                                    860,

                                "margin.l":
                                    48,

                                "margin.r":
                                    48,

                                "margin.t":
                                    76,

                                "margin.b":
                                    60,

                                "title.font.size":
                                    20,
                            }
                        ).then(
                            scheduleOverlayUpdate
                        );
                    }
                },
                80
            );
    }


    // Initialization


    injectResponsiveStyles();

    createControls();

    bindBackgroundDeselect();

    initializeVisualModules();


    gd.on(
        "plotly_relayout",
        applyVisibility
    );


    gd.on(
        "plotly_afterplot",
        () => {
            bindBackgroundDeselect();

            scheduleOverlayUpdate();
        }
    );


    if (hasHover()) {
        gd.on(
            "plotly_hover",
            (event) => {
                if (selectedTag) {
                    return;
                }

                const point =
                    event.points
                    &&
                    event.points[0];

                if (!point) {
                    return;
                }

                const trace =
                    gd.data[
                        point.curveNumber
                    ];

                if (
                    (
                        trace.meta
                        ||
                        {}
                    ).layer
                    !==
                    "node"
                ) {
                    return;
                }

                const node =
                    nodesByTag.get(
                        point.customdata
                    );

                if (node) {
                    showNodeInfo(
                        node,
                        false
                    );
                }
            }
        );


        gd.on(
            "plotly_unhover",
            () => {
                if (!selectedTag) {
                    hideInfoPanel();
                }
            }
        );
    }


    gd.on(
        "plotly_click",
        (event) => {
            const point =
                event.points
                &&
                event.points[0];

            if (!point) {
                return;
            }

            const trace =
                gd.data[
                    point.curveNumber
                ];

            if (
                (
                    trace.meta
                    ||
                    {}
                ).layer
                !==
                "node"
            ) {
                clearSelection();

                return;
            }

            const node =
                nodesByTag.get(
                    point.customdata
                );

            if (node) {
                selectTag(
                    node
                );
            }
        }
    );


    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key
                ===
                "Escape"
            ) {
                clearSelection();
            }
        }
    );


    window.addEventListener(
        "resize",
        () => {
            applyResponsiveLayout();

            scheduleOverlayUpdate();
        }
    );


    applyResponsiveLayout();

    applyVisibility();

    scheduleOverlayUpdate();


    if (ambientManager) {
        ambientManager.start();
    }

})();
