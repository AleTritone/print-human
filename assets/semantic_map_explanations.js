(function () {
    "use strict";

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const fixed = (value) => number(value).toFixed(2);
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
    const template = (value, vars = {}) => String(value || "").replace(/\{(\w+)\}/g,
        (match, key) => Object.hasOwn(vars, key) ? String(vars[key]) : match);
    const paragraph = (text) => text ? `<p>${escape(text)}</p>` : "";
    const mi = (text) => `<mi>${escape(text)}</mi>`;
    const mn = (value) => `<mn>${escape(value)}</mn>`;
    const mo = (text) => `<mo>${escape(text)}</mo>`;
    const sub = (base, index) => `<msub>${mi(base)}${mi(index)}</msub>`;
    const frac = (top, bottom) => `<mfrac><mrow>${top}</mrow><mrow>${bottom}</mrow></mfrac>`;
    const power = (base, exponent) => `<msup><mrow>${base}</mrow><mrow>${exponent}</mrow></msup>`;
    const sum = (index, content) => `<munder>${mo("∑")}<mtext>${escape(index)}</mtext></munder>${content}`;
    const math = (...lines) => `<div class="semantic-explain-equations">${lines.map((line) =>
        `<math display="block" xmlns="http://www.w3.org/1998/Math/MathML">${line}</math>`).join("")}</div>`;
    const definitions = (items) => `<dl class="semantic-explain-definitions">${(items || []).map(([symbol, text]) =>
        `<dt>${escape(symbol)}</dt><dd>${escape(text)}</dd>`).join("")}</dl>`;
    const metrics = (rows) => `<dl class="semantic-explain-values">${rows.map(([label, value]) =>
        `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>`;
    const step = (index, copy, body) => `<section class="semantic-explain-step">
        <h4><span aria-hidden="true">${index + 1}</span>${escape(copy.title)}</h4>
        ${paragraph(copy.body)}${body}</section>`;
    const note = (text) => text ? `<p class="semantic-explain-note">${escape(text)}</p>` : "";
    const result = (text) => `<p class="semantic-explain-result">${escape(text)}</p>`;

    const bands = {
        importance: [[0.40, "low"], [0.60, "moderate"], [0.80, "high"], [Infinity, "essential"]],
        connections: [[0.40, "weak"], [0.60, "moderate"], [0.80, "high"], [Infinity, "strong"]],
        echoes: [[0.25, "weak"], [0.50, "moderate"], [0.75, "strong"], [Infinity, "close"]],
    };

    function qualitativeLabel(topic, value, copy) {
        const rounded = Number(fixed(value));
        const band = (bands[topic] || []).find(([upper]) => rounded < upper);
        return band ? copy.labels[band[1]] : "";
    }

    function figure(title, svg, caption = "") {
        return `<figure class="semantic-explain-figure"><div class="semantic-explain-chart-title">${escape(title)}</div>${svg}${caption ? `<figcaption>${escape(caption)}</figcaption>` : ""}</figure>`;
    }

    function bars(title, rows, accent, maximum = 1, caption = "") {
        const width = 440;
        const height = rows.length * 47 + 22;
        const max = Math.max(number(maximum), 1e-9);
        const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">
            <title>${escape(title)}</title><desc>${escape(rows.map((row) => `${row.label}: ${fixed(row.value)}`).join("; "))}</desc>
            ${rows.map((row, index) => `<g transform="translate(8, ${index * 47 + 15})">
                <text class="semantic-explain-svg-text" y="0">${escape(row.label)}</text>
                <text class="semantic-explain-svg-value" x="424" y="0" text-anchor="end">${fixed(row.value)}</text>
                <rect y="9" width="424" height="9" rx="4" fill="rgba(139,148,158,.12)"/>
                <rect y="9" width="${(424 * clamp(number(row.value) / max)).toFixed(2)}" height="9" rx="4" fill="${escape(accent)}" opacity="${row.opacity ?? 0.8}"/>
                ${row.reference !== undefined ? `<line x1="${424 * clamp(row.reference / max)}" x2="${424 * clamp(row.reference / max)}" y1="5" y2="22" stroke="#E6EDF3" stroke-dasharray="3 2"/>` : ""}
            </g>`).join("")}
            <text class="semantic-explain-svg-tick" x="8" y="${height - 3}">0</text>
            <text class="semantic-explain-svg-tick" x="432" y="${height - 3}" text-anchor="end">${fixed(max)}</text>
        </svg>`;
        return figure(title, svg, caption);
    }

    function stacked(title, rows, accent, maximum = 1, caption = "") {
        let cursor = 8;
        const rects = rows.map((row, index) => {
            const width = 424 * clamp(number(row.value) / Math.max(maximum, 1e-9));
            const rect = `<rect x="${cursor}" y="15" width="${width}" height="21" fill="${escape(accent)}" opacity="${[0.35, 0.65, 1][index % 3]}"/>`;
            cursor += width;
            return rect;
        }).join("");
        const legend = `<div class="semantic-explain-stack-legend">${rows.map((row, index) =>
            `<div><i aria-hidden="true" style="background:${escape(accent)};opacity:${[0.35, 0.65, 1][index % 3]}"></i><span>${escape(row.label)}</span><strong>${fixed(row.value)}</strong></div>`).join("")}</div>`;
        return figure(title, `<svg viewBox="0 0 440 63" role="img" aria-label="${escape(title)}">
            <title>${escape(title)}</title><desc>${escape(rows.map((row) => `${row.label}: ${fixed(row.value)}`).join("; "))}</desc>
            <rect x="8" y="15" width="424" height="21" rx="4" fill="rgba(139,148,158,.12)"/>
            ${rects}<text class="semantic-explain-svg-tick" x="8" y="55">0</text>
            <text class="semantic-explain-svg-tick" x="432" y="55" text-anchor="end">${fixed(maximum)}</text>
        </svg>${legend}`, caption);
    }

    function scale(topic, value, e) {
        const rows = bands[topic];
        const symbol = {importance: "P", connections: "w", echoes: "E"}[topic];
        let previous = 0;
        const rects = rows.map(([upper], index) => {
            const end = Math.min(upper, 1);
            const rect = `<rect x="${8 + previous * 424}" y="25" width="${(end - previous) * 424}" height="12" fill="${escape(e.accent)}" opacity="${0.25 + index * 0.23}"/>`;
            previous = end;
            return rect;
        }).join("");
        const x = 8 + clamp(Number(fixed(value))) * 424;
        const labelX = clamp(x, 26, 414);
        const svg = `<svg viewBox="0 0 440 62" role="img" aria-label="${escape(e.common.scale)}">
            <title>${escape(e.common.scale)}: ${fixed(value)} — ${escape(qualitativeLabel(topic, value, e.copy))}</title>
            ${rects}<line x1="${x}" x2="${x}" y1="20" y2="41" stroke="#E6EDF3" stroke-width="2"/>
            <text class="semantic-explain-svg-value" x="${labelX}" y="13" text-anchor="middle">${fixed(value)}</text>
            <text class="semantic-explain-svg-tick" x="8" y="57">0</text><text class="semantic-explain-svg-tick" x="432" y="57" text-anchor="end">1</text>
        </svg>`;
        let lower = 0;
        const legend = rows.map(([upper, key]) => {
            const line = `${fixed(lower)} ≤ ${symbol} ${upper === Infinity ? "≤ 1.00" : "< " + fixed(upper)} → ${e.copy.labels[key]}`;
            lower = upper;
            return `<div>${escape(line)}</div>`;
        }).join("");
        return figure(e.common.scale, svg + `<div class="semantic-explain-scale">${legend}</div>`, e.common.rounding);
    }

    function postCount(node) {
        return Array.isArray(node.posts) ? new Set(node.posts).size : number(node.count);
    }

    function pairFor(node, items, e) {
        const item = (items || [])[0];
        if (!item) return null;
        const other = e.nodes.find((entry) => entry.tag === item.tag);
        if (!other) return null;
        const a = postCount(node);
        const b = postCount(other);
        const shared = Array.isArray(node.posts) && Array.isArray(other.posts)
            ? new Set(node.posts.filter((slug) => other.posts.includes(slug))).size
            : number(item.cooccurrence);
        const union = a + b - shared;
        return {item, other, a, b, shared, union, jaccard: union > 0 ? shared / union : 0};
    }

    // Validate the neighbour union against node degrees and total edge weights.
    function collectLayoutEdges(nodes, provided) {
        if (Array.isArray(provided) && provided.length) return provided;
        const found = new Map();
        for (const node of nodes) for (const item of node.semanticNeighbors || []) {
            const key = [node.tag, item.tag].sort().join("|");
            found.set(key, {source: node.tag, target: item.tag, weight: Math.max(number(item.affinity, item.semantic), 0.001)});
        }
        const edges = [...found.values()];
        for (const node of nodes) {
            const expected = node.attractionComponents;
            if (!expected || !Number.isFinite(expected.neighbor_count) || !Number.isFinite(expected.raw)) return null;
            const incident = edges.filter((edge) => edge.source === node.tag || edge.target === node.tag);
            if (incident.length !== expected.neighbor_count) return null;
            if (Math.abs(incident.reduce((total, edge) => total + edge.weight, 0) - expected.raw) > (incident.length + 1) * 0.00006) return null;
        }
        return edges;
    }

    function circuitMetrics(node, nodes, layoutEdges) {
        const members = nodes.filter((entry) => entry.systemId === node.systemId);
        if (!layoutEdges || members.length < 2) return {members, rows: [], modularity: null};
        const tags = members.map((entry) => entry.tag);
        const size = tags.length;
        const degree = Array(size).fill(0);
        const distance = Array.from({length: size}, (_, i) => Array.from({length: size}, (_, j) => i === j ? 0 : Infinity));
        for (const edge of layoutEdges) {
            const i = tags.indexOf(edge.source);
            const j = tags.indexOf(edge.target);
            if (i < 0 || j < 0) continue;
            const weight = Math.max(number(edge.weight, edge.affinity), 0.001);
            degree[i] += weight;
            degree[j] += weight;
            distance[i][j] = distance[j][i] = 1 / weight;
        }
        for (let k = 0; k < size; k++) for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
            distance[i][j] = Math.min(distance[i][j], distance[i][k] + distance[k][j]);
        }
        const closeness = distance.map((row, index) => {
            const reachable = row.filter((value, j) => j !== index && Number.isFinite(value));
            const total = reachable.reduce((a, b) => a + b, 0);
            return total > 0 ? reachable.length / total * reachable.length / (size - 1) : 0;
        });
        const maxDegree = Math.max(...degree) || 1;
        const maxCloseness = Math.max(...closeness) || 1;
        const maxIntensity = Math.max(...members.map((entry) => number(entry.weight)));
        const rows = members.map((entry, index) => {
            const d = degree[index] / maxDegree;
            const c = closeness[index] / maxCloseness;
            const semantic = 0.65 * d + 0.35 * c;
            const intensity = maxIntensity > 0 ? number(entry.weight) / maxIntensity : semantic;
            return {node: entry, degree: d, closeness: c, intensity, score: 0.55 * semantic + 0.45 * intensity};
        });
        const totalWeight = layoutEdges.reduce((total, edge) => total + number(edge.weight, edge.affinity), 0);
        let modularity = 0;
        for (const id of new Set(nodes.map((entry) => entry.systemId))) {
            const group = new Set(nodes.filter((entry) => entry.systemId === id).map((entry) => entry.tag));
            let internal = 0;
            let strength = 0;
            for (const edge of layoutEdges) {
                const weight = number(edge.weight, edge.affinity);
                const insideA = group.has(edge.source);
                const insideB = group.has(edge.target);
                if (insideA && insideB) internal += weight;
                strength += weight * (Number(insideA) + Number(insideB));
            }
            if (totalWeight > 0) modularity += internal / totalWeight - (strength / (2 * totalWeight)) ** 2;
        }
        return {members, rows, modularity};
    }

    function circuitGraph(node, data, edges, e) {
        const members = data.members;
        const minX = Math.min(...members.map((entry) => entry.x));
        const maxX = Math.max(...members.map((entry) => entry.x));
        const minY = Math.min(...members.map((entry) => entry.y));
        const maxY = Math.max(...members.map((entry) => entry.y));
        const points = new Map(members.map((entry) => [entry.tag, {
            x: 65 + (number(entry.x) - minX) / (maxX - minX || 1) * 310,
            y: 35 + (maxY - number(entry.y)) / (maxY - minY || 1) * 175,
        }]));
        const lines = (edges || []).filter((edge) => points.has(edge.source) && points.has(edge.target)).map((edge) => {
            const a = points.get(edge.source);
            const b = points.get(edge.target);
            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${escape(e.accent)}" stroke-opacity=".4" stroke-width="${1 + number(edge.weight, edge.affinity) * 2}"/>`;
        }).join("");
        const dots = members.map((entry) => {
            const p = points.get(entry.tag);
            const core = entry.systemRole === "core";
            return `<g><title>${escape(entry.tag)} — ${escape(core ? e.copy.labels.core : e.copy.labels.member)}</title>
                ${entry.tag === node.tag ? `<circle cx="${p.x}" cy="${p.y}" r="13" fill="none" stroke="#E6EDF3" stroke-dasharray="3 2"/>` : ""}
                <circle cx="${p.x}" cy="${p.y}" r="${core ? 8 : 5}" fill="${core ? escape(e.accent) : "#161B22"}" stroke="${escape(e.accent)}"/>
                <text class="semantic-explain-svg-text" x="${p.x}" y="${p.y + 25}" text-anchor="middle">${escape(entry.tag)}</text></g>`;
        }).join("");
        return figure(e.topic.chart_title, `<svg viewBox="0 0 440 250" role="img" aria-label="${escape(e.topic.chart_title)}"><title>${escape(e.topic.chart_title)}</title>${lines}${dots}</svg>`, e.topic.chart_caption);
    }

    function renderCircuit(node, e) {
        const c = e.topic;
        const data = circuitMetrics(node, e.nodes, e.layoutEdges);
        const ratio = number(e.method.core_score_ratio, 0.94);
        const maxCores = number(e.method.max_system_cores, 3);
        const selected = data.rows.find((row) => row.node.tag === node.tag);
        const best = Math.max(...data.rows.map((row) => row.score), 0);
        const cores = (node.systemCoreTags || []).join(" / ") || e.copy.labels.unresolved;
        const steps = [];
        steps.push(step(0, c.steps[0], math(
            mi("k") + mo("=") + `<mtext>min</mtext>${mo("(")}${mi("N")}${mo("−")}${mn(1)}${mo(",")}${mn(6)}${mo(",")}<mtext>max</mtext>${mo("(")}${mn(2)}${mo(",")}<mtext>round</mtext><msqrt>${mi("N")}</msqrt>${mo(")")}${mo(")")}`,
            mi("Q") + mo("=") + sum("c", mo("[") + frac(sub("w", "c"), mi("m")) + mo("−") + power(frac(sub("s", "c"), mn(2) + mi("m")), mn(2)) + mo("]"))
        ) + definitions(c.definitions_graph) + metrics([
            [c.labels.ideas, e.nodes.length], [c.labels.neighbors, number(e.method.layout_knn)],
            [c.labels.modularity, data.modularity === null ? e.common.unavailable : fixed(data.modularity)],
        ])));
        steps.push(step(1, c.steps[1], math(
            sub("d", "x") + mo("=") + sum("y ∈ N_c(x)", sub("a", "xy")),
            sub("c", "x") + mo("=") + frac(sub("r", "x"), sub("n", "c") + mo("−") + mn(1))
                + frac(sub("r", "x"), sum("y ∈ R(x)", sub("ℓ", "xy"))),
            sub("D", "x") + mo("=") + frac(sub("d", "x"), sub("d", "max")),
            sub("C", "x") + mo("=") + frac(sub("c", "x"), sub("c", "max")),
            sub("I", "x") + mo("=") + frac(sub("i", "x"), sub("i", "max")),
            sub("q", "x") + mo("=") + mn("0.55") + mo("(") + mn("0.65") + sub("D", "x") + mo("+") + mn("0.35") + sub("C", "x") + mo(")") + mo("+") + mn("0.45") + sub("I", "x")
        ) + definitions(c.definitions_core) + (selected ? bars(c.labels.components, [
            {label: c.labels.degree, value: selected.degree}, {label: c.labels.closeness, value: selected.closeness},
            {label: c.labels.intensity, value: selected.intensity},
        ], e.accent) : note(data.members.length === 1 ? c.singleton : e.common.unavailable))));
        steps.push(step(2, c.steps[2], math(sub("q", "x") + mo("≥") + mn(fixed(ratio)) + sub("q", "max"))
            + (data.rows.length ? bars(c.labels.ranking, [...data.rows].sort((a, b) => b.score - a.score).map((row) => ({
                label: `${row.node.tag}${row.node.systemRole === "core" ? " · " + e.copy.labels.core : ""}`,
                value: row.score, reference: ratio * best,
            })), e.accent, 1, c.labels.cutoff) : "")
            + note(template(c.core_limit, {max: maxCores, ratio: fixed(ratio)}))));
        steps.push(step(3, c.steps[3], circuitGraph(node, data, e.layoutEdges, e) + metrics([
            [c.labels.core, cores], [c.labels.size, data.members.length],
            [c.labels.role, node.systemRole === "core" ? e.copy.labels.core : e.copy.labels.member],
        ])));
        return steps.join("") + result(template(c.reading, {tag: node.tag, core: cores}));
    }

    function renderImportance(node, e) {
        const c = e.topic;
        const p = node.priorityComponents || {};
        const weights = [number(e.method.importance_frequency_weight, 0.45), number(e.method.importance_degree_weight, 0.35), number(e.method.importance_betweenness_weight, 0.20)];
        const values = [number(p.frequency), number(p.degree), number(p.betweenness)];
        const pieces = values.map((value, index) => ({label: c.labels.components[index], value: value * weights[index]}));
        return step(0, c.steps[0], math(
            mi("F") + mo("=") + frac(sub("f", "x"), sub("f", "max")),
            mi("W") + mo("=") + frac(sub("w", "x"), sub("w", "max")),
            mi("B") + mo("=") + frac(sub("b", "x"), sub("b", "max")),
            sub("w", "x") + mo("=") + sum("y ∈ N(x)", sub("a", "xy")),
            sub("b", "x") + mo("=") + sum("s < t; s,t ≠ x", frac(sub("σ", "st") + mo("(") + mi("x") + mo(")"), sub("σ", "st")))
        ) + definitions(c.definitions) + bars(c.labels.inputs, values.map((value, index) => ({label: ["F", "W", "B"][index], value})), e.accent))
        + step(1, c.steps[1], math(mi("P") + mo("=") + weights.map((weight, index) => mn(fixed(weight)) + [mi("F"), mi("W"), mi("B")][index]).join(mo("+")))
            + stacked(c.labels.contributions, pieces, e.accent, 1, c.chart_caption)
            + metrics([[c.labels.result, fixed(node.priority)]]))
        + step(2, c.steps[2], scale("importance", node.priority, e))
        + result(template(c.reading, {tag: node.tag, value: fixed(node.priority), label: qualitativeLabel("importance", node.priority, e.copy)}));
    }

    function renderTraces(node, e) {
        const c = e.topic;
        const count = postCount(node);
        const total = e.totalPosts;
        const ratio = total > 0 ? count / total : 0;
        return step(0, c.steps[0], definitions(c.definitions) + math(sub("T", "x") + mo("=") + mo("|") + sub("P", "x") + mo("|"))
            + metrics([[c.labels.idea, node.tag], [c.labels.count, count]]))
        + step(1, c.steps[1], stacked(c.chart_title, [
            {label: c.labels.with, value: count}, {label: c.labels.without, value: Math.max(0, total - count)},
        ], e.accent, Math.max(total, 1), c.chart_caption)
            + math(mi("ρ") + mo("=") + frac(sub("T", "x"), mi("N")))
            + metrics([[c.labels.total, total], [c.labels.coverage, `${(ratio * 100).toFixed(0)}%`]])
            + note(Array.isArray(node.posts) && node.posts.length ? `${c.labels.publications}: ${node.posts.join(", ")}` : e.common.no_publications))
        + step(2, c.steps[2], result(template(c.reading, {tag: node.tag, count, total})));
    }

    function confidenceChart(shared, tau, e) {
        const maximum = Math.max(8, Math.ceil(shared + 2));
        const point = (s) => [35 + s / maximum * 380, 140 - (1 - Math.exp(-s / tau)) * 110];
        const path = Array.from({length: 81}, (_, i) => point(maximum * i / 80)).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
        const [x, y] = point(shared);
        return figure(e.topic.labels.confidence, `<svg viewBox="0 0 440 185" role="img" aria-label="${escape(e.topic.labels.confidence)}">
            <title>${escape(e.topic.labels.confidence)}</title><desc>S = ${shared}; C = ${fixed(1 - Math.exp(-shared / tau))}</desc>
            <path d="M35,30 V140 H415" stroke="#8B949E" fill="none"/>
            <path d="${path}" stroke="${escape(e.accent)}" stroke-width="2" fill="none"/>
            <line x1="${x}" x2="${x}" y1="${y}" y2="140" stroke="#8B949E" stroke-dasharray="3 3"/>
            <circle cx="${x}" cy="${y}" r="4" fill="#E6EDF3"/>
            <text class="semantic-explain-svg-value" x="${clamp(x, 55, 382)}" y="${Math.max(18, y - 10)}" text-anchor="middle">${fixed(1 - Math.exp(-shared / tau))}</text>
            <text class="semantic-explain-svg-tick" x="25" y="144">0</text><text class="semantic-explain-svg-tick" x="25" y="34">1</text>
            <text class="semantic-explain-svg-text" x="18" y="20">C</text>
            <text class="semantic-explain-svg-tick" x="35" y="158">0</text><text class="semantic-explain-svg-tick" x="415" y="158" text-anchor="end">${maximum}</text>
            <text class="semantic-explain-svg-text" x="225" y="179" text-anchor="middle">${escape(e.topic.labels.shared)}</text>
        </svg>`, e.topic.confidence_caption);
    }

    function renderPull(node, e) {
        const c = e.topic;
        const pair = pairFor(node, node.semanticNeighbors, e);
        const tau = Math.max(number(e.method.layout_corpus_confidence_scale, 2), 1e-9);
        const boost = number(e.method.layout_corpus_max_boost, 0.65);
        const exponent = number(e.method.pillow_attraction_visual_exponent, 0.72);
        const g = pair ? clamp(number(pair.item.semantic)) : 0;
        const confidence = pair ? 1 - Math.exp(-pair.shared / tau) : 0;
        const bonus = pair ? boost * pair.jaccard * confidence * (1 - g) : 0;
        const affinity = g + bonus;
        const attraction = node.attractionComponents || {};
        const normalized = clamp(number(node.attractionStrength));
        const pairTitle = pair ? template(e.common.pair, {tag: node.tag, other: pair.other.tag}) : e.common.no_pairs;
        return step(0, c.steps[0], math(mi("G") + mo("=") + `<mtext>clip</mtext>${mo("(")}${frac(sub("v", "a") + mo("·") + sub("v", "b"), mo("‖") + sub("v", "a") + mo("‖") + mo("‖") + sub("v", "b") + mo("‖"))}${mo(",")}${mn(0)}${mo(",")}${mn(1)}${mo(")")}`)
            + definitions(c.definitions_language) + note(pairTitle)
            + (pair ? metrics([["G", fixed(g)]]) : ""))
        + step(1, c.steps[1], math(
            mi("J") + mo("=") + frac(mi("S"), mi("A") + mo("+") + mi("B") + mo("−") + mi("S")),
            mi("C") + mo("=") + mn(1) + mo("−") + power(mi("e"), mo("−") + frac(mi("S"), mn(fixed(tau))))
        ) + definitions(c.definitions_corpus) + (pair ? confidenceChart(pair.shared, tau, e) + metrics([
            ["A", pair.a], ["B", pair.b], ["S", pair.shared], ["J", fixed(pair.jaccard)], ["C", fixed(confidence)],
        ]) : note(e.common.no_pairs)))
        + step(2, c.steps[2], math(
            mi("P") + mo("=") + mi("G") + mo("+") + mn(fixed(boost)) + mi("J") + mi("C") + mo("(") + mn(1) + mo("−") + mi("G") + mo(")"),
            mi("d") + mo("≈") + `<msqrt>${mn(2)}${mo("(")}${mn(1)}${mo("−")}${mi("P")}${mo(")")}</msqrt>`
        ) + definitions(c.definitions_result) + (pair ? stacked(c.labels.pull, [
            {label: c.labels.language, value: g}, {label: c.labels.bonus, value: bonus},
        ], e.accent, 1, c.distance_caption) + metrics([[c.labels.pull, fixed(affinity)], [c.labels.distance, fixed(Math.sqrt(Math.max(2 * (1 - affinity), 1e-9)))]]) : ""))
        + step(3, c.steps[3], math(
            sub("H", "x") + mo("=") + sum("y ∈ Nₗ(x)", sub("P", "xy")),
            sub("U", "x") + mo("=") + frac(sub("H", "x"), sub("H", "max")),
            sub("V", "x") + mo("=") + power(sub("U", "x"), mn(fixed(exponent)))
        ) + definitions(c.definitions_glow) + bars(c.labels.glow, [
            {label: "U", value: normalized}, {label: "V", value: normalized ** exponent},
        ], e.accent) + metrics([["H", fixed(attraction.raw)], [c.labels.maximum, fixed(attraction.max_raw)]]))
        + result(c.reading) + note(e.common.rounded);
    }

    function renderConnections(node, e) {
        const c = e.topic;
        const pair = pairFor(node, node.neighbors, e);
        const base = number(e.method.interaction_base_vector_weight, 0.7);
        const context = number(e.method.interaction_context_vector_weight, 0.3);
        const semanticWeight = number(e.method.interaction_semantic_weight, 0.8);
        const corpusWeight = number(e.method.interaction_cooccurrence_weight, 0.2);
        const threshold = number(e.method.semantic_edge_threshold, 0.35);
        const similarity = pair ? number(pair.item.semantic) : 0;
        const score = pair ? number(pair.item.strength) : 0;
        return step(0, c.steps[0], math(
            sub("c", "x") + mo("=") + `<mtext>normalize</mtext>${mo("(")}${sum("y ∈ C(x)", sub("J", "xy") + sub("v", "y"))}${mo(")")}`,
            sub("u", "x") + mo("=") + `<mtext>normalize</mtext>${mo("(")}${mn(fixed(base))}${sub("v", "x")}${mo("+")}${mn(fixed(context))}${sub("c", "x")}${mo(")")}`
        ) + definitions(c.definitions_vectors) + note(c.fallback))
        + step(1, c.steps[1], math(
            mi("S") + mo("=") + frac(sub("u", "a") + mo("·") + sub("u", "b"), mo("‖") + sub("u", "a") + mo("‖") + mo("‖") + sub("u", "b") + mo("‖")),
            mi("J") + mo("=") + frac(sub("n", "ab"), sub("n", "a") + mo("+") + sub("n", "b") + mo("−") + sub("n", "ab")),
            mi("w") + mo("=") + `<mtext>max</mtext>${mo("(")}${mn("0.01")}${mo(",")}${mn(fixed(semanticWeight))}<mtext>max</mtext>${mo("(")}${mn(0)}${mo(",")}${mi("S")}${mo(")")}${mo("+")}${mn(fixed(corpusWeight))}${mi("J")}${mo(")")}`
        ) + definitions(c.definitions_score) + (pair ? note(template(e.common.pair, {tag: node.tag, other: pair.other.tag}))
            + stacked(c.labels.contributions, [
                {label: c.labels.semantic, value: semanticWeight * Math.max(similarity, 0)},
                {label: c.labels.corpus, value: corpusWeight * pair.jaccard},
            ], e.accent, 1, c.chart_caption) + metrics([["S", fixed(similarity)], ["J", fixed(pair.jaccard)], ["w", fixed(score)]]) : note(e.common.no_pairs)))
        + step(2, {...c.steps[2], body: template(c.steps[2].body, {threshold: fixed(threshold)})}, math(
            mi("S") + mo("≥") + mn(fixed(threshold)) + `<mspace width="0.6em"/><mtext>${escape(c.labels.or)}</mtext><mspace width="0.6em"/>` + sub("n", "ab") + mo("≥") + mn(1)
        ) + (pair ? metrics([[c.labels.shared, pair.shared], [c.labels.kept, similarity >= threshold || pair.shared >= 1 ? c.labels.yes : c.labels.no]]) : ""))
        + step(3, c.steps[3], pair ? scale("connections", score, e) : note(e.common.no_pairs))
        + result(c.reading) + note(e.common.rounded);
    }

    function overlapChart(pair, e) {
        const c = e.topic;
        return stacked(c.chart_title, [
            {label: c.labels.only_a, value: pair.a - pair.shared},
            {label: c.labels.shared, value: pair.shared},
            {label: c.labels.only_b, value: pair.b - pair.shared},
        ], e.accent, Math.max(pair.union, 1), c.chart_caption);
    }

    function renderEchoes(node, e) {
        const c = e.topic;
        // Zero-overlap pairs provide examples for ideas without listed echoes.
        const candidates = node.context?.length ? node.context
            : e.nodes.filter((other) => other.tag !== node.tag).slice(0, 1);
        const pair = pairFor(node, candidates, e);
        return step(0, c.steps[0], definitions(c.definitions) + (pair ? note(template(e.common.pair, {tag: node.tag, other: pair.other.tag}))
            + overlapChart(pair, e) + metrics([["A", pair.a], ["B", pair.b], ["S", pair.shared]]) : note(e.common.no_pairs)))
        + step(1, c.steps[1], math(mi("E") + mo("=") + mi("J") + mo("=") + frac(mi("S"), mi("A") + mo("+") + mi("B") + mo("−") + mi("S")))
            + (pair ? math(mi("E") + mo("=") + frac(mn(pair.shared), mn(pair.a) + mo("+") + mn(pair.b) + mo("−") + mn(pair.shared)) + mo("≈") + mn(fixed(pair.jaccard))) : ""))
        + step(2, c.steps[2], pair ? scale("echoes", pair.jaccard, e) + result(template(c.reading, {value: fixed(pair.jaccard), shared: pair.shared, union: pair.union})) : note(e.common.no_pairs))
        + note(c.evidence);
    }

    function flowGraph(tree, options, e) {
        const children = new Map();
        for (const relation of tree.treeEdges) {
            if (!children.has(relation.parent)) children.set(relation.parent, []);
            children.get(relation.parent).push(relation);
        }
        let nextY = 25;
        const positions = new Map();
        function visit(tag, depth) {
            const descendants = children.get(tag) || [];
            const ys = descendants.map((relation) => visit(relation.child, depth + 1));
            const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : nextY;
            if (!ys.length) nextY += 48;
            positions.set(tag, {x: 12 + depth * 113, y});
            return y;
        }
        visit(tree.rootTag, 0);
        const paths = tree.treeEdges.map((relation) => {
            const a = positions.get(relation.parent);
            const b = positions.get(relation.child);
            const width = 1 + 4 * number(relation.flowLoad);
            return `<path d="M${a.x + 88},${a.y} C${a.x + 106},${a.y} ${b.x - 15},${b.y} ${b.x - 3},${b.y}" fill="none" stroke="${escape(e.accent)}" stroke-width="${width}" opacity="${[1, 0.8, 0.6][relation.depth - 1]}"/>
                <path d="M${b.x - 7},${b.y - 4} L${b.x - 1},${b.y} L${b.x - 7},${b.y + 4}" fill="none" stroke="${escape(e.accent)}"/>`;
        }).join("");
        const labels = [...positions].map(([tag, p]) => `<g><title>${escape(tag)}</title>
            <rect x="${p.x}" y="${p.y - 11}" width="88" height="23" rx="5" fill="#161B22" stroke="${tag === tree.rootTag ? "#E6EDF3" : escape(e.accent)}"/>
            <text class="semantic-explain-svg-text" x="${p.x + 44}" y="${p.y + 4}" text-anchor="middle">${escape(tag.length > 12 ? tag.slice(0, 11) + "…" : tag)}</text></g>`).join("");
        return figure(e.topic.chart_title, `<svg viewBox="0 0 450 ${Math.max(85, nextY)}" role="img" aria-label="${escape(e.topic.chart_title)}"><title>${escape(e.topic.chart_title)}</title>${paths}${labels}</svg>`, e.topic.chart_caption);
    }

    function renderFlow(node, e) {
        const c = e.topic;
        const info = window.PrintHumanNeural?.explain(node.tag, e.nodes, e.edges);
        if (!info) return note(e.common.no_flow);
        const {tree, options, rootFloor} = info;
        const sample = tree.treeEdges[0];
        const priority = sample ? window.PrintHumanNeural.priority(sample.edge) : 0;
        const profile = options.depthProfiles[1].lineWidth;
        const load = sample ? number(sample.flowLoad) : 0;
        const lineWidth = sample ? (options.mainCoreWidth + clamp(number(sample.edge.strength)) * options.mainStrengthWidth) * profile
            * (options.flowWidthBase + options.flowWidthGain * load ** options.flowWidthExponent) : 0;
        return step(0, {...c.steps[0], body: template(c.steps[0].body, {candidates: options.maxCandidateNodes})}, math(
            mi("p") + mo("=") + mi("w") + mo("+") + mn("0.035") + mi("S") + mo("+") + mn("0.15") + mi("h") + mo("+") + mn("0.17") + mi("J")
        ) + definitions(c.definitions_priority) + (sample ? metrics([
            [c.labels.edge, `${sample.parent} → ${sample.child}`], ["w", fixed(sample.edge.strength)], ["S", fixed(Math.max(0, number(sample.edge.semantic)))],
            ["h", number(sample.edge.cooccurrence) > 0 ? 1 : 0], ["J", fixed(sample.edge.jaccard)], ["p", fixed(priority)],
        ]) : note(e.common.no_flow)))
        + step(1, {...c.steps[1], body: template(c.steps[1].body, {root: options.rootMaxChildren, children: options.nodeMaxChildren, depth: options.maxDepth})}, math(
            mi("f") + mo("=") + `<mtext>max</mtext>${mo("(")}${mn(fixed(options.rootBranchAbsoluteFloor))}${mo(",")}${mn(fixed(options.rootBranchRelativeFloor))}${sub("w", "p₁")}${mo(")")}`,
            mi("a") + mo("=") + mi("p") + mo("−") + mn("0.025") + mi("d") + mo("−") + mn("0.008") + mi("n")
        ) + definitions(c.definitions_tree) + metrics([[c.labels.floor, fixed(rootFloor)], [c.labels.reached, tree.connected.size]])
            + flowGraph(tree, options, e))
        + step(2, c.steps[2], math(
            sub("L", "b") + mo("=") + sub("w", "b") + mo("+") + mn(fixed(options.downstreamFlowDecay)) + sum("j ∈ F(b)", sub("L", "j")),
            sub("U", "b") + mo("=") + frac(sub("L", "b"), sub("L", "max")),
            mi("t") + mo("=") + mo("(") + mn(fixed(options.mainCoreWidth)) + mo("+") + mn(fixed(options.mainStrengthWidth)) + mi("w") + mo(")") + sub("D", "d")
                + mo("(") + mn(fixed(options.flowWidthBase)) + mo("+") + mn(fixed(options.flowWidthGain)) + power(mi("U"), mn(fixed(options.flowWidthExponent))) + mo(")")
        ) + definitions(c.definitions_load) + (sample ? bars(c.labels.loads, tree.treeEdges.slice(0, 6).map((relation) => ({
            label: `${relation.parent} → ${relation.child}`, value: relation.flowLoad,
        })), e.accent, 1, c.load_caption) + metrics([
            [c.labels.example_load, fixed(sample.flowLoadRaw)], ["U", fixed(load)], [c.labels.width, `${fixed(lineWidth)} px`],
            [c.labels.depth, Object.values(options.depthProfiles).map((entry) => fixed(entry.lineWidth)).join(" / ")],
        ]) : ""))
        + step(3, c.steps[3], result(c.reading));
    }

    function render(topic, node, context) {
        const copy = context.copy || {};
        const content = copy.topics?.[topic];
        if (!content) return {title: copy.fallback?.title || "", body: paragraph(copy.fallback?.body || "")};
        const nodes = context.nodes || [];
        const e = {
            copy, topic: content, common: copy.explanations, nodes,
            edges: context.edges || [], method: context.methodology || {},
            accent: context.colors?.primary || "#71C7A6",
            totalPosts: number(context.postCount, new Set(nodes.flatMap((entry) => entry.posts || [])).size),
            layoutEdges: collectLayoutEdges(nodes, context.layoutEdges),
        };
        const renderers = {circuit: renderCircuit, importance: renderImportance, traces: renderTraces,
            pull: renderPull, connections: renderConnections, echoes: renderEchoes, flow: renderFlow};
        return {title: content.title, body: `<div class="semantic-explain">${paragraph(content.intro)}${renderers[topic](node, e)}</div>`};
    }

    const styles = `
        .semantic-explain { max-width:680px; font-size:10px; line-height:1.65; }
        .semantic-explain > p:first-child { color:#E6EDF3; font-size:11px; }
        .semantic-explain-step { margin:17px 0 0; padding:13px 0 0; border-top:1px solid rgba(139,148,158,.16); }
        .semantic-explain-step h4 { display:flex; align-items:center; gap:8px; margin:0 0 8px; padding:0; color:#E6EDF3; font:inherit; font-size:11px; font-weight:600; }
        .semantic-explain-step h4 > span { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; flex:0 0 20px; border:1px solid var(--semantic-explain-accent); border-radius:50%; color:var(--semantic-explain-accent); font-size:10px; }
        .semantic-explain-equations { display:flex; flex-wrap:wrap; align-items:center; gap:10px 20px; margin:10px 0; padding:10px 12px; min-width:0; border-left:2px solid var(--semantic-explain-accent); background:rgba(13,17,23,.55); }
        .semantic-explain-equations math { display:block math; max-width:100%; overflow-x:auto; overflow-y:hidden; padding:4px 0 6px; font-family:"Cambria Math","STIX Two Math",serif; font-size:15px; color:#E6EDF3; }
        .semantic-explain-definitions { display:grid; grid-template-columns:minmax(28px,auto) minmax(0,1fr); gap:5px 10px; margin:8px 0 12px; }
        .semantic-explain-definitions dt { color:var(--semantic-explain-accent); font-weight:600; }
        .semantic-explain-definitions dd { margin:0; overflow-wrap:anywhere; }
        .semantic-explain-values { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,155px),1fr)); gap:6px 14px; margin:8px 0; font-variant-numeric:tabular-nums; }
        .semantic-explain-values > div { display:flex; justify-content:space-between; gap:10px; border-bottom:1px solid rgba(139,148,158,.12); padding:4px 0; }
        .semantic-explain-values dt { color:#8B949E; }
        .semantic-explain-values dd { margin:0; color:#E6EDF3; text-align:right; overflow-wrap:anywhere; }
        .semantic-explain-figure { width:100%; max-width:460px; box-sizing:border-box; margin:12px 0; padding:9px 10px; border:1px solid rgba(139,148,158,.17); border-radius:7px; background:rgba(13,17,23,.35); }
        .semantic-explain-figure svg { display:block; width:100%; height:auto; overflow:visible; }
        .semantic-explain-chart-title { margin:0 0 9px; color:#C9D1D9; font-size:10px; font-weight:600; }
        .semantic-explain-svg-text { fill:#C9D1D9; font:11px ui-monospace,monospace; }
        .semantic-explain-svg-value { fill:#E6EDF3; font:11px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
        .semantic-explain-svg-tick { fill:#8B949E; font:10px ui-monospace,monospace; }
        .semantic-explain-figure figcaption { margin:7px 0 0; color:#8B949E; font-size:9px; line-height:1.6; }
        .semantic-explain-note { color:#8B949E; font-size:9px; line-height:1.6; }
        .semantic-explain-result { margin:12px 0 5px !important; padding:10px 12px; border-left:2px solid var(--semantic-explain-accent); background:rgba(139,148,158,.06); color:#E6EDF3; }
        .semantic-explain-scale { display:grid; gap:3px; color:#C9D1D9; font-size:9px; }
        .semantic-explain-stack-legend { display:grid; gap:5px; }
        .semantic-explain-stack-legend > div { display:grid; grid-template-columns:9px minmax(0,1fr) auto; align-items:center; gap:8px; }
        .semantic-explain-stack-legend i { width:9px; height:9px; border-radius:2px; }
        .semantic-explain-stack-legend strong { font-weight:400; color:#E6EDF3; }
        @media(max-width:480px) {
            .semantic-explain { font-size:10px; }
            .semantic-explain-equations { padding:8px; gap:6px 12px; }
            .semantic-explain-equations math { font-size:clamp(12px, 3.8vw, 14px); }
            .semantic-explain-figure { padding:8px 6px; }
        }
    `;

    window.PrintHumanMapExplanations = {render, styles, qualitativeLabel, collectLayoutEdges, circuitMetrics};
})();
