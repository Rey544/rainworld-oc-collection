(function(root, factory) {
    const api = factory();
    if (typeof module === "object") module.exports = api; else root.OCMapCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    "use strict";
    let serial = 0;
    const uid = () => "m" + Date.now().toString(36) + (++serial).toString(36) + Math.random().toString(36).slice(2, 7), clone = v => JSON.parse(JSON.stringify(v));
    const categories = {
        gate: "业力门",
        shelter: "庇护所",
        echo: "回响",
        shop: "拾荒者商店",
        toll: "收费站",
        creature: "生物刷新",
        pearl: "珍珠",
        token: "竞技场代币",
        broadcast: "广播",
        iterator: "迭代器 AI"
    };
    const materials = {
        draft: "自由剪影",
        solid: "实体墙",
        air: "空气 / 擦除",
        platform: "单向台阶",
        beamH: "横杆",
        beamV: "竖杆",
        slopeRU: "斜坡 ◢",
        slopeLU: "斜坡 ◣",
        slopeRD: "斜坡 ◥",
        slopeLD: "斜坡 ◤",
        crawl: "狭窄通道",
        shortcut: "捷径路径",
        water: "水体"
    };
    const portKinds = {
        exit: "跨房间通道井",
        internal: "同房间通道井",
        den: "生物巢穴",
        creature: "生物专用井",
        scavenger: "拾荒者井"
    };
    const portDirections = {
        auto: "自动",
        up: "朝上",
        down: "朝下",
        left: "朝左",
        right: "朝右"
    };
    function regionLabelColor(w, r) {
        return w.settings.regionLabelMode === "uniform" ? w.settings.regionLabelColor || "#ffffff" : r.labelColor || "#ffffff";
    }
    function regionRecordMatches(docs, r) {
        const normal = v => String(v || "").normalize("NFKC").toLowerCase().trim(), names = [ r.name, r.english ].map(normal).filter(s => s.length > 1), code = normal(r.code), token = code ? new RegExp("(^|[^a-z0-9_])" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9_])", "i") : null;
        return docs.filter(d => !d.archived).map(d => {
            const title = normal(d.title), region = normal(d.details?.region), body = normal([ d.content, d.details?.synopsis, d.details?.description, d.details?.comment ].filter(Boolean).join("\n"));
            let score = d.id === r.textDocId ? 100 : 0;
            if (names.includes(title) || title === code) score += 40;
            if (names.includes(region) || region === code) score += 30;
            if (names.some(s => title.includes(s))) score += 20;
            if (names.some(s => body.includes(s)) || token?.test(body)) score += 10;
            return {
                doc: d,
                score: score
            };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.doc);
    }
    function portPose(r, p) {
        if (![ "exit", "internal", "creature" ].includes(p.kind)) return {
            x: p.x,
            y: p.y,
            angle: 0,
            direction: "none",
            dx: 0,
            dy: 0
        };
        const vectors = {
            up: {
                dx: 0,
                dy: -1,
                angle: Math.PI
            },
            down: {
                dx: 0,
                dy: 1,
                angle: 0
            },
            left: {
                dx: -1,
                dy: 0,
                angle: Math.PI / 2
            },
            right: {
                dx: 1,
                dy: 0,
                angle: -Math.PI / 2
            }
        };
        let direction = Object.hasOwn(vectors, p.facing) ? p.facing : null;
        if (!direction) {
            const room = r.rooms.find(rm => rm.id === p.roomId), box = room || {
                x: 0,
                y: 0,
                w: r.w,
                h: r.h
            };
            const edges = [ [ "down", Math.abs(p.y - box.y) ], [ "up", Math.abs(box.y + box.h - p.y) ], [ "right", Math.abs(p.x - box.x) ], [ "left", Math.abs(box.x + box.w - p.x) ] ].sort((a, b) => a[1] - b[1]);
            const shapes = r.shapes.filter(s => s.layer === p.layer && !(s.depth > 0) && (!s.roomId || s.roomId === p.roomId));
            const solid = point => {
                if (!inside(point, box)) return true;
                for (let i = shapes.length - 1; i >= 0; i--) {
                    const s = shapes[i];
                    if (![ "solid", "draft", "air", "crawl", "slopeRU", "slopeLU", "slopeRD", "slopeLD" ].includes(s.material) || !hitShape(s, point)) continue;
                    return !s.erase && ![ "air", "crawl" ].includes(s.material);
                }
                return false;
            };
            const open = Object.keys(vectors).filter(key => {
                const v = vectors[key];
                return !solid({
                    x: p.x + v.dx,
                    y: p.y + v.dy
                });
            });
            direction = open.length === 1 ? open[0] : edges.find(([key]) => open.includes(key))?.[0] || edges[0][0];
        }
        const v = vectors[direction];
        return {
            x: p.x + v.dx * .75,
            y: p.y + v.dy * .75,
            direction: direction,
            ...v
        };
    }
    function workspace() {
        const s = {
            id: uid(),
            name: "默认地图",
            regions: [],
            placements: {}
        };
        return {
            format: "rw-oc-region",
            version: 1,
            scenes: [ s ],
            regions: [],
            gates: [],
            activeScene: s.id,
            settings: {
                iconScale: 1,
                snapAlignment: true,
                undoVisible: true,
                undoLocked: true,
                canvasBackground: "#000000",
                showRegionBounds: false,
                grid: true,
                selectionColor: "#ffffff",
                showZoom: false,
                toolbarPosition: "bottom-right",
                presentationVersion: 5
            },
            exportSettings: {
                dependencies: []
            },
            presets: []
        };
    }
    function region(name = "未命名区域", english = "New Region", w = 280, h = 160) {
        return {
            id: uid(),
            name: name,
            english: english,
            code: regionInitials(english) || "RG",
            codeAuto: true,
            w: w,
            h: h,
            bg: "#000000",
            air: "#ffffff",
            color: "#000000",
            outline: "#000000",
            border: "#ffffff",
            layers: [ {
                id: uid(),
                name: "地表",
                visible: true,
                locked: false
            } ],
            shapes: [],
            rooms: [],
            markers: [],
            ports: [],
            links: [],
            refs: [],
            categories: Object.fromEntries([ "draft", "geometry", "water", "rooms", "roomNames", "cameras", "ports", "connections", "refs", ...Object.keys(categories) ].map(k => [ k, {
                visible: [ "draft", "geometry", "water", "refs", "shelter" ].includes(k),
                locked: false
            } ])),
            symmetry: {
                x: false,
                y: false,
                axisX: w / 2,
                axisY: h / 2,
                axisColor: "#ffffff",
                axisWidth: 2
            },
            geoDepth: 0
        };
    }
    function regionInitials(english) {
        return (String(english || "").replace(/['’]/g, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(/[A-Za-z0-9]+/g) || []).map(word => word[0]).join("").toUpperCase();
    }
    function setRegionCode(r, code) {
        code = String(code).trim().toUpperCase();
        if (!/^[A-Z0-9]+$/.test(code)) throw Error("区域简称只能包含英文字母和数字。");
        const old = r.code, next = r.rooms.map(rm => rm.name.startsWith(old + "_") ? code + rm.name.slice(old.length) : rm.name.startsWith("GATE_") ? rm.name.split("_").map((part, i) => i && part === old ? code : part).join("_") : rm.name);
        if (new Set(next).size !== next.length) throw Error("修改简称会导致房间重名。");
        r.rooms.forEach((rm, i) => rm.name = next[i]);
        r.code = code;
    }
    const roomHandles = [ "nw", "n", "ne", "e", "se", "s", "sw", "w" ];
    function roomHandlePoints(room) {
        return {
            nw: {
                x: room.x,
                y: room.y
            },
            n: {
                x: room.x + room.w / 2,
                y: room.y
            },
            ne: {
                x: room.x + room.w,
                y: room.y
            },
            e: {
                x: room.x + room.w,
                y: room.y + room.h / 2
            },
            se: {
                x: room.x + room.w,
                y: room.y + room.h
            },
            s: {
                x: room.x + room.w / 2,
                y: room.y + room.h
            },
            sw: {
                x: room.x,
                y: room.y + room.h
            },
            w: {
                x: room.x,
                y: room.y + room.h / 2
            }
        };
    }
    function hitRoomHandle(room, p, tolerance) {
        const points = roomHandlePoints(room);
        for (const k of [ "nw", "ne", "se", "sw" ]) if (Math.hypot(p.x - points[k].x, p.y - points[k].y) <= tolerance) return k;
        if (p.x >= room.x - tolerance && p.x <= room.x + room.w + tolerance) {
            if (Math.abs(p.y - room.y) <= tolerance) return "n";
            if (Math.abs(p.y - room.y - room.h) <= tolerance) return "s";
        }
        if (p.y >= room.y - tolerance && p.y <= room.y + room.h + tolerance) {
            if (Math.abs(p.x - room.x) <= tolerance) return "w";
            if (Math.abs(p.x - room.x - room.w) <= tolerance) return "e";
        }
        return null;
    }
    function roomResizeBox(r, room, handle, dx, dy) {
        if (!roomHandles.includes(handle)) throw Error("无效的房间控制点。");
        let left = room.x, top = room.y, right = room.x + room.w, bottom = room.y + room.h;
        dx = Math.round(dx);
        dy = Math.round(dy);
        if (handle.includes("w")) left = Math.max(0, Math.min(right - 1, left + dx));
        if (handle.includes("e")) right = Math.min(r.w, Math.max(left + 1, right + dx));
        if (handle.includes("n")) top = Math.max(0, Math.min(bottom - 1, top + dy));
        if (handle.includes("s")) bottom = Math.min(r.h, Math.max(top + 1, bottom + dy));
        return {
            x: left,
            y: top,
            w: right - left,
            h: bottom - top
        };
    }
    function resizeRoom(r, room, box) {
        if (room.locked || r.layers.find(l => l.id === room.layer)?.locked || r.categories.rooms?.locked) throw Error("房间或图层已锁定。");
        if (![ "x", "y", "w", "h" ].every(k => Number.isInteger(box[k])) || box.w < 1 || box.h < 1 || box.x < 0 || box.y < 0 || box.x + box.w > r.w || box.y + box.h > r.h) throw Error("房间超出区域范围。");
        if (r.rooms.some(other => other.id !== room.id && other.layer === room.layer && intersection(other, box))) throw Error("不能与同层房间重叠。");
        if ([ ...r.markers, ...r.ports ].some(o => o.roomId === room.id && !isRoomMarker(o) && !inside(o, box))) throw Error("边界不能越过房间里的标记或通道井。");
        const previous = {
            x: room.x,
            y: room.y,
            w: room.w,
            h: room.h
        }, surface = room.water >= 0 ? room.y + room.h - room.water : null, coords = new Set, next = [];
        for (const camera of room.cameras) {
            const x = Math.max(0, Math.min(Math.max(0, box.w - 70), camera.x + room.x - box.x)), y = Math.max(0, Math.min(Math.max(0, box.h - 40), camera.y + room.y - box.y)), key = x + "," + y;
            if (!coords.has(key)) {
                coords.add(key);
                next.push({
                    ...camera,
                    x: x,
                    y: y
                });
            }
        }
        if (!next.length || box.w > room.w || box.h > room.h) for (const camera of cameras(box.w, box.h)) {
            const key = camera.x + "," + camera.y;
            if (!coords.has(key)) {
                coords.add(key);
                next.push(camera);
            }
        }
        Object.assign(room, box, {
            cameras: next,
            water: surface === null ? -1 : Math.max(-1, Math.min(box.h, box.y + box.h - surface))
        });
        if (box.w > previous.w || box.h > previous.h) cutShapes(r, room);
        return room;
    }
    function snapTargets(r, {excludeId: excludeId = null, excludeContents: excludeContents = false, includeRegion: includeRegion = true, sceneId: sceneId = null, symmetry: symmetry = null, isDisplayed: isDisplayed = () => true} = {}) {
        const axes = {
            x: new Map,
            y: new Map
        }, add = (axis, value, lo, hi) => {
            if (![ value, lo, hi ].every(Number.isFinite)) return;
            const key = Math.round(value * 1e4) / 1e4, old = axes[axis].get(key);
            if (old) {
                old.lo = Math.min(old.lo, lo);
                old.hi = Math.max(old.hi, hi);
            } else axes[axis].set(key, {
                value: key,
                lo: lo,
                hi: hi
            });
        }, point = p => {
            add("x", p.x, p.y, p.y);
            add("y", p.y, p.x, p.x);
        }, box = b => {
            if (![ b.x, b.y, b.w, b.h ].every(Number.isFinite)) return;
            for (const x of [ b.x, b.x + b.w / 2, b.x + b.w ]) add("x", x, b.y, b.y + b.h);
            for (const y of [ b.y, b.y + b.h / 2, b.y + b.h ]) add("y", y, b.x, b.x + b.w);
        };
        const visible = o => isDisplayed(o) && o.id !== excludeId && !(excludeContents && o.roomId === excludeId) && roomVisible(r, o) && r.layers.find(l => l.id === o.layer)?.visible !== false && objectOpacity(r, o) > 0;
        if (includeRegion) box({
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        });
        for (const rm of r.rooms) {
            if (!visible(rm)) continue;
            box(rm);
            if (r.categories.cameras.visible) for (const camera of rm.cameras) box({
                x: rm.x + camera.x,
                y: rm.y + camera.y,
                w: 70,
                h: 40
            });
        }
        for (const s of r.shapes) {
            const cat = s.material === "draft" ? "draft" : s.material === "water" ? "water" : "geometry";
            if (!visible(s) || r.categories[cat].visible === false) continue;
            let b = intersection(bounds(s), {
                x: 0,
                y: 0,
                w: r.w,
                h: r.h
            });
            const rm = s.roomId ? r.rooms.find(o => o.id === s.roomId) : null;
            if (b && rm) b = intersection(b, rm);
            if (!b) continue;
            box(b);
            if (s.points) for (const p of s.points) if (p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h) point(p);
        }
        for (const list of [ "markers", "ports" ]) for (const o of r[list]) {
            const cat = list === "markers" ? o.kind : "ports";
            if (!(list === "ports" && r.detailsVisible === false) && visible(o) && r.categories[cat]?.visible !== false && (!sceneId || !o.sceneIds?.length || o.sceneIds.includes(sceneId))) point(o);
        }
        if (r.categories.refs.visible) for (const ref of r.refs) if (visible(ref) && opacity(ref) > 0) box(ref);
        if (symmetry?.y) add("x", symmetry.axisX, 0, r.h);
        if (symmetry?.x) add("y", symmetry.axisY, 0, r.w);
        return {
            x: [ ...axes.x.values() ],
            y: [ ...axes.y.values() ]
        };
    }
    function snapBox(box, targets, tolerance, {handle: handle = "move", valid: valid = () => true} = {}) {
        const move = handle === "move", candidates = axis => {
            const position = axis === "x" ? "x" : "y", size = axis === "x" ? "w" : "h", low = axis === "x" ? "w" : "n", high = axis === "x" ? "e" : "s";
            let anchors = move ? [ box[position], box[position] + box[size] / 2, box[position] + box[size] ] : handle.includes(low) ? [ box[position] ] : handle.includes(high) ? [ box[position] + box[size] ] : [];
            const found = new Map;
            for (const anchor of anchors) for (const target of targets[axis]) {
                const delta = target.value - anchor;
                if (Math.abs(delta) > tolerance || Math.abs(delta - Math.round(delta)) > 1e-6) continue;
                const d = Math.round(delta);
                if (!found.has(d)) found.set(d, {
                    delta: d,
                    target: target
                });
            }
            return [ ...found.values() ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)).slice(0, 8).concat({
                delta: 0,
                target: null
            });
        };
        const pairs = [];
        for (const x of candidates("x")) for (const y of candidates("y")) pairs.push({
            x: x,
            y: y,
            matches: Number(!!x.target) + Number(!!y.target),
            cost: Math.abs(x.delta) + Math.abs(y.delta)
        });
        pairs.sort((a, b) => b.matches - a.matches || a.cost - b.cost);
        for (const p of pairs) {
            const next = {
                ...box
            };
            if (move) {
                next.x += p.x.delta;
                next.y += p.y.delta;
            } else {
                if (handle.includes("w")) {
                    next.x += p.x.delta;
                    next.w -= p.x.delta;
                } else if (handle.includes("e")) next.w += p.x.delta;
                if (handle.includes("n")) {
                    next.y += p.y.delta;
                    next.h -= p.y.delta;
                } else if (handle.includes("s")) next.h += p.y.delta;
            }
            if (!valid(next)) continue;
            const guides = [];
            for (const axis of [ "x", "y" ]) if (p[axis].target) {
                const other = axis === "x" ? "y" : "x", size = axis === "x" ? "h" : "w", target = p[axis].target;
                guides.push({
                    axis: axis,
                    value: target.value,
                    lo: Math.min(target.lo, next[other]),
                    hi: Math.max(target.hi, next[other] + next[size])
                });
            }
            return {
                box: next,
                guides: guides
            };
        }
        return {
            box: {
                ...box
            },
            guides: []
        };
    }
    function regionContentBounds(r) {
        const boxes = r.rooms.map(rm => ({
            x: rm.x,
            y: rm.y,
            w: rm.w,
            h: rm.h
        })), area = {
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        };
        for (const s of r.shapes) {
            let b = intersection(bounds(s), area);
            const rm = s.roomId ? r.rooms.find(o => o.id === s.roomId) : null;
            if (b && rm) b = intersection(b, rm);
            if (b) boxes.push(b);
        }
        for (const p of [ ...r.markers, ...r.ports ]) boxes.push({
            x: p.x,
            y: p.y,
            w: 0,
            h: 0
        });
        if (!boxes.length) return null;
        const x = Math.floor(Math.min(...boxes.map(b => b.x))), y = Math.floor(Math.min(...boxes.map(b => b.y))), right = Math.ceil(Math.max(...boxes.map(b => b.x + b.w))), bottom = Math.ceil(Math.max(...boxes.map(b => b.y + b.h)));
        return {
            x: x,
            y: y,
            w: right - x,
            h: bottom - y
        };
    }
    function regionResizeBox(r, handle, dx, dy) {
        if (!roomHandles.includes(handle)) throw Error("无效的区域控制点。");
        const content = regionContentBounds(r), minW = Math.min(20, r.w), minH = Math.min(20, r.h);
        let left = 0, top = 0, right = r.w, bottom = r.h;
        dx = Math.round(dx);
        dy = Math.round(dy);
        if (handle.includes("w")) left = Math.max(right - 4096, Math.min(dx, right - minW, content?.x ?? Infinity));
        if (handle.includes("e")) right = Math.min(4096, Math.max(r.w + dx, minW, content ? content.x + content.w : 0));
        if (handle.includes("n")) top = Math.max(bottom - 4096, Math.min(dy, bottom - minH, content?.y ?? Infinity));
        if (handle.includes("s")) bottom = Math.min(4096, Math.max(r.h + dy, minH, content ? content.y + content.h : 0));
        return {
            x: left,
            y: top,
            w: right - left,
            h: bottom - top
        };
    }
    function resizeRegion(workspace, r, box) {
        if (![ "x", "y", "w", "h" ].every(k => Number.isInteger(box[k])) || box.w < Math.min(20, r.w) || box.h < Math.min(20, r.h) || box.w > 4096 || box.h > 4096) throw Error("区域宽高需要 20–4096 的整数格。");
        const b = regionContentBounds(r);
        if (b && (b.x < box.x || b.y < box.y || b.x + b.w > box.x + box.w || b.y + b.h > box.y + box.h)) throw Error("新范围不能裁掉已有房间、草稿或标记。");
        if (box.x === 0 && box.y === 0 && r.w === box.w && r.h === box.h) return r;
        if (box.x || box.y) {
            for (const list of [ "rooms", "shapes", "markers", "ports", "refs" ]) for (const o of r[list]) shift(o, -box.x, -box.y);
            for (const scene of workspace.scenes) if (scene.regions.includes(r.id)) {
                const p = scene.placements[r.id] || {
                    x: 0,
                    y: 0
                };
                scene.placements[r.id] = {
                    x: p.x + box.x,
                    y: p.y + box.y
                };
            }
            r.origin = {
                x: (r.origin?.x || 0) + box.x,
                y: (r.origin?.y || 0) + box.y
            };
            if (r.symmetry?.centerCustom) {
                r.symmetry.axisX -= box.x;
                r.symmetry.axisY -= box.y;
            }
        }
        r.w = box.w;
        r.h = box.h;
        if (r.symmetry && !r.symmetry.centerCustom) {
            r.symmetry.axisX = r.w / 2;
            r.symmetry.axisY = r.h / 2;
        }
        return r;
    }
    function symmetryFor(r, room = null) {
        const base = r.symmetry || {}, box = room || {
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        }, center = room ? room.symmetryCenter : base.centerCustom ? {
            x: base.axisX,
            y: base.axisY
        } : null;
        return {
            ...base,
            axisColor: /^#[a-f0-9]{6}$/i.test(base.axisColor) ? base.axisColor : "#ffffff",
            axisWidth: Math.max(1, Math.min(8, Number(base.axisWidth) || 2)),
            axisX: box.x + (center ? Math.max(0, Math.min(box.w, center.x)) : box.w / 2),
            axisY: box.y + (center ? Math.max(0, Math.min(box.h, center.y)) : box.h / 2)
        };
    }
    function setSymmetryCenter(r, room, p) {
        const box = room || {
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        }, x = Math.max(0, Math.min(box.w, p.x - box.x)), y = Math.max(0, Math.min(box.h, p.y - box.y));
        if (room) room.symmetryCenter = {
            x: x,
            y: y
        }; else Object.assign(r.symmetry, {
            axisX: x,
            axisY: y,
            centerCustom: true
        });
    }
    function resetSymmetryCenter(r, room) {
        if (room) delete room.symmetryCenter; else {
            r.symmetry.centerCustom = false;
            r.symmetry.axisX = r.w / 2;
            r.symmetry.axisY = r.h / 2;
        }
    }
    function partitionRoom(r, box) {
        if (r.categories.rooms.locked || r.layers.find(l => l.id === box.layer)?.locked) throw Error("房间或图层已锁定。");
        const hits = r.rooms.filter(rm => rm.layer === box.layer && intersection(rm, box));
        if (!hits.length) return addRoom(r, box);
        if (hits.length > 1) throw Error("选框跨越多个房间，请调整边界。");
        let rm = hits[0];
        if (rm.locked) throw Error("房间已锁定。");
        if (box.x < rm.x || box.y < rm.y || box.x + box.w > rm.x + rm.w || box.y + box.h > rm.y + rm.h) throw Error("选框需要完整位于一个房间内，或位于空白处。");
        if (box.x > rm.x) rm = splitRoom(r, rm, true, box.x - rm.x);
        if (box.w < rm.w) {
            const id = rm.id;
            splitRoom(r, rm, true, box.w);
            rm = r.rooms.find(o => o.id === id);
        }
        if (box.y > rm.y) rm = splitRoom(r, rm, false, box.y - rm.y);
        if (box.h < rm.h) {
            const id = rm.id;
            splitRoom(r, rm, false, box.h);
            rm = r.rooms.find(o => o.id === id);
        }
        return rm;
    }
    function rect(a, b) {
        return {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.max(1, Math.abs(a.x - b.x)),
            h: Math.max(1, Math.abs(a.y - b.y))
        };
    }
    function intersection(a, b) {
        const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), r = Math.min(a.x + a.w, b.x + b.w), d = Math.min(a.y + a.h, b.y + b.h);
        return r > x && d > y ? {
            x: x,
            y: y,
            w: r - x,
            h: d - y
        } : null;
    }
    function inside(p, r) {
        return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
    }
    function bounds(s) {
        if (s.clip) return s.clip;
        if (s.points) {
            const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y), b = s.width / 2 || .5;
            return {
                x: Math.min(...xs) - b,
                y: Math.min(...ys) - b,
                w: Math.max(...xs) - Math.min(...xs) + 2 * b,
                h: Math.max(...ys) - Math.min(...ys) + 2 * b
            };
        }
        return s;
    }
    function subtract(a, b) {
        const i = intersection(a, b);
        if (!i) return [ a ];
        return [ {
            x: a.x,
            y: a.y,
            w: a.w,
            h: i.y - a.y
        }, {
            x: a.x,
            y: i.y + i.h,
            w: a.w,
            h: a.y + a.h - i.y - i.h
        }, {
            x: a.x,
            y: i.y,
            w: i.x - a.x,
            h: i.h
        }, {
            x: i.x + i.w,
            y: i.y,
            w: a.x + a.w - i.x - i.w,
            h: i.h
        } ].filter(r => r.w > 0 && r.h > 0);
    }
    function cutShapes(r, box, from = null) {
        const out = [];
        for (const s of r.shapes) {
            if ((s.roomId || null) !== from || s.layer !== box.layer) {
                out.push(s);
                continue;
            }
            const b = bounds(s), i = intersection(b, box);
            if (!i) {
                out.push(s);
                continue;
            }
            out.push(...subtract(b, box).map(clip => ({
                ...clone(s),
                id: uid(),
                clip: clip
            })), {
                ...clone(s),
                id: uid(),
                clip: i,
                roomId: box.id
            });
        }
        r.shapes = out;
    }
    function cameras(w, h) {
        const positions = (n, size, step) => {
            if (n <= size) return [ 0 ];
            let a = [];
            for (let i = 0; i < n - size; i += step) a.push(i);
            a.push(n - size);
            return [ ...new Set(a) ];
        };
        return positions(w, 70, 68).flatMap(x => positions(h, 40, 38).map(y => ({
            id: uid(),
            x: x,
            y: y
        })));
    }
    const paintLayerNames = [ "Geometry", "背景 · 淡色", "背景 · 更淡" ];
    function roomPaintLayers(rm) {
        return rm.paintLayers || [ 1, .35, .15 ].map(opacity => ({
            visible: true,
            locked: false,
            opacity: opacity
        }));
    }
    function paintLayerVisible(r, s) {
        const rm = s.roomId ? r.rooms.find(rm => rm.id === s.roomId) : null;
        return !rm || roomPaintLayers(rm)[s.decoration || 0]?.visible !== false;
    }
    function addRoom(r, box) {
        const b = {
            ...rect({
                x: box.x,
                y: box.y
            }, {
                x: box.x + box.w,
                y: box.y + box.h
            }),
            layer: box.layer
        };
        if (b.x < 0 || b.y < 0 || b.x + b.w > r.w || b.y + b.h > r.h) throw Error("房间超出了区域边界，请先扩展区域。");
        if (r.rooms.some(v => v.layer === b.layer && intersection(v, b))) throw Error("同一空间层级的房间不能重叠；请选择已有房间进行切分。");
        const room = {
            ...b,
            id: uid(),
            name: nextRoomName(r, "ROOM", box.layer),
            roomType: "ROOM",
            visible: true,
            locked: false,
            paintLayers: roomPaintLayers({}),
            water: -1,
            background: r.air || "#ffffff",
            cameras: cameras(b.w, b.h)
        };
        r.rooms.push(room);
        cutShapes(r, room);
        for (const o of [ ...r.markers, ...r.ports ]) if (!o.roomId && o.layer === room.layer && inside(o, room)) o.roomId = room.id;
        return room;
    }
    function shift(s, dx, dy) {
        if (s.x !== undefined) {
            s.x += dx;
            s.y += dy;
        }
        if (s.points) s.points.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
        if (s.clip) {
            s.clip.x += dx;
            s.clip.y += dy;
        }
    }
    function moveRoom(r, room, dx, dy) {
        if (room.locked) throw Error("房间已锁定。");
        dx = Math.round(Math.max(-room.x, Math.min(dx, r.w - room.x - room.w)));
        dy = Math.round(Math.max(-room.y, Math.min(dy, r.h - room.y - room.h)));
        if (r.rooms.some(v => v.id !== room.id && v.layer === room.layer && intersection(v, {
            ...room,
            x: room.x + dx,
            y: room.y + dy
        }))) throw Error("当前位置与同层房间重叠。可先切换空间层级。");
        shift(room, dx, dy);
        for (const o of [ ...r.shapes, ...r.markers, ...r.ports, ...r.refs ]) if (o.roomId === room.id) shift(o, dx, dy);
    }
    function splitRoom(r, room, vertical, at) {
        const axis = vertical ? "x" : "y", size = vertical ? "w" : "h";
        at = Math.round(at);
        if (at <= 0 || at >= room[size]) throw Error("切分位置必须在房间内部。");
        const a = {
            ...clone(room),
            [size]: at,
            cameras: []
        }, b = {
            ...clone(room),
            id: uid(),
            name: nextRoomName(r, room.roomType || "ROOM", room.layer, room.gateTo),
            [axis]: room[axis] + at,
            [size]: room[size] - at,
            cameras: []
        };
        delete b.symmetryCenter;
        a.cameras = cameras(a.w, a.h);
        b.cameras = cameras(b.w, b.h);
        if (room.water >= 0) {
            const surface = room.y + room.h - room.water;
            for (const child of [ a, b ]) {
                const height = Math.max(0, Math.min(child.h, child.y + child.h - surface));
                child.water = height > 0 ? height : -1;
            }
        }
        cutShapes(r, b, room.id);
        r.rooms.splice(r.rooms.indexOf(room), 1, a, b);
        for (const o of [ ...r.markers, ...r.ports, ...r.refs ]) if (o.roomId === room.id && inside(o, b)) o.roomId = b.id;
        if (room.roomType === "SHELTER") organizeShelters(r);
        if (room.roomType === "GATE") organizeGates(r);
        return b;
    }
    function mergeRooms(r, a, b) {
        if (a.layer !== b.layer) throw Error("请先将房间移到同一空间层级。");
        const box = {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
            h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y)
        };
        if (r.rooms.some(c => c.id !== a.id && c.id !== b.id && c.layer === a.layer && intersection(c, box))) throw Error("合并范围包含其他房间。");
        const surfaces = [ a, b ].filter(r => r.water >= 0).map(r => r.y + r.h - r.water);
        if (surfaces.length === 2 && surfaces[0] !== surfaces[1]) throw Error("两个房间的水面高度不同，请先统一水面再合并。");
        Object.assign(a, box, {
            water: surfaces.length ? Math.max(0, Math.min(box.h, box.y + box.h - surfaces[0])) : -1,
            cameras: cameras(box.w, box.h)
        });
        r.rooms = r.rooms.filter(x => x.id !== b.id);
        for (const o of [ ...r.shapes, ...r.markers, ...r.ports, ...r.refs ]) if (o.roomId === b.id) o.roomId = a.id;
        return a;
    }
    function forkRegion(w, scene, id) {
        const source = w.regions.find(r => r.id === id), r = clone(source), ids = new Map;
        const remap = v => {
            if (!ids.has(v)) ids.set(v, uid());
            return ids.get(v);
        };
        r.id = remap(id);
        for (const list of [ "layers", "shapes", "rooms", "markers", "ports", "links", "refs" ]) for (const o of r[list]) {
            o.id = remap(o.id);
            for (const key of [ "roomId", "layer", "returnLayer", "a", "b" ]) if (o[key]) o[key] = remap(o[key]);
        }
        scene.regions = scene.regions.map(v => v === id ? r.id : v);
        if (scene.placements[id]) scene.placements[r.id] = clone(scene.placements[id]);
        w.regions.push(r);
        for (const g of [ ...w.gates ]) if (g.scenes.includes(scene.id) && (g.a.region === id || g.b.region === id)) {
            g.scenes = g.scenes.filter(x => x !== scene.id);
            const ng = {
                ...clone(g),
                id: uid(),
                scenes: [ scene.id ]
            };
            for (const side of [ "a", "b" ]) if (ng[side].region === id) {
                ng[side].region = r.id;
                if (ng[side].marker) ng[side].marker = remap(ng[side].marker);
            }
            w.gates.push(ng);
        }
        return r;
    }
    function mirrored(s, sym) {
        let items = [ clone(s) ];
        for (const axis of [ "x", "y" ]) if (sym[axis]) {
            items.push(...items.map(original => {
                const q = clone(original), coord = axis === "x" ? "y" : "x", size = axis === "x" ? "h" : "w", mid = axis === "x" ? sym.axisY : sym.axisX;
                if (q.points) q.points.forEach(p => p[coord] = 2 * mid - p[coord]); else q[coord] = 2 * mid - q[coord] - (q[size] || 0);
                if (q.clip) q.clip[coord] = 2 * mid - q.clip[coord] - q.clip[size];
                const slopes = axis === "x" ? {
                    slopeRU: "slopeRD",
                    slopeRD: "slopeRU",
                    slopeLU: "slopeLD",
                    slopeLD: "slopeLU"
                } : {
                    slopeRU: "slopeLU",
                    slopeLU: "slopeRU",
                    slopeRD: "slopeLD",
                    slopeLD: "slopeRD"
                };
                q.material = slopes[q.material] || q.material;
                return q;
            }));
        }
        return items.map(x => ({
            ...x,
            id: uid()
        }));
    }
    function hitShape(s, p) {
        if (!inside(p, bounds(s))) return false;
        if (s.type === "ellipse") return ((p.x - s.x - s.w / 2) / (s.w / 2)) ** 2 + ((p.y - s.y - s.h / 2) / (s.h / 2)) ** 2 <= 1;
        if (s.points) {
            if (s.type === "polygon") {
                let hit = false;
                for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
                    const a = s.points[i], b = s.points[j];
                    if (a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
                }
                return hit;
            }
            for (let i = 1; i < s.points.length; i++) {
                const a = s.points[i - 1], b = s.points[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
                if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) <= (s.width || 1) / 2) return true;
            }
            return s.points.length === 1 && Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= (s.width || 1) / 2;
        }
        return inside(p, s);
    }
    function raster(r, room) {
        if (room.w * room.h > 3e5) throw Error("单房间超过 30 万格，请切分后导出。");
        const cells = Array.from({
            length: room.w
        }, () => Array.from({
            length: room.h
        }, () => [ [ 0, [] ], [ 0, [] ], [ 0, [] ] ]));
        const types = {
            solid: 1,
            air: 0,
            crawl: 0,
            slopeRU: 2,
            slopeLU: 3,
            slopeRD: 4,
            slopeLD: 5,
            platform: 6
        };
        for (const s of r.shapes) {
            if (s.decoration || s.material === "water" || s.layer !== room.layer || s.roomId && s.roomId !== room.id) continue;
            const b = intersection(bounds(s), room);
            if (!b) continue;
            for (let x = Math.max(0, Math.floor(b.x - room.x)); x < Math.min(room.w, Math.ceil(b.x + b.w - room.x)); x++) for (let y = Math.max(0, Math.floor(b.y - room.y)); y < Math.min(room.h, Math.ceil(b.y + b.h - room.y)); y++) if (hitShape(s, {
                x: room.x + x + .5,
                y: room.y + y + .5
            })) {
                if (s.rawCell) {
                    cells[x][y][s.depth || 0] = clone(s.rawCell);
                    continue;
                }
                if (s.eraseAll) {
                    cells[x][y] = [ [ 0, [] ], [ 0, [] ], [ 0, [] ] ];
                    continue;
                }
                const c = cells[x][y][s.material === "draft" ? 2 : s.depth || 0];
                if (s.material === "draft") {
                    c[0] = s.erase ? 0 : 1;
                    continue;
                }
                if (s.erase) {
                    c[0] = 0;
                    c[1] = [];
                    continue;
                }
                if (s.material in types) {
                    c[0] = types[s.material];
                    if (s.material === "air" || s.material === "crawl") c[1] = [];
                } else {
                    const f = {
                        beamH: 1,
                        beamV: 2,
                        shortcut: 5
                    }[s.material];
                    if (f && !c[1].includes(f)) c[1].push(f);
                }
            }
        }
        return cells;
    }
    function rainedText(r, room) {
        const geo = raster(r, room);
        if (room.rainedSource && room.rainedSize?.w === room.w && room.rainedSize?.h === room.h) {
            const lines = room.rainedSource.split(/\r\n|\r|\n/);
            lines[0] = JSON.stringify(geo);
            lines[6] = lines[6].replace(/#cameras\s*:\s*\[[^\]]*\]/, "#cameras: [" + room.cameras.map(c => "point(" + c.x * 20 + ", " + c.y * 20 + ")").join(",") + "]");
            lines[7] = lines[7].replace(/#waterLevel\s*:\s*-?\d+/, "#waterLevel: " + room.water);
            return lines.join("\r");
        }
        const tile = '[#tp: "default", #Data: 0]', tm = "[" + Array.from({
            length: room.w
        }, () => "[" + Array.from({
            length: room.h
        }, () => `[${tile},${tile},${tile}]`).join(",") + "]").join(",") + "]";
        return [ JSON.stringify(geo), `[#tlMatrix: ${tm}, #defaultMaterial: "Concrete", #workLayer: 1]`, "[#effects: []]", "[#lightAngle: 180, #flatness: 1]", "[#defaultTerrain: 0]", `[#size: point(${room.w}, ${room.h}), #extraTiles: [0,0,0,0], #tileSeed: 1, #light: 1]`, `[#cameras: [${(room.cameras.length ? room.cameras : [ {
            x: 0,
            y: 0
        } ]).map(c => `point(${c.x * 20}, ${c.y * 20})`).join(",")}]]`, `[#waterLevel: ${room.water ?? -1}, #waterInFront: 0]`, "[#props: []]" ].join("\r");
    }
    function renameGateMarker(w, rid, mid, value) {
        const r = w.regions.find(r => r.id === rid), marker = r?.markers.find(m => m.id === mid && m.kind === "gate");
        if (!marker) throw Error("业力门已不存在。");
        const name = String(value).trim();
        if (!name) throw Error("请填写业力门昵称。");
        const gates = w.gates.filter(g => g.a.marker === mid || g.b.marker === mid), targets = [ {
            r: r,
            m: marker
        } ];
        for (const g of gates) for (const side of [ g.a, g.b ]) {
            const rr = w.regions.find(r => r.id === side.region), m = rr?.markers.find(m => m.id === side.marker && m.kind === "gate");
            if (m) targets.push({
                r: rr,
                m: m
            });
        }
        for (const {r: r, m: m} of targets) {
            const reason = lockReason(r, m, "gate");
            if (reason) throw Error(reason);
        }
        for (const {m: m} of targets) m.name = name;
        for (const g of gates) g.name = name;
    }
    function saveGateConnection(w, sid, draft, id) {
        const scene = w.scenes.find(s => s.id === sid), existing = id ? w.gates.find(g => g.id === id) : null;
        if (id && !existing) throw Error("此连接已不存在。");
        const name = String(draft.name || "").trim();
        if (!name) throw Error("请填写业力门昵称。");
        if (draft.a.region === draft.b.region) throw Error("请选择两个不同区域。");
        const sameSides = existing && [ "a", "b" ].every(k => [ "region", "karma", "marker" ].every(f => String(existing[k][f] || "") === String(draft[k][f] || "")));
        const ends = [ "a", "b" ].map(k => {
            const side = draft[k], r = w.regions.find(r => r.id === side.region), m = r?.markers.find(m => m.id === side.marker && m.kind === "gate");
            if (!r || !scene.regions.includes(r.id)) throw Error("请选择当前地图中的区域。");
            if (!sameSides && !m) throw Error("请先放置并选择两侧业力门。");
            if (m) {
                const reason = lockReason(r, m, "gate");
                if (reason) throw Error(reason);
            }
            return {
                side: side,
                r: r,
                m: m
            };
        });
        const g = existing || {
            id: uid(),
            scenes: [ sid ]
        };
        Object.assign(g, {
            name: name,
            a: clone(draft.a),
            b: clone(draft.b)
        });
        for (const [index, {r: r, m: m}] of ends.entries()) {
            if (!m) continue;
            m.name = name;
            r.categories.gate.visible = true;
            if (!sameSides) {
                const target = ensureGateLayer(r);
                if (target.locked) throw Error("业力门层级已锁定。");
                const rm = ensureGateRoom(r, m, ends[1 - index].r.code);
                setRoomKind(w, r, rm, "GATE", ends[1 - index].r.code);
            }
        }
        if (!existing) w.gates.push(g);
        return g;
    }
    function exportWorkspace(w, sid, regionIds) {
        const source = w.scenes.find(s => s.id === sid);
        if (!source) throw Error("当前地图不存在。");
        const wanted = new Set(regionIds), ids = source.regions.filter(id => wanted.has(id));
        if (!ids.length) throw Error("请至少勾选一个区域。");
        const out = clone(w), selected = new Set(ids), scene = clone(source);
        scene.regions = ids;
        scene.groups = (scene.groups || []).map(g => ({
            ...g,
            regions: g.regions.filter(id => selected.has(id))
        }));
        scene.placements = Object.fromEntries(ids.map(id => [ id, clone(source.placements[id] || {
            x: 0,
            y: 0
        }) ]));
        out.scenes = [ scene ];
        out.activeScene = sid;
        out.regions = out.regions.filter(r => selected.has(r.id));
        for (const r of out.regions) {
            const omitted = new Set(r.markers.filter(m => m.kind === "gate" && m.sceneIds?.length && !m.sceneIds.includes(sid)).map(m => m.roomId));
            r.markers = r.markers.filter(m => !m.sceneIds?.length || m.sceneIds.includes(sid)).map(m => ({
                ...m,
                sceneIds: m.sceneIds?.length ? [ sid ] : []
            }));
            for (const rm of r.rooms) if (omitted.has(rm.id) && !r.markers.some(m => m.kind === "gate" && m.roomId === rm.id)) rm.gateMarkerOmitted = true;
        }
        out.gates = out.gates.filter(g => g.scenes.includes(sid) && selected.has(g.a.region) && selected.has(g.b.region)).map(g => ({
            ...g,
            scenes: [ sid ]
        }));
        return validate(out);
    }
    function rainedExportFiles(w) {
        const scene = w.scenes.find(s => s.id === w.activeScene), warnings = check(w, scene), files = {}, manifest = {
            format: "rw-oc-design-manifest",
            version: 1,
            scene: clone(scene),
            regions: clone(w.regions),
            roomTypes: w.regions.map(r => ({
                region: r.code,
                rooms: roomTypeManifest(r)
            })),
            gates: clone(w.gates),
            dependencies: exportDependencies(w, scene),
            warnings: warnings
        };
        let count = 0;
        for (const r of w.regions) for (const rm of r.rooms) {
            const safe = rm.name.replace(/[^a-z0-9_-]/gi, "_");
            if (files["rooms/" + safe + ".txt"]) throw Error("存在重名房间：" + safe);
            files["rooms/" + safe + ".txt"] = rainedText(r, rm);
            count++;
        }
        if (!count) throw Error("所选区域没有房间，请先切分房间。");
        files["design-manifest.json"] = JSON.stringify(manifest, null, 2);
        files["README.txt"] = "Rainworld OC Collection · Rained 导出\n在 Rained 中打开 rooms/*.txt；这些是编辑工程，不是游戏运行房间。\n未经过实机导入验收。自由剪影导出为背景墙（第三几何深度），前景为空气；水体草稿、标记、通道井端点和区域连接保存在设计清单。\n请在 Rained / Dev Tools 完成水深、捷径网络、庇护所和业力门功能。\n显示、锁定和透明度不改变导出地形。\n" + warnings.join("\n");
        return {
            files: files,
            count: count
        };
    }
    function exportDependencies(w, scene) {
        const deps = new Set(w.exportSettings?.dependencies || []);
        if (w.regions.some(r => scene.regions.includes(r.id) && r.cameraMode === "sbc")) deps.add("SBCameraScroll");
        if (w.gates.some(g => g.scenes.includes(scene.id) && [ g.a, g.b ].some(s => Number(s.karma) > 5))) deps.add("RegionKit ExtendedGates");
        return [ ...deps ];
    }
    function check(w, scene) {
        const out = [];
        if (exportDependencies(w, scene).includes("SBCameraScroll")) out.push("SBCameraScroll 已列入依赖声明，需在游戏中安装、启用并实测。");
        for (const id of scene.regions) {
            const r = w.regions.find(x => x.id === id);
            if (!r) continue;
            if (!r.rooms.length) out.push(r.name + "：尚未切分房间。");
            if (r.shapes.some(s => s.material === "draft")) out.push(r.name + "：自由剪影将导出为第三深度的背景墙，前景保持空气。");
            if (r.shapes.some(s => s.material === "water")) out.push(r.name + "：水体草稿保留在项目；每个房间需单独填写导出水深。");
            if (r.ports.length) out.push(r.name + "：通道井与跨房间连线导出为连接清单；未自动生成可运行的捷径网络。");
            if (r.markers.length) out.push(r.name + "：标记导出为清单，游戏放置需 Dev Tools / 对应模组。");
            for (const room of r.rooms) {
                if (room.rainedSource && (room.rainedSize?.w !== room.w || room.rainedSize?.h !== room.h)) out.push(room.name + "：导入后尺寸已改变，本次仅导出基础几何；原 Rained 材质、物件和效果需重新整理。");
                if (room.w < 70 || room.h < 40) out.push(room.name + "：尺寸小于 70×40 渲染框，需在 Rained 检查镜头覆盖。");
            }
        }
        if (w.gates.some(g => g.scenes.includes(scene.id) && [ g.a, g.b ].some(s => Number(s.karma) > 5))) out.push("业力 6–10 门需求：RegionKit ExtendedGates；需确认游戏端支持。");
        return out;
    }
    function validate(v) {
        if (!v || v.format !== "rw-oc-region" || v.version !== 1 || !Array.isArray(v.scenes) || !Array.isArray(v.regions) || !Array.isArray(v.gates) || !v.scenes.length) throw Error("这不是受支持的区域项目备份。");
        if (v.regions.length > 500 || v.scenes.length > 100) throw Error("项目规模超出支持上限。");
        const validId = x => typeof x === "string" && /^[a-z0-9_-]{1,160}$/i.test(x) && ![ "__proto__", "constructor", "prototype" ].includes(x), finite = x => typeof x === "number" && Number.isFinite(x), range = (x, a, b) => finite(x) && x >= a && x <= b, ids = new Set, scenes = new Set(v.scenes.map(s => s.id)), safe = clone(v);
        for (const r of safe.regions) {
            if (ids.has(r.id) || !validId(r.id) || !Number.isInteger(r.w) || !Number.isInteger(r.h) || !range(r.w, 1, 4096) || !range(r.h, 1, 4096)) throw Error("区域编号或尺寸无效。");
            ids.add(r.id);
            if (r.origin && (!Number.isSafeInteger(r.origin.x) || !Number.isSafeInteger(r.origin.y))) throw Error("区域原点无效。");
            for (const k of [ "layers", "shapes", "rooms", "markers", "ports", "links", "refs" ]) if (!Array.isArray(r[k])) throw Error("区域缺少 " + k);
            if (!r.layers.length || r.shapes.length > 3e4 || r.rooms.length > 1e3 || r.markers.length + r.ports.length > 2e4) throw Error("区域内容数量无效。");
            const layers = new Set(r.layers.map(o => o.id)), rooms = new Set(r.rooms.map(o => o.id)), ports = new Set(r.ports.map(o => o.id)), localIds = new Set;
            for (const key of [ "layers", "rooms", "shapes", "markers", "ports", "links", "refs" ]) for (const o of r[key]) {
                if (!validId(o.id) || localIds.has(o.id)) throw Error("对象编号重复或无效。");
                localIds.add(o.id);
                if (![ "layers", "links" ].includes(key) && !layers.has(o.layer)) throw Error("对象引用了不存在的空间层级。");
                if (o.roomId && !rooms.has(o.roomId)) throw Error("对象引用了不存在的房间。");
            }
            for (const o of [ ...r.layers, ...r.rooms ]) if (o.opacity !== undefined && !range(o.opacity, 0, 1)) throw Error("不透明度无效。");
            for (const k of [ "bg", "color", "outline", "border" ]) if (!/^#[a-f0-9]{6}$/i.test(r[k] || "")) throw Error("区域颜色格式无效。");
            for (const o of r.rooms) {
                if (o.paintLayers !== undefined && (!Array.isArray(o.paintLayers) || o.paintLayers.length !== 3 || o.paintLayers.some(p => !p || typeof p !== "object" || p.opacity !== undefined && !range(p.opacity, 0, 1)))) throw Error("房间绘制层无效。");
                o.paintLayers = roomPaintLayers(o).map((p, i) => ({
                    visible: p.visible !== false,
                    locked: p.locked === true,
                    opacity: p.opacity ?? [ 1, .35, .15 ][i]
                }));
                if (o.rainedSource !== undefined && (typeof o.rainedSource !== "string" || o.rainedSource.length > 40 * 1024 * 1024)) throw Error("Rained 来源数据无效。");
                if (!Number.isInteger(o.w) || !Number.isInteger(o.h) || !range(o.w, 1, r.w) || !range(o.h, 1, r.h) || !range(o.x, 0, r.w - o.w) || !range(o.y, 0, r.h - o.h) || !Array.isArray(o.cameras)) throw Error("房间尺寸或镜头无效。");
                for (const c of o.cameras) if (!range(c.x, 0, o.w) || !range(c.y, 0, o.h)) throw Error("镜头位置无效。");
                if (o.background !== undefined && !/^#[a-f0-9]{6}$/i.test(o.background)) throw Error("房间背景颜色无效。");
                if (!Number.isInteger(o.water) || !range(o.water, -1, o.h)) throw Error("水深无效。");
            }
            for (const o of r.shapes) {
                if (o.decoration !== undefined && (!Number.isInteger(o.decoration) || !range(o.decoration, 0, 2) || o.decoration && !o.roomId)) throw Error("背景绘制层无效。");
                if (!Object.hasOwn(materials, o.material) || ![ "rect", "ellipse", "polygon", "line" ].includes(o.type) || !range(o.depth ?? 0, 0, 2)) throw Error("绘制分类无效。");
                if (o.points) {
                    if (!Array.isArray(o.points) || !o.points.length || o.points.length > 5e4 || o.points.some(p => !finite(p.x) || !finite(p.y))) throw Error("笔画坐标无效。");
                } else if (!finite(o.x) || !finite(o.y) || !range(o.w, 0, 1e4) || !range(o.h, 0, 1e4)) throw Error("轮廓尺寸无效。");
                if (o.rawCell && (!Array.isArray(o.rawCell) || o.rawCell.length !== 2 || !Number.isInteger(o.rawCell[0]) || !range(o.rawCell[0], 0, 9) || !Array.isArray(o.rawCell[1]) || o.rawCell[1].length > 64 || o.rawCell[1].some(f => !Number.isInteger(f) || !range(f, 0, 255)))) throw Error("房间几何单元无效。");
                if (o.clip && (!finite(o.clip.x) || !finite(o.clip.y) || !range(o.clip.w, 0, 1e4) || !range(o.clip.h, 0, 1e4))) throw Error("裁切范围无效。");
            }
            for (const o of [ ...r.markers, ...r.ports ]) if (!range(o.x, 0, r.w) || !range(o.y, 0, r.h)) throw Error("标记坐标无效。");
            for (const o of r.markers) {
                if (!Object.hasOwn(categories, o.kind) || !Array.isArray(o.sceneIds) || o.sceneIds.some(id => !scenes.has(id))) throw Error("标记类型或时间线绑定无效。");
                if (o.icon && !/^data:image\/(png|jpeg|webp);base64,/.test(o.icon)) throw Error("图标必须是本机图片。");
            }
            for (const o of r.ports) if (!Object.hasOwn(portKinds, o.kind) || o.facing !== undefined && !Object.hasOwn(portDirections, o.facing)) throw Error("通道井类型或朝向无效。");
            for (const o of r.links) if (!ports.has(o.a) || !ports.has(o.b) || o.a === o.b) throw Error("连接端点无效。");
            for (const ref of r.refs) if (!/^data:image\/(png|jpeg|webp);base64,/.test(ref.src || "") || !finite(ref.x) || !finite(ref.y) || !range(ref.w, 1, 1e4) || !range(ref.h, 1, 1e4) || !range(ref.opacity, 0, 1) || !finite(ref.angle || 0)) throw Error("参考图格式或尺寸无效。");
            if (r.labelColor !== undefined && !/^#[a-f0-9]{6}$/i.test(r.labelColor)) throw Error("区域名称颜色无效。");
            if (r.textDocId !== undefined && (typeof r.textDocId !== "string" || r.textDocId.length > 160)) throw Error("区域文字绑定无效。");
            const defaults = region().categories;
            r.categories = Object.fromEntries(Object.keys(defaults).map(k => [ k, {
                visible: r.categories?.[k]?.visible ?? defaults[k].visible,
                locked: r.categories?.[k]?.locked === true
            } ]));
            if (!r.symmetry || !finite(r.symmetry.axisX) || !finite(r.symmetry.axisY)) r.symmetry = {
                x: false,
                y: false,
                axisX: r.w / 2,
                axisY: r.h / 2
            };
        }
        if (scenes.size !== safe.scenes.length) throw Error("地图编号重复。");
        for (const s of safe.scenes) {
            if (!validId(s.id) || !Array.isArray(s.regions) || s.regions.some(id => !ids.has(id)) || !s.placements || typeof s.placements !== "object") throw Error("地图引用无效。");
            for (const p of Object.values(s.placements)) if (!p || !finite(p.x) || !finite(p.y)) throw Error("世界布局坐标无效。");
            if (s.groups !== undefined) {
                if (!Array.isArray(s.groups) || s.groups.length > 500) throw Error("区域分组无效。");
                const groupIds = new Set, assigned = new Set;
                for (const g of s.groups) {
                    if (!g || !validId(g.id) || groupIds.has(g.id) || typeof g.name !== "string" || g.name.length > 200 || !Array.isArray(g.regions)) throw Error("区域分组无效。");
                    groupIds.add(g.id);
                    g.regions = g.regions.filter(id => s.regions.includes(id) && !assigned.has(id) && (assigned.add(id), 
                    true));
                }
            }
        }
        for (const g of safe.gates) if (!validId(g.id) || !Array.isArray(g.scenes) || g.scenes.some(id => !scenes.has(id)) || [ g.a, g.b ].some(side => !side || !ids.has(side.region) || ![ "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "locked" ].includes(String(side.karma)))) throw Error("业力门连接无效。");
        if (safe.settings?.presentationVersion !== 5) {
            for (const r of safe.regions) {
                for (const k of [ "rooms", "roomNames", "cameras", "ports", "connections", ...Object.keys(categories) ]) r.categories[k].visible = false;
                for (const m of r.markers) if (m.name === "鳄鱼刷新") {
                    m.name = "蝾螈";
                    m.creatureType = "Salamander";
                }
                if ([ "#101713", "#101b17", "#17251f", "#101815", "#0a100d" ].includes(r.bg)) r.bg = "#000000";
            }
            for (const ss of safe.scenes) if (ss.name === "主线") ss.name = "默认地图";
        }
        for (const r of safe.regions) {
            r.air ||= "#ffffff";
            for (const rm of r.rooms) {
                rm.roomType ||= rm.name.startsWith("GATE_") ? "GATE" : new RegExp("^" + r.code + "_S[0-9]+$").test(rm.name) ? "SHELTER" : "ROOM";
                rm.visible ??= true;
                rm.locked ??= false;
            }
        }
        safe.settings = {
            iconScale: 1,
            snapAlignment: true,
            undoVisible: true,
            undoLocked: true,
            canvasBackground: "#000000",
            selectionColor: "#ffffff",
            showRegionBounds: false,
            showZoom: false,
            toolbarPosition: "bottom-right",
            grid: true,
            ...safe.settings,
            presentationVersion: 5
        };
        safe.settings.regionLabelMode = safe.settings.regionLabelMode === "uniform" ? "uniform" : "color";
        if (!/^#[a-f0-9]{6}$/i.test(safe.settings.regionLabelColor || "")) safe.settings.regionLabelColor = "#ffffff";
        safe.settings.undoVisible = true;
        safe.settings.iconScale = finite(safe.settings.iconScale) ? Math.max(.25, Math.min(8, safe.settings.iconScale)) : 1;
        if (!/^#[a-f0-9]{6}$/i.test(safe.settings.canvasBackground)) safe.settings.canvasBackground = "#000000";
        const deps = Array.isArray(safe.exportSettings?.dependencies) ? safe.exportSettings.dependencies.filter(d => typeof d === "string" && d.length < 100) : [];
        if (safe.regions.some(r => r.cameraMode === "sbc")) deps.push("SBCameraScroll");
        safe.exportSettings = {
            dependencies: [ ...new Set(deps) ]
        };
        for (const r of safe.regions) {
            delete r.cameraMode;
            organizeShelters(r);
            organizeGates(r, safe);
        }
        safe.presets = Array.isArray(safe.presets) ? safe.presets : [];
        if (!scenes.has(safe.activeScene)) safe.activeScene = safe.scenes[0].id;
        return safe;
    }
    function categoryName(k) {
        return {
            rooms: "房间",
            draft: "自由剪影",
            geometry: "地形",
            water: "水体",
            refs: "参考图",
            ports: "通道井",
            connections: "连接虚线",
            roomNames: "房间名称",
            cameras: "镜头边界",
            ...categories
        }[k] || k;
    }
    function lockReason(r, o, category, lid) {
        const l = r.layers.find(l => l.id === (lid || o?.layer));
        if (l?.locked) return "图层“" + l.name + "”已锁定";
        const rm = o && (o.roomId ? r.rooms.find(rm => rm.id === o.roomId) : r.rooms.includes(o) ? o : null);
        if (rm?.locked) return "房间“" + rm.name + "”已锁定";
        if (rm && o?.decoration !== undefined && roomPaintLayers(rm)[o.decoration || 0]?.locked) return paintLayerNames[o.decoration || 0] + "已锁定";
        if (o?.locked) return "对象“" + (o.name || categoryName(category) || "所选对象") + "”已锁定";
        if (!o?.decoration && category && r.categories[category]?.locked) return categoryName(category) + "已锁定";
        return "";
    }
    function unlockRegion(r) {
        for (const o of [ ...r.layers, ...r.rooms, ...r.rooms.flatMap(roomPaintLayers), ...r.shapes, ...r.markers, ...r.ports, ...r.refs, ...Object.values(r.categories) ]) if (o.locked) o.locked = false;
    }
    function opacity(o) {
        return Math.max(0, Math.min(1, Number.isFinite(o?.opacity) ? o.opacity : 1));
    }
    function objectOpacity(r, o) {
        return opacity(r.layers.find(l => l.id === o.layer)) * opacity(o.roomId ? r.rooms.find(rm => rm.id === o.roomId) : r.rooms.includes(o) ? o : null);
    }
    function roomCopyPosition(r, source, lid = source.layer) {
        const candidates = [ {
            x: source.x + source.w + 4,
            y: source.y
        }, {
            x: source.x,
            y: source.y + source.h + 4
        }, {
            x: source.x - source.w - 4,
            y: source.y
        }, {
            x: source.x,
            y: source.y - source.h - 4
        }, {
            x: 0,
            y: 0
        } ];
        if (lid !== source.layer) candidates.unshift({
            x: source.x,
            y: source.y
        });
        for (const o of r.rooms.filter(o => o.layer === lid)) candidates.push({
            x: o.x + o.w,
            y: o.y
        }, {
            x: o.x,
            y: o.y + o.h
        }, {
            x: 0,
            y: o.y + o.h
        }, {
            x: o.x + o.w,
            y: 0
        });
        return candidates.find(p => p.x >= 0 && p.y >= 0 && p.x + source.w <= r.w && p.y + source.h <= r.h && !r.rooms.some(o => o.layer === lid && intersection(o, {
            ...p,
            w: source.w,
            h: source.h
        }))) || null;
    }
    function duplicateRoom(w, r, id, target) {
        const source = r.rooms.find(o => o.id === id), lid = source?.roomType === "SHELTER" ? ensureShelterLayer(r).id : source?.roomType === "GATE" ? ensureGateLayer(r).id : target.layer, layer = r.layers.find(l => l.id === lid);
        if (!source || !layer) throw Error("房间或图层不存在。");
        if (layer.locked) throw Error("目标图层已锁定。");
        const box = {
            x: target.x,
            y: target.y,
            w: source.w,
            h: source.h
        };
        if (!Number.isInteger(box.x) || !Number.isInteger(box.y) || box.x < 0 || box.y < 0 || box.x + box.w > r.w || box.y + box.h > r.h) throw Error("副本超出区域范围。");
        if (r.rooms.some(o => o.layer === lid && intersection(o, box))) throw Error("副本与同层房间重叠，请调整位置或选择其他层。");
        const kinds = [ "shapes", "markers", "ports", "refs" ], items = Object.fromEntries(kinds.map(k => [ k, r[k].filter(o => o.roomId === id) ]));
        if (r.rooms.length >= 1e3 || r.shapes.length + items.shapes.length > 3e4 || r.markers.length + r.ports.length + items.markers.length + items.ports.length > 2e4) throw Error("复制后内容超过区域上限。");
        const rm = {
            ...clone(source),
            ...box,
            id: uid(),
            layer: lid,
            locked: false,
            name: nextRoomName(r, source.roomType || "ROOM", lid, source.gateTo),
            cameras: source.cameras.map(c => ({
                ...c,
                id: uid()
            }))
        }, ids = new Map([ [ id, rm.id ] ]), dx = rm.x - source.x, dy = rm.y - source.y;
        r.rooms.push(rm);
        for (const k of kinds) for (const o of items[k]) ids.set(o.id, uid());
        for (const k of kinds) for (const o of items[k]) {
            const next = {
                ...clone(o),
                id: ids.get(o.id),
                roomId: rm.id,
                layer: lid
            };
            shift(next, dx, dy);
            r[k].push(next);
        }
        const ports = new Set(items.ports.map(o => o.id));
        for (const link of [ ...r.links ]) if (ports.has(link.a) || ports.has(link.b)) r.links.push({
            ...clone(link),
            id: uid(),
            a: ids.get(link.a) || link.a,
            b: ids.get(link.b) || link.b
        });
        const markers = new Set(items.markers.map(o => o.id));
        for (const gate of [ ...w.gates ]) if ([ "a", "b" ].some(s => gate[s].region === r.id && markers.has(gate[s].marker))) {
            const next = clone(gate);
            next.id = uid();
            next.name = gate.name + " · " + rm.name;
            for (const side of [ "a", "b" ]) if (next[side].region === r.id && markers.has(next[side].marker)) next[side].marker = ids.get(next[side].marker);
            w.gates.push(next);
        }
        return rm;
    }
    function isDedicatedLayer(l) {
        return l?.kind === "shelter" || l?.kind === "gate";
    }
    function isRoomMarker(o) {
        return o?.kind === "shelter" || o?.kind === "gate";
    }
    function gateLayer(r) {
        return r.layers.find(l => l.kind === "gate");
    }
    function ensureGateLayer(r) {
        let layer = gateLayer(r);
        if (!layer) {
            const duplicate = r.layers.find(l => l.name === "业力门层级");
            if (duplicate) duplicate.name = nextLayerName(r, "原业力门层级");
            layer = {
                id: uid(),
                name: "业力门层级",
                kind: "gate",
                visible: true,
                locked: false
            };
            r.layers.push(layer);
        }
        return layer;
    }
    function gateIcon(w, sid, marker) {
        if (w.settings?.gateKarmaIcons !== true) return "gate";
        const g = w.gates.find(g => g.scenes.includes(sid) && [ g.a, g.b ].some(s => s.marker === marker.id)), side = g && [ g.a, g.b ].find(s => s.marker === marker.id);
        return side ? side.karma === "locked" ? "gate-locked" : "karma-" + side.karma : "gate";
    }
    function ensureGateRoom(r, m, to = "") {
        let rm = r.rooms.find(rm => rm.id === m.roomId && rm.roomType === "GATE");
        const layer = ensureGateLayer(r);
        if (!rm) {
            if (r.rooms.length >= 1e3) throw Error("区域房间数量已达上限，请先整理房间。");
            const ww = Math.min(70, r.w), hh = Math.min(40, r.h), old = r.layers.find(l => l.id === m.layer);
            rm = addRoom(r, {
                x: Math.round(Math.max(0, Math.min(r.w - ww, m.x - ww / 2))),
                y: Math.round(Math.max(0, Math.min(r.h - hh, m.y - hh / 2))),
                w: ww,
                h: hh,
                layer: layer.id
            });
            rm.returnLayer = !isDedicatedLayer(old) ? old?.id : r.layers.find(l => !isDedicatedLayer(l))?.id;
            setRoomType(r, rm, "GATE", to);
            m.roomId = rm.id;
        }
        m.layer = layer.id;
        return rm;
    }
    function organizeGates(r, w) {
        const rooms = r.rooms.filter(rm => rm.roomType === "GATE"), markers = r.markers.filter(m => m.kind === "gate");
        if (!rooms.length && !markers.length) return;
        const layer = ensureGateLayer(r);
        for (const rm of rooms) {
            if (rm.layer !== layer.id) {
                const old = r.layers.find(l => l.id === rm.layer);
                if (!isDedicatedLayer(old)) rm.returnLayer = rm.layer;
                if (old?.locked) rm.locked = true;
                if (old?.visible === false) rm.visible = false;
                rm.opacity = opacity(rm) * opacity(old);
                transferRoomLayer(r, rm, layer.id);
            }
            if (!rm.gateMarkerOmitted && !r.markers.some(m => m.kind === "gate" && m.roomId === rm.id)) r.markers.push({
                id: uid(),
                kind: "gate",
                name: "业力门",
                roomTypeMarker: true,
                roomId: rm.id,
                layer: layer.id,
                x: Math.floor(rm.x + rm.w / 2),
                y: Math.floor(rm.y + rm.h / 2),
                sceneIds: [],
                color: "#cccccc"
            });
        }
        for (const m of markers) {
            const link = w?.gates.find(g => [ g.a, g.b ].some(s => s.region === r.id && s.marker === m.id)), other = link && [ link.a, link.b ].find(s => s.region !== r.id), to = w?.regions.find(rr => rr.id === other?.region)?.code || "";
            ensureGateRoom(r, m, to);
        }
        r.gateLayerVersion = 1;
    }
    function shelterLayer(r) {
        return r.layers.find(l => l.kind === "shelter");
    }
    function ensureShelterLayer(r) {
        let layer = shelterLayer(r);
        if (!layer) {
            const duplicate = r.layers.find(l => l.name === "庇护所层级");
            if (duplicate) duplicate.name = nextLayerName(r, "原庇护所层级");
            layer = {
                id: uid(),
                name: "庇护所层级",
                kind: "shelter",
                visible: true,
                locked: false
            };
            r.layers.push(layer);
        }
        return layer;
    }
    function transferRoomLayer(r, rm, lid) {
        rm.layer = lid;
        for (const o of [ ...r.shapes, ...r.markers, ...r.ports, ...r.refs ]) if (o.roomId === rm.id) o.layer = lid;
    }
    function organizeShelters(r) {
        const shelters = r.rooms.filter(rm => rm.roomType === "SHELTER"), markers = r.markers.filter(m => m.kind === "shelter");
        if (!shelters.length && !markers.length) return;
        const layer = ensureShelterLayer(r);
        for (const rm of shelters) {
            if (rm.layer !== layer.id) {
                rm.returnLayer = rm.layer;
                const old = r.layers.find(l => l.id === rm.layer);
                if (old?.locked) rm.locked = true;
                if (old?.visible === false) rm.visible = false;
                rm.opacity = opacity(rm) * opacity(old);
                transferRoomLayer(r, rm, layer.id);
            }
            if (!r.markers.some(m => m.kind === "shelter" && m.roomId === rm.id)) r.markers.push({
                id: uid(),
                kind: "shelter",
                name: "庇护所",
                roomTypeMarker: true,
                roomId: rm.id,
                layer: layer.id,
                x: Math.floor(rm.x + rm.w / 2),
                y: Math.floor(rm.y + rm.h / 2),
                sceneIds: [],
                color: "#cccccc"
            });
        }
        for (const m of markers) {
            let rm = r.rooms.find(rm => rm.id === m.roomId);
            if (rm?.roomType !== "SHELTER") {
                const ww = Math.min(70, r.w), hh = Math.min(40, r.h), oldLayer = m.layer;
                if (r.rooms.length >= 1e3) {
                    m.roomId = null;
                    m.layer = layer.id;
                    continue;
                }
                rm = addRoom(r, {
                    x: Math.round(Math.max(0, Math.min(r.w - ww, m.x - ww / 2))),
                    y: Math.round(Math.max(0, Math.min(r.h - hh, m.y - hh / 2))),
                    w: ww,
                    h: hh,
                    layer: layer.id
                });
                rm.returnLayer = oldLayer;
                setRoomType(r, rm, "SHELTER");
                m.roomId = rm.id;
            }
            m.layer = layer.id;
        }
        if (r.shelterLayerVersion !== 1) {
            r.categories.shelter.visible = true;
            r.shelterLayerVersion = 1;
        }
    }
    function setRoomKind(w, r, rm, type, to = "") {
        if (rm.locked || r.layers.find(l => l.id === rm.layer)?.locked) throw Error("房间或图层已锁定。");
        const oldLayer = r.layers.find(l => l.id === rm.layer), special = type === "SHELTER" || type === "GATE";
        if (special) {
            const target = type === "SHELTER" ? ensureShelterLayer(r) : ensureGateLayer(r);
            if (target.locked) throw Error(target.name + "已锁定。");
            if (rm.layer !== target.id) {
                if (!isDedicatedLayer(oldLayer)) rm.returnLayer = rm.layer;
                transferRoomLayer(r, rm, target.id);
            }
        } else if (isDedicatedLayer(oldLayer)) {
            const target = r.layers.find(l => l.id === rm.returnLayer && !isDedicatedLayer(l)) || r.layers.find(l => !isDedicatedLayer(l));
            if (!target || target.locked) throw Error("原图层已锁定或不存在。");
            if (r.rooms.some(o => o.id !== rm.id && o.layer === target.id && intersection(o, rm))) throw Error("原图层此处有房间，请先调整房间位置再修改类型。");
            transferRoomLayer(r, rm, target.id);
        }
        if (rm.roomType !== type || type === "GATE" && rm.gateTo !== to) setRoomType(r, rm, type, to);
        const kind = type === "SHELTER" ? "shelter" : type === "GATE" ? "gate" : type === "ITERATOR" ? "iterator" : null, removed = new Set(r.markers.filter(m => m.roomId === rm.id && ([ "shelter", "gate" ].includes(m.kind) || m.kind === "iterator" && m.roomTypeMarker) && m.kind !== kind).map(m => m.id));
        r.markers = r.markers.filter(m => !removed.has(m.id));
        w.gates = w.gates.filter(g => ![ "a", "b" ].some(s => g[s].region === r.id && removed.has(g[s].marker)));
        if (kind && !r.markers.some(m => m.roomId === rm.id && m.kind === kind)) r.markers.push({
            id: uid(),
            kind: kind,
            name: categories[kind],
            roomTypeMarker: true,
            roomId: rm.id,
            layer: rm.layer,
            x: Math.floor(rm.x + rm.w / 2),
            y: Math.floor(rm.y + rm.h / 2),
            sceneIds: [],
            color: "#cccccc"
        });
        if (kind) r.categories[kind].visible = true;
        if (type === "SHELTER") r.shelterLayerVersion = 1;
        if (type === "GATE") r.gateLayerVersion = 1;
        return rm;
    }
    function iteratorRoomFrame(r, rm, preset) {
        const thickness = preset.walls === false ? 0 : preset.thickness ?? 2;
        if (!Number.isInteger(thickness) || thickness < 0 || thickness * 2 >= Math.min(rm.w, rm.h)) throw Error("墙体厚度必须小于房间短边的一半。");
        if (thickness && r.categories.geometry.locked) throw Error("地形已锁定；可点右下角“全部解锁”。");
        if (r.shapes.length + (thickness ? 4 : 0) > 3e4) throw Error("区域地形数量已达上限。");
        rm.preset = {
            kind: "iterator",
            thickness: thickness,
            walls: thickness > 0
        };
        if (thickness) {
            const t = thickness, rects = [ {
                x: rm.x,
                y: rm.y,
                w: rm.w,
                h: t
            }, {
                x: rm.x,
                y: rm.y + rm.h - t,
                w: rm.w,
                h: t
            }, {
                x: rm.x,
                y: rm.y + t,
                w: t,
                h: rm.h - 2 * t
            }, {
                x: rm.x + rm.w - t,
                y: rm.y + t,
                w: t,
                h: rm.h - 2 * t
            } ];
            for (const box of rects) r.shapes.push({
                id: uid(),
                type: "rect",
                material: "solid",
                depth: 0,
                roomId: rm.id,
                layer: rm.layer,
                ...box
            });
        }
        const marker = r.markers.find(m => m.roomId === rm.id && m.kind === "iterator");
        if (marker) {
            marker.name = String(preset.name || "迭代器演算室");
            if (preset.icon) marker.icon = preset.icon;
            if (preset.iteratorIcon) {
                marker.iteratorIcon = clone(preset.iteratorIcon);
                marker.iteratorDocId = preset.iteratorDocId || "";
                marker.iteratorColorMode = preset.iteratorColorMode || "white";
            }
        }
        return rm;
    }
    function roomTypeManifest(r) {
        return r.rooms.map(rm => ({
            name: rm.name,
            type: rm.roomType || "ROOM",
            worldTags: [ "SHELTER", "GATE" ].includes(rm.roomType) ? [ rm.roomType ] : [],
            gateTo: rm.gateTo || null
        }));
    }
    function nextLayerName(r, base = "新层") {
        let name = base, n = 2;
        while (r.layers.some(l => l.name === name)) name = base + " " + n++;
        return name;
    }
    function addLayer(r, name) {
        name = String(name || "").trim();
        if (!name) throw Error("请填写图层名称。");
        if (r.layers.some(l => l.name === name)) throw Error("图层名称已存在。");
        const layer = {
            id: uid(),
            name: name,
            visible: true,
            locked: false
        };
        r.layers.push(layer);
        return layer;
    }
    function duplicateLayer(w, r, sourceId, name) {
        const source = r.layers.find(l => l.id === sourceId);
        if (!source) throw Error("原图层不存在。");
        if (isDedicatedLayer(source)) {
            for (const rm of [ ...r.rooms.filter(o => o.layer === sourceId) ]) {
                const p = roomCopyPosition(r, rm);
                if (!p) throw Error("区域内没有空间放置房间副本，请先扩大区域。");
                duplicateRoom(w, r, rm.id, {
                    ...p,
                    layer: sourceId
                });
            }
            return source;
        }
        const kinds = [ "rooms", "shapes", "markers", "ports", "refs" ], original = Object.fromEntries(kinds.map(k => [ k, r[k].filter(o => o.layer === sourceId) ]));
        if (r.rooms.length + original.rooms.length > 1e3 || r.shapes.length + original.shapes.length > 3e4 || r.markers.length + r.ports.length + original.markers.length + original.ports.length > 2e4) throw Error("复制后内容超过区域上限。");
        const layer = addLayer(r, name || nextLayerName(r, source.name + " 副本")), ids = new Map([ [ sourceId, layer.id ] ]);
        layer.opacity = opacity(source);
        for (const k of kinds) for (const o of original[k]) ids.set(o.id, uid());
        for (const k of kinds) for (const o of original[k]) {
            const next = clone(o);
            next.id = ids.get(o.id);
            next.layer = layer.id;
            if (next.roomId && ids.has(next.roomId)) next.roomId = ids.get(next.roomId);
            if (k === "rooms") {
                next.name = nextRoomName(r, next.roomType || "ROOM", layer.id, next.gateTo);
                next.cameras = next.cameras.map(c => ({
                    ...c,
                    id: uid()
                }));
            }
            r[k].push(next);
        }
        const ports = new Set(original.ports.map(p => p.id));
        for (const link of [ ...r.links ]) if (ports.has(link.a) || ports.has(link.b)) r.links.push({
            ...clone(link),
            id: uid(),
            a: ids.get(link.a) || link.a,
            b: ids.get(link.b) || link.b
        });
        const markers = new Set(original.markers.map(m => m.id));
        for (const gate of [ ...w.gates ]) if ([ "a", "b" ].some(side => gate[side].region === r.id && markers.has(gate[side].marker))) {
            const next = clone(gate);
            next.id = uid();
            next.name = gate.name + " · " + layer.name;
            for (const side of [ "a", "b" ]) if (next[side].region === r.id && markers.has(next[side].marker)) next[side].marker = ids.get(next[side].marker);
            w.gates.push(next);
        }
        return layer;
    }
    function nextRoomName(r, type = "ROOM", lid = r.layers[0].id, gateTo = "") {
        if (type === "ITERATOR") {
            const prefix = r.code + "_AI";
            if (!r.rooms.some(rm => rm.name === prefix)) return prefix;
            let n = 2;
            while (r.rooms.some(rm => rm.name === prefix + String(n).padStart(2, "0"))) n++;
            return prefix + String(n).padStart(2, "0");
        }
        const prefix = type === "GATE" ? "GATE_" + r.code + "_" + (gateTo || "XX") : r.code + "_" + (type === "SHELTER" ? "S" : String.fromCharCode(65 + Math.max(0, r.layers.findIndex(l => l.id === lid)) % 26));
        if (type === "GATE" && !r.rooms.some(o => o.name === prefix)) return prefix;
        let n = 1;
        while (r.rooms.some(o => o.name === prefix + (type === "GATE" ? "_" : "") + String(n).padStart(2, "0"))) n++;
        return prefix + (type === "GATE" ? "_" : "") + String(n).padStart(2, "0");
    }
    function renameRoom(r, rm, name) {
        name = String(name).trim().toUpperCase();
        if (!/^[A-Z0-9]+_[A-Z0-9_]+$/.test(name) || !(name.startsWith(r.code + "_") || name.startsWith("GATE_"))) throw Error("房间名格式：" + r.code + "_A01 / " + r.code + "_S01 / GATE_" + r.code + "_区域代码");
        if (r.rooms.some(o => o.id !== rm.id && o.name === name)) throw Error("房间名称已存在。");
        rm.name = name;
    }
    function setRoomType(r, rm, type, gateTo = "") {
        if (![ "ROOM", "SHELTER", "GATE", "ITERATOR" ].includes(type)) throw Error("房间类型无效。");
        rm.name = nextRoomName(r, type, rm.layer, gateTo);
        rm.roomType = type;
        rm.gateTo = gateTo;
    }
    function roomVisible(r, o) {
        return o.visible !== false && (!o.roomId || r.rooms.find(rm => rm.id === o.roomId)?.visible !== false);
    }
    function roomLocked(r, o) {
        return o.locked === true || !!(o.roomId && r.rooms.find(rm => rm.id === o.roomId)?.locked);
    }
    function recordKind(d) {
        if (!d) return "text";
        const names = {
            "区域": "region",
            "珍珠": "pearl",
            "广播": "broadcast",
            "回响": "echo",
            "迭代器": "iterator",
            "角色": "character",
            "蛞蝓猫": "slugcat"
        };
        return names[d.category] || (d.details?.regionProfiles ? "region" : d.kind) || "text";
    }
    function docsOfKind(docs, kind) {
        return (docs || []).filter(d => d && !d.archived && recordKind(d) === kind);
    }
    function exactRecords(docs, kind, names) {
        const normal = v => String(v || "").normalize("NFKC").trim().toLowerCase(), terms = names.map(normal).filter(Boolean);
        return (docs || []).filter(d => d && !d.archived && (recordKind(d) === kind || kind === "region" && recordKind(d) === "text") && [ d.title, d.details?.english ].map(normal).some(n => n && terms.includes(n)));
    }
    function searchRecords(docs, query, kind) {
        const q = String(query || "").normalize("NFKC").trim().toLowerCase(), value = v => Array.isArray(v) ? v.map(value).join(" ") : v && typeof v === "object" ? Object.values(v).map(value).join(" ") : String(v || "");
        return (docs || []).filter(d => d && !d.archived && [ d.title, d.category, d.details?.english, d.details?.synopsis, d.details?.tags, d.details?.characterTags, d.details?.region, d.details?.regionProfiles, d.content ].map(value).join(" ").normalize("NFKC").toLowerCase().includes(q)).sort((a, b) => Number(recordKind(b) === kind) - Number(recordKind(a) === kind));
    }
    function bindRecord(marker, doc) {
        marker.docId = doc?.id || "";
        if (doc) {
            marker.bindingDismissed = false;
            marker.name = doc.title;
            marker.appearance = clone(doc.details?.appearance || {});
            marker.color = marker.appearance.baseColor || marker.color;
            marker.recordMode = "bound";
        }
    }
    function makeRegionRecord(kind, name, r) {
        const id = uid();
        return {
            id: id,
            title: name || categories[kind],
            kind: kind === "echo" ? "text" : kind,
            category: {
                pearl: "珍珠",
                broadcast: "广播",
                echo: "回响"
            }[kind],
            content: "",
            sourcePath: "",
            logicalPath: "regions/" + r.id + "/" + id + ".md",
            archived: false,
            details: {
                synopsis: "",
                tags: [],
                characterTags: [],
                region: r.code,
                ...kind === "pearl" ? {
                    reader: ""
                } : {
                    broadcastType: "即时广播",
                    sourceNode: ""
                }
            }
        };
    }
    function mergeLayers(r, from, to) {
        const a = r.layers.find(l => l.id === from), b = r.layers.find(l => l.id === to);
        if (!a || !b || a === b) throw Error("请选择另一个图层。");
        if (a.locked || b.locked) throw Error("请先解锁两个图层。");
        if (isDedicatedLayer(a) || isDedicatedLayer(b)) throw Error("庇护所与业力门保留各自的专用层。");
        const moving = r.rooms.filter(rm => rm.layer === from);
        if (moving.some(rm => rm.locked)) throw Error("请先解锁源图层中的房间。");
        if (moving.some(rm => r.rooms.some(other => other.layer === to && intersection(rm, other)))) throw Error("两层中有重叠房间，请先移动房间。");
        for (const key of [ "rooms", "shapes", "markers", "ports", "refs" ]) for (const o of r[key]) if (o.layer === from) o.layer = to;
        r.layers = r.layers.filter(l => l.id !== from);
        return b;
    }
    function roomFrameMergePlan(r, frame) {
        let box = {
            x: frame.x,
            y: frame.y,
            w: frame.w,
            h: frame.h
        }, hits = [];
        for (let i = 0; i <= r.rooms.length; i++) {
            const next = r.rooms.filter(rm => rm.layer === frame.layer && intersection(rm, box));
            if (next.length === hits.length) break;
            hits = next;
            const x = Math.min(box.x, ...hits.map(rm => rm.x)), y = Math.min(box.y, ...hits.map(rm => rm.y));
            box = {
                x: x,
                y: y,
                w: Math.max(box.x + box.w, ...hits.map(rm => rm.x + rm.w)) - x,
                h: Math.max(box.y + box.h, ...hits.map(rm => rm.y + rm.h)) - y
            };
        }
        return {
            box: {
                ...box,
                layer: frame.layer
            },
            hits: hits
        };
    }
    function mergeRoomFrame(r, frame) {
        const {box: box, hits: hits} = roomFrameMergePlan(r, frame);
        if (!hits.length) return addRoom(r, box);
        if (r.categories.rooms.locked || r.layers.find(l => l.id === frame.layer)?.locked || hits.some(rm => rm.locked)) throw Error("请先解锁需要合并的房间和图层。");
        if (hits.some(rm => [ "GATE", "SHELTER" ].includes(rm.roomType))) throw Error("庇护所和业力门有独立入口，请保留独立房间。");
        const surfaces = [ ...new Set(hits.filter(rm => rm.water >= 0).map(rm => rm.y + rm.h - rm.water)) ];
        if (surfaces.length > 1) throw Error("这些房间的水面高度不同，请先统一水面。");
        const keep = hits[0], ids = new Set(hits.map(rm => rm.id));
        Object.assign(keep, box, {
            cameras: cameras(box.w, box.h),
            water: surfaces.length ? Math.max(0, box.y + box.h - surfaces[0]) : -1
        });
        for (const key of [ "shapes", "markers", "ports", "refs" ]) for (const o of r[key]) if (ids.has(o.roomId)) o.roomId = keep.id;
        r.rooms = r.rooms.filter(rm => !ids.has(rm.id) || rm.id === keep.id);
        cutShapes(r, keep);
        return keep;
    }
    function fillRegion(r, p, options = {}) {
        const lid = options.layer || r.layers[0].id, layer = r.layers.find(l => l.id === lid), mat = options.material || "solid";
        if (!layer || layer.locked) throw Error("当前图层已锁定。");
        if (!Object.hasOwn(materials, mat)) throw Error("请选择填充内容。");
        if (options.decoration) options = {
            ...options,
            crossRooms: false
        };
        const owner = options.roomId ? r.rooms.find(rm => rm.id === options.roomId) : r.rooms.find(rm => rm.layer === lid && inside(p, rm)), boundsBox = options.crossRooms === false && owner ? owner : {
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        };
        if (owner && roomPaintLayers(owner)[options.decoration || 0]?.locked) throw Error(paintLayerNames[options.decoration || 0] + "已锁定");
        if (options.decoration && !owner) throw Error("请先选择要绘制背景的房间。");
        const left = Math.floor(boundsBox.x), top = Math.floor(boundsBox.y), width = Math.ceil(boundsBox.w), height = Math.ceil(boundsBox.h), size = width * height;
        if (size > 1e6) throw Error("填充范围超过 100 万格，请先进入房间再填充。");
        const ix = Math.floor(p.x) - left, iy = Math.floor(p.y) - top;
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
        const names = [ "air", ...Object.keys(materials).filter(m => m !== "air") ], codes = Object.fromEntries(names.map((m, i) => [ m, i ])), pixels = new Uint8Array(size), blocked = new Uint8Array(size), samples = options.antialias === false ? [ [ .5, .5 ] ] : [ [ .25, .25 ], [ .75, .25 ], [ .25, .75 ], [ .75, .75 ] ], threshold = Math.max(.01, .5 - (Number(options.tolerance) || 0) / 200);
        const layerIds = options.sampleAll ? r.layers.filter(l => l.visible !== false).map(l => l.id) : [ lid ];
        for (const l of layerIds) for (const shape of r.shapes) {
            if (shape.layer !== l || (shape.decoration || 0) !== (options.decoration || 0) || !roomVisible(r, shape) || !paintLayerVisible(r, shape)) continue;
            const category = shape.material === "draft" ? "draft" : shape.material === "water" ? "water" : "geometry";
            if (!options.decoration && r.categories[category]?.visible === false) continue;
            const b = intersection(bounds(shape), boundsBox);
            if (!b) continue;
            for (let y = Math.max(top, Math.floor(b.y)); y < Math.min(top + height, Math.ceil(b.y + b.h)); y++) for (let x = Math.max(left, Math.floor(b.x)); x < Math.min(left + width, Math.ceil(b.x + b.w)); x++) {
                const coverage = samples.filter(([sx, sy]) => hitShape(shape, {
                    x: x + sx,
                    y: y + sy
                })).length / samples.length;
                if (coverage < threshold) continue;
                pixels[(y - top) * width + x - left] = shape.erase || shape.material === "crawl" ? 0 : codes[shape.material];
            }
        }
        if (options.crossRooms === false && owner) blocked.fill(1);
        for (const rm of r.rooms.filter(rm => rm.layer === lid)) {
            const deny = rm.locked || roomPaintLayers(rm)[options.decoration || 0]?.locked || rm.visible === false || options.crossRooms === false && (!owner || rm.id !== owner.id);
            for (let y = Math.max(top, Math.floor(rm.y)); y < Math.min(top + height, Math.ceil(rm.y + rm.h)); y++) for (let x = Math.max(left, Math.floor(rm.x)); x < Math.min(left + width, Math.ceil(rm.x + rm.w)); x++) blocked[(y - top) * width + x - left] = deny ? 1 : 0;
        }
        const start = iy * width + ix;
        if (blocked[start]) throw Error("目标房间已锁定、隐藏或超出编辑范围。");
        const target = pixels[start], mask = new Uint8Array(size), queue = new Int32Array(size);
        let head = 0, tail = 0;
        queue[tail++] = start;
        mask[start] = 1;
        const tunnels = new Map;
        if (options.crossRooms !== false) {
            const seed = port => {
                const rm = r.rooms.find(rm => rm.id === port.roomId);
                if (port.layer !== lid || !rm || rm.locked || rm.visible === false || port.kind === "den") return -1;
                let best = -1, dist = Infinity;
                for (let y = Math.max(top, Math.floor(port.y) - 2); y < Math.min(top + height, Math.floor(port.y) + 3); y++) for (let x = Math.max(left, Math.floor(port.x) - 2); x < Math.min(left + width, Math.floor(port.x) + 3); x++) {
                    const i = (y - top) * width + x - left, d = Math.hypot(x + .5 - port.x, y + .5 - port.y);
                    if (inside({
                        x: x + .5,
                        y: y + .5
                    }, rm) && !blocked[i] && pixels[i] === target && d < dist) {
                        dist = d;
                        best = i;
                    }
                }
                return best;
            };
            for (const link of r.links) {
                const a = r.ports.find(p => p.id === link.a), b = r.ports.find(p => p.id === link.b);
                if (!a || !b) continue;
                const ai = seed(a), bi = seed(b);
                if (ai < 0 || bi < 0) continue;
                for (const [i, j] of [ [ ai, bi ], [ bi, ai ] ]) {
                    if (!tunnels.has(i)) tunnels.set(i, []);
                    tunnels.get(i).push(j);
                }
            }
        }
        while (head < tail) {
            const i = queue[head++], x = i % width, y = Math.floor(i / width);
            for (const j of [ x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1, ...tunnels.get(i) || [] ]) if (j >= 0 && !mask[j] && !blocked[j] && pixels[j] === target) {
                mask[j] = 1;
                queue[tail++] = j;
            }
        }
        const expansion = Math.max(-4, Math.min(4, Math.round(options.expansion || 0)));
        for (let n = 0; n < Math.abs(expansion); n++) {
            const before = mask.slice();
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const i = y * width + x;
                if (blocked[i]) continue;
                const near = [ x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1 ];
                if (expansion > 0 && near.some(j => j >= 0 && before[j])) mask[i] = 1; else if (expansion < 0 && before[i] && near.some(j => j < 0 || !before[j])) mask[i] = 0;
            }
        }
        const additions = [];
        let count = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; ) {
            if (!mask[y * width + x]) {
                x++;
                continue;
            }
            const begin = x;
            while (x < width && mask[y * width + x]) {
                count++;
                x++;
            }
            const base = {
                type: "rect",
                x: left + begin,
                y: top + y,
                w: x - begin,
                h: 1,
                layer: lid,
                roomId: options.decoration ? owner.id : null,
                decoration: options.decoration || 0,
                depth: options.depth || 0
            };
            additions.push({
                ...base,
                id: uid(),
                material: "air",
                erase: true,
                eraseAll: true
            });
            if (mat !== "air") additions.push({
                ...base,
                id: uid(),
                material: mat
            });
        }
        if (!count) return 0;
        const cats = new Set(additions.map(s => s.material === "water" ? "water" : s.material === "draft" ? "draft" : "geometry"));
        for (const k of [ "draft", "geometry", "water" ]) if (!options.decoration && r.categories[k].locked && r.shapes.some(s => !s.decoration && s.layer === lid && (s.material === "draft" ? "draft" : s.material === "water" ? "water" : "geometry") === k && intersection(bounds(s), boundsBox))) throw Error(categoryName(k) + "已锁定，请先解锁再替换。");
        if (r.shapes.length + additions.length > 3e4) throw Error("填充产生的轮廓超过上限，请缩小范围。");
        r.shapes.push(...additions);
        for (const rm of r.rooms.filter(rm => rm.layer === lid)) cutShapes(r, rm);
        for (const k of cats) r.categories[k].visible = true;
        return count;
    }
    function selectContents(r, lid, box, roomId = null) {
        if (!box) return [];
        return [ "shapes", "markers", "ports", "refs" ].flatMap(list => r[list].filter(o => o.layer === lid && (!roomId || o.roomId === roomId) && roomVisible(r, o) && !o.locked && (list === "shapes" ? !!intersection(bounds(o), box) : inside(o, box))).map(o => ({
            list: list,
            id: o.id
        })));
    }
    function isolateSelection(r, lid, box, roomId = null) {
        const refs = selectContents(r, lid, box, roomId), result = [];
        for (const ref of refs) {
            const o = r[ref.list].find(o => o.id === ref.id), reason = lockReason(r, o, ref.list === "shapes" ? o.material === "draft" ? "draft" : o.material === "water" ? "water" : "geometry" : ref.list === "markers" ? o.kind : ref.list);
            if (reason) continue;
            if (ref.list !== "shapes") {
                result.push(ref);
                continue;
            }
            const b = bounds(o), clip = intersection(b, box);
            if (!clip) continue;
            const fragments = subtract(b, box).map(part => ({
                ...clone(o),
                id: uid(),
                clip: part
            }));
            o.clip = clip;
            r.shapes.push(...fragments);
            result.push(ref);
        }
        if (r.shapes.length > 3e4) throw Error("选区产生的轮廓超过上限。");
        return result;
    }
    function selectionBounds(r, refs) {
        const bs = refs.map(ref => r[ref.list]?.find(o => o.id === ref.id)).filter(Boolean).map(o => o.points || o.w !== undefined ? bounds(o) : {
            x: o.x,
            y: o.y,
            w: 0,
            h: 0
        });
        if (!bs.length) return null;
        const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
        return {
            x: x,
            y: y,
            w: Math.max(...bs.map(b => b.x + b.w)) - x,
            h: Math.max(...bs.map(b => b.y + b.h)) - y
        };
    }
    function transformSelection(r, refs, {dx: dx = 0, dy: dy = 0, flipX: flipX = false, flipY: flipY = false, crossRooms: crossRooms = true} = {}) {
        const box = selectionBounds(r, refs);
        if (!box) return;
        const updates = [];
        for (const ref of refs) {
            const o = r[ref.list]?.find(o => o.id === ref.id);
            if (!o) continue;
            const reason = lockReason(r, o, ref.list === "shapes" ? o.material === "draft" ? "draft" : o.material === "water" ? "water" : "geometry" : ref.list === "markers" ? o.kind : ref.list);
            if (reason) throw Error(reason);
            const next = clone(o), point = p => ({
                x: (flipX ? box.x * 2 + box.w - p.x : p.x) + dx,
                y: (flipY ? box.y * 2 + box.h - p.y : p.y) + dy
            });
            if (next.points) next.points = next.points.map(point); else {
                const p = point({
                    x: next.x + (flipX ? next.w || 0 : 0),
                    y: next.y + (flipY ? next.h || 0 : 0)
                });
                next.x = p.x;
                next.y = p.y;
            }
            if (next.clip) {
                const p = point({
                    x: next.clip.x + (flipX ? next.clip.w : 0),
                    y: next.clip.y + (flipY ? next.clip.h : 0)
                });
                next.clip = {
                    ...next.clip,
                    ...p
                };
            }
            if (flipX) {
                next.facing = {
                    left: "right",
                    right: "left"
                }[next.facing] || next.facing;
                next.material = {
                    slopeRU: "slopeLU",
                    slopeLU: "slopeRU",
                    slopeRD: "slopeLD",
                    slopeLD: "slopeRD"
                }[next.material] || next.material;
            }
            if (flipY) {
                next.facing = {
                    up: "down",
                    down: "up"
                }[next.facing] || next.facing;
                next.material = {
                    slopeRU: "slopeRD",
                    slopeRD: "slopeRU",
                    slopeLU: "slopeLD",
                    slopeLD: "slopeLU"
                }[next.material] || next.material;
            }
            if (ref.list === "refs") {
                if (flipX) {
                    next.flipX = !next.flipX;
                    next.angle = -(next.angle || 0);
                }
                if (flipY) {
                    next.flipY = !next.flipY;
                    next.angle = -(next.angle || 0);
                }
            }
            if (next.rawCell && (flipX || flipY)) {
                if (flipX) next.rawCell[0] = {
                    2: 3,
                    3: 2,
                    4: 5,
                    5: 4
                }[next.rawCell[0]] ?? next.rawCell[0];
                if (flipY) next.rawCell[0] = {
                    2: 4,
                    4: 2,
                    3: 5,
                    5: 3
                }[next.rawCell[0]] ?? next.rawCell[0];
            }
            if (!next.facing) delete next.facing;
            if (!next.material) delete next.material;
            const b = ref.list === "shapes" || ref.list === "refs" ? bounds(next) : {
                x: next.x,
                y: next.y,
                w: 0,
                h: 0
            }, owner = r.rooms.find(rm => rm.id === o.roomId), limits = !crossRooms && owner ? owner : {
                x: 0,
                y: 0,
                w: r.w,
                h: r.h
            };
            if (b.x < limits.x || b.y < limits.y || b.x + b.w > limits.x + limits.w || b.y + b.h > limits.y + limits.h) throw Error("选区超出编辑范围。");
            if (r.rooms.some(rm => rm.layer === o.layer && rm.locked && (b.w && b.h ? intersection(rm, b) : inside(b, rm)))) throw Error("选区经过锁定的房间。");
            if (crossRooms) {
                const center = {
                    x: b.x + b.w / 2,
                    y: b.y + b.h / 2
                };
                next.roomId = r.rooms.find(rm => rm.layer === o.layer && inside(center, rm) && b.x >= rm.x && b.y >= rm.y && b.x + b.w <= rm.x + rm.w && b.y + b.h <= rm.y + rm.h)?.id || null;
            }
            updates.push([ o, next ]);
        }
        for (const [o, next] of updates) Object.assign(o, next);
        return refs;
    }
    function copySelection(r, refs, target) {
        const l = r.layers.find(l => l.id === target);
        if (!l || l.locked || isDedicatedLayer(l)) throw Error("请选择未锁定的普通空间层。");
        const result = [], idMap = new Map;
        for (const ref of refs) {
            const o = r[ref.list]?.find(o => o.id === ref.id);
            if (!o) continue;
            const next = {
                ...clone(o),
                id: uid(),
                layer: target,
                locked: false,
                roomId: null
            }, b = next.points || next.w !== undefined ? bounds(next) : {
                x: next.x,
                y: next.y,
                w: 0,
                h: 0
            };
            const rm = r.rooms.find(rm => rm.layer === target && b.x >= rm.x && b.y >= rm.y && b.x + b.w <= rm.x + rm.w && b.y + b.h <= rm.y + rm.h);
            if (rm?.locked) throw Error("目标房间已锁定。");
            next.roomId = rm?.id || null;
            r[ref.list].push(next);
            idMap.set(o.id, next.id);
            result.push({
                list: ref.list,
                id: next.id
            });
        }
        for (const link of [ ...r.links ]) if (idMap.has(link.a) && idMap.has(link.b)) r.links.push({
            ...clone(link),
            id: uid(),
            a: idMap.get(link.a),
            b: idMap.get(link.b)
        });
        if (r.shapes.length > 3e4) throw Error("复制后轮廓超过上限。");
        return result;
    }
    function exactRegionRecords(docs, r) {
        return exactRecords(docs, "region", [ r.name, r.english ]);
    }
    function makeAreaRecord(name, english, profile) {
        return {
            id: uid(),
            title: name,
            kind: "text",
            category: "区域",
            content: "",
            sourcePath: "",
            logicalPath: "",
            archived: false,
            details: {
                synopsis: "",
                tags: [],
                characterTags: [],
                english: english,
                regionProfiles: profile ? [ clone(profile) ] : []
            }
        };
    }
    function parseRainedRoom(text) {
        text = String(text).replace(/^\uFEFF/, "");
        if (text.length > 40 * 1024 * 1024) throw Error("房间文件超过 40 MB。");
        const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
        if (lines.length < 6) throw Error("请选择 Rained 的房间工程 TXT。");
        let geometry;
        try {
            geometry = JSON.parse(lines[0]);
        } catch {
            throw Error("房间几何数据无法读取。");
        }
        const size = /#size\s*:\s*point\(\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(lines[5] || ""), width = +(size?.[1] || geometry?.length), height = +(size?.[2] || geometry?.[0]?.length);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 3e5 || !Array.isArray(geometry) || geometry.length !== width) throw Error("房间尺寸无效或超过 30 万格。");
        for (const column of geometry) {
            if (!Array.isArray(column) || column.length !== height) throw Error("几何尺寸与房间尺寸不一致。");
            for (const cell of column) {
                if (!Array.isArray(cell) || cell.length !== 3) throw Error("需要三个几何深度。");
                for (const layer of cell) if (!Array.isArray(layer) || layer.length !== 2 || !Number.isInteger(layer[0]) || layer[0] < 0 || layer[0] > 9 || !Array.isArray(layer[1]) || layer[1].some(v => !Number.isInteger(v) || v < 1 || v > 32)) throw Error("包含无效几何单元。");
            }
        }
        const cameraPart = /#cameras\s*:\s*\[([^\]]*)\]/i.exec(lines[6] || "")?.[1] || "", camerasOut = [ ...cameraPart.matchAll(/point\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g) ].map(m => ({
            id: uid(),
            x: +m[1] / 20,
            y: +m[2] / 20
        }));
        if (camerasOut.some(c => !Number.isFinite(c.x) || !Number.isFinite(c.y) || c.x < 0 || c.y < 0 || c.x > width || c.y > height)) throw Error("镜头位置超出房间范围。");
        const water = Number(/#waterLevel\s*:\s*(-?\d+)/i.exec(lines[7] || "")?.[1] ?? -1);
        return {
            w: width,
            h: height,
            geometry: geometry,
            cameras: camerasOut.length ? camerasOut : cameras(width, height),
            water: Math.max(-1, Math.min(height, water)),
            source: lines.join("\r")
        };
    }
    function replaceRoomFromRained(w, r, id, data) {
        const rm = r.rooms.find(o => o.id === id);
        if (!rm) throw Error("请选择要覆盖的房间。");
        const reason = lockReason(r, rm, "rooms");
        if (reason) throw Error(reason);
        const old = clone(rm), before = clone(r), originals = new Map(r.rooms.map(o => [ o.id, clone(o) ]));
        rm.w = data.w;
        rm.h = data.h;
        const peers = r.rooms.filter(o => o.layer === rm.layer), moved = new Set;
        for (let pass = 0; pass < peers.length * peers.length + 10; pass++) {
            let collision = null;
            for (let i = 0; i < peers.length && !collision; i++) for (let j = i + 1; j < peers.length; j++) if (intersection(peers[i], peers[j])) {
                collision = [ peers[i], peers[j] ];
                break;
            }
            if (!collision) break;
            let [a, b] = collision;
            if (b.id === id || b.locked) [a, b] = [ b, a ];
            if (b.id === id || b.locked) throw Error("邻近房间已锁定，无法让开覆盖范围。");
            const options = [ {
                dx: a.x + a.w - b.x,
                dy: 0
            }, {
                dx: a.x - b.w - b.x,
                dy: 0
            }, {
                dx: 0,
                dy: a.y + a.h - b.y
            }, {
                dx: 0,
                dy: a.y - b.h - b.y
            } ].sort((p, q) => Math.abs(p.dx) + Math.abs(p.dy) - Math.abs(q.dx) - Math.abs(q.dy));
            const oa = originals.get(a.id), ob = originals.get(b.id), preferred = oa.x + oa.w <= ob.x ? options.find(p => p.dx > 0) : ob.x + ob.w <= oa.x ? options.find(p => p.dx < 0) : oa.y + oa.h <= ob.y ? options.find(p => p.dy > 0) : ob.y + ob.h <= oa.y ? options.find(p => p.dy < 0) : null;
            const direction = preferred || options.find(p => b.x + p.dx >= 0 && b.y + p.dy >= 0) || options[0];
            b.x += direction.dx;
            b.y += direction.dy;
            moved.add(b.id);
            if (pass === peers.length * peers.length + 9) throw Error("邻近房间过于密集，请先移动部分房间。");
        }
        for (const o of peers) {
            const original = originals.get(o.id), dx = o.x - original.x, dy = o.y - original.y;
            if (dx || dy) for (const key of [ "shapes", "markers", "ports", "refs" ]) for (const item of r[key]) if (item.roomId === o.id) shift(item, dx, dy);
        }
        const minX = Math.min(0, ...r.rooms.map(o => o.x)), minY = Math.min(0, ...r.rooms.map(o => o.y)), maxX = Math.max(r.w, ...r.rooms.map(o => o.x + o.w)), maxY = Math.max(r.h, ...r.rooms.map(o => o.y + o.h));
        if (maxX - minX > 4096 || maxY - minY > 4096) throw Error("导入后超出 4096 格区域上限。");
        if (minX || minY) {
            for (const key of [ "rooms", "shapes", "markers", "ports", "refs" ]) for (const item of r[key]) shift(item, -minX, -minY);
            for (const sc of w.scenes) if (sc.placements[r.id]) {
                sc.placements[r.id].x += minX;
                sc.placements[r.id].y += minY;
            }
        }
        r.w = maxX - minX;
        r.h = maxY - minY;
        r.shapes = r.shapes.filter(s => s.roomId !== id);
        Object.assign(rm, {
            cameras: clone(data.cameras),
            water: data.water,
            rainedSource: data.source,
            rainedSize: {
                w: data.w,
                h: data.h
            }
        });
        const types = {
            1: "solid",
            2: "slopeRU",
            3: "slopeLU",
            4: "slopeRD",
            5: "slopeLD",
            6: "platform",
            9: "solid"
        }, add = (x, y, len, depth, cell, material) => r.shapes.push({
            id: uid(),
            type: "rect",
            x: rm.x + x,
            y: rm.y + y,
            w: len,
            h: 1,
            layer: rm.layer,
            roomId: id,
            depth: depth,
            material: material,
            rawCell: clone(cell)
        });
        for (let d = 0; d < 3; d++) for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; ) {
            const cell = data.geometry[x][y][d], key = JSON.stringify(cell), start = x;
            while (x < data.w && JSON.stringify(data.geometry[x][y][d]) === key) x++;
            if (!cell[0] && !cell[1].length) continue;
            add(start, y, x - start, d, cell, types[cell[0]] || cell[1].includes(1) ? types[cell[0]] || "beamH" : cell[1].includes(2) ? "beamV" : "air");
            if (cell[1].includes(1) && cell[1].includes(2)) add(start, y, x - start, d, cell, "beamV");
        }
        for (const o of [ ...r.markers, ...r.ports, ...r.refs ]) if (o.roomId === id && !isRoomMarker(o)) {
            o.x = Math.max(rm.x, Math.min(rm.x + rm.w - (o.w || .5), o.x));
            o.y = Math.max(rm.y, Math.min(rm.y + rm.h - (o.h || .5), o.y));
        }
        for (let x = 0; x < data.w; x++) for (let y = 0; y < data.h; y++) {
            const [geo, flags] = data.geometry[x][y][0], kind = flags.includes(7) ? "den" : flags.includes(21) ? "scavenger" : geo === 7 ? "exit" : null;
            if (kind && !r.ports.some(p => p.roomId === id && p.x === rm.x + x + .5 && p.y === rm.y + y + .5 && p.kind === kind)) r.ports.push({
                id: uid(),
                x: rm.x + x + .5,
                y: rm.y + y + .5,
                layer: rm.layer,
                roomId: id,
                kind: kind,
                name: portKinds[kind],
                facing: "auto"
            });
        }
        if (r.shapes.length > 3e4) throw Error("导入后的轮廓超过上限。");
        return {
            room: rm,
            moved: [ ...moved ],
            expanded: r.w !== before.w || r.h !== before.h,
            oldSize: {
                w: old.w,
                h: old.h
            }
        };
    }
    function compactPreviewRegion(source) {
        return clone(source);
    }
    return {
        recordKind: recordKind,
        exactRecords: exactRecords,
        searchRecords: searchRecords,
        paintLayerNames: paintLayerNames,
        roomPaintLayers: roomPaintLayers,
        paintLayerVisible: paintLayerVisible,
        compactPreviewRegion: compactPreviewRegion,
        parseRainedRoom: parseRainedRoom,
        replaceRoomFromRained: replaceRoomFromRained,
        exactRegionRecords: exactRegionRecords,
        makeAreaRecord: makeAreaRecord,
        selectContents: selectContents,
        isolateSelection: isolateSelection,
        selectionBounds: selectionBounds,
        transformSelection: transformSelection,
        copySelection: copySelection,
        mergeLayers: mergeLayers,
        roomFrameMergePlan: roomFrameMergePlan,
        mergeRoomFrame: mergeRoomFrame,
        fillRegion: fillRegion,
        isDedicatedLayer: isDedicatedLayer,
        isRoomMarker: isRoomMarker,
        gateLayer: gateLayer,
        ensureGateLayer: ensureGateLayer,
        ensureGateRoom: ensureGateRoom,
        organizeGates: organizeGates,
        gateIcon: gateIcon,
        renameGateMarker: renameGateMarker,
        saveGateConnection: saveGateConnection,
        exportWorkspace: exportWorkspace,
        rainedExportFiles: rainedExportFiles,
        regionLabelColor: regionLabelColor,
        regionRecordMatches: regionRecordMatches,
        portDirections: portDirections,
        portPose: portPose,
        shelterLayer: shelterLayer,
        ensureShelterLayer: ensureShelterLayer,
        organizeShelters: organizeShelters,
        transferRoomLayer: transferRoomLayer,
        snapTargets: snapTargets,
        snapBox: snapBox,
        iteratorRoomFrame: iteratorRoomFrame,
        categoryName: categoryName,
        lockReason: lockReason,
        unlockRegion: unlockRegion,
        opacity: opacity,
        objectOpacity: objectOpacity,
        roomCopyPosition: roomCopyPosition,
        duplicateRoom: duplicateRoom,
        setRoomKind: setRoomKind,
        roomTypeManifest: roomTypeManifest,
        nextLayerName: nextLayerName,
        addLayer: addLayer,
        duplicateLayer: duplicateLayer,
        regionContentBounds: regionContentBounds,
        regionResizeBox: regionResizeBox,
        resizeRegion: resizeRegion,
        symmetryFor: symmetryFor,
        setSymmetryCenter: setSymmetryCenter,
        resetSymmetryCenter: resetSymmetryCenter,
        partitionRoom: partitionRoom,
        regionInitials: regionInitials,
        setRegionCode: setRegionCode,
        roomHandles: roomHandles,
        roomHandlePoints: roomHandlePoints,
        hitRoomHandle: hitRoomHandle,
        roomResizeBox: roomResizeBox,
        resizeRoom: resizeRoom,
        exportDependencies: exportDependencies,
        nextRoomName: nextRoomName,
        renameRoom: renameRoom,
        setRoomType: setRoomType,
        roomVisible: roomVisible,
        roomLocked: roomLocked,
        docsOfKind: docsOfKind,
        bindRecord: bindRecord,
        makeRegionRecord: makeRegionRecord,
        uid: uid,
        clone: clone,
        workspace: workspace,
        region: region,
        rect: rect,
        inside: inside,
        intersection: intersection,
        bounds: bounds,
        subtract: subtract,
        cutShapes: cutShapes,
        cameras: cameras,
        addRoom: addRoom,
        shift: shift,
        moveRoom: moveRoom,
        splitRoom: splitRoom,
        mergeRooms: mergeRooms,
        forkRegion: forkRegion,
        mirrored: mirrored,
        hitShape: hitShape,
        raster: raster,
        rainedText: rainedText,
        check: check,
        validate: validate,
        categories: categories,
        materials: materials,
        portKinds: portKinds
    };
});
