(function(root, factory) {
    const api = factory(typeof module === "object" ? require("./region-core") : root.OCMapCore);
    if (typeof module === "object") module.exports = api; else root.OCMapExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(C) {
    "use strict";
    const fontFamily = settings => settings?.mapFont === "narrow" ? "'Map Narrow','Fusion Pixel',sans-serif" : "'Fusion Pixel',monospace";
    function gateNotes(w, sid, rid) {
        const r = w.regions.find(r => r.id === rid);
        if (!r) return [];
        const result = [];
        for (const g of w.gates) {
            if (!g.scenes.includes(sid)) continue;
            const key = g.a.region === rid ? "a" : g.b.region === rid ? "b" : null;
            if (!key) continue;
            const from = g[key], to = g[key === "a" ? "b" : "a"], target = w.regions.find(r => r.id === to.region), m = r.markers.find(m => m.id === from.marker);
            if (!m || !target || !C.roomVisible(r, m) || r.layers.find(l => l.id === m.layer)?.visible === false || m.sceneIds?.length && !m.sceneIds.includes(sid)) continue;
            result.push({
                id: g.id,
                marker: m.id,
                x: m.x,
                y: m.y,
                from: from.karma,
                to: to.karma,
                color: r.labelColor || "#ffffff",
                targetColor: target.labelColor || "#ffffff",
                target: target.english || target.name,
                name: target.name
            });
        }
        return result;
    }
    function coloredPearl(m, docs = []) {
        if (m.kind !== "pearl") return false;
        if (m.recordMode === "plain") return false;
        const doc = docs.find(d => d.id === m.docId), color = doc?.details?.appearance?.baseColor || m.appearance?.baseColor || m.color || "#cccccc";
        return !!m.docId || m.recordMode === "colored" || ![ "#cccccc", "#ffffff", "#d2d7d3" ].includes(color.toLowerCase());
    }
    function prepare(w, sid, ids, mode, docs = [], options = {}) {
        const snapshot = C.exportWorkspace(w, sid, ids);
        snapshot.pngGateNotes = mode === "current" && options.gates !== false ? gateNotes(w, sid, ids[0]) : [];
        for (const r of snapshot.regions) {
            for (const m of r.markers) {
                const pearl = coloredPearl(m, docs);
                m.pngHidden = options.pearls === false && pearl || options.tokens === false && m.kind === "token";
                m.pngVisible = options.pearls !== false && pearl || options.tokens !== false && m.kind === "token";
            }
            if (mode === "current" && snapshot.pngGateNotes.length) r.categories.gate.visible = true;
        }
        return snapshot;
    }
    function layout(notes, r, z, measure, font = fontFamily()) {
        const columns = {
            left: [],
            right: []
        };
        for (const note of notes) columns[note.x < r.w / 2 ? "left" : "right"].push(note);
        const rows = [], maxWidth = 420;
        let pad = 80;
        measure.font = "18px " + font;
        for (const [side, list] of Object.entries(columns)) {
            list.sort((a, b) => a.y - b.y);
            let end = -60;
            for (const n of list) {
                const words = ("TO " + n.target.toUpperCase()).split(/\s+/), lines = [];
                let line = "";
                for (const word of words) {
                    const candidate = line ? line + " " + word : word;
                    if (measure.measureText(candidate).width > maxWidth && line) {
                        lines.push(line);
                        line = word;
                    } else line = candidate;
                }
                if (line) lines.push(line);
                const width = Math.max(112, ...lines.map(t => Math.min(maxWidth, measure.measureText(t).width))), height = 85 + lines.length * 23, y = Math.max(n.y * z - height / 2, end + 18), x = side === "left" ? -width - 28 : r.w * z + 28;
                rows.push({
                    ...n,
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    lines: lines,
                    side: side,
                    anchor: {
                        x: n.x * z,
                        y: n.y * z
                    }
                });
                end = y + height;
                pad = Math.max(pad, width + 48);
            }
        }
        return {
            rows: rows,
            pad: pad,
            font: font,
            extraBottom: Math.max(0, ...rows.map(row => row.y + row.height - r.h * z))
        };
    }
    const karmaSource = k => "rainworld-icons/" + (k === "locked" ? "gate-locked" : "karma-" + k) + ".png";
    function paint(c, notes, getImage) {
        const arrow = (x, y, color, right) => {
            c.fillStyle = color;
            c.beginPath();
            c.moveTo(x + (right ? 0 : 16), y + 4);
            c.lineTo(x + (right ? 10 : 6), y + 4);
            c.lineTo(x + (right ? 10 : 6), y);
            c.lineTo(x + (right ? 17 : -1), y + 7);
            c.lineTo(x + (right ? 10 : 6), y + 14);
            c.lineTo(x + (right ? 10 : 6), y + 10);
            c.lineTo(x + (right ? 0 : 16), y + 10);
            c.closePath();
            c.fill();
        };
        for (const n of notes.rows) {
            c.save();
            const near = n.side === "left" ? n.x + n.width : n.x;
            c.strokeStyle = "#777777";
            c.lineWidth = 1;
            c.setLineDash([ 4, 4 ]);
            c.beginPath();
            c.moveTo(n.anchor.x, n.anchor.y);
            c.lineTo(near, n.y + 48);
            c.stroke();
            c.setLineDash([]);
            const x = n.x, y = n.y;
            arrow(x + 14, y, n.targetColor, true);
            arrow(x + 72, y, n.color, false);
            c.fillStyle = "#ffffff";
            c.fillRect(x + 53, y + 1, 3, 62);
            for (const [k, at] of [ [ n.to, x ], [ n.from, x + 60 ] ]) {
                const img = getImage(karmaSource(k));
                if (!img || !(img.naturalWidth || img.width)) continue;
                const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.min(44 / iw, 44 / ih);
                c.imageSmoothingEnabled = false;
                c.drawImage(img, at + (44 - iw * s) / 2, y + 21, iw * s, ih * s);
            }
            c.font = "18px " + (notes.font || fontFamily());
            for (let i = 0; i < n.lines.length; i++) {
                const line = n.lines[i], baseline = y + 89 + i * 23;
                if (i === 0 && line.startsWith("TO ")) {
                    c.fillStyle = "#ffffff";
                    c.fillText("TO ", x, baseline);
                    c.fillStyle = n.targetColor;
                    c.fillText(line.slice(3), x + c.measureText("TO ").width, baseline, Math.max(1, n.width - c.measureText("TO ").width));
                } else {
                    c.fillStyle = n.targetColor;
                    c.fillText(line, x, baseline, n.width);
                }
            }
            c.restore();
        }
    }
    return {
        fontFamily: fontFamily,
        gateNotes: gateNotes,
        coloredPearl: coloredPearl,
        prepare: prepare,
        layout: layout,
        paint: paint,
        karmaSource: karmaSource
    };
});
