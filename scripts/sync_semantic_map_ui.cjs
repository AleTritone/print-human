// Update the preview's UI bundle and translations while retaining its figure.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const previewPath = path.join(root, "data", "semantic_map_preview.html");
const original = fs.readFileSync(previewPath, "utf8");
const configMatch = original.match(/window\.__PRINT_HUMAN_MAP_CONFIG__ = (\{[^\r\n]+\});/);
assert(configMatch, "An existing semantic map preview with its config is required.");
const config = JSON.parse(configMatch[1]);
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "semantic_map.json"), "utf8"));
assert.deepEqual(config.nodes.map((node) => node.tag).sort(), data.nodes.map((node) => node.tag).sort(),
    "The data and preview contain different ideas. Regenerate the preview with preview_semantic_map.py.");
for (const node of config.nodes) {
    const cached = data.nodes.find((entry) => entry.tag === node.tag);
    assert.equal(node.weight, cached.weight, "The data and preview have different intensity values.");
    assert.equal(node.x, cached.x, "The data and preview have different coordinates.");
    assert.equal(node.y, cached.y, "The data and preview have different coordinates.");
}
for (const lang of ["it", "en"]) {
    config.copy[lang] = JSON.parse(fs.readFileSync(path.join(root, "locales", `semantic_map_${lang}.json`), "utf8"));
}
config.postCount = data.post_count;
config.layoutEdges = data.layout_edges || [];

const plotMatch = original.match(/Plotly\.newPlot\(\s*["']([^"']+)["']/);
assert(plotMatch, "The preview's Plotly graph ID was not found.");
const plotId = plotMatch[1];
const names = ["semantic_map_neural.js", "semantic_map_ambient.js", "semantic_map_explanations.js", "semantic_map.js", "semantic_map_interaction.js"];
const bundle = names.map((name) => {
    const source = fs.readFileSync(path.join(root, "assets", name), "utf8").replaceAll("{plot_id}", plotId);
    return `\n/* =====================================================\n   ${name}\n   ===================================================== */\n${source}\n`;
}).join("");
const configStart = configMatch.index;
const scriptEnd = original.indexOf("</script>", configStart);
assert(scriptEnd > configStart, "The preview's script end was not found.");
assert(/\.then\(function\(\)\{\s*$/.test(original.slice(0, configStart)),
    "Expected Plotly's post-script callback before the UI bundle.");
const updated = original.slice(0, configStart)
    + "window.__PRINT_HUMAN_MAP_CONFIG__ = " + JSON.stringify(config) + ";\n" + bundle
    + "\n                        });\n                }\n"
    + original.slice(scriptEnd);
assert.equal(updated.slice(0, configStart), original.slice(0, configStart), "Unexpected Plotly figure changes.");
for (const match of updated.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) new vm.Script(match[1]);
}
fs.writeFileSync(previewPath, updated, "utf8");
console.log("Updated semantic-map UI and both languages; retained the embedded figure and coordinates.");
