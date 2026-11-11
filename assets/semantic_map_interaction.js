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
            () => {
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
                enforceZoomOutLimit();

                scheduleVisualScale();
            }
        );

})();