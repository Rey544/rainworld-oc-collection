(function(root, factory) {
    const api = factory(typeof module === "object" ? require("./region-core") : root.OCMapCore);
    if (typeof module === "object") module.exports = api; else root.OCMapRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(C) {
    "use strict";
    const ink = "#000000", air = "#ffffff";
    const hintColors = Object.fromEntries(Object.keys(C.materials).map(k => [ k, "#ffff00" ]));
    const category = s => s.material === "water" ? "water" : s.material === "draft" ? "draft" : "geometry";
    function path(c, s) {
        c.beginPath();
        if (s.points) {
            c.moveTo(s.points[0].x, s.points[0].y);
            for (const p of s.points.slice(1)) c.lineTo(p.x, p.y);
            if (s.type === "polygon") c.closePath();
        } else if (s.type === "ellipse") c.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); else c.rect(s.x, s.y, s.w, s.h);
    }
    function clipShape(c, r, s) {
        if (s.roomId) {
            const rm = r.rooms.find(v => v.id === s.roomId);
            if (rm) {
                c.beginPath();
                c.rect(rm.x, rm.y, rm.w, rm.h);
                c.clip();
            }
        }
        if (s.clip) {
            c.beginPath();
            c.rect(s.clip.x, s.clip.y, s.clip.w, s.clip.h);
            c.clip();
        }
    }
    function beams(c, r, s) {
        let b = C.intersection(C.bounds(s), {
            x: 0,
            y: 0,
            w: r.w,
            h: r.h
        });
        if (s.roomId) {
            const rm = r.rooms.find(o => o.id === s.roomId);
            if (rm && b) b = C.intersection(b, rm);
        }
        if (s.type === "rect" && !s.points && b) b = C.intersection(b, s);
        if (!b) return;
        const left = Math.ceil(b.x - .5), top = Math.ceil(b.y - .5), right = Math.ceil(b.x + b.w - .5), bottom = Math.ceil(b.y + b.h - .5), horizontal = s.material === "beamH";
        c.beginPath();
        if (s.type === "rect" && !s.points) {
            if (horizontal) {
                for (let y = top; y < bottom; y++) c.rect(left, y + .4, right - left, .2);
            } else for (let x = left; x < right; x++) c.rect(x + .4, top, .2, bottom - top);
        } else for (let x = left; x < right; x++) for (let y = top; y < bottom; y++) if (C.hitShape(s, {
            x: x + .5,
            y: y + .5
        })) {
            if (horizontal) c.rect(x, y + .4, 1, .2); else c.rect(x + .4, y, .2, 1);
        }
        c.fill();
    }
    function shape(c, r, s, {hint: hint = false} = {}) {
        c.save();
        const mat = s.material, isBeam = !s.erase && (mat === "beamH" || mat === "beamV");
        clipShape(c, r, isBeam ? {
            ...s,
            clip: null
        } : s);
        c.fillStyle = hint ? hintColors[mat] || "#888888" : ink;
        c.strokeStyle = c.fillStyle;
        c.lineWidth = s.width || 1;
        c.lineCap = "butt";
        c.lineJoin = "miter";
        if (hint) c.globalAlpha = .65;
        if (isBeam) {
            beams(c, r, s);
            c.restore();
            return;
        }
        if (s.erase || mat === "air" || mat === "crawl") {
            c.globalCompositeOperation = hint ? "source-over" : "destination-out";
            if (!hint) c.globalAlpha = 1;
        }
        path(c, s);
        if (mat.startsWith("slope") && !s.erase && !hint) {
            const b = C.intersection(C.bounds(s), {
                x: 0,
                y: 0,
                w: r.w,
                h: r.h
            });
            if (b && b.w * b.h < 3e5) {
                for (let x = Math.floor(b.x); x < b.x + b.w; x++) for (let y = Math.floor(b.y); y < b.y + b.h; y++) {
                    if (!C.hitShape(s, {
                        x: x + .5,
                        y: y + .5
                    })) continue;
                    const v = {
                        slopeRU: [ [ 0, 1 ], [ 1, 0 ], [ 1, 1 ] ],
                        slopeLU: [ [ 0, 0 ], [ 0, 1 ], [ 1, 1 ] ],
                        slopeRD: [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ] ],
                        slopeLD: [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ] ]
                    }[mat];
                    c.beginPath();
                    c.moveTo(x + v[0][0], y + v[0][1]);
                    for (const p of v.slice(1)) c.lineTo(x + p[0], y + p[1]);
                    c.closePath();
                    c.fill();
                }
            }
        } else if (s.points && s.type !== "polygon") c.stroke(); else c.fill();
        c.restore();
    }
    function water(c, r, s, z) {
        c.save();
        clipShape(c, r, s);
        path(c, s);
        if (s.points && s.type !== "polygon") {
            c.strokeStyle = ink;
            c.lineWidth = Math.min(s.width || 1, 1);
            c.stroke();
        } else {
            c.clip();
            const b = C.bounds(s);
            c.strokeStyle = ink;
            c.lineWidth = Math.max(.2, .7 / z);
            c.beginPath();
            for (let y = Math.ceil(b.y); y < b.y + b.h; y += 3) {
                c.moveTo(b.x, y);
                c.lineTo(b.x + b.w, y);
            }
            c.stroke();
        }
        c.restore();
    }
    function create(createCanvas) {
        const buffer = createCanvas(1, 1), composite = createCanvas(1, 1);
        return function paint(c, r, z, {workSurface: workSurface = false, beforeTerrain: beforeTerrain = null, activeShape: activeShape = null, activeShapes: activeShapes = null, backgrounds: backgrounds = z >= 2} = {}) {
            c.save();
            c.beginPath();
            c.rect(0, 0, r.w, r.h);
            c.clip();
            c.imageSmoothingEnabled = false;
            const budgetScale = Math.sqrt(2e6 / (r.w * r.h)), scale = Math.max(.05, Math.min(10, Math.max(1, Math.ceil(z)), budgetScale >= 1 ? Math.floor(budgetScale) : budgetScale));
            buffer.width = composite.width = r.w * scale;
            buffer.height = composite.height = r.h * scale;
            const bc = buffer.getContext("2d"), cc = composite.getContext("2d");
            for (const l of r.layers) {
                if (!l.visible) continue;
                cc.setTransform(1, 0, 0, 1, 0, 0);
                cc.clearRect(0, 0, composite.width, composite.height);
                cc.scale(scale, scale);
                cc.imageSmoothingEnabled = false;
                for (const rm of r.rooms) if (rm.layer === l.id && C.roomVisible(r, rm)) {
                    cc.fillStyle = rm.background || air;
                    cc.fillRect(rm.x, rm.y, rm.w, rm.h);
                }
                if (beforeTerrain) beforeTerrain(cc, l.id);
                if (backgrounds) for (const level of [ 2, 1 ]) for (const rm of r.rooms) {
                    if (rm.layer !== l.id || !C.roomVisible(r, rm) || !C.roomPaintLayers(rm)[level].visible) continue;
                    const strokes = r.shapes.filter(s => s.roomId === rm.id && s.decoration === level && s.visible !== false);
                    if (!strokes.length) continue;
                    bc.setTransform(1, 0, 0, 1, 0, 0);
                    bc.clearRect(0, 0, buffer.width, buffer.height);
                    bc.scale(scale, scale);
                    for (const s of strokes) shape(bc, r, s);
                    cc.save();
                    cc.globalAlpha = C.roomPaintLayers(rm)[level].opacity;
                    cc.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, r.w, r.h);
                    cc.restore();
                }
                for (const cat of [ "draft", "geometry" ]) {
                    if (r.categories[cat]?.visible === false) continue;
                    for (const depth of cat === "geometry" ? [ 2, 1, 0 ] : [ null ]) {
                        bc.setTransform(1, 0, 0, 1, 0, 0);
                        bc.clearRect(0, 0, buffer.width, buffer.height);
                        bc.scale(scale, scale);
                        for (const s of r.shapes) if (!s.decoration && C.paintLayerVisible(r, s) && C.roomVisible(r, s) && s.layer === l.id && (s.eraseAll || category(s) === cat && (depth === null || (s.depth || 0) === depth))) shape(bc, r, s);
                        cc.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, r.w, r.h);
                    }
                }
                if (r.categories.water?.visible !== false) {
                    bc.setTransform(1, 0, 0, 1, 0, 0);
                    bc.clearRect(0, 0, buffer.width, buffer.height);
                    bc.scale(scale, scale);
                    for (const s of r.shapes) if (!s.decoration && C.paintLayerVisible(r, s) && C.roomVisible(r, s) && s.layer === l.id && (s.material === "water" || s.eraseAll)) {
                        if (s.erase || s.eraseAll) shape(bc, r, s); else water(bc, r, s, z);
                    }
                    cc.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, r.w, r.h);
                }
                const faded = r.rooms.filter(rm => rm.layer === l.id && C.roomVisible(r, rm) && C.opacity(rm) < 1);
                if (faded.length) {
                    bc.setTransform(1, 0, 0, 1, 0, 0);
                    bc.clearRect(0, 0, buffer.width, buffer.height);
                    bc.save();
                    bc.scale(scale, scale);
                    bc.fillStyle = "#000000";
                    for (const rm of faded) {
                        bc.globalAlpha = 1 - C.opacity(rm);
                        bc.fillRect(rm.x, rm.y, rm.w, rm.h);
                    }
                    bc.restore();
                    cc.save();
                    cc.globalCompositeOperation = "destination-out";
                    cc.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, r.w, r.h);
                    cc.restore();
                }
                c.save();
                c.globalAlpha *= C.opacity(l);
                c.drawImage(composite, 0, 0, composite.width, composite.height, 0, 0, r.w, r.h);
                c.restore();
            }
            for (const stroke of activeShapes || (activeShape ? [ activeShape ] : [])) shape(c, r, stroke, {
                hint: true
            });
            c.restore();
        };
    }
    function createCached(createCanvas, {maxPixels: maxPixels = 8e6} = {}) {
        const paint = create(createCanvas), entries = new Map;
        let pixels = 0, renders = 0, hits = 0;
        const drop = key => {
            const entry = entries.get(key);
            if (entry) {
                pixels -= entry.pixels;
                entry.canvas.width = entry.canvas.height = 1;
                entries.delete(key);
            }
        };
        function cached(c, r, z, options = {}, source = r, variant = "") {
            const backgrounds = options.backgrounds ?? z >= 2, key = r.id + ":" + variant + ":" + backgrounds, desired = z < 2 ? 1 : z < 4 ? 2 : z < 10 ? 5 : 10, scale = Math.min(desired, Math.sqrt(Math.min(maxPixels, 2e6) / Math.max(1, r.w * r.h)));
            let entry = entries.get(key);
            if (!entry || entry.source !== source || Math.abs(entry.scale - scale) > .001) {
                drop(key);
                const width = Math.max(1, Math.ceil(r.w * scale)), height = Math.max(1, Math.ceil(r.h * scale)), cost = width * height;
                while (pixels + cost > maxPixels && entries.size) drop(entries.keys().next().value);
                const raster = createCanvas(width, height), rc = raster.getContext("2d");
                rc.scale(width / r.w, height / r.h);
                rc.imageSmoothingEnabled = false;
                paint(rc, r, scale, {
                    ...options,
                    backgrounds: backgrounds,
                    activeShape: null,
                    activeShapes: null
                });
                entry = {
                    source: source,
                    scale: scale,
                    canvas: raster,
                    pixels: cost
                };
                entries.set(key, entry);
                pixels += cost;
                renders++;
            } else {
                hits++;
                entries.delete(key);
                entries.set(key, entry);
            }
            c.save();
            c.imageSmoothingEnabled = false;
            c.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height, 0, 0, r.w, r.h);
            c.restore();
            for (const stroke of options.activeShapes || (options.activeShape ? [ options.activeShape ] : [])) shape(c, r, stroke, {
                hint: true
            });
        }
        cached.clear = () => {
            for (const key of [ ...entries.keys() ]) drop(key);
        };
        cached.stats = () => ({
            pixels: pixels,
            entries: entries.size,
            renders: renders,
            hits: hits
        });
        return cached;
    }
    function symbolPainter(createCanvas) {
        let masks = new WeakMap;
        const paint = (c, img, x, y, size, z) => {
            const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
            if (!iw || !ih) return;
            let mask = masks.get(img);
            if (!mask) {
                mask = createCanvas(iw, ih);
                const mc = mask.getContext("2d");
                mc.drawImage(img, 0, 0);
                mc.globalCompositeOperation = "source-in";
                mc.fillStyle = "#000000";
                mc.fillRect(0, 0, iw, ih);
                masks.set(img, mask);
            }
            const scale = Math.min(size / iw, size / ih), ww = iw * scale, hh = ih * scale, px = x - ww / 2, py = y - hh / 2, d = .65 / z;
            c.save();
            c.imageSmoothingEnabled = false;
            for (const [dx, dy] of [ [ -d, 0 ], [ d, 0 ], [ 0, -d ], [ 0, d ] ]) c.drawImage(mask, px + dx, py + dy, ww, hh);
            c.drawImage(img, px, py, ww, hh);
            c.restore();
        };
        paint.clear = () => masks = new WeakMap;
        return paint;
    }
    return {
        create: create,
        createCached: createCached,
        symbolPainter: symbolPainter,
        shape: shape,
        hintColors: hintColors,
        ink: ink,
        air: air
    };
});
