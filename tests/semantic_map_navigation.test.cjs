const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the production navigation against a small DOM/Plotly adapter. Touch events
// retain their default-prevention state, so scrolling regressions are observable.
async function navigation() {
    const elements = new Map();
    const frames = new Map();
    let nextFrame = 0;
    class Element {
        constructor() { this.handlers = new Map(); this.dataset = {}; this.style = {}; }
        set id(value) { this._id = value; elements.set(value, this); }
        get id() { return this._id; }
        set innerHTML(value) {
            for (const match of value.matchAll(/id="([^"]+)"/g)) {
                const element = new Element(); element.id = match[1];
            }
        }
        addEventListener(type, handler) {
            if (!this.handlers.has(type)) this.handlers.set(type, []);
            this.handlers.get(type).push(handler);
        }
        dispatchEvent(event) { for (const handler of this.handlers.get(event.type) || []) handler(event); }
        querySelector(selector) { return elements.get(selector.slice(1)); }
        querySelectorAll() { return []; }
        setAttribute(key, value) { this[key] = value; }
        appendChild() {}
        insertAdjacentElement() {}
        contains(target) { return target === this; }
        getBoundingClientRect() { return {left: 0, top: 0}; }
    }
    const gd = new Element(); gd.id = "semantic-map";
    gd.data = []; gd.isConnected = true;
    gd._fullLayout = {
        xaxis: {range: [-1.22, 1.22], _offset: 0, _length: 300},
        yaxis: {range: [-1.22, 1.22], _offset: 0, _length: 300},
    };
    gd.on = gd.addEventListener;
    const config = {
        initialWidth: 2.44, brainBounds: {xRadius: 1.08, yRadius: 0.86},
        nodes: [{x: 1.2, y: 0.4}], anchors: [], colors: {},
        copy: {en: {controls: {fit: "Fit"}}, it: {controls: {fit: "Adatta"}}},
    };
    const window = new Element(); window.__PRINT_HUMAN_MAP_CONFIG__ = config;
    const document = new Element(); document.head = new Element(); document.body = new Element();
    document.getElementById = id => elements.get(id);
    document.createElement = () => new Element();
    const context = vm.createContext({
        window, document, localStorage: {getItem: () => "it"},
        Plotly: {
            relayout: async (_, update) => {
                for (const axis of ["xaxis", "yaxis"]) {
                    if (update[`${axis}.range`]) gd._fullLayout[axis].range = [...update[`${axis}.range`]];
                }
                for (const handler of gd.handlers.get("plotly_relayout") || []) handler(update);
            },
            restyle: async () => {},
        },
        requestAnimationFrame: handler => { const id = ++nextFrame; frames.set(id, handler); return id; },
        cancelAnimationFrame: id => frames.delete(id),
        MutationObserver: class { observe() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    });
    const source = fs.readFileSync(path.join(__dirname, "../assets/semantic_map_interaction.js"), "utf8");
    vm.runInContext(source.replaceAll("{plot_id}", gd.id), context);
    async function settle() {
        for (let i = 0; i < 8; i++) {
            await new Promise(resolve => setImmediate(resolve));
            const current = [...frames.values()]; frames.clear();
            current.forEach(handler => handler());
        }
        assert.equal(frames.size, 0, "Navigation should settle without a redraw loop");
    }
    await settle();
    const ranges = () => JSON.parse(JSON.stringify({x: gd._fullLayout.xaxis.range, y: gd._fullLayout.yaxis.range}));
    const touch = (type, points) => {
        const event = {type, cancelable: true, defaultPrevented: false,
            touches: points.map(([x, y], identifier) => ({clientX: x, clientY: y, identifier, target: gd})),
            preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {},
        };
        gd.dispatchEvent(event);
        return event;
    };
    const click = id => elements.get(`semantic-map-${id}`).dispatchEvent({type: "click"});
    return {gd, config, elements, ranges, touch, click, settle};
}

const span = range => range.x[1] - range.x[0];
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} differs from ${b}`);

test("fit includes the brain and all nodes and responds to a new aspect ratio", async () => {
    const map = await navigation();
    let range = map.ranges();
    assert(range.x[0] < -1.08 && range.x[1] > 1.2);
    assert(range.y[0] < -0.86 && range.y[1] > 0.86);
    map.gd._fullLayout.xaxis._length = 600;
    map.click("fit"); await map.settle();
    range = map.ranges();
    close(span(range) / (range.y[1] - range.y[0]), 2);
    assert(range.x[0] < -1.08 && range.x[1] > 1.2);
});

test("a one-finger swipe allows browser scrolling and leaves the camera untouched", async () => {
    const map = await navigation(), before = map.ranges();
    assert.equal(map.touch("touchstart", [[150, 200]]).defaultPrevented, false);
    assert.equal(map.touch("touchmove", [[150, 90]]).defaultPrevented, false);
    map.touch("touchend", []); await map.settle();
    assert.deepEqual(map.ranges(), before);
});

test("pinching scales both axes around the point under the fingers", async () => {
    const map = await navigation(), before = map.ranges();
    assert.equal(map.touch("touchstart", [[60, 100], [140, 100]]).defaultPrevented, true);
    assert.equal(map.touch("touchmove", [[20, 100], [180, 100]]).defaultPrevented, true);
    await map.settle(); map.touch("touchend", []);
    const after = map.ranges();
    close(span(after), span(before) / 2);
    close(before.x[0] + span(before) / 3, after.x[0] + span(after) / 3);
    close(before.y[1] - span(before) / 3, after.y[1] - span(after) / 3);
});

test("moving two fingers pans while preserving scale; fit restores the complete map", async () => {
    const map = await navigation(), before = map.ranges();
    map.touch("touchstart", [[60, 100], [140, 100]]);
    map.touch("touchmove", [[90, 120], [170, 120]]);
    await map.settle(); map.touch("touchend", []);
    const after = map.ranges();
    close(span(after), span(before));
    close(after.x[0], before.x[0] - span(before) * .1);
    close(after.y[0], before.y[0] + span(before) / 15);
    map.click("fit"); await map.settle();
    assert.deepEqual(map.ranges(), before);
});

test("zoom buttons remain bounded and restore the previous scale", async () => {
    const map = await navigation(), before = map.ranges();
    map.click("zoom-in"); await map.settle();
    assert(span(map.ranges()) < span(before));
    map.click("zoom-out"); await map.settle();
    close(span(map.ranges()), span(before));
    for (let i = 0; i < 50; i++) { map.click("zoom-out"); await map.settle(); }
    close(span(map.ranges()), 2.44 / .25);
    for (let i = 0; i < 50; i++) { map.click("zoom-in"); await map.settle(); }
    close(span(map.ranges()), 2.44 / 16);
    assert.equal(map.elements.get("semantic-map-fit").textContent, "Adatta");
});

test("a tap selects through the map event, while a cancelled gesture selects nothing", async () => {
    const map = await navigation(), taps = [];
    map.gd.addEventListener("print-human-maptap", event => taps.push(event.detail));
    map.touch("touchstart", [[150, 200]]); map.touch("touchend", []);
    assert.equal(taps.length, 1); assert.equal(taps[0].clientX, 150);
    map.touch("touchstart", [[100, 200]]); map.touch("touchcancel", []);
    assert.equal(taps.length, 1);
});
