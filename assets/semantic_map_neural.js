(function () {
    "use strict";

    const NS = "http://www.w3.org/2000/svg";
    const TWO_PI = Math.PI * 2;
    const GLOBAL_CONFIG = window.__PRINT_HUMAN_MAP_CONFIG__ || {};

    const DEFAULTS = {
        maxCandidateNodes: 12,
        rootMaxChildren: 3,
        nodeMaxChildren: 2,
        maxDepth: 3,

        rootBranchAbsoluteFloor: 0.46,
        rootBranchRelativeFloor: 0.58,

        clipSampleSpacing: 120,
        clipMinSamplesPerPath: 14,
        clipMaxSamplesPerPath: 120,
        clipSafetyPixels: 4.0,
        clipRadialScale: 0.992,

        minControlPoints: 3,
        maxControlPoints: 6,
        pixelsPerSection: 105,

        minAmplitude: 7,
        maxAmplitude: 30,
        amplitudeFactor: 0.040,

        mainCoreWidth: 1.30,
        mainStrengthWidth: 1.20,
        mainCoreOpacity: 0.98,

        mainHaloWidth: 5.2,
        mainHaloStrengthWidth: 1.6,
        mainHaloOpacity: 0.18,

        downstreamFlowDecay: 0.65,
        flowWidthBase: 0.80,
        flowWidthGain: 0.90,
        flowWidthExponent: 0.70,

        selectedBranchesMin: 10,
        selectedBranchesMax: 14,
        selectedBranchLengthMin: 34,
        selectedBranchLengthMax: 88,

        targetBranchesMin: 6,
        targetBranchesMax: 9,
        targetBranchLengthMin: 22,
        targetBranchLengthMax: 54,

        angleGapWeightMin: 0.32,
        angleGapWeightMax: 2.10,
        angleGapExponent: 1.35,

        branchCoreWidth: 0.82,
        branchHaloWidth: 3.2,

        branchCoreOpacityNear: 0.66,
        branchCoreOpacityMid: 0.48,
        branchCoreOpacityFar: 0.28,

        branchHaloOpacityNear: 0.10,
        branchHaloOpacityMid: 0.055,
        branchHaloOpacityFar: 0.015,

        branchCurveMin: 0.07,
        branchCurveMax: 0.24,
        branchAngleJitter: 0.12,

        terminalLengthRatioMin: 0.22,
        terminalLengthRatioMax: 0.38,

        terminalAngleMin: 0.26,
        terminalAngleMax: 0.66,

        terminalCoreWidth: 0.54,
        terminalHaloWidth: 2.1,

        terminalCoreOpacityNear: 0.40,
        terminalCoreOpacityMid: 0.24,
        terminalCoreOpacityFar: 0.045,

        terminalHaloOpacityNear: 0.055,
        terminalHaloOpacityMid: 0.024,
        terminalHaloOpacityFar: 0.0,

        terminalCurveMin: 0.04,
        terminalCurveMax: 0.16,

        signalEnabled: true,
        signalLength: 18,
        signalWidth: 2.25,
        signalOpacity: 0.94,
        signalDuration: 1350,
        signalDurationJitter: 320,
        signalGap: 1250,
        signalGapJitter: 850,

        depthProfiles: {
            1: {
                lineOpacity: 1.00,
                lineWidth: 1.00,
                glow: 1.00,

                arborOpacity: 0.88,
                arborLength: 0.92,
                arborCount: 0.92,

                highlightOpacity: 0.82,
                highlightScale: 1.00,

                signalOpacity: 1.00,
                signalWidth: 1.00,
            },

            2: {
                lineOpacity: 0.64,
                lineWidth: 0.74,
                glow: 0.52,

                arborOpacity: 0.60,
                arborLength: 0.72,
                arborCount: 0.72,

                highlightOpacity: 0.55,
                highlightScale: 0.84,

                signalOpacity: 0.44,
                signalWidth: 0.82,
            },

            3: {
                lineOpacity: 0.38,
                lineWidth: 0.56,
                glow: 0.27,

                arborOpacity: 0.38,
                arborLength: 0.54,
                arborCount: 0.54,

                highlightOpacity: 0.30,
                highlightScale: 0.70,

                signalOpacity: 0.0,
                signalWidth: 0.0,
            },
        },
    };


    // Numeric helpers


    function clamp(
        value,
        minimum,
        maximum
    ) {
        return Math.max(
            minimum,
            Math.min(
                maximum,
                value
            )
        );
    }


    function lerp(
        start,
        end,
        amount
    ) {
        return (
            start
            +
            (
                end
                -
                start
            )
            *
            amount
        );
    }


    function hashValue(text) {
        let hash =
            2166136261
            >>>
            0;

        for (
            let index = 0;
            index < text.length;
            index += 1
        ) {
            hash ^=
                text.charCodeAt(
                    index
                );

            hash =
                Math.imul(
                    hash,
                    16777619
                );
        }

        return (
            hash
            >>>
            0
        );
    }


    function mix32(value) {
        let x =
            value
            >>>
            0;

        x ^=
            x
            >>>
            16;

        x =
            Math.imul(
                x,
                0x7feb352d
            );

        x ^=
            x
            >>>
            15;

        x =
            Math.imul(
                x,
                0x846ca68b
            );

        x ^=
            x
            >>>
            16;

        return (
            x
            >>>
            0
        );
    }


    function seededUnit(
        key,
        offset
    ) {
        const base =
            hashValue(
                key
            );

        const mixed =
            mix32(
                base
                ^
                Math.imul(
                    (
                        offset
                        +
                        1
                    )
                    >>>
                    0,

                    0x9e3779b1
                )
            );

        return (
            mixed
            /
            4294967296
        );
    }


    function seededSigned(
        key,
        offset
    ) {
        return (
            seededUnit(
                key,
                offset
            )
            *
            2
            -
            1
        );
    }


    function seededInteger(
        key,
        offset,
        minimum,
        maximum
    ) {
        return (
            minimum
            +
            Math.floor(
                seededUnit(
                    key,
                    offset
                )
                *
                (
                    maximum
                    -
                    minimum
                    +
                    1
                )
            )
        );
    }


    function normalize(
        x,
        y
    ) {
        const length =
            Math.max(
                Math.hypot(
                    x,
                    y
                ),
                0.000001
            );

        return {
            x:
                x
                /
                length,

            y:
                y
                /
                length,

            length,
        };
    }


    function canonicalEdgeKey(
        a,
        b
    ) {
        return (
            a < b
                ?
                `${a}|${b}`
                :
                `${b}|${a}`
        );
    }


    function numberOr(
        value,
        fallback
    ) {
        const numeric =
            Number(
                value
            );

        return (
            Number.isFinite(
                numeric
            )
                ?
                numeric
                :
                fallback
        );
    }


    // Semantic graph


    function mergeEdgeMetric(
        target,
        source
    ) {
        if (
            !source
        ) {
            return target;
        }

        target.strength =
            Math.max(
                target.strength,

                numberOr(
                    source.strength,
                    0
                )
            );

        target.semantic =
            Math.max(
                target.semantic,

                numberOr(
                    source.semantic,
                    0
                )
            );

        target.cooccurrence =
            Math.max(
                target.cooccurrence,

                numberOr(
                    source.cooccurrence,
                    0
                )
            );

        target.jaccard =
            Math.max(
                target.jaccard,

                numberOr(
                    source.jaccard,
                    0
                )
            );

        return target;
    }


    function buildGraphEdges(
        nodes,
        edges
    ) {
        const byKey =
            new Map();


        edges.forEach(
            (edge) => {
                if (
                    !edge
                    ||
                    !edge.source
                    ||
                    !edge.target
                ) {
                    return;
                }

                const key =
                    canonicalEdgeKey(
                        edge.source,
                        edge.target
                    );

                const metric =
                    byKey.get(
                        key
                    )
                    ||
                    {
                        source:
                            edge.source,

                        target:
                            edge.target,

                        strength:
                            0,

                        semantic:
                            0,

                        cooccurrence:
                            0,

                        jaccard:
                            0,
                    };

                mergeEdgeMetric(
                    metric,
                    edge
                );

                byKey.set(
                    key,
                    metric
                );
            }
        );


        nodes.forEach(
            (node) => {
                const neighbors =
                    Array.isArray(
                        node.neighbors
                    )
                        ?
                        node.neighbors
                        :
                        [];

                neighbors.forEach(
                    (neighbor) => {
                        if (
                            !neighbor
                            ||
                            !neighbor.tag
                        ) {
                            return;
                        }

                        const key =
                            canonicalEdgeKey(
                                node.tag,
                                neighbor.tag
                            );

                        const metric =
                            byKey.get(
                                key
                            )
                            ||
                            {
                                source:
                                    node.tag,

                                target:
                                    neighbor.tag,

                                strength:
                                    0,

                                semantic:
                                    0,

                                cooccurrence:
                                    0,

                                jaccard:
                                    0,
                            };

                        mergeEdgeMetric(
                            metric,
                            neighbor
                        );

                        byKey.set(
                            key,
                            metric
                        );
                    }
                );
            }
        );


        return Array.from(
            byKey.values()
        );
    }


    function edgePriority(
        edge
    ) {
        const strength =
            clamp(
                numberOr(
                    edge.strength,
                    0
                ),
                0,
                1.5
            );

        const semantic =
            clamp(
                numberOr(
                    edge.semantic,
                    0
                ),
                0,
                1
            );

        const cooccurrence =
            clamp(
                numberOr(
                    edge.cooccurrence,
                    0
                ),
                0,
                1
            );

        const jaccard =
            clamp(
                numberOr(
                    edge.jaccard,
                    0
                ),
                0,
                1
            );

        return (
            strength
            +
            semantic
            *
            0.035
            +
            cooccurrence
            *
            0.15
            +
            jaccard
            *
            0.17
        );
    }


    function otherTag(
        edge,
        tag
    ) {
        if (
            edge.source
            ===
            tag
        ) {
            return edge.target;
        }

        if (
            edge.target
            ===
            tag
        ) {
            return edge.source;
        }

        return null;
    }


    function incidentEdges(
        graphEdges,
        tag
    ) {
        return graphEdges
            .filter(
                (edge) => (
                    edge.source
                    ===
                    tag

                    ||

                    edge.target
                    ===
                    tag
                )
            )
            .sort(
                (
                    a,
                    b
                ) => (
                    edgePriority(
                        b
                    )
                    -
                    edgePriority(
                        a
                    )
                )
            );
    }


    function buildCandidateTags(
        rootTag,
        graphEdges,
        options
    ) {
        const direct =
            incidentEdges(
                graphEdges,
                rootTag
            );

        const tags = [
            rootTag,
        ];

        for (
            const edge
            of
            direct
        ) {
            const tag =
                otherTag(
                    edge,
                    rootTag
                );

            if (
                !tag
                ||
                tags.includes(
                    tag
                )
            ) {
                continue;
            }

            tags.push(
                tag
            );

            if (
                tags.length
                >=
                options.maxCandidateNodes
            ) {
                break;
            }
        }

        return tags;
    }


    function chooseRootBranches(
        rootTag,
        candidateSet,
        graphEdges,
        options
    ) {
        const direct =
            incidentEdges(
                graphEdges,
                rootTag
            )
            .filter(
                (edge) => {
                    const child =
                        otherTag(
                            edge,
                            rootTag
                        );

                    return (
                        child
                        &&
                        candidateSet.has(
                            child
                        )
                    );
                }
            );

        if (
            !direct.length
        ) {
            return [];
        }

        const strongest =
            numberOr(
                direct[0]
                    .strength,
                0
            );

        const floor =
            Math.max(
                options
                    .rootBranchAbsoluteFloor,

                strongest
                *
                options
                    .rootBranchRelativeFloor
            );

        let selected =
            direct
                .filter(
                    (edge) => (
                        numberOr(
                            edge.strength,
                            0
                        )
                        >=
                        floor
                    )
                )
                .slice(
                    0,
                    options
                        .rootMaxChildren
                );

        if (
            !selected.length
        ) {
            selected =
                direct.slice(
                    0,
                    1
                );
        }

        return selected;
    }


    function buildSemanticTree(
        rootTag,
        graphEdges,
        options
    ) {
        const candidateTags =
            buildCandidateTags(
                rootTag,
                graphEdges,
                options
            );

        const candidateSet =
            new Set(
                candidateTags
            );

        const rootBranches =
            chooseRootBranches(
                rootTag,
                candidateSet,
                graphEdges,
                options
            );

        const connected =
            new Set([
                rootTag,
            ]);

        const depthByTag =
            new Map([
                [
                    rootTag,
                    0,
                ],
            ]);

        const childCount =
            new Map();

        const treeEdges = [];


        rootBranches.forEach(
            (edge) => {
                const child =
                    otherTag(
                        edge,
                        rootTag
                    );

                if (
                    !child
                    ||
                    connected.has(
                        child
                    )
                ) {
                    return;
                }

                treeEdges.push({
                    parent:
                        rootTag,

                    child,

                    depth:
                        1,

                    edge,
                });

                connected.add(
                    child
                );

                depthByTag.set(
                    child,
                    1
                );

                childCount.set(
                    rootTag,

                    (
                        childCount.get(
                            rootTag
                        )
                        ||
                        0
                    )
                    +
                    1
                );
            }
        );


        const subgraphEdges =
            graphEdges.filter(
                (edge) => (
                    candidateSet.has(
                        edge.source
                    )

                    &&

                    candidateSet.has(
                        edge.target
                    )
                )
            );


        while (
            connected.size
            <
            candidateSet.size
        ) {
            let best =
                null;


            for (
                const edge
                of
                subgraphEdges
            ) {
                const sourceConnected =
                    connected.has(
                        edge.source
                    );

                const targetConnected =
                    connected.has(
                        edge.target
                    );

                if (
                    sourceConnected
                    ===
                    targetConnected
                ) {
                    continue;
                }


                const parent =
                    sourceConnected
                        ?
                        edge.source
                        :
                        edge.target;

                const child =
                    sourceConnected
                        ?
                        edge.target
                        :
                        edge.source;

                const parentDepth =
                    depthByTag.get(
                        parent
                    );

                if (
                    !Number.isFinite(
                        parentDepth
                    )
                ) {
                    continue;
                }

                if (
                    parentDepth
                    >=
                    options.maxDepth
                ) {
                    continue;
                }


                const capacity =
                    parent
                    ===
                    rootTag
                        ?
                        options
                            .rootMaxChildren
                        :
                        options
                            .nodeMaxChildren;

                if (
                    (
                        childCount.get(
                            parent
                        )
                        ||
                        0
                    )
                    >=
                    capacity
                ) {
                    continue;
                }


                const depth =
                    parentDepth
                    +
                    1;

                if (
                    depth
                    >
                    options.maxDepth
                ) {
                    continue;
                }


                const score =
                    edgePriority(
                        edge
                    )
                    -
                    parentDepth
                    *
                    0.025
                    -
                    (
                        childCount.get(
                            parent
                        )
                        ||
                        0
                    )
                    *
                    0.008;


                if (
                    !best
                    ||
                    score
                    >
                    best.score
                ) {
                    best = {
                        parent,
                        child,
                        depth,
                        edge,
                        score,
                    };
                }
            }


            if (
                !best
            ) {
                break;
            }


            treeEdges.push({
                parent:
                    best.parent,

                child:
                    best.child,

                depth:
                    best.depth,

                edge:
                    best.edge,
            });


            connected.add(
                best.child
            );

            depthByTag.set(
                best.child,
                best.depth
            );

            childCount.set(
                best.parent,

                (
                    childCount.get(
                        best.parent
                    )
                    ||
                    0
                )
                +
                1
            );
        }


        return {
            rootTag,
            candidateTags,
            treeEdges,
            depthByTag,
            connected,
        };
    }


    function annotateTreeFlow(
        tree,
        options
    ) {
        if (
            !tree
            ||
            !Array.isArray(tree.treeEdges)
            ||
            !tree.treeEdges.length
        ) {
            return tree;
        }

        const childrenByParent = new Map();

        tree.treeEdges.forEach((relation) => {
            if (!childrenByParent.has(relation.parent)) {
                childrenByParent.set(relation.parent, []);
            }

            childrenByParent.get(relation.parent).push(relation);
        });

        let maximumLoad = 0;

        function branchLoad(relation) {
            const direct = clamp(
                numberOr(relation.edge && relation.edge.strength, 0),
                0,
                1.5
            );

            const children = childrenByParent.get(relation.child) || [];
            const downstream = children.reduce(
                (total, childRelation) => total + branchLoad(childRelation),
                0
            );

            const load = direct + options.downstreamFlowDecay * downstream;

            relation.flowLoadRaw = load;
            relation.descendantCount = children.reduce(
                (total, childRelation) => (
                    total
                    + 1
                    + numberOr(childRelation.descendantCount, 0)
                ),
                0
            );

            maximumLoad = Math.max(maximumLoad, load);
            return load;
        }

        const rootBranches = childrenByParent.get(tree.rootTag) || [];
        rootBranches.forEach(branchLoad);

        const denominator = Math.max(maximumLoad, 0.000001);

        tree.treeEdges.forEach((relation) => {
            relation.flowLoad = clamp(
                numberOr(relation.flowLoadRaw, 0) / denominator,
                0,
                1
            );
        });

        return tree;
    }


    // Angular distribution


    function buildIrregularAngles(
        key,
        count,
        options,
        offsetBase
    ) {
        if (
            count
            <=
            0
        ) {
            return [];
        }

        if (
            count
            ===
            1
        ) {
            return [
                seededUnit(
                    key,
                    offsetBase
                )
                *
                TWO_PI,
            ];
        }


        const weights = [];
        let totalWeight = 0;


        for (
            let index = 0;
            index < count;
            index += 1
        ) {
            const random =
                Math.pow(
                    seededUnit(
                        key,
                        offsetBase
                        +
                        100
                        +
                        index
                    ),

                    options
                        .angleGapExponent
                );

            const weight =
                lerp(
                    options
                        .angleGapWeightMin,

                    options
                        .angleGapWeightMax,

                    random
                );

            weights.push(
                weight
            );

            totalWeight +=
                weight;
        }


        const phase =
            seededUnit(
                key,
                offsetBase
                +
                1
            )
            *
            TWO_PI;

        const angles = [];
        let cursor = phase;


        for (
            let index = 0;
            index < count;
            index += 1
        ) {
            const localJitter =
                seededSigned(
                    key,
                    offsetBase
                    +
                    300
                    +
                    index
                )
                *
                0.035;

            angles.push(
                cursor
                +
                localJitter
            );

            cursor +=
                TWO_PI
                *
                (
                    weights[index]
                    /
                    totalWeight
                );
        }

        return angles;
    }


    // Organic paths


    function buildMainPoints(
        start,
        end,
        key,
        options
    ) {
        const dx =
            end.x
            -
            start.x;

        const dy =
            end.y
            -
            start.y;

        const vector =
            normalize(
                dx,
                dy
            );

        const length =
            vector.length;

        const tangentX =
            vector.x;

        const tangentY =
            vector.y;

        const normalX =
            -tangentY;

        const normalY =
            tangentX;


        const sectionCount =
            clamp(
                Math.round(
                    length
                    /
                    options
                        .pixelsPerSection
                ),

                options
                    .minControlPoints,

                options
                    .maxControlPoints
            );


        const amplitude =
            clamp(
                options
                    .minAmplitude
                +
                length
                *
                options
                    .amplitudeFactor,

                options
                    .minAmplitude,

                options
                    .maxAmplitude
            );


        const points = [
            {
                x:
                    start.x,

                y:
                    start.y,
            },
        ];


        let drift = 0;


        for (
            let index = 1;
            index <= sectionCount;
            index += 1
        ) {
            const t =
                index
                /
                (
                    sectionCount
                    +
                    1
                );

            const envelope =
                Math.pow(
                    Math.sin(
                        Math.PI
                        *
                        t
                    ),

                    0.96
                );


            drift =
                drift
                *
                0.48
                +
                seededSigned(
                    key,
                    100
                    +
                    index
                )
                *
                amplitude
                *
                (
                    0.28
                    +
                    seededUnit(
                        key,
                        200
                        +
                        index
                    )
                    *
                    0.48
                );


            const longitudinalJitter =
                seededSigned(
                    key,
                    300
                    +
                    index
                )
                *
                Math.min(
                    10,
                    length
                    *
                    0.022
                );


            points.push({
                x:
                    start.x
                    +
                    dx
                    *
                    t
                    +
                    tangentX
                    *
                    longitudinalJitter
                    +
                    normalX
                    *
                    drift
                    *
                    envelope,

                y:
                    start.y
                    +
                    dy
                    *
                    t
                    +
                    tangentY
                    *
                    longitudinalJitter
                    +
                    normalY
                    *
                    drift
                    *
                    envelope,
            });
        }


        points.push({
            x:
                end.x,

            y:
                end.y,
        });


        return points;
    }


    function buildSmoothPathFromPoints(
        points
    ) {
        if (
            !points.length
        ) {
            return "";
        }


        let path =
            "M "
            +
            points[0]
                .x
                .toFixed(
                    2
                )
            +
            " "
            +
            points[0]
                .y
                .toFixed(
                    2
                );


        for (
            let index = 0;
            index < points.length - 1;
            index += 1
        ) {
            const p0 =
                index
                ===
                0
                    ?
                    points[index]
                    :
                    points[
                        index
                        -
                        1
                    ];

            const p1 =
                points[index];

            const p2 =
                points[
                    index
                    +
                    1
                ];

            const p3 =
                index
                +
                2
                <
                points.length
                    ?
                    points[
                        index
                        +
                        2
                    ]
                    :
                    p2;


            const cp1 = {
                x:
                    p1.x
                    +
                    (
                        p2.x
                        -
                        p0.x
                    )
                    /
                    6,

                y:
                    p1.y
                    +
                    (
                        p2.y
                        -
                        p0.y
                    )
                    /
                    6,
            };


            const cp2 = {
                x:
                    p2.x
                    -
                    (
                        p3.x
                        -
                        p1.x
                    )
                    /
                    6,

                y:
                    p2.y
                    -
                    (
                        p3.y
                        -
                        p1.y
                    )
                    /
                    6,
            };


            path +=
                " C "
                +
                cp1.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                cp1.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                cp2.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                cp2.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                p2.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                p2.y
                    .toFixed(
                        2
                    );
        }


        return path;
    }


    function buildOrganicMainPath(
        start,
        end,
        key,
        options
    ) {
        const points =
            buildMainPoints(
                start,
                end,
                key,
                options
            );

        return {
            points,

            d:
                buildSmoothPathFromPoints(
                    points
                ),
        };
    }


    // SVG layer


    function createGlowFilter(
        defs,
        id
    ) {
        const filter =
            document.createElementNS(
                NS,
                "filter"
            );

        filter.setAttribute(
            "id",
            id
        );

        filter.setAttribute(
            "x",
            "-220%"
        );

        filter.setAttribute(
            "y",
            "-220%"
        );

        filter.setAttribute(
            "width",
            "540%"
        );

        filter.setAttribute(
            "height",
            "540%"
        );


        const blur =
            document.createElementNS(
                NS,
                "feGaussianBlur"
            );

        blur.setAttribute(
            "stdDeviation",
            "4.3"
        );

        blur.setAttribute(
            "result",
            "blur"
        );


        const merge =
            document.createElementNS(
                NS,
                "feMerge"
            );


        const blurNode =
            document.createElementNS(
                NS,
                "feMergeNode"
            );

        blurNode.setAttribute(
            "in",
            "blur"
        );


        const sourceNode =
            document.createElementNS(
                NS,
                "feMergeNode"
            );

        sourceNode.setAttribute(
            "in",
            "SourceGraphic"
        );


        merge.appendChild(
            blurNode
        );

        merge.appendChild(
            sourceNode
        );

        filter.appendChild(
            blur
        );

        filter.appendChild(
            merge
        );

        defs.appendChild(
            filter
        );
    }


    function createLayer(
        gd
    ) {
        const existing =
            document.getElementById(
                "semantic-neural-layer"
            );

        if (
            existing
        ) {
            existing.remove();
        }


        const svg =
            document.createElementNS(
                NS,
                "svg"
            );

        svg.id =
            "semantic-neural-layer";

        svg.setAttribute(
            "width",
            "100%"
        );

        svg.setAttribute(
            "height",
            "100%"
        );

        svg.style.cssText = `
            position:absolute;
            inset:0;
            z-index:35;
            width:100%;
            height:100%;
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


        createGlowFilter(
            defs,
            "semantic-neural-module-glow"
        );


        const clipPath =
            document.createElementNS(
                NS,
                "clipPath"
            );

        clipPath.setAttribute(
            "id",
            "semantic-neural-brain-clip"
        );

        clipPath.setAttribute(
            "clipPathUnits",
            "userSpaceOnUse"
        );


        const clipShape =
            document.createElementNS(
                NS,
                "path"
            );

        clipShape.setAttribute(
            "fill",
            "#ffffff"
        );


        clipPath.appendChild(
            clipShape
        );

        defs.appendChild(
            clipPath
        );


        const content =
            document.createElementNS(
                NS,
                "g"
            );

        content.setAttribute(
            "clip-path",
            "url(#semantic-neural-brain-clip)"
        );

        svg.appendChild(
            content
        );

        const overlay =
            document.createElementNS(
                NS,
                "g"
            );

        svg.appendChild(
            overlay
        );

        gd.appendChild(
            svg
        );


        return {
            svg,
            defs,
            content,
            overlay,
            clipShape,
        };
    }


    function createPathElement(
        layer,
        config
    ) {
        const path =
            document.createElementNS(
                NS,
                "path"
            );

        path.classList.add(
            "neural-dynamic"
        );

        path.setAttribute(
            "d",
            config.d
        );

        path.setAttribute(
            "fill",
            "none"
        );

        path.setAttribute(
            "stroke",
            config.stroke
        );

        path.setAttribute(
            "stroke-width",
            String(
                config.width
            )
        );

        path.setAttribute(
            "stroke-linecap",
            "round"
        );

        path.setAttribute(
            "stroke-linejoin",
            "round"
        );

        path.setAttribute(
            "opacity",

            String(
                config.opacity
                ===
                undefined
                    ?
                    1
                    :
                    config.opacity
            )
        );

        path.setAttribute(
            "vector-effect",
            "non-scaling-stroke"
        );

        if (
            config.glow
        ) {
            path.setAttribute(
                "filter",
                "url(#semantic-neural-module-glow)"
            );
        }

        layer.content.appendChild(
            path
        );

        return path;
    }


    function createCircleElement(
        layer,
        config
    ) {
        const circle =
            document.createElementNS(
                NS,
                "circle"
            );

        circle.classList.add(
            "neural-dynamic"
        );

        circle.setAttribute(
            "cx",
            String(
                config.x
            )
        );

        circle.setAttribute(
            "cy",
            String(
                config.y
            )
        );

        circle.setAttribute(
            "r",
            String(
                config.radius
            )
        );

        circle.setAttribute(
            "fill",
            config.fill
            ||
            "none"
        );

        circle.setAttribute(
            "stroke",
            config.stroke
            ||
            "none"
        );

        circle.setAttribute(
            "stroke-width",

            String(
                config.width
                ||
                0
            )
        );

        circle.setAttribute(
            "opacity",

            String(
                config.opacity
                ===
                undefined
                    ?
                    1
                    :
                    config.opacity
            )
        );

        circle.setAttribute(
            "vector-effect",
            "non-scaling-stroke"
        );

        if (
            config.glow
        ) {
            circle.setAttribute(
                "filter",
                "url(#semantic-neural-module-glow)"
            );
        }

        (
            config.unclipped
                ? layer.overlay
                : layer.content
        ).appendChild(
            circle
        );

        return circle;
    }


    // Brain silhouette


    function crossProduct(
        origin,
        a,
        b
    ) {
        return (
            (
                a.x
                -
                origin.x
            )
            *
            (
                b.y
                -
                origin.y
            )
            -
            (
                a.y
                -
                origin.y
            )
            *
            (
                b.x
                -
                origin.x
            )
        );
    }


    function buildConvexHull(
        points
    ) {
        if (
            !points
            ||
            points.length
            <
            3
        ) {
            return (
                points
                    ?
                    points.slice()
                    :
                    []
            );
        }


        const sorted =
            points
                .slice()
                .sort(
                    (
                        a,
                        b
                    ) => (
                        a.x
                        ===
                        b.x
                            ?
                            a.y
                            -
                            b.y
                            :
                            a.x
                            -
                            b.x
                    )
                );


        const unique = [];


        sorted.forEach(
            (point) => {
                const previous =
                    unique.length
                        ?
                        unique[
                            unique.length
                            -
                            1
                        ]
                        :
                        null;

                if (
                    !previous
                    ||
                    Math.abs(
                        point.x
                        -
                        previous.x
                    )
                    >
                    0.000001
                    ||
                    Math.abs(
                        point.y
                        -
                        previous.y
                    )
                    >
                    0.000001
                ) {
                    unique.push(
                        point
                    );
                }
            }
        );


        if (
            unique.length
            <
            3
        ) {
            return unique;
        }


        const lower = [];


        unique.forEach(
            (point) => {
                while (
                    lower.length
                    >=
                    2

                    &&

                    crossProduct(
                        lower[
                            lower.length
                            -
                            2
                        ],

                        lower[
                            lower.length
                            -
                            1
                        ],

                        point
                    )
                    <=
                    0
                ) {
                    lower.pop();
                }

                lower.push(
                    point
                );
            }
        );


        const upper = [];


        for (
            let index =
                unique.length
                -
                1;

            index
            >=
            0;

            index -=
                1
        ) {
            const point =
                unique[index];

            while (
                upper.length
                >=
                2

                &&

                crossProduct(
                    upper[
                        upper.length
                        -
                        2
                    ],

                    upper[
                        upper.length
                        -
                        1
                    ],

                    point
                )
                <=
                0
            ) {
                upper.pop();
            }

            upper.push(
                point
            );
        }


        lower.pop();
        upper.pop();


        return lower.concat(
            upper
        );
    }


    function buildNormalizedBrainSilhouette(
        layer,
        brainPaths,
        brainPathTransform,
        brainViewBox,
        options
    ) {
        if (
            !brainPaths.length
        ) {
            return null;
        }


        const guideGroup =
            document.createElementNS(
                NS,
                "g"
            );

        guideGroup.setAttribute(
            "visibility",
            "hidden"
        );

        guideGroup.setAttribute(
            "pointer-events",
            "none"
        );

        if (
            brainPathTransform
        ) {
            guideGroup.setAttribute(
                "transform",
                brainPathTransform
            );
        }

        layer.svg.appendChild(
            guideGroup
        );


        const samples = [];


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
                    "none"
                );

                path.setAttribute(
                    "stroke",
                    "none"
                );

                guideGroup.appendChild(
                    path
                );


                let totalLength =
                    0;

                try {
                    totalLength =
                        path.getTotalLength();

                } catch (
                    error
                ) {
                    totalLength =
                        0;
                }


                if (
                    !Number.isFinite(
                        totalLength
                    )
                    ||
                    totalLength
                    <=
                    0
                ) {
                    return;
                }


                const sampleCount =
                    clamp(
                        Math.ceil(
                            totalLength
                            /
                            options
                                .clipSampleSpacing
                        ),

                        options
                            .clipMinSamplesPerPath,

                        options
                            .clipMaxSamplesPerPath
                    );


                const matrix =
                    path.getCTM();

                if (
                    !matrix
                ) {
                    return;
                }


                for (
                    let index = 0;
                    index <= sampleCount;
                    index += 1
                ) {
                    const localPoint =
                        path.getPointAtLength(
                            totalLength
                            *
                            (
                                index
                                /
                                sampleCount
                            )
                        );


                    const svgPoint =
                        layer
                            .svg
                            .createSVGPoint();

                    svgPoint.x =
                        localPoint.x;

                    svgPoint.y =
                        localPoint.y;


                    const transformed =
                        svgPoint
                            .matrixTransform(
                                matrix
                            );


                    const nx =
                        (
                            transformed.x
                            -
                            brainViewBox
                                .minX
                        )
                        /
                        brainViewBox
                            .width;


                    const ny =
                        (
                            transformed.y
                            -
                            brainViewBox
                                .minY
                        )
                        /
                        brainViewBox
                            .height;


                    if (
                        Number.isFinite(
                            nx
                        )
                        &&
                        Number.isFinite(
                            ny
                        )
                        &&
                        nx
                        >=
                        -0.03
                        &&
                        nx
                        <=
                        1.03
                        &&
                        ny
                        >=
                        -0.03
                        &&
                        ny
                        <=
                        1.03
                    ) {
                        samples.push({
                            x:
                                nx,

                            y:
                                ny,
                        });
                    }
                }
            }
        );


        guideGroup.remove();


        if (
            samples.length
            <
            20
        ) {
            return null;
        }


        let hull =
            buildConvexHull(
                samples
            );


        if (
            hull.length
            <
            3
        ) {
            return null;
        }


        let minX =
            Infinity;

        let maxX =
            -Infinity;

        let minY =
            Infinity;

        let maxY =
            -Infinity;


        hull.forEach(
            (point) => {
                minX =
                    Math.min(
                        minX,
                        point.x
                    );

                maxX =
                    Math.max(
                        maxX,
                        point.x
                    );

                minY =
                    Math.min(
                        minY,
                        point.y
                    );

                maxY =
                    Math.max(
                        maxY,
                        point.y
                    );
            }
        );


        const centerX =
            (
                minX
                +
                maxX
            )
            /
            2;

        const centerY =
            (
                minY
                +
                maxY
            )
            /
            2;


        hull =
            hull.map(
                (point) => ({
                    x:
                        centerX
                        +
                        (
                            point.x
                            -
                            centerX
                        )
                        *
                        options
                            .clipRadialScale,

                    y:
                        centerY
                        +
                        (
                            point.y
                            -
                            centerY
                        )
                        *
                        options
                            .clipRadialScale,
                })
            );


        return {
            centerX,
            centerY,
            points:
                hull,
        };
    }


    function fallbackNormalizedSilhouette() {
        const points = [];
        const count = 180;


        for (
            let index = 0;
            index < count;
            index += 1
        ) {
            const angle =
                TWO_PI
                *
                index
                /
                count;

            points.push({
                x:
                    0.5
                    +
                    Math.cos(
                        angle
                    )
                    *
                    0.47,

                y:
                    0.5
                    +
                    Math.sin(
                        angle
                    )
                    *
                    0.49,
            });
        }


        return {
            centerX:
                0.5,

            centerY:
                0.5,

            points,
        };
    }


    function updateBrainClip(
        layer,
        silhouette,
        dataToPixel,
        brainBounds,
        options
    ) {
        const topLeft =
            dataToPixel(
                -brainBounds
                    .xRadius,

                brainBounds
                    .yRadius
            );


        const bottomRight =
            dataToPixel(
                brainBounds
                    .xRadius,

                -brainBounds
                    .yRadius
            );


        const left =
            Math.min(
                topLeft.x,
                bottomRight.x
            );

        const right =
            Math.max(
                topLeft.x,
                bottomRight.x
            );

        const top =
            Math.min(
                topLeft.y,
                bottomRight.y
            );

        const bottom =
            Math.max(
                topLeft.y,
                bottomRight.y
            );

        const width =
            right
            -
            left;

        const height =
            bottom
            -
            top;


        const center = {
            x:
                left
                +
                silhouette
                    .centerX
                *
                width,

            y:
                top
                +
                silhouette
                    .centerY
                *
                height,
        };


        const mappedPoints =
            silhouette
                .points
                .map(
                    (point) => {
                        let x =
                            left
                            +
                            point.x
                            *
                            width;

                        let y =
                            top
                            +
                            point.y
                            *
                            height;


                        const dx =
                            x
                            -
                            center.x;

                        const dy =
                            y
                            -
                            center.y;

                        const distance =
                            Math.max(
                                Math.hypot(
                                    dx,
                                    dy
                                ),
                                0.000001
                            );


                        const safeDistance =
                            Math.max(
                                0,

                                distance
                                -
                                options
                                    .clipSafetyPixels
                            );


                        const factor =
                            safeDistance
                            /
                            distance;


                        x =
                            center.x
                            +
                            dx
                            *
                            factor;

                        y =
                            center.y
                            +
                            dy
                            *
                            factor;


                        return {
                            x,
                            y,
                        };
                    }
                );


        if (
            !mappedPoints.length
        ) {
            layer
                .clipShape
                .setAttribute(
                    "d",
                    ""
                );

            return;
        }


        let path =
            "M "
            +
            mappedPoints[0]
                .x
                .toFixed(
                    2
                )
            +
            " "
            +
            mappedPoints[0]
                .y
                .toFixed(
                    2
                );


        for (
            let index = 1;
            index < mappedPoints.length;
            index += 1
        ) {
            path +=
                " L "
                +
                mappedPoints[index]
                    .x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                mappedPoints[index]
                    .y
                    .toFixed(
                        2
                    );
        }


        path +=
            " Z";


        layer
            .clipShape
            .setAttribute(
                "d",
                path
            );
    }


    // Branch gradients


    function createBranchGradient(
        layer,
        id,
        color,
        start,
        tip,
        opacityNear,
        opacityMid,
        opacityFar
    ) {
        const gradient =
            document.createElementNS(
                NS,
                "linearGradient"
            );

        gradient.classList.add(
            "neural-dynamic-def"
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
            "x1",
            String(
                start.x
            )
        );

        gradient.setAttribute(
            "y1",
            String(
                start.y
            )
        );

        gradient.setAttribute(
            "x2",
            String(
                tip.x
            )
        );

        gradient.setAttribute(
            "y2",
            String(
                tip.y
            )
        );


        [
            [
                "0%",
                opacityNear,
            ],

            [
                "48%",
                opacityMid,
            ],

            [
                "100%",
                opacityFar,
            ],
        ].forEach(
            (
                [
                    offset,
                    opacity,
                ]
            ) => {
                const stop =
                    document.createElementNS(
                        NS,
                        "stop"
                    );

                stop.setAttribute(
                    "offset",
                    offset
                );

                stop.setAttribute(
                    "stop-color",
                    color
                );

                stop.setAttribute(
                    "stop-opacity",
                    String(
                        opacity
                    )
                );

                gradient.appendChild(
                    stop
                );
            }
        );


        layer
            .defs
            .appendChild(
                gradient
            );


        return (
            "url(#"
            +
            id
            +
            ")"
        );
    }


    // Dendrites


    function buildDendrite(
        origin,
        angle,
        length,
        key,
        index,
        options
    ) {
        const direction = {
            x:
                Math.cos(
                    angle
                ),

            y:
                Math.sin(
                    angle
                ),
        };


        const normal = {
            x:
                -direction.y,

            y:
                direction.x,
        };


        const curvature =
            lerp(
                options
                    .branchCurveMin,

                options
                    .branchCurveMax,

                seededUnit(
                    key,
                    5000
                    +
                    index
                )
            );


        const bend =
            seededSigned(
                key,
                5100
                +
                index
            )
            *
            length
            *
            curvature;


        const tipAngle =
            angle
            +
            seededSigned(
                key,
                5200
                +
                index
            )
            *
            options
                .branchAngleJitter;


        const tipDirection = {
            x:
                Math.cos(
                    tipAngle
                ),

            y:
                Math.sin(
                    tipAngle
                ),
        };


        const tip = {
            x:
                origin.x
                +
                tipDirection.x
                *
                length,

            y:
                origin.y
                +
                tipDirection.y
                *
                length,
        };


        const control1 = {
            x:
                origin.x
                +
                direction.x
                *
                length
                *
                0.30
                +
                normal.x
                *
                bend
                *
                0.55,

            y:
                origin.y
                +
                direction.y
                *
                length
                *
                0.30
                +
                normal.y
                *
                bend
                *
                0.55,
        };


        const control2 = {
            x:
                origin.x
                +
                direction.x
                *
                length
                *
                0.70
                -
                normal.x
                *
                bend
                *
                0.28,

            y:
                origin.y
                +
                direction.y
                *
                length
                *
                0.70
                -
                normal.y
                *
                bend
                *
                0.28,
        };


        const terminal =
            normalize(
                tip.x
                -
                control2.x,

                tip.y
                -
                control2.y
            );


        return {
            d:
                "M "
                +
                origin.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                origin.y
                    .toFixed(
                        2
                    )
                +
                " C "
                +
                control1.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                control1.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                control2.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                control2.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                tip.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                tip.y
                    .toFixed(
                        2
                    ),

            tip,

            terminalAngle:
                Math.atan2(
                    terminal.y,
                    terminal.x
                ),

            length,
        };
    }


    function buildTerminalTwig(
        origin,
        angle,
        length,
        key,
        index,
        options
    ) {
        const direction = {
            x:
                Math.cos(
                    angle
                ),

            y:
                Math.sin(
                    angle
                ),
        };


        const normal = {
            x:
                -direction.y,

            y:
                direction.x,
        };


        const curve =
            lerp(
                options
                    .terminalCurveMin,

                options
                    .terminalCurveMax,

                seededUnit(
                    key,
                    7000
                    +
                    index
                )
            );


        const bend =
            seededSigned(
                key,
                7100
                +
                index
            )
            *
            length
            *
            curve;


        const tipAngle =
            angle
            +
            seededSigned(
                key,
                7200
                +
                index
            )
            *
            0.08;


        const tipDirection = {
            x:
                Math.cos(
                    tipAngle
                ),

            y:
                Math.sin(
                    tipAngle
                ),
        };


        const tip = {
            x:
                origin.x
                +
                tipDirection.x
                *
                length,

            y:
                origin.y
                +
                tipDirection.y
                *
                length,
        };


        const control1 = {
            x:
                origin.x
                +
                direction.x
                *
                length
                *
                0.34
                +
                normal.x
                *
                bend
                *
                0.50,

            y:
                origin.y
                +
                direction.y
                *
                length
                *
                0.34
                +
                normal.y
                *
                bend
                *
                0.50,
        };


        const control2 = {
            x:
                origin.x
                +
                direction.x
                *
                length
                *
                0.72
                -
                normal.x
                *
                bend
                *
                0.20,

            y:
                origin.y
                +
                direction.y
                *
                length
                *
                0.72
                -
                normal.y
                *
                bend
                *
                0.20,
        };


        return {
            d:
                "M "
                +
                origin.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                origin.y
                    .toFixed(
                        2
                    )
                +
                " C "
                +
                control1.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                control1.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                control2.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                control2.y
                    .toFixed(
                        2
                    )
                +
                ", "
                +
                tip.x
                    .toFixed(
                        2
                    )
                +
                " "
                +
                tip.y
                    .toFixed(
                        2
                    ),

            tip,
        };
    }


    function drawGradientPath(
        layer,
        pathData,
        start,
        tip,
        color,
        idBase,
        coreWidth,
        haloWidth,
        coreOpacities,
        haloOpacities,
        style
    ) {
        const widthScale =
            style.widthScale
            ===
            undefined
                ?
                1
                :
                style.widthScale;


        const opacityScale =
            style.opacityScale
            ===
            undefined
                ?
                1
                :
                style.opacityScale;


        const glowScale =
            style.glowScale
            ===
            undefined
                ?
                1
                :
                style.glowScale;


        const haloStroke =
            createBranchGradient(
                layer,
                `${idBase}-halo`,
                color,
                start,
                tip,

                haloOpacities[0]
                *
                opacityScale
                *
                glowScale,

                haloOpacities[1]
                *
                opacityScale
                *
                glowScale,

                haloOpacities[2]
                *
                opacityScale
                *
                glowScale
            );


        const coreStroke =
            createBranchGradient(
                layer,
                `${idBase}-core`,
                color,
                start,
                tip,

                coreOpacities[0]
                *
                opacityScale,

                coreOpacities[1]
                *
                opacityScale,

                coreOpacities[2]
                *
                opacityScale
            );


        createPathElement(
            layer,
            {
                d:
                    pathData,

                stroke:
                    haloStroke,

                width:
                    haloWidth
                    *
                    widthScale,

                opacity:
                    1,

                glow:
                    true,
            }
        );


        createPathElement(
            layer,
            {
                d:
                    pathData,

                stroke:
                    coreStroke,

                width:
                    coreWidth
                    *
                    widthScale,

                opacity:
                    1,

                glow:
                    false,
            }
        );
    }


    function drawDendriteWithTerminalSplit(
        layer,
        origin,
        angle,
        length,
        key,
        branchIndex,
        color,
        idBase,
        options,
        style
    ) {
        const dendrite =
            buildDendrite(
                origin,
                angle,
                length,
                key,
                branchIndex,
                options
            );


        drawGradientPath(
            layer,
            dendrite.d,
            origin,
            dendrite.tip,
            color,
            idBase,

            options
                .branchCoreWidth,

            options
                .branchHaloWidth,

            [
                options
                    .branchCoreOpacityNear,

                options
                    .branchCoreOpacityMid,

                options
                    .branchCoreOpacityFar,
            ],

            [
                options
                    .branchHaloOpacityNear,

                options
                    .branchHaloOpacityMid,

                options
                    .branchHaloOpacityFar,
            ],

            style
        );


        const ratioA =
            lerp(
                options
                    .terminalLengthRatioMin,

                options
                    .terminalLengthRatioMax,

                seededUnit(
                    key,
                    8000
                    +
                    branchIndex
                    *
                    7
                )
            );


        const ratioB =
            lerp(
                options
                    .terminalLengthRatioMin,

                options
                    .terminalLengthRatioMax,

                seededUnit(
                    key,
                    8001
                    +
                    branchIndex
                    *
                    7
                )
            );


        const divergenceA =
            lerp(
                options
                    .terminalAngleMin,

                options
                    .terminalAngleMax,

                seededUnit(
                    key,
                    8002
                    +
                    branchIndex
                    *
                    7
                )
            );


        const divergenceB =
            lerp(
                options
                    .terminalAngleMin,

                options
                    .terminalAngleMax,

                seededUnit(
                    key,
                    8003
                    +
                    branchIndex
                    *
                    7
                )
            );


        const skew =
            seededSigned(
                key,
                8004
                +
                branchIndex
                *
                7
            )
            *
            0.12;


        const twigAngles = [
            dendrite
                .terminalAngle
            +
            divergenceA
            +
            skew,

            dendrite
                .terminalAngle
            -
            divergenceB
            +
            skew
            *
            0.42,
        ];


        const twigLengths = [
            dendrite
                .length
            *
            ratioA,

            dendrite
                .length
            *
            ratioB,
        ];


        twigAngles.forEach(
            (
                twigAngle,
                twigIndex
            ) => {
                const twig =
                    buildTerminalTwig(
                        dendrite.tip,
                        twigAngle,
                        twigLengths[
                            twigIndex
                        ],
                        `${key}|terminal`,
                        branchIndex
                        *
                        2
                        +
                        twigIndex,
                        options
                    );


                drawGradientPath(
                    layer,
                    twig.d,
                    dendrite.tip,
                    twig.tip,
                    color,

                    `${idBase}-terminal-${twigIndex}`,

                    options
                        .terminalCoreWidth,

                    options
                        .terminalHaloWidth,

                    [
                        options
                            .terminalCoreOpacityNear,

                        options
                            .terminalCoreOpacityMid,

                        options
                            .terminalCoreOpacityFar,
                    ],

                    [
                        options
                            .terminalHaloOpacityNear,

                        options
                            .terminalHaloOpacityMid,

                        options
                            .terminalHaloOpacityFar,
                    ],

                    {
                        widthScale:
                            style.widthScale
                            *
                            0.92,

                        opacityScale:
                            style.opacityScale
                            *
                            0.92,

                        glowScale:
                            style.glowScale
                            *
                            0.86,
                    }
                );
            }
        );
    }


    function drawNodeArbor(
        layer,
        origin,
        nodeKey,
        color,
        count,
        lengthMin,
        lengthMax,
        options,
        gradientIdPrefix,
        style
    ) {
        const adjustedCount =
            Math.max(
                2,

                Math.round(
                    count
                    *
                    style.countScale
                )
            );


        const angles =
            buildIrregularAngles(
                nodeKey,
                adjustedCount,
                options,
                10000
            );


        angles.forEach(
            (
                angle,
                index
            ) => {
                const finalAngle =
                    angle
                    +
                    seededSigned(
                        nodeKey,
                        11000
                        +
                        index
                    )
                    *
                    options
                        .branchAngleJitter;


                const length =
                    lerp(
                        lengthMin,
                        lengthMax,

                        seededUnit(
                            nodeKey,
                            12000
                            +
                            index
                        )
                    )
                    *
                    style.lengthScale;


                drawDendriteWithTerminalSplit(
                    layer,
                    origin,
                    finalAngle,
                    length,
                    nodeKey,
                    index,
                    color,
                    `${gradientIdPrefix}-${index}`,
                    options,

                    {
                        widthScale:
                            style.widthScale,

                        opacityScale:
                            style.opacityScale,

                        glowScale:
                            style.glowScale,
                    }
                );
            }
        );
    }


    // Node highlights


    function drawTreeNodeHighlight(
        layer,
        point,
        node,
        depth,
        color,
        profile
    ) {
        const weight =
            clamp(
                numberOr(
                    node.weight,
                    3
                ),
                1,
                6
            );


        const baseRadius =
            7.8
            +
            weight
            *
            0.72;


        const radius =
            baseRadius
            *
            profile
                .highlightScale;


        createCircleElement(
            layer,
            {
                x:
                    point.x,

                y:
                    point.y,

                radius:
                    radius
                    +
                    2.4,

                fill:
                    "none",

                stroke:
                    color,

                width:
                    4.2
                    *
                    profile
                        .lineWidth,

                opacity:
                    0.10
                    *
                    profile
                        .glow
                    *
                    profile
                        .highlightOpacity,

                glow:
                    true,

                unclipped:
                    true,
            }
        );


        createCircleElement(
            layer,
            {
                x:
                    point.x,

                y:
                    point.y,

                radius,

                fill:
                    "none",

                stroke:
                    color,

                width:
                    Math.max(
                        0.65,

                        1.45
                        *
                        profile
                            .lineWidth
                    ),

                opacity:
                    profile
                        .highlightOpacity,

                glow:
                    false,

                unclipped:
                    true,
            }
        );


        if (
            depth
            ===
            1
        ) {
            createCircleElement(
                layer,
                {
                    x:
                        point.x,

                    y:
                        point.y,

                    radius:
                        Math.max(
                            2.1,

                            radius
                            *
                            0.28
                        ),

                    fill:
                        color,

                    stroke:
                        "none",

                    width:
                        0,

                    opacity:
                        0.11
                        *
                        profile
                            .highlightOpacity,

                    glow:
                        false,
                }
            );
        }
    }


    function hideLegacyNeighborHighlight(
        gd
    ) {
        const index =
            gd.data.findIndex(
                (trace) => (
                    (
                        trace.meta
                        ||
                        {}
                    ).layer
                    ===
                    "neighbor-highlight"
                )
            );


        if (
            index
            <
            0
        ) {
            return;
        }


        if (
            gd.data[
                index
            ].visible
            ===
            false
        ) {
            return;
        }


        Plotly.restyle(
            gd,
            {
                visible:
                    false,
            },
            [
                index,
            ]
        );
    }


    // Moving signal


    function animateSignal(
        layer,
        guidePath,
        color,
        edgeIndex,
        options,
        profile
    ) {
        if (
            !options
                .signalEnabled
            ||
            profile
                .signalOpacity
            <=
            0
        ) {
            return;
        }


        const totalLength =
            guidePath.getTotalLength();


        if (
            !Number.isFinite(
                totalLength
            )
            ||
            totalLength
            <=
            options
                .signalLength
        ) {
            return;
        }


        const signal =
            document.createElementNS(
                NS,
                "path"
            );

        signal.classList.add(
            "neural-dynamic"
        );

        signal.setAttribute(
            "d",
            guidePath.getAttribute(
                "d"
            )
        );

        signal.setAttribute(
            "fill",
            "none"
        );

        signal.setAttribute(
            "stroke",
            color
        );

        signal.setAttribute(
            "stroke-width",

            String(
                options
                    .signalWidth
                *
                profile
                    .signalWidth
            )
        );

        signal.setAttribute(
            "stroke-linecap",
            "round"
        );

        signal.setAttribute(
            "stroke-linejoin",
            "round"
        );

        signal.setAttribute(
            "stroke-dasharray",

            options
                .signalLength
            +
            " "
            +
            (
                totalLength
                +
                options
                    .signalLength
            )
        );

        signal.setAttribute(
            "stroke-dashoffset",

            String(
                totalLength
                +
                options
                    .signalLength
            )
        );

        signal.setAttribute(
            "opacity",
            "0"
        );

        signal.setAttribute(
            "filter",
            "url(#semantic-neural-module-glow)"
        );

        signal.setAttribute(
            "vector-effect",
            "non-scaling-stroke"
        );

        layer
            .content
            .appendChild(
                signal
            );


        const duration =
            options
                .signalDuration
            +
            seededUnit(
                guidePath.getAttribute(
                    "d"
                ),

                13000
                +
                edgeIndex
            )
            *
            options
                .signalDurationJitter;


        const gap =
            options
                .signalGap
            +
            seededUnit(
                guidePath.getAttribute(
                    "d"
                ),

                14000
                +
                edgeIndex
            )
            *
            options
                .signalGapJitter;


        const initialDelay =
            edgeIndex
            *
            95
            +
            seededUnit(
                guidePath.getAttribute(
                    "d"
                ),

                15000
                +
                edgeIndex
            )
            *
            500;


        function run() {
            if (
                !signal
                    .isConnected
            ) {
                return;
            }


            const startedAt =
                performance.now();


            function frame(
                timestamp
            ) {
                if (
                    !signal
                        .isConnected
                ) {
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


                const eased =
                    1
                    -
                    Math.pow(
                        1
                        -
                        progress,

                        1.65
                    );


                const startOffset =
                    totalLength
                    +
                    options
                        .signalLength;


                const endOffset =
                    -options
                        .signalLength;


                const offset =
                    startOffset
                    +
                    (
                        endOffset
                        -
                        startOffset
                    )
                    *
                    eased;


                const visibility =
                    Math.pow(
                        Math.sin(
                            Math.PI
                            *
                            progress
                        ),

                        0.55
                    );


                signal.setAttribute(
                    "stroke-dashoffset",
                    String(
                        offset
                    )
                );


                signal.setAttribute(
                    "opacity",

                    String(
                        options
                            .signalOpacity
                        *
                        profile
                            .signalOpacity
                        *
                        visibility
                    )
                );


                if (
                    progress
                    <
                    1
                ) {
                    requestAnimationFrame(
                        frame
                    );

                    return;
                }


                signal.setAttribute(
                    "opacity",
                    "0"
                );


                window.setTimeout(
                    run,
                    gap
                );
            }


            requestAnimationFrame(
                frame
            );
        }


        window.setTimeout(
            run,
            initialDelay
        );
    }


    // Manager


    function createManager(
        config
    ) {
        const gd =
            config.gd;

        const nodes =
            config.nodes
            ||
            [];

        const rawEdges =
            config.edges
            ||
            [];

        const colors =
            config.colors
            ||
            {};

        const dataToPixel =
            config.dataToPixel;


        const brainPaths =
            config.brainPaths
            ||
            GLOBAL_CONFIG
                .brainPaths
            ||
            [];


        const brainPathTransform =
            config
                .brainPathTransform
            ||
            GLOBAL_CONFIG
                .brainPathTransform
            ||
            "";


        const brainViewBox =
            config
                .brainViewBox
            ||
            GLOBAL_CONFIG
                .brainViewBox
            ||
            {
                minX:
                    0,

                minY:
                    0,

                width:
                    1122,

                height:
                    1402,
            };


        const brainBounds =
            config
                .brainBounds
            ||
            GLOBAL_CONFIG
                .brainBounds
            ||
            {
                xRadius:
                    1.06,

                yRadius:
                    1.325,
            };


        const options = {
            ...DEFAULTS,

            ...(
                config.options
                ||
                {}
            ),

            depthProfiles: {
                ...DEFAULTS
                    .depthProfiles,

                ...(
                    (
                        config.options
                        ||
                        {}
                    ).depthProfiles
                    ||
                    {}
                ),
            },
        };


        if (
            !gd
        ) {
            throw new Error(
                "PrintHumanNeural: missing gd"
            );
        }


        if (
            typeof dataToPixel
            !==
            "function"
        ) {
            throw new Error(
                "PrintHumanNeural: missing dataToPixel()"
            );
        }


        const nodesByTag =
            new Map(
                nodes.map(
                    (node) => [
                        node.tag,
                        node,
                    ]
                )
            );


        const graphEdges =
            buildGraphEdges(
                nodes,
                rawEdges
            );


        const layer =
            createLayer(
                gd
            );


        const silhouette =
            buildNormalizedBrainSilhouette(
                layer,
                brainPaths,
                brainPathTransform,
                brainViewBox,
                options
            )
            ||
            fallbackNormalizedSilhouette();


        let activeTag =
            null;

        let activeTree =
            null;


        function updateClip() {
            updateBrainClip(
                layer,
                silhouette,
                dataToPixel,
                brainBounds,
                options
            );
        }


        function clearVisuals() {
            layer
                .svg
                .querySelectorAll(
                    ".neural-dynamic"
                )
                .forEach(
                    (element) => {
                        element.remove();
                    }
                );


            layer
                .defs
                .querySelectorAll(
                    ".neural-dynamic-def"
                )
                .forEach(
                    (element) => {
                        element.remove();
                    }
                );
        }


        function clear() {
            activeTag =
                null;

            activeTree =
                null;

            clearVisuals();
        }


        function profileForDepth(
            depth
        ) {
            return (
                options
                    .depthProfiles[
                        depth
                    ]

                ||

                options
                    .depthProfiles[
                        options
                            .maxDepth
                    ]

                ||

                options
                    .depthProfiles[
                        3
                    ]
            );
        }


        function drawMainConnection(
            parentPixel,
            childPixel,
            relation,
            edgeIndex,
            depth,
            neuralColor,
            pulseColor
        ) {
            const profile =
                profileForDepth(
                    depth
                );


            const key =
                activeTag
                +
                "|"
                +
                relation.parent
                +
                "|"
                +
                relation.child
                +
                "|"
                +
                depth;


            const geometry =
                buildOrganicMainPath(
                    parentPixel,
                    childPixel,
                    key,
                    options
                );


            const strength =
                clamp(
                    numberOr(
                        relation
                            .edge
                            .strength,

                        0
                    ),

                    0,
                    1
                );


            const flowLoad =
                clamp(
                    numberOr(
                        relation.flowLoad,
                        strength
                    ),
                    0,
                    1
                );


            const flowWidthScale =
                options.flowWidthBase
                +
                options.flowWidthGain
                *
                Math.pow(
                    flowLoad,
                    options.flowWidthExponent
                );


            createPathElement(
                layer,
                {
                    d:
                        geometry.d,

                    stroke:
                        neuralColor,

                    width:
                        (
                            options
                                .mainHaloWidth

                            +

                            strength
                            *
                            options
                                .mainHaloStrengthWidth
                        )
                        *
                        profile
                            .lineWidth
                        *
                        flowWidthScale,

                    opacity:
                        options
                            .mainHaloOpacity
                        *
                        profile
                            .lineOpacity
                        *
                        profile
                            .glow,

                    glow:
                        true,
                }
            );


            const core =
                createPathElement(
                    layer,
                    {
                        d:
                            geometry.d,

                        stroke:
                            neuralColor,

                        width:
                            (
                                options
                                    .mainCoreWidth

                                +

                                strength
                                *
                                options
                                    .mainStrengthWidth
                            )
                            *
                            profile
                                .lineWidth
                            *
                            flowWidthScale,

                        opacity:
                            options
                                .mainCoreOpacity
                            *
                            profile
                                .lineOpacity,

                        glow:
                            false,
                    }
                );


            animateSignal(
                layer,
                core,
                pulseColor,
                edgeIndex,
                options,
                profile
            );
        }


        function drawReachedNode(
            tag,
            depth,
            neuralColor
        ) {
            const node =
                nodesByTag.get(
                    tag
                );


            if (
                !node
            ) {
                return;
            }


            const point =
                dataToPixel(
                    node.x,
                    node.y
                );


            const profile =
                profileForDepth(
                    depth
                );


            const countBase =
                seededInteger(
                    "tree-target|"
                    +
                    activeTag
                    +
                    "|"
                    +
                    tag,

                    16000
                    +
                    depth,

                    options
                        .targetBranchesMin,

                    options
                        .targetBranchesMax
                );


            drawTreeNodeHighlight(
                layer,
                point,
                node,
                depth,
                neuralColor,
                profile
            );


            drawNodeArbor(
                layer,
                point,

                "tree-arbor|"
                +
                activeTag
                +
                "|"
                +
                tag
                +
                "|"
                +
                depth,

                neuralColor,
                countBase,

                options
                    .targetBranchLengthMin,

                options
                    .targetBranchLengthMax,

                options,

                "semantic-tree-"
                +
                hashValue(
                    activeTag
                    +
                    "|"
                    +
                    tag
                    +
                    "|"
                    +
                    depth
                ),

                {
                    countScale:
                        profile
                            .arborCount,

                    lengthScale:
                        profile
                            .arborLength,

                    widthScale:
                        profile
                            .lineWidth,

                    opacityScale:
                        profile
                            .arborOpacity,

                    glowScale:
                        profile
                            .glow,
                }
            );
        }


        function draw(
            tag
        ) {
            activeTag =
                tag
                ||
                null;


            clearVisuals();
            updateClip();


            if (
                !activeTag
                ||
                !nodesByTag.has(
                    activeTag
                )
            ) {
                activeTree =
                    null;

                return;
            }


            hideLegacyNeighborHighlight(
                gd
            );


            activeTree =
                buildSemanticTree(
                    activeTag,
                    graphEdges,
                    options
                );


            annotateTreeFlow(
                activeTree,
                options
            );


            const selectedNode =
                nodesByTag.get(
                    activeTag
                );


            const selectedPixel =
                dataToPixel(
                    selectedNode.x,
                    selectedNode.y
                );


            const neuralColor =
                colors.neural
                ||
                colors.primary
                ||
                "#FFFFFF";


            const pulseColor =
                colors.pulse
                ||
                colors.primary
                ||
                "#FFFFFF";


            activeTree
                .treeEdges
                .forEach(
                    (
                        relation,
                        edgeIndex
                    ) => {
                        const parentNode =
                            nodesByTag.get(
                                relation.parent
                            );

                        const childNode =
                            nodesByTag.get(
                                relation.child
                            );


                        if (
                            !parentNode
                            ||
                            !childNode
                        ) {
                            return;
                        }


                        const parentPixel =
                            dataToPixel(
                                parentNode.x,
                                parentNode.y
                            );


                        const childPixel =
                            dataToPixel(
                                childNode.x,
                                childNode.y
                            );


                        drawMainConnection(
                            parentPixel,
                            childPixel,
                            relation,
                            edgeIndex,
                            relation.depth,
                            neuralColor,
                            pulseColor
                        );
                    }
                );


            const reached =
                Array.from(
                    activeTree
                        .depthByTag
                        .entries()
                )
                .filter(
                    (
                        [
                            nodeTag,
                            depth,
                        ]
                    ) => (
                        nodeTag
                        !==
                        activeTag

                        &&

                        depth
                        >
                        0
                    )
                )
                .sort(
                    (
                        a,
                        b
                    ) => (
                        a[1]
                        -
                        b[1]
                    )
                );


            reached.forEach(
                (
                    [
                        nodeTag,
                        depth,
                    ]
                ) => {
                    drawReachedNode(
                        nodeTag,
                        depth,
                        neuralColor
                    );
                }
            );


            const selectedCount =
                seededInteger(
                    "selected|"
                    +
                    activeTag,

                    17000,

                    options
                        .selectedBranchesMin,

                    options
                        .selectedBranchesMax
                );


            drawNodeArbor(
                layer,
                selectedPixel,

                "selected-arbor|"
                +
                activeTag,

                neuralColor,
                selectedCount,

                options
                    .selectedBranchLengthMin,

                options
                    .selectedBranchLengthMax,

                options,

                "semantic-selected-"
                +
                hashValue(
                    activeTag
                ),

                {
                    countScale:
                        1,

                    lengthScale:
                        1,

                    widthScale:
                        1,

                    opacityScale:
                        1,

                    glowScale:
                        1,
                }
            );
        }


        function redraw() {
            updateClip();

            if (
                activeTag
            ) {
                draw(
                    activeTag
                );
            }
        }


        function destroy() {
            activeTag =
                null;

            activeTree =
                null;

            clearVisuals();

            layer
                .svg
                .remove();
        }


        updateClip();


        return {
            draw,
            redraw,
            clear,
            destroy,

            get activeTag() {
                return activeTag;
            },

            get activeTree() {
                return activeTree;
            },
        };
    }


    // Public API


    window.PrintHumanNeural = {
        create:
            createManager,
        // Tree and load calculations shared by the map and explanations.
        explain(rootTag, nodes, edges) {
            const graphEdges = buildGraphEdges(nodes, edges);
            const options = {...DEFAULTS};
            const direct = incidentEdges(graphEdges, rootTag);
            const rootFloor = Math.max(
                options.rootBranchAbsoluteFloor,
                numberOr(direct[0] && direct[0].strength, 0) * options.rootBranchRelativeFloor
            );
            return {
                tree: annotateTreeFlow(buildSemanticTree(rootTag, graphEdges, options), options),
                options,
                rootFloor,
            };
        },
        priority: edgePriority,
    };

})();
