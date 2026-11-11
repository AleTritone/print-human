const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const preview = fs.readFileSync(path.join(root, "data/semantic_map_preview.html"), "utf8");
const config = JSON.parse(preview.match(/window\.__PRINT_HUMAN_MAP_CONFIG__ = (\{[^\r\n]+\});/)[1]);
const locales = Object.fromEntries(["it", "en"].map((lang) => [lang,
    JSON.parse(fs.readFileSync(path.join(root, `locales/semantic_map_${lang}.json`), "utf8"))]));
const runtime = {window: {__PRINT_HUMAN_MAP_CONFIG__: config}};
vm.createContext(runtime);
for (const name of ["semantic_map_neural.js", "semantic_map_explanations.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "assets", name), "utf8"), runtime);
}
const explanations = runtime.window.PrintHumanMapExplanations;
const neural = runtime.window.PrintHumanNeural;
const plain = (value) => JSON.parse(JSON.stringify(value));
const topics = ["circuit", "importance", "traces", "pull", "connections", "echoes", "flow"];
const close = (actual, expected, tolerance = 0.00015) => assert(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from expected ${expected}`);

function shape(value) {
    if (Array.isArray(value)) return value.map(shape);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
    return typeof value;
}

test("Italian and English have the same explanation structure and complete translations", () => {
    assert.deepEqual(shape(locales.it), shape(locales.en));
    for (const lang of ["it", "en"]) {
        assert.deepEqual(config.copy[lang], locales[lang], "Preview translations must be synchronized");
        for (const topic of topics) {
            const copy = locales[lang].topics[topic];
            assert(copy.steps.length >= 3);
            for (const step of copy.steps) assert(step.title && step.body);
        }
    }
});

test("all ideas and topics render equations, real graphs and resolved examples in both languages", () => {
    for (const copy of Object.values(locales)) for (const node of config.nodes) for (const topic of topics) {
        const output = explanations.render(topic, node, {...config, copy});
        assert.equal(output.title, copy.topics[topic].title);
        assert.match(output.body, /<math\b/);
        assert.match(output.body, /<svg\b[^>]*role="img"/);
        assert.equal((output.body.match(/class="semantic-explain-step"/g) || []).length, copy.topics[topic].steps.length);
        assert.doesNotMatch(output.body, /undefined|NaN|\{\w+\}/);
        assert.match(output.body, /semantic-explain-definitions/);
        assert.match(output.body, /<title>/);
    }
});

test("displayed scales classify their exact thresholds and rounded boundary values consistently", () => {
    const cases = {
        importance: [[0,"low"],[0.399,"moderate"],[0.4,"moderate"],[0.599,"high"],[0.8,"essential"],[1,"essential"]],
        connections: [[0,"weak"],[0.399,"moderate"],[0.6,"high"],[0.799,"strong"],[1,"strong"]],
        echoes: [[0,"weak"],[0.249,"moderate"],[0.5,"strong"],[0.749,"close"],[1,"close"]],
    };
    for (const copy of Object.values(locales)) for (const [topic, values] of Object.entries(cases)) {
        for (const [value, label] of values) assert.equal(explanations.qualitativeLabel(topic, value, copy), copy.labels[label]);
    }
});

test("published pair scores agree with the documented formulas", () => {
    const method = config.methodology;
    for (const node of config.nodes) {
        const p = node.priorityComponents;
        close(node.priority, method.importance_frequency_weight * p.frequency
            + method.importance_degree_weight * p.degree + method.importance_betweenness_weight * p.betweenness);
        for (const pair of node.semanticNeighbors) {
            const c = 1 - Math.exp(-pair.cooccurrence / method.layout_corpus_confidence_scale);
            close(pair.affinity, pair.semantic + method.layout_corpus_max_boost * pair.jaccard * c * (1 - pair.semantic));
        }
        for (const pair of node.neighbors) close(pair.strength, Math.max(0.01,
            method.interaction_semantic_weight * Math.max(0, pair.semantic) + method.interaction_cooccurrence_weight * pair.jaccard));
        for (const pair of node.context) {
            const other = config.nodes.find((entry) => entry.tag === pair.tag);
            const shared = new Set(node.posts.filter((slug) => other.posts.includes(slug))).size;
            close(pair.weight, shared / (new Set(node.posts).size + new Set(other.posts).size - shared));
        }
    }
});

test("legacy layout edges are accepted only when their full degrees and weight sums match", () => {
    const edges = explanations.collectLayoutEdges(config.nodes, []);
    assert(edges && edges.length > 0);
    const incomplete = structuredClone(config.nodes);
    const first = edges[0];
    for (const node of incomplete) node.semanticNeighbors = node.semanticNeighbors.filter((item) =>
        !((node.tag === first.source && item.tag === first.target) || (node.tag === first.target && item.tag === first.source)));
    assert.equal(explanations.collectLayoutEdges(incomplete, []), null);
});

test("core score calculation matches a known graph and reproduces the cached core selections", () => {
    const nodes = [
        {tag:"a",systemId:0,weight:1}, {tag:"b",systemId:0,weight:5},
    ];
    const metric = explanations.circuitMetrics(nodes[0], nodes, [{source:"a",target:"b",weight:0.5}]);
    close(metric.rows[0].score, 0.64, 1e-12);
    close(metric.rows[1].score, 1, 1e-12);
    close(metric.modularity, 0, 1e-12);
    const edges = explanations.collectLayoutEdges(config.nodes, config.layoutEdges);
    for (const node of config.nodes) {
        const data = explanations.circuitMetrics(node, config.nodes, edges);
        const best = Math.max(...data.rows.map((row) => row.score));
        const selected = data.rows.filter((row) => row.score >= best * config.methodology.core_score_ratio)
            .sort((a,b) => b.score - a.score || a.node.tag.localeCompare(b.node.tag))
            .slice(0, config.methodology.max_system_cores).map((row) => row.node.tag).sort();
        assert.deepEqual(plain(selected), [...node.systemCoreTags].sort());
    }
});

test("flow explanations use the real tree algorithm, branch limits and recursive loads", () => {
    for (const node of config.nodes) {
        const {tree, options} = neural.explain(node.tag, config.nodes, config.edges);
        const incoming = new Set();
        const children = new Map();
        for (const relation of tree.treeEdges) {
            assert(!incoming.has(relation.child));
            incoming.add(relation.child);
            assert(relation.child !== tree.rootTag);
            assert(relation.depth <= options.maxDepth);
            if (!children.has(relation.parent)) children.set(relation.parent, []);
            children.get(relation.parent).push(relation);
        }
        for (const [parent, relations] of children) assert(relations.length <= (parent === node.tag ? options.rootMaxChildren : options.nodeMaxChildren));
        const loads = tree.treeEdges.map((relation) => relation.flowLoadRaw);
        const max = Math.max(...loads);
        for (const relation of tree.treeEdges) {
            const downstream = (children.get(relation.child) || []).reduce((total, child) => total + child.flowLoadRaw, 0);
            close(relation.flowLoadRaw, relation.edge.strength + options.downstreamFlowDecay * downstream, 1e-10);
            close(relation.flowLoad, relation.flowLoadRaw / max, 1e-10);
        }
    }
});

test("root threshold uses the top-priority candidate and retains the real fallback branch", () => {
    const nodes = [{tag:"root"},{tag:"a"},{tag:"b"}];
    const edges = [
        {source:"root",target:"a",strength:0.9},
        {source:"root",target:"b",strength:0.8,semantic:1,jaccard:1,cooccurrence:1},
    ];
    close(neural.explain("root",nodes,edges).rootFloor, 0.8 * 0.58, 1e-12);
    const fallback = neural.explain("root",nodes,[{source:"root",target:"a",strength:0.1}]);
    assert.equal(fallback.tree.treeEdges.length, 1);
    assert.equal(fallback.tree.treeEdges[0].child, "a");
});

test("isolated ideas, singleton circuits and empty publication sets have finite output", () => {
    const node = {tag:"alone",systemId:0,systemCoreTags:["alone"],systemRole:"core",weight:1,
        x:0,y:0,posts:[],attractionComponents:{raw:0,max_raw:1,neighbor_count:0},priorityComponents:{},
        semanticNeighbors:[],neighbors:[],context:[]};
    for (const copy of Object.values(locales)) for (const topic of topics) {
        const output = explanations.render(topic,node,{nodes:[node],edges:[],methodology:config.methodology,copy,postCount:0});
        assert.doesNotMatch(output.body,/NaN|undefined|Infinity|\{\w+\}/);
    }
});

test("idea labels are escaped in text, SVGs and computed examples", () => {
    const nodes = structuredClone(config.nodes);
    const node = nodes[0];
    node.tag = '<img src=x onerror="alert(1)">';
    for (const topic of topics) {
        const output = explanations.render(topic,node,{...config,nodes,copy:locales.it});
        assert(!output.body.includes(node.tag));
        assert.doesNotMatch(output.body,/<img\b/);
    }
});

test("the full generated preview remains valid JavaScript with explanations before the UI", () => {
    for (const script of preview.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        if (script[1].trim()) new vm.Script(script[1]);
    }
    assert(preview.indexOf("window.PrintHumanMapExplanations =") < preview.indexOf("function methodologyContent("));
});
