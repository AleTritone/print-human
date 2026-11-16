(function () {
    "use strict";

    const gd = document.getElementById("{plot_id}");
    const CONFIG = window.__PRINT_HUMAN_MAP_CONFIG__ || {};

    if (!gd) {
        return;
    }

    const INITIAL_WIDTH = Number(CONFIG.initialWidth) || 2.44;
    const MAX_ZOOM_OUT_SCALE = 0.25;
    const MAX_X_SPAN = INITIAL_WIDTH / MAX_ZOOM_OUT_SCALE;
    const MIN_VISUAL_SCALE = MAX_ZOOM_OUT_SCALE;
    const CLICK_TOLERANCE = 7;
    const MIN_X_SPAN = INITIAL_WIDTH / 16;

    const ANCHOR_ICON_DATA_SIZE = 0.14;
    const ANCHOR_LABEL_PADDING_PX = 0.5;

    const FAMILY_ICON_Y_OFFSET = 0.17;
    const WORK_ICON_Y_OFFSET = -0.17;

    const anchorsByName = new Map(
        (CONFIG.anchors || []).map(
            (anchor) => [
                anchor.name,
                anchor,
            ]
        )
    );

    const nodeBaseSizes = new Map();
    const highlightBaseSizes = new Map();
    const anchorTraceNames = new Map();

    let pointerState = null;

    let visualFrame = null;

    let applyingVisualScale = false;

    let lastAppliedScale = null;
    let lastAnchorMarkerSize = null;

    let enforcingZoom = false;
    let configuringAxes = false;
    let configuringAnchors = false;
    let viewIsFitted = true;
    let fittingView = false;
    let touchGesture = null;
    let touchStart = null;
    let touchMoved = false;
    let suppressClickUntil = 0;
    let touchFrame = null;
    let pendingTouchRanges = null;
    let updatingTouch = false;


    // Keep browser scrolling with one finger; own only two-finger gestures.
    // Capture touch events before Plotly's drag handlers can cancel scrolling.
    function plotGeometry() {
        const layout = gd._fullLayout;
        if (!layout || !layout.xaxis || !layout.yaxis) return null;
        const rect = gd.getBoundingClientRect();
        return {
            left: rect.left + layout.xaxis._offset,
            top: rect.top + layout.yaxis._offset,
            width: layout.xaxis._length,
            height: layout.yaxis._length,
            x: layout.xaxis.range.slice(),
            y: layout.yaxis.range.slice(),
        };
    }

    function applyRanges(x, y) {
        return Plotly.relayout(gd, {
            "xaxis.range": x,
            "yaxis.range": y,
            "xaxis.autorange": false,
            "yaxis.autorange": false,
        });
    }

    function fitMap() {
        const geometry = plotGeometry();
        if (!geometry || !geometry.width || !geometry.height) return Promise.resolve();
        const bounds = CONFIG.brainBounds || {xRadius: 1.08, yRadius: 0.86};
        const points = [...(CONFIG.nodes || []), ...(CONFIG.anchors || [])];
        const xs = [-bounds.xRadius, bounds.xRadius, ...points.map((node) => node.x)];
        const ys = [-bounds.yRadius, bounds.yRadius, ...points.map((node) => node.y)];
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
        const width = Math.max((maxX - minX) * 1.18,
            (maxY - minY) * 1.18 * geometry.width / geometry.height);
        const height = width * geometry.height / geometry.width;
        viewIsFitted = true;
        fittingView = true;
        return applyRanges([centerX - width / 2, centerX + width / 2],
            [centerY - height / 2, centerY + height / 2])
            .finally(() => { fittingView = false; });
    }

    function zoomMap(factor) {
        const geometry = plotGeometry();
        if (!geometry) return;
        const currentWidth = geometry.x[1] - geometry.x[0];
        const width = Math.max(MIN_X_SPAN, Math.min(MAX_X_SPAN, currentWidth * factor));
        const height = width * geometry.height / geometry.width;
        const x = (geometry.x[0] + geometry.x[1]) / 2;
        const y = (geometry.y[0] + geometry.y[1]) / 2;
        viewIsFitted = false;
        applyRanges([x - width / 2, x + width / 2], [y - height / 2, y + height / 2]);
    }

    function createNavigation() {
        const style = document.createElement("style");
        style.textContent = `
            #${gd.id}, #${gd.id} .svg-container, #${gd.id} .main-svg,
            #${gd.id} .draglayer, #${gd.id} .draglayer * {
                touch-action:pan-y !important;
            }
            #semantic-map-navigation {
                position:sticky; top:0; z-index:120;
                display:flex; align-items:center; flex-wrap:wrap; gap:8px;
                padding:8px 10px; box-sizing:border-box;
                background:${CONFIG.colors.background};
                border-bottom:1px solid ${CONFIG.colors.border};
                font:12px/1.5 JetBrains Mono, Fira Code, monospace;
            }
            #semantic-map-navigation button {
                min-width:44px; min-height:44px; padding:8px 12px;
                border:1px solid ${CONFIG.colors.primary}; border-radius:8px;
                background:${CONFIG.colors.surface}; color:${CONFIG.colors.text};
                font:inherit; font-weight:600; cursor:pointer; touch-action:manipulation;
            }
            #semantic-map-navigation button:hover { background:${CONFIG.colors.border}; }
            #semantic-map-navigation button:focus-visible {
                outline:2px solid ${CONFIG.colors.primary}; outline-offset:3px;
            }
            #semantic-map-touch-hint { display:none; margin:0; color:${CONFIG.colors.text}; }
            @media (pointer:coarse), (hover:none) {
                #semantic-map-touch-hint { display:block; flex:1 1 220px; }
            }
            @media (max-width:760px) {
                #semantic-map-search { font-size:16px !important; min-height:44px; }
                #semantic-map-controls label { min-height:44px; }
                #semantic-map-controls input[type=checkbox] { width:20px; height:20px; }
            }
        `;
        document.head.appendChild(style);
        const navigation = document.createElement("div");
        navigation.id = "semantic-map-navigation";
        navigation.setAttribute("role", "group");
        navigation.innerHTML = `
            <button type="button" id="semantic-map-zoom-in">+</button>
            <button type="button" id="semantic-map-zoom-out">−</button>
            <button type="button" id="semantic-map-fit"></button>
            <p id="semantic-map-touch-hint"></p>
        `;
        gd.insertAdjacentElement("beforebegin", navigation);
        navigation.querySelector("#semantic-map-zoom-in").addEventListener("click", () => zoomMap(1 / 1.4));
        navigation.querySelector("#semantic-map-zoom-out").addEventListener("click", () => zoomMap(1.4));
        navigation.querySelector("#semantic-map-fit").addEventListener("click", fitMap);
        function translate(language) {
            const copy = ((CONFIG.copy || {})[language] || (CONFIG.copy || {}).en || {}).controls || {};
            navigation.setAttribute("aria-label", copy.navigation || "Map navigation");
            for (const [id, key] of [["zoom-in", "zoom_in"], ["zoom-out", "zoom_out"], ["fit", "fit_description"]]) {
                const button = navigation.querySelector(`#semantic-map-${id}`);
                button.setAttribute("aria-label", copy[key] || key);
                button.title = copy[key] || key;
            }
            navigation.querySelector("#semantic-map-fit").textContent = copy.fit || "Fit";
            navigation.querySelector("#semantic-map-touch-hint").textContent = copy.touch_hint || "";
        }
        let language = "en";
        try { language = localStorage.getItem("print-human-map-language") || "en"; } catch (error) {}
        translate(language);
        window.addEventListener("print-human-languagechange", (event) => translate(event.detail.language));
        window.addEventListener("storage", (event) => {
            if (event.key === "print-human-map-language") translate(event.newValue);
        });

        // Expand the same-origin Streamlit frame with its content so page scrolling
        // also reaches controls and explanations without a second scroll area.
        if (window.frameElement && typeof ResizeObserver === "function") {
            const observer = new ResizeObserver(() => {
                const height = Math.ceil(document.body.getBoundingClientRect().height);
                if (height > 0) window.frameElement.style.height = `${height}px`;
            });
            observer.observe(document.body);
        }
    }

    function touchPair(touches) {
        const [a, b] = touches;
        return {
            x: (a.clientX + b.clientX) / 2,
            y: (a.clientY + b.clientY) / 2,
            distance: Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)),
        };
    }

    function flushTouchRanges() {
        touchFrame = null;
        if (updatingTouch || !pendingTouchRanges) return;
        const ranges = pendingTouchRanges;
        pendingTouchRanges = null;
        updatingTouch = true;
        applyRanges(ranges.x, ranges.y).finally(() => {
            updatingTouch = false;
            if (pendingTouchRanges) touchFrame = requestAnimationFrame(flushTouchRanges);
        });
    }

    function handleTouchStart(event) {
        event.stopImmediatePropagation();
        if (event.touches.length === 1) {
            touchStart = event.touches[0];
            touchMoved = false;
        }
        const touches = Array.from(event.touches).filter((touch) => gd.contains(touch.target));
        if (touches.length !== 2) {
            touchGesture = null;
            return;
        }
        const geometry = plotGeometry();
        if (!geometry) return;
        if (event.cancelable) event.preventDefault();
        const pair = touchPair(touches);
        touchGesture = {...geometry, distance: pair.distance,
            anchorX: geometry.x[0] + (pair.x - geometry.left) / geometry.width * (geometry.x[1] - geometry.x[0]),
            anchorY: geometry.y[1] - (pair.y - geometry.top) / geometry.height * (geometry.y[1] - geometry.y[0]),
        };
        touchMoved = true;
        viewIsFitted = false;
        suppressClickUntil = Date.now() + 800;
    }

    function handleTouchMove(event) {
        event.stopImmediatePropagation();
        if (touchStart && Array.from(event.touches).some((touch) =>
            touch.identifier === touchStart.identifier
            && Math.hypot(touch.clientX - touchStart.clientX, touch.clientY - touchStart.clientY) > CLICK_TOLERANCE)) {
            touchMoved = true;
        }
        if (!touchGesture || event.touches.length !== 2) return;
        if (event.cancelable) event.preventDefault();
        const pair = touchPair(event.touches);
        const startWidth = touchGesture.x[1] - touchGesture.x[0];
        const width = Math.max(MIN_X_SPAN, Math.min(MAX_X_SPAN,
            startWidth * touchGesture.distance / pair.distance));
        const height = width * touchGesture.height / touchGesture.width;
        const left = touchGesture.anchorX - (pair.x - touchGesture.left) / touchGesture.width * width;
        const top = touchGesture.anchorY + (pair.y - touchGesture.top) / touchGesture.height * height;
        pendingTouchRanges = {x: [left, left + width], y: [top - height, top]};
        if (!touchFrame && !updatingTouch) touchFrame = requestAnimationFrame(flushTouchRanges);
        suppressClickUntil = Date.now() + 800;
    }

    function handleTouchEnd(event) {
        event.stopImmediatePropagation();
        if (touchGesture) {
            if (event.cancelable) event.preventDefault();
            suppressClickUntil = Date.now() + 800;
            touchGesture = null;
        }
        if (event.touches.length === 0) {
            if (!touchMoved && touchStart && event.type !== "touchcancel") {
                // Plotly's touch handlers are bypassed, so select a tapped node
                // through the map's existing selection path.
                gd.dispatchEvent(new CustomEvent("print-human-maptap", {detail: {
                    clientX: touchStart.clientX, clientY: touchStart.clientY, target: touchStart.target,
                }}));
                suppressClickUntil = Date.now() + 500;
            }
            touchStart = null;
        }
    }

    function bindTouchNavigation() {
        for (const [type, handler] of [["touchstart", handleTouchStart], ["touchmove", handleTouchMove],
            ["touchend", handleTouchEnd], ["touchcancel", handleTouchEnd]]) {
            gd.addEventListener(type, handler, {capture: true, passive: false});
        }
        gd.addEventListener("click", (event) => {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
    }


    // Plot geometry


    function captureTraceGeometry() {
        gd.data.forEach(
            (trace, index) => {
                const meta = trace.meta || {};
                const layer = meta.layer;

                if (
                    layer
                    ===
                    "node"
                ) {
                    const size =
                        trace.marker
                        &&
                        trace.marker.size;

                    if (
                        Array.isArray(size)
                    ) {
                        nodeBaseSizes.set(
                            index,
                            size.map(
                                (value) =>
                                    Number(value)
                            )
                        );

                    } else if (
                        Number.isFinite(
                            Number(size)
                        )
                    ) {
                        nodeBaseSizes.set(
                            index,
                            Number(size)
                        );
                    }
                }

                if (
                    layer
                    ===
                    "highlight"
                    ||
                    layer
                    ===
                    "neighbor-highlight"
                ) {
                    const size =
                        trace.marker
                        &&
                        trace.marker.size;

                    if (
                        Number.isFinite(
                            Number(size)
                        )
                    ) {
                        highlightBaseSizes.set(
                            index,
                            Number(size)
                        );
                    }
                }

                if (
                    layer
                    ===
                    "anchor"
                    &&
                    meta.anchorName
                ) {
                    anchorTraceNames.set(
                        index,
                        meta.anchorName
                    );
                }
            }
        );
    }


    function anchorTextPosition(name) {
        return {
            family:
                "top center",

            relationships:
                "middle right",

            society:
                "middle right",

            work:
                "bottom center",

            nature:
                "middle left",

            self:
                "middle left",
        }[name]
        ||
        "top center";
    }


    function anchorIconPosition(name) {
        const anchor =
            anchorsByName.get(
                name
            );

        if (
            !anchor
        ) {
            return null;
        }

        let x =
            Number(
                anchor.x
            );

        let y =
            Number(
                anchor.y
            );

        if (
            !Number.isFinite(x)
            ||
            !Number.isFinite(y)
        ) {
            return null;
        }

        if (
            name
            ===
            "family"
        ) {
            y +=
                FAMILY_ICON_Y_OFFSET;

        } else if (
            name
            ===
            "work"
        ) {
            y +=
                WORK_ICON_Y_OFFSET;
        }

        return {
            x,
            y,
        };
    }


    function configureAnchorGeometry() {
        if (
            configuringAnchors
        ) {
            return Promise.resolve();
        }

        configuringAnchors =
            true;

        const jobs = [];

        anchorTraceNames.forEach(
            (
                name,
                traceIndex
            ) => {
                const position =
                    anchorIconPosition(
                        name
                    );

                if (
                    !position
                ) {
                    return;
                }

                jobs.push(
                    Plotly.restyle(
                        gd,
                        {
                            x: [[
                                position.x,
                            ]],

                            y: [[
                                position.y,
                            ]],

                            mode:
                                "markers+text",

                            textposition:
                                anchorTextPosition(
                                    name
                                ),
                        },
                        [
                            traceIndex,
                        ]
                    )
                );
            }
        );

        return Promise
            .allSettled(
                jobs
            )
            .finally(
                () => {
                    configuringAnchors =
                        false;
                }
            );
    }


    function configureAxisGeometry() {
        configuringAxes =
            true;

        return Plotly.relayout(
            gd,
            {
                "xaxis.minallowed":
                    null,

                "xaxis.maxallowed":
                    null,

                "yaxis.minallowed":
                    null,

                "yaxis.maxallowed":
                    null,

                "xaxis.domain": [
                    0,
                    1,
                ],

                "yaxis.domain": [
                    0,
                    1,
                ],

                "xaxis.constrain":
                    "range",

                "yaxis.constrain":
                    "range",

                "yaxis.scaleanchor":
                    "x",

                "yaxis.scaleratio":
                    1,
            }
        ).finally(
            () => {
                configuringAxes =
                    false;
            }
        );
    }


    function currentXRange() {
        const axis =
            gd._fullLayout
            &&
            gd._fullLayout.xaxis;

        if (
            !axis
            ||
            !Array.isArray(
                axis.range
            )
            ||
            axis.range.length < 2
        ) {
            return null;
        }

        const start =
            Number(
                axis.range[0]
            );

        const end =
            Number(
                axis.range[1]
            );

        if (
            !Number.isFinite(start)
            ||
            !Number.isFinite(end)
        ) {
            return null;
        }

        return [
            start,
            end,
        ];
    }


    function enforceZoomOutLimit() {
        if (
            enforcingZoom
            ||
            configuringAxes
        ) {
            return;
        }

        const range =
            currentXRange();

        if (
            !range
        ) {
            return;
        }

        const span =
            Math.abs(
                range[1]
                -
                range[0]
            );

        if (
            span
            <=
            MAX_X_SPAN
            +
            0.000001
        ) {
            return;
        }

        const center =
            (
                range[0]
                +
                range[1]
            )
            /
            2;

        const half =
            MAX_X_SPAN
            /
            2;

        enforcingZoom =
            true;

        Plotly.relayout(
            gd,
            {
                "xaxis.range": [
                    center - half,
                    center + half,
                ],
            }
        ).finally(
            () => {
                enforcingZoom =
                    false;

                scheduleVisualScale();
            }
        );
    }


    // Marker and anchor spacing


    function currentVisualScale() {
        const range =
            currentXRange();

        if (
            !range
        ) {
            return 1;
        }

        const span =
            Math.abs(
                range[1]
                -
                range[0]
            );

        if (
            !Number.isFinite(span)
            ||
            span <= 0
        ) {
            return 1;
        }

        return Math.max(
            MIN_VISUAL_SCALE,

            Math.min(
                1,

                INITIAL_WIDTH
                /
                span
            )
        );
    }


    function scaledSize(
        baseSize,
        scale,
        minimum
    ) {
        if (
            Array.isArray(
                baseSize
            )
        ) {
            return baseSize.map(
                (value) =>
                    Math.max(
                        minimum,

                        Number(value)
                        *
                        scale
                    )
            );
        }

        return Math.max(
            minimum,

            Number(baseSize)
            *
            scale
        );
    }


    function anchorMarkerSizePixels() {
        const layout =
            gd._fullLayout;

        if (
            !layout
            ||
            !layout.xaxis
            ||
            !layout.yaxis
            ||
            typeof layout
                .xaxis
                .l2p
            !==
            "function"
            ||
            typeof layout
                .yaxis
                .l2p
            !==
            "function"
        ) {
            return 36;
        }

        const xPixels =
            Math.abs(
                layout
                    .xaxis
                    .l2p(
                        ANCHOR_ICON_DATA_SIZE
                    )
                -
                layout
                    .xaxis
                    .l2p(
                        0
                    )
            );

        const yPixels =
            Math.abs(
                layout
                    .yaxis
                    .l2p(
                        ANCHOR_ICON_DATA_SIZE
                    )
                -
                layout
                    .yaxis
                    .l2p(
                        0
                    )
            );

        const iconPixels =
            Math.max(
                1,

                Math.min(
                    xPixels,
                    yPixels
                )
            );

        return (
            iconPixels
            +
            ANCHOR_LABEL_PADDING_PX
            *
            2
        );
    }


    function applyVisualScale() {
        if (
            applyingVisualScale
            ||
            configuringAnchors
            ||
            !gd.isConnected
        ) {
            return;
        }

        const scale =
            currentVisualScale();

        const anchorMarkerSize =
            anchorMarkerSizePixels();

        const scaleUnchanged =
            lastAppliedScale
            !==
            null

            &&

            Math.abs(
                scale
                -
                lastAppliedScale
            )
            <
            0.001;

        const anchorSizeUnchanged =
            lastAnchorMarkerSize
            !==
            null

            &&

            Math.abs(
                anchorMarkerSize
                -
                lastAnchorMarkerSize
            )
            <
            0.5;

        if (
            scaleUnchanged
            &&
            anchorSizeUnchanged
        ) {
            return;
        }

        lastAppliedScale =
            scale;

        lastAnchorMarkerSize =
            anchorMarkerSize;

        applyingVisualScale =
            true;

        const jobs = [];


        nodeBaseSizes.forEach(
            (
                baseSize,
                traceIndex
            ) => {
                if (
                    !gd.data[
                        traceIndex
                    ]
                ) {
                    return;
                }

                jobs.push(
                    Plotly.restyle(
                        gd,
                        {
                            "marker.size": [
                                scaledSize(
                                    baseSize,
                                    scale,
                                    1.5
                                ),
                            ],
                        },
                        [
                            traceIndex,
                        ]
                    )
                );
            }
        );


        highlightBaseSizes.forEach(
            (
                baseSize,
                traceIndex
            ) => {
                if (
                    !gd.data[
                        traceIndex
                    ]
                ) {
                    return;
                }

                jobs.push(
                    Plotly.restyle(
                        gd,
                        {
                            "marker.size":
                                scaledSize(
                                    baseSize,
                                    scale,
                                    4
                                ),
                        },
                        [
                            traceIndex,
                        ]
                    )
                );
            }
        );


        anchorTraceNames.forEach(
            (
                name,
                traceIndex
            ) => {
                if (
                    !gd.data[
                        traceIndex
                    ]
                ) {
                    return;
                }

                jobs.push(
                    Plotly.restyle(
                        gd,
                        {
                            "marker.size":
                                anchorMarkerSize,

                            textposition:
                                anchorTextPosition(
                                    name
                                ),
                        },
                        [
                            traceIndex,
                        ]
                    )
                );
            }
        );


        Promise
            .allSettled(
                jobs
            )
            .finally(
                () => {
                    applyingVisualScale =
                        false;
                }
            );
    }


    function scheduleVisualScale() {
        if (
            visualFrame
        ) {
            cancelAnimationFrame(
                visualFrame
            );
        }

        visualFrame =
            requestAnimationFrame(
                () => {
                    visualFrame =
                        null;

                    applyVisualScale();
                }
            );
    }


    // Event helpers


    function distance(
        x1,
        y1,
        x2,
        y2
    ) {
        return Math.hypot(
            x2 - x1,
            y2 - y1
        );
    }


    function eventPath(event) {
        if (
            typeof event.composedPath
            ===
            "function"
        ) {
            return event.composedPath();
        }

        const path = [];

        let element =
            event.target;

        while (
            element
        ) {
            path.push(
                element
            );

            element =
                element.parentNode;
        }

        path.push(
            window
        );

        return path;
    }


    function pathContains(
        path,
        element
    ) {
        return Boolean(
            element
            &&
            path.includes(
                element
            )
        );
    }


    function pathMatches(
        path,
        selector
    ) {
        return path.some(
            (element) => {
                if (
                    !element
                    ||
                    element.nodeType !== 1
                    ||
                    typeof element.matches
                    !==
                    "function"
                ) {
                    return false;
                }

                try {
                    return element.matches(
                        selector
                    );

                } catch (error) {
                    return false;
                }
            }
        );
    }


    function isUiClick(path) {
        return (
            pathMatches(
                path,
                "#semantic-map-controls"
            )
            ||
            pathMatches(
                path,
                "#semantic-map-controls *"
            )
            ||
            pathMatches(
                path,
                "#semantic-map-info"
            )
            ||
            pathMatches(
                path,
                "#semantic-map-info *"
            )
            ||
            pathMatches(
                path,
                ".semantic-map-label"
            )
            ||
            pathMatches(
                path,
                ".semantic-map-label *"
            )
        );
    }


    function isNodeClick(path) {
        return (
            pathMatches(
                path,
                "path.point"
            )
            ||
            pathMatches(
                path,
                ".point"
            )
        );
    }


    // Selection


    function sendEscape() {
        const event =
            new KeyboardEvent(
                "keydown",
                {
                    key:
                        "Escape",

                    code:
                        "Escape",

                    keyCode:
                        27,

                    which:
                        27,

                    bubbles:
                        true,

                    cancelable:
                        true,
                }
            );

        if (
            document.body
        ) {
            document.body.dispatchEvent(
                event
            );

        } else {
            document.dispatchEvent(
                event
            );
        }
    }


    function handleMapClick(event) {
        if (Date.now() < suppressClickUntil) return;
        const path =
            eventPath(
                event
            );

        if (
            !pathContains(
                path,
                gd
            )
        ) {
            return;
        }

        if (
            isUiClick(
                path
            )
        ) {
            return;
        }

        if (
            isNodeClick(
                path
            )
        ) {
            return;
        }

        sendEscape();
    }


    // Pointer state


    function handlePointerDown(event) {
        if (
            event.button !== 0
        ) {
            return;
        }

        const path =
            eventPath(
                event
            );

        if (
            !pathContains(
                path,
                gd
            )
        ) {
            pointerState =
                null;

            return;
        }

        pointerState = {
            pointerId:
                event.pointerId,

            startX:
                event.clientX,

            startY:
                event.clientY,

            moved:
                false,
        };
    }


    function handlePointerMove(event) {
        if (
            !pointerState
        ) {
            return;
        }

        if (
            event.pointerId
            !==
            pointerState.pointerId
        ) {
            return;
        }

        const movement =
            distance(
                pointerState.startX,
                pointerState.startY,
                event.clientX,
                event.clientY
            );

        if (
            movement
            >
            CLICK_TOLERANCE
        ) {
            pointerState.moved =
                true;
        }
    }


    function handlePointerUp(event) {
        if (
            !pointerState
        ) {
            return;
        }

        if (
            event.pointerId
            !==
            pointerState.pointerId
        ) {
            return;
        }

        pointerState =
            null;
    }


    function handlePointerCancel() {
        pointerState =
            null;
    }


    // Plot background


    function bindPlotBackgrounds() {
        const backgrounds =
            gd.querySelectorAll(
                ".nsewdrag"
            );

        backgrounds.forEach(
            (background) => {
                if (
                    background
                        .dataset
                        .printHumanDeselectBound
                    ===
                    "1"
                ) {
                    return;
                }

                background
                    .dataset
                    .printHumanDeselectBound =
                    "1";

                background.addEventListener(
                    "click",
                    sendEscape,
                    true
                );
            }
        );
    }


    // Plot lifecycle


    function bindPlotlyLifecycle() {
        if (
            typeof gd.on
            !==
            "function"
        ) {
            return;
        }

        gd.on(
            "plotly_relayout",
            (event) => {
                if (!fittingView && !configuringAxes && Object.keys(event).some((key) => /[xy]axis\.range/.test(key))) {
                    viewIsFitted = false;
                }
                if (viewIsFitted && ("height" in event || "width" in event || "autosize" in event)) {
                    requestAnimationFrame(fitMap);
                }
                enforceZoomOutLimit();

                scheduleVisualScale();

                requestAnimationFrame(
                    bindPlotBackgrounds
                );
            }
        );

        gd.on(
            "plotly_afterplot",
            () => {
                bindPlotBackgrounds();

                scheduleVisualScale();
            }
        );
    }


    function observePlotlyDom() {
        const observer =
            new MutationObserver(
                () => {
                    bindPlotBackgrounds();
                }
            );

        observer.observe(
            gd,
            {
                childList:
                    true,

                subtree:
                    true,
            }
        );

        return observer;
    }


    // DOM events


    document.addEventListener(
        "click",
        handleMapClick,
        true
    );

    document.addEventListener(
        "pointerdown",
        handlePointerDown,
        true
    );

    document.addEventListener(
        "pointermove",
        handlePointerMove,
        true
    );

    document.addEventListener(
        "pointerup",
        handlePointerUp,
        true
    );

    document.addEventListener(
        "pointercancel",
        handlePointerCancel,
        true
    );

    window.addEventListener(
        "blur",
        handlePointerCancel
    );

    window.addEventListener(
        "resize",
        () => {
            lastAppliedScale =
                null;

            lastAnchorMarkerSize =
                null;

            scheduleVisualScale();
        }
    );


    // Initialization


    captureTraceGeometry();

    createNavigation();

    bindTouchNavigation();

    bindPlotBackgrounds();

    bindPlotlyLifecycle();

    observePlotlyDom();

    Promise
        .allSettled([
            configureAnchorGeometry(),
            configureAxisGeometry(),
        ])
        .finally(
            () => {
                fitMap();
                enforceZoomOutLimit();

                scheduleVisualScale();
            }
        );

})();
