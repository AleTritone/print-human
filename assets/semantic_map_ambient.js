(function () {
    "use strict";

    const NS = "http://www.w3.org/2000/svg";

    const DEFAULTS = {
        minGuideLength: 120,

        travelRatioMin: 0.10,
        travelRatioMax: 0.22,
        minTravelLength: 420,
        maxTravelLength: 1800,

        durationMin: 760,
        durationMax: 1080,

        illuminationRadiusMin: 760,
        illuminationRadiusMax: 1320,
        illuminationOpacity: 0.96,

        intervalMin: 2200,
        intervalMax: 4200,
        initialDelay: 650,

        doubleFlashChance: 0.18,
        doubleFlashDelayMin: 120,
        doubleFlashDelayMax: 240,
    };


    // Utilities


    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(
                maximum,
                value
            )
        );
    }


    function randomBetween(minimum, maximum) {
        return (
            minimum
            +
            Math.random()
            *
            (
                maximum
                -
                minimum
            )
        );
    }


    function flashEnvelope(progress) {
        if (progress <= 0.10) {
            return (
                progress
                /
                0.10
            );
        }

        if (progress <= 0.58) {
            const local =
                (
                    progress
                    -
                    0.10
                )
                /
                0.48;

            return (
                1
                -
                local
                *
                0.10
            );
        }

        const local =
            (
                progress
                -
                0.58
            )
            /
            0.42;

        return (
            0.90
            *
            Math.pow(
                Math.max(
                    0,
                    1
                    -
                    local
                ),
                1.35
            )
        );
    }


    function travelEase(progress) {
        return (
            1
            -
            Math.pow(
                1
                -
                progress,
                1.45
            )
        );
    }


    // SVG layer


    function createLayer(config) {
        const {
            gd,
            brainPaths,
            brainPathTransform,
            brainViewBox,
        } = config;

        const existing =
            document.getElementById(
                "semantic-ambient-layer"
            );

        if (existing) {
            existing.remove();
        }

        const svg =
            document.createElementNS(
                NS,
                "svg"
            );

        svg.id =
            "semantic-ambient-layer";

        svg.setAttribute(
            "width",
            "100%"
        );

        svg.setAttribute(
            "height",
            "100%"
        );

        svg.setAttribute(
            "viewBox",
            [
                brainViewBox.minX || 0,
                brainViewBox.minY || 0,
                brainViewBox.width,
                brainViewBox.height,
            ].join(" ")
        );

        svg.setAttribute(
            "preserveAspectRatio",
            "xMidYMid meet"
        );

        svg.style.cssText = `
            position:absolute;
            left:0;
            top:0;
            z-index:24;
            pointer-events:none;
            overflow:hidden;
        `;

        const defs =
            document.createElementNS(
                NS,
                "defs"
            );

        svg.appendChild(
            defs
        );


        // Invisible anatomical guides


        const guideGroup =
            document.createElementNS(
                NS,
                "g"
            );

        if (brainPathTransform) {
            guideGroup.setAttribute(
                "transform",
                brainPathTransform
            );
        }

        brainPaths.forEach(
            (pathData, index) => {
                const guide =
                    document.createElementNS(
                        NS,
                        "path"
                    );

                guide.setAttribute(
                    "id",
                    "semantic-ambient-guide-"
                    +
                    index
                );

                guide.setAttribute(
                    "d",
                    pathData
                );

                guide.setAttribute(
                    "fill",
                    "none"
                );

                guide.setAttribute(
                    "stroke",
                    "transparent"
                );

                guide.setAttribute(
                    "stroke-width",
                    "1"
                );

                guideGroup.appendChild(
                    guide
                );
            }
        );

        svg.appendChild(
            guideGroup
        );


        // Visible illumination


        const flashGroup =
            document.createElementNS(
                NS,
                "g"
            );

        flashGroup.id =
            "semantic-ambient-flashes";

        svg.appendChild(
            flashGroup
        );

        gd.appendChild(
            svg
        );

        return {
            svg,
            defs,
            guideGroup,
            flashGroup,
        };
    }


    // Ambient manager


    function createManager(config) {
        const gd =
            config.gd;

        const brainPaths =
            config.brainPaths
            ||
            [];

        const brainPathTransform =
            config.brainPathTransform
            ||
            "";

        const brainViewBox =
            config.brainViewBox
            ||
            {
                minX: 0,
                minY: 0,
                width: 1122,
                height: 1402,
            };

        const brainBounds =
            config.brainBounds
            ||
            {
                xRadius: 1.06,
                yRadius: 1.3245,
            };

        const colors =
            config.colors
            ||
            {};

        const dataToPixel =
            config.dataToPixel;

        const options = {
            ...DEFAULTS,
            ...(config.options || {}),
        };

        if (!gd) {
            throw new Error(
                "PrintHumanAmbient: missing gd"
            );
        }

        if (!brainPaths.length) {
            throw new Error(
                "PrintHumanAmbient: no brain paths"
            );
        }

        if (
            typeof dataToPixel
            !==
            "function"
        ) {
            throw new Error(
                "PrintHumanAmbient: missing dataToPixel()"
            );
        }

        const layer =
            createLayer({
                gd,
                brainPaths,
                brainPathTransform,
                brainViewBox,
            });

        const ambientColor =
            colors.pulse
            ||
            "#F8FBFF";

        let running =
            false;

        let destroyed =
            false;

        let timer =
            null;

        let guideCandidates =
            [];

        let flashSerial =
            0;

        const delayedTimers =
            new Set();


        // Position over Plotly brain


        function updateBounds() {
            if (
                destroyed
                ||
                !layer.svg.isConnected
            ) {
                return;
            }

            const topLeft =
                dataToPixel(
                    -brainBounds.xRadius,
                    brainBounds.yRadius
                );

            const bottomRight =
                dataToPixel(
                    brainBounds.xRadius,
                    -brainBounds.yRadius
                );

            const left =
                Math.min(
                    topLeft.x,
                    bottomRight.x
                );

            const top =
                Math.min(
                    topLeft.y,
                    bottomRight.y
                );

            const width =
                Math.abs(
                    bottomRight.x
                    -
                    topLeft.x
                );

            const height =
                Math.abs(
                    bottomRight.y
                    -
                    topLeft.y
                );

            layer.svg.style.left =
                left
                +
                "px";

            layer.svg.style.top =
                top
                +
                "px";

            layer.svg.style.width =
                width
                +
                "px";

            layer.svg.style.height =
                height
                +
                "px";
        }


        // Anatomical guides


        function rebuildGuideCandidates() {
            guideCandidates =
                [];

            const guides =
                Array.from(
                    layer.guideGroup
                        .querySelectorAll(
                            "path"
                        )
                );

            guides.forEach(
                (
                    guide,
                    index
                ) => {
                    let length =
                        0;

                    try {
                        length =
                            guide
                                .getTotalLength();

                    } catch (error) {
                        length =
                            0;
                    }

                    if (
                        Number.isFinite(
                            length
                        )
                        &&
                        length
                        >=
                        options
                            .minGuideLength
                    ) {
                        guideCandidates.push({
                            index,
                            guide,
                            length,
                        });
                    }
                }
            );

            if (
                !guideCandidates.length
            ) {
                guides.forEach(
                    (
                        guide,
                        index
                    ) => {
                        let length =
                            0;

                        try {
                            length =
                                guide
                                    .getTotalLength();

                        } catch (error) {
                            length =
                                0;
                        }

                        if (
                            Number.isFinite(
                                length
                            )
                            &&
                            length > 1
                        ) {
                            guideCandidates.push({
                                index,
                                guide,
                                length,
                            });
                        }
                    }
                );
            }
        }


        function chooseGuide() {
            if (
                !guideCandidates.length
            ) {
                return null;
            }

            const weighted =
                guideCandidates.map(
                    (candidate) => ({
                        candidate,

                        weight:
                            Math.pow(
                                candidate.length,
                                0.42
                            ),
                    })
                );

            const totalWeight =
                weighted.reduce(
                    (
                        sum,
                        item
                    ) => (
                        sum
                        +
                        item.weight
                    ),
                    0
                );

            let cursor =
                Math.random()
                *
                totalWeight;

            for (
                const item
                of weighted
            ) {
                cursor -=
                    item.weight;

                if (
                    cursor <= 0
                ) {
                    return (
                        item.candidate
                    );
                }
            }

            return (
                weighted[
                    weighted.length - 1
                ].candidate
            );
        }


        function buildTravel(candidate) {
            const totalLength =
                candidate.length;

            const travelLength =
                Math.min(
                    totalLength,

                    clamp(
                        totalLength
                        *
                        randomBetween(
                            options
                                .travelRatioMin,

                            options
                                .travelRatioMax
                        ),

                        options
                            .minTravelLength,

                        options
                            .maxTravelLength
                    )
                );

            const maxStart =
                Math.max(
                    0,
                    totalLength
                    -
                    travelLength
                );

            let start =
                maxStart > 0
                    ?
                    randomBetween(
                        0,
                        maxStart
                    )
                    :
                    0;

            let end =
                Math.min(
                    totalLength,
                    start
                    +
                    travelLength
                );

            if (
                Math.random()
                <
                0.5
            ) {
                const swap =
                    start;

                start =
                    end;

                end =
                    swap;
            }

            return {
                start,
                end,
            };
        }


        // Moving illumination


        function createGradient(
            id,
            color,
            radius,
            center
        ) {
            const gradient =
                document.createElementNS(
                    NS,
                    "radialGradient"
                );

            gradient.classList.add(
                "ambient-gradient"
            );

            gradient.setAttribute(
                "id",
                id
            );

            gradient.setAttribute(
                "gradientUnits",
                "userSpaceOnUse"
            );

            gradient.setAttribute(
                "cx",
                String(
                    center.x
                )
            );

            gradient.setAttribute(
                "cy",
                String(
                    center.y
                )
            );

            gradient.setAttribute(
                "r",
                String(
                    radius
                )
            );

            const stops = [
                {
                    offset: "0%",
                    opacity: 1.00,
                },
                {
                    offset: "18%",
                    opacity: 0.92,
                },
                {
                    offset: "42%",
                    opacity: 0.58,
                },
                {
                    offset: "70%",
                    opacity: 0.22,
                },
                {
                    offset: "100%",
                    opacity: 0.00,
                },
            ];

            stops.forEach(
                (stopData) => {
                    const stop =
                        document.createElementNS(
                            NS,
                            "stop"
                        );

                    stop.setAttribute(
                        "offset",
                        stopData.offset
                    );

                    stop.setAttribute(
                        "stop-color",
                        color
                    );

                    stop.setAttribute(
                        "stop-opacity",
                        String(
                            stopData.opacity
                        )
                    );

                    gradient.appendChild(
                        stop
                    );
                }
            );

            layer.defs.appendChild(
                gradient
            );

            return gradient;
        }


        function createIlluminationGroup(
            gradientId
        ) {
            const group =
                document.createElementNS(
                    NS,
                    "g"
                );

            group.classList.add(
                "ambient-dynamic"
            );

            if (
                brainPathTransform
            ) {
                group.setAttribute(
                    "transform",
                    brainPathTransform
                );
            }

            group.setAttribute(
                "opacity",
                "0"
            );

            group.style.mixBlendMode =
                "screen";

            brainPaths.forEach(
                (pathData) => {
                    const path =
                        document.createElementNS(
                            NS,
                            "path"
                        );

                    path.setAttribute(
                        "d",
                        pathData
                    );

                    path.setAttribute(
                        "fill",
                        "url(#"
                        +
                        gradientId
                        +
                        ")"
                    );

                    path.setAttribute(
                        "stroke",
                        "none"
                    );

                    group.appendChild(
                        path
                    );
                }
            );

            layer.flashGroup.appendChild(
                group
            );

            return group;
        }


        function removeFlash(
            group,
            gradient
        ) {
            if (
                group
                &&
                group.isConnected
            ) {
                group.remove();
            }

            if (
                gradient
                &&
                gradient.isConnected
            ) {
                gradient.remove();
            }
        }


        function createFlash(
            candidate,
            delay = 0
        ) {
            if (
                destroyed
                ||
                !candidate
            ) {
                return;
            }

            const travel =
                buildTravel(
                    candidate
                );

            const firstPoint =
                candidate.guide
                    .getPointAtLength(
                        travel.start
                    );

            const radius =
                randomBetween(
                    options
                        .illuminationRadiusMin,

                    options
                        .illuminationRadiusMax
                );

            flashSerial += 1;

            const gradientId =
                "semantic-ambient-gradient-"
                +
                flashSerial;

            const gradient =
                createGradient(
                    gradientId,
                    ambientColor,
                    radius,
                    firstPoint
                );

            const illumination =
                createIlluminationGroup(
                    gradientId
                );

            const duration =
                randomBetween(
                    options
                        .durationMin,

                    options
                        .durationMax
                );

            const timeoutId =
                window.setTimeout(
                    () => {
                        delayedTimers.delete(
                            timeoutId
                        );

                        if (
                            destroyed
                            ||
                            !layer.svg.isConnected
                        ) {
                            removeFlash(
                                illumination,
                                gradient
                            );

                            return;
                        }

                        const startedAt =
                            performance.now();

                        function frame(timestamp) {
                            if (
                                destroyed
                                ||
                                !illumination.isConnected
                                ||
                                !gradient.isConnected
                            ) {
                                removeFlash(
                                    illumination,
                                    gradient
                                );

                                return;
                            }

                            const progress =
                                clamp(
                                    (
                                        timestamp
                                        -
                                        startedAt
                                    )
                                    /
                                    duration,

                                    0,
                                    1
                                );

                            const travelProgress =
                                travelEase(
                                    progress
                                );

                            const offset =
                                travel.start
                                +
                                (
                                    travel.end
                                    -
                                    travel.start
                                )
                                *
                                travelProgress;

                            const point =
                                candidate.guide
                                    .getPointAtLength(
                                        offset
                                    );

                            gradient.setAttribute(
                                "cx",
                                String(
                                    point.x
                                )
                            );

                            gradient.setAttribute(
                                "cy",
                                String(
                                    point.y
                                )
                            );

                            illumination.setAttribute(
                                "opacity",
                                String(
                                    options
                                        .illuminationOpacity
                                    *
                                    flashEnvelope(
                                        progress
                                    )
                                )
                            );

                            if (
                                progress < 1
                            ) {
                                requestAnimationFrame(
                                    frame
                                );

                            } else {
                                removeFlash(
                                    illumination,
                                    gradient
                                );
                            }
                        }

                        requestAnimationFrame(
                            frame
                        );
                    },

                    delay
                );

            delayedTimers.add(
                timeoutId
            );
        }


        // Scheduler


        function flash() {
            if (
                destroyed
                ||
                !layer.svg.isConnected
            ) {
                return;
            }

            updateBounds();

            if (
                !guideCandidates.length
            ) {
                rebuildGuideCandidates();
            }

            const candidate =
                chooseGuide();

            if (
                !candidate
            ) {
                return;
            }

            createFlash(
                candidate,
                0
            );

            if (
                Math.random()
                <
                options
                    .doubleFlashChance
            ) {
                const secondCandidate =
                    chooseGuide();

                if (
                    secondCandidate
                ) {
                    createFlash(
                        secondCandidate,

                        randomBetween(
                            options
                                .doubleFlashDelayMin,

                            options
                                .doubleFlashDelayMax
                        )
                    );
                }
            }
        }


        function scheduleNext() {
            if (
                !running
                ||
                destroyed
            ) {
                return;
            }

            if (
                timer
            ) {
                clearTimeout(
                    timer
                );
            }

            timer =
                window.setTimeout(
                    () => {
                        timer =
                            null;

                        if (
                            !running
                            ||
                            destroyed
                        ) {
                            return;
                        }

                        flash();

                        scheduleNext();
                    },

                    randomBetween(
                        options
                            .intervalMin,

                        options
                            .intervalMax
                    )
                );
        }


        // Lifecycle


        function start() {
            if (
                destroyed
                ||
                running
            ) {
                return;
            }

            running =
                true;

            updateBounds();

            rebuildGuideCandidates();

            timer =
                window.setTimeout(
                    () => {
                        timer =
                            null;

                        if (
                            !running
                            ||
                            destroyed
                        ) {
                            return;
                        }

                        flash();

                        scheduleNext();
                    },

                    options
                        .initialDelay
                );
        }


        function stop() {
            running =
                false;

            if (
                timer
            ) {
                clearTimeout(
                    timer
                );

                timer =
                    null;
            }

            delayedTimers.forEach(
                (timeoutId) => {
                    clearTimeout(
                        timeoutId
                    );
                }
            );

            delayedTimers.clear();

            layer.flashGroup
                .querySelectorAll(
                    ".ambient-dynamic"
                )
                .forEach(
                    (element) => {
                        element.remove();
                    }
                );

            layer.defs
                .querySelectorAll(
                    ".ambient-gradient"
                )
                .forEach(
                    (element) => {
                        element.remove();
                    }
                );
        }


        function redraw() {
            updateBounds();
        }


        function destroy() {
            stop();

            destroyed =
                true;

            layer.svg.remove();
        }


        updateBounds();

        rebuildGuideCandidates();


        return {
            start,
            stop,
            flash,
            redraw,
            updateBounds,
            destroy,

            get running() {
                return running;
            },
        };
    }


    window.PrintHumanAmbient = {
        create:
            createManager,
    };
})();