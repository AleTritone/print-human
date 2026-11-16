// Run against the complete Streamlit app, not a rewritten HTML fixture:
// node scripts/check_semantic_map_browser.cjs http://127.0.0.1:8502
// Requires Playwright and Chrome. PLOTLY_TEST_JS can supply the same version of
// Plotly locally when the test environment cannot access the CDN.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require("playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:8502";
const artifacts = process.env.MAP_SCREENSHOTS_DIR;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function verify(browser, mobile) {
    const context = await browser.newContext({
        viewport: {width: mobile ? 390 : 1365, height: mobile ? 844 : 1000},
        isMobile: mobile, hasTouch: mobile,
    });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        if (process.env.PLOTLY_TEST_JS) {
            await page.route("https://cdn.plot.ly/**", route => route.fulfill({
                path: process.env.PLOTLY_TEST_JS, contentType: "text/javascript",
            }));
        }
        await page.goto(`${baseUrl}/?page=semantic-map&lang=it`);
        const iframe = page.locator('iframe[data-testid="stIFrame"]');
        await iframe.waitFor();
        const frame = await (await iframe.elementHandle()).contentFrame();
        await frame.locator("#semantic-map-neural-links").waitFor();
        await pause(600);

        const state = () => frame.evaluate(() => {
            const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
            const definitions = [...document.querySelectorAll(
                "#semantic-neural-layer [stroke], #semantic-neural-background [stroke], "
                + "#semantic-neural-layer [clip-path], #semantic-neural-background [clip-path]"
            )];
            return {
                checked: document.getElementById("semantic-map-neural-links").checked,
                background: document.querySelectorAll("#semantic-neural-background path.neural-dynamic").length,
                selected: document.querySelectorAll("#semantic-neural-layer path.neural-dynamic").length,
                info: document.getElementById("semantic-map-info").innerText,
                highlight: document.getElementById("semantic-map").data.find(trace => trace.meta?.layer === "highlight").visible,
                duplicateIds: ids.length - new Set(ids).size,
                badReferences: definitions.filter(element => {
                    const value = element.getAttribute("stroke") || element.getAttribute("clip-path") || "";
                    const id = value.match(/^url\(#(.+)\)$/)?.[1];
                    return id && document.getElementById(id)?.closest("svg") !== element.closest("svg");
                }).length,
            };
        });
        const toggle = async () => {
            await frame.locator("#semantic-map-neural-links")[mobile ? "tap" : "click"]();
            await pause(300);
        };
        const clickNode = async tag => {
            await frame.locator(".nsewdrag").scrollIntoViewIfNeeded();
            const box = await iframe.boundingBox();
            const point = await frame.evaluate(tag => {
                const gd = document.getElementById("semantic-map");
                const node = window.__PRINT_HUMAN_MAP_CONFIG__.nodes.find(node => node.tag === tag);
                const rect = gd.getBoundingClientRect();
                return {
                    x: rect.left + gd._fullLayout.xaxis._offset + gd._fullLayout.xaxis.l2p(node.x),
                    y: rect.top + gd._fullLayout.yaxis._offset + gd._fullLayout.yaxis.l2p(node.y),
                };
            }, tag);
            if (mobile) await page.touchscreen.tap(box.x + point.x, box.y + point.y);
            else await page.mouse.click(box.x + point.x, box.y + point.y);
            await pause(600);
        };
        const assertSelection = async tag => {
            const current = await state();
            assert(current.selected > 0, "Clicking a node must retain its neural path");
            assert(current.highlight, "The selected node must stay highlighted");
            assert(current.info.startsWith(tag + "\n"));
            assert.equal(current.duplicateIds, 0, "SVG definitions must be unique across both layers");
            assert.equal(current.badReferences, 0, "Each neural layer must reference its own SVG definitions");
        };

        let current = await state();
        assert(current.checked && current.background > 0, "The overview must be visible before any tag is selected");
        assert.equal(current.selected, 0);
        if (artifacts) {
            fs.mkdirSync(artifacts, {recursive: true});
            await frame.locator("#semantic-map").screenshot({path: `${artifacts}/${mobile ? "phone" : "desktop"}-overview.png`});
        }
        await toggle();
        assert.equal((await state()).background, 0, "The checkbox must hide the overview without requiring a selection");
        await clickNode("experience");
        await assertSelection("experience");
        assert.equal((await state()).background, 0);
        await toggle();
        await assertSelection("experience");
        assert((await state()).background > 0);
        await toggle();
        await assertSelection("experience");
        assert.equal((await state()).background, 0, "Hiding the overview must preserve the selected path");
        await frame.locator('.semantic-map-label[data-tag="humanity"]')[mobile ? "tap" : "click"]();
        await pause(600);
        await assertSelection("humanity");
        if (artifacts) await frame.locator("#semantic-map").screenshot({path: `${artifacts}/${mobile ? "phone" : "desktop"}-selection.png`});
        await toggle();
        await assertSelection("humanity");
        await frame.locator(".nsewdrag").scrollIntoViewIfNeeded();
        let plot = await frame.locator(".nsewdrag").boundingBox();
        const ranges = () => frame.evaluate(() => {
            const {xaxis, yaxis} = document.getElementById("semantic-map")._fullLayout;
            return {x: [...xaxis.range], y: [...yaxis.range]};
        });
        if (mobile) {
            const cdp = await context.newCDPSession(page);
            const send = (type, points) => cdp.send("Input.dispatchTouchEvent", {
                type, touchPoints: points.map((point, id) => ({...point, id, radiusX: 3, radiusY: 3})),
            });
            const before = await ranges();
            const start = {x: plot.x + plot.width / 2, y: Math.min(760, plot.y + plot.height * .75)};
            await send("touchStart", [start]);
            for (let i = 1; i <= 8; i++) {
                await send("touchMove", [{x: start.x, y: start.y - i * 20}]);
                await pause(25);
            }
            await send("touchEnd", []);
            await pause(300);
            assert.deepEqual(await ranges(), before, "One-finger scrolling must not move the camera");
            await assertSelection("humanity");
            await frame.locator(".nsewdrag").scrollIntoViewIfNeeded();
            plot = await frame.locator(".nsewdrag").boundingBox();
            const center = {x: plot.x + plot.width / 2, y: Math.min(650, plot.y + plot.height / 2)};
            await send("touchStart", [{x: center.x - 35, y: center.y}, {x: center.x + 35, y: center.y}]);
            for (let i = 1; i <= 6; i++) {
                await send("touchMove", [{x: center.x - 35 - i * 5, y: center.y}, {x: center.x + 35 + i * 5, y: center.y}]);
                await pause(35);
            }
            await send("touchEnd", []);
            await pause(300);
            const zoomed = await ranges();
            assert(zoomed.x[1] - zoomed.x[0] < (before.x[1] - before.x[0]) * .7);
        } else {
            await page.mouse.move(plot.x + plot.width / 2, plot.y + plot.height / 2);
            await page.mouse.down();
            await page.mouse.move(plot.x + plot.width / 2 + 35, plot.y + plot.height / 2 + 15, {steps: 8});
            await page.mouse.up();
            await pause(300);
            await assertSelection("humanity");
        }
        await frame.locator("#semantic-map-fit")[mobile ? "tap" : "click"]();
        await pause(300);
        await assertSelection("humanity");
        await clickNode("experience");
        await assertSelection("experience");
        await frame.locator(".nsewdrag")[mobile ? "tap" : "click"]({position: {x: 8, y: 8}});
        await pause(300);
        current = await state();
        assert.equal(current.selected, 0, "An empty-background click must clear the selection");
        assert(current.background > 0, "Clearing selection must preserve the enabled overview");
        assert.deepEqual(errors, []);
        console.log(`PASS ${mobile ? "touch" : "mouse"}: visible overview, checkbox on/off, marker and label selection, persistent path, independent SVG layers, gestures, fit and deselection`);
    } finally { await context.close(); }
}

(async () => {
    const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome"});
    try {
        await verify(browser, false);
        await verify(browser, true);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
