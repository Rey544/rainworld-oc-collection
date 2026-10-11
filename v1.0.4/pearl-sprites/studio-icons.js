(function(scope) {
    "use strict";
    const defaults = Object.freeze({
        baseColor: "#000000",
        highlightColor: "#b0d8f0",
        secondaryColor: "#365576",
        twoTone: false,
        size: 1,
        effect: "none",
        effectColor: "#88bbff",
        effectOpacity: .4,
        effectSize: 28,
        pulseSpeed: 1
    });
    const effects = Object.freeze([ [ "none", "无" ], [ "glow", "柔光" ], [ "pulse", "脉冲光圈" ], [ "halcyon", "赞美诗式光圈" ] ].map(Object.freeze));
    const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const bounded = (value, min, max, fallback) => Math.max(min, Math.min(max, finite(value, fallback)));
    const color = (value, fallback) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value.toLowerCase() : fallback;
    function defaultAppearance() {
        return {
            ...defaults
        };
    }
    function normalizeAppearance(value) {
        const a = value && typeof value === "object" ? value : {};
        return {
            baseColor: color(a.baseColor, defaults.baseColor),
            highlightColor: color(a.highlightColor, defaults.highlightColor),
            secondaryColor: color(a.secondaryColor, defaults.secondaryColor),
            twoTone: a.twoTone === true,
            size: bounded(a.size, .5, 3, defaults.size),
            effect: effects.some(([name]) => name === a.effect) ? a.effect : defaults.effect,
            effectColor: color(a.effectColor, defaults.effectColor),
            effectOpacity: bounded(a.effectOpacity, 0, 1, defaults.effectOpacity),
            effectSize: bounded(a.effectSize, 5, 120, defaults.effectSize),
            pulseSpeed: bounded(a.pulseSpeed, .1, 4, defaults.pulseSpeed)
        };
    }
    function context(canvas) {
        if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("需要画布。");
        return canvas.getContext("2d");
    }
    const pearlMask = Object.freeze([ "...###...", ".#######.", ".#######.", "#########", "#########", "#########", ".#######.", ".#######.", "...###..." ]);
    const pearlShade = Object.freeze([ "...222...", ".2555542.", ".5444442.", "254444432", "254444432", "234444332", ".3443331.", ".1333311.", "...111..." ]);
    const pearlPigment = Object.freeze([ "...000...", ".0000000.", ".0001100.", "000122100", "000134210", "000244210", ".0012210.", ".0001000.", "...000..." ]);
    const mapShadow = Object.freeze([ ".........", ".........", ".........", ".......#.", ".......#.", ".......#.", "......#..", "...###...", "........." ]);
    const starMask = Object.freeze([ ".#.", "###", ".#." ]);
    const channels = hex => [ 1, 3, 5 ].map(i => parseInt(hex.slice(i, i + 2), 16));
    function mix(a, b, amount) {
        return a.map((value, i) => Math.round(value + (b[i] - value) * amount));
    }
    function pearlPixels(appearance, options = {}) {
        const a = normalizeAppearance(appearance), marker = options.variant === "map", width = 11, height = 11, data = new Uint8ClampedArray(width * height * 4), base = channels(a.baseColor), secondary = channels(a.secondaryColor), highlight = channels(a.highlightColor);
        const put = (x, y, rgb) => data.set([ ...rgb, 255 ], (y * width + x) * 4);
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
            if (pearlMask[y][x] !== "#") continue;
            const weight = a.twoTone ? Number(pearlPigment[y][x]) * .25 : 0, tone = weight ? mix(base, secondary, weight) : base, shade = pearlShade[y][x];
            let rgb = shade === "1" ? mix(tone, [ 8, 11, 17 ], .62) : shade === "2" ? mix(tone, [ 170, 184, 198 ], .24) : shade === "3" ? mix(tone, [ 10, 14, 22 ], .25) : shade === "5" ? mix(tone, [ 224, 235, 247 ], .22) : tone;
            if (marker) rgb = mapShadow[y][x] === "#" ? mix(tone, [ 8, 11, 17 ], .55) : tone;
            put(x + 1, y + 1, rgb);
        }
        if (!marker) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (starMask[y][x] === "#") put(x + 3, y + 2, highlight);
        return {
            width: width,
            height: height,
            data: data
        };
    }
    function paintPixels(ctx, sprite, left, top, size) {
        for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
            const i = (y * sprite.width + x) * 4;
            if (!sprite.data[i + 3]) continue;
            ctx.fillStyle = `rgb(${sprite.data[i]},${sprite.data[i + 1]},${sprite.data[i + 2]})`;
            ctx.fillRect(left + x * size, top + y * size, size, size);
        }
    }
    function pearl(canvas, appearance, options = {}) {
        const ctx = context(canvas);
        if (!ctx) return false;
        const a = normalizeAppearance(appearance), width = canvas.width, height = canvas.height;
        if (!(width > 0 && height > 0)) return false;
        const time = finite(options?.time, 0), radius = 23 * a.size, reach = Math.max(radius + 6, a.effectSize * 1.35), extent = a.effect !== "none" && a.effectOpacity > 0 ? Math.max(radius + .65, reach + 1.3) : radius + .65;
        const scale = options?.tight === true ? Math.min(width, height) / (2 * extent + 8) : Math.min(width, height) / 160;
        const w = width / scale, h = height / scale, x = w / 2, y = h / 2 - (options?.tight === true ? 0 : 8), pulse = .5 + .5 * Math.sin(time * .002 * a.pulseSpeed);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.scale(scale, scale);
        if (a.effect !== "none") {
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, reach);
            gradient.addColorStop(0, a.effectColor);
            gradient.addColorStop(1, a.effectColor + "00");
            ctx.globalAlpha = a.effectOpacity;
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            if (a.effect === "pulse" || a.effect === "halcyon") {
                ctx.strokeStyle = a.effectColor;
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.arc(x, y, reach * (.7 + .3 * pulse), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const sprite = pearlPixels(a), pixel = Math.max(1, Math.min(Math.round(radius * 2 * scale / 9), Math.floor(Math.min(width, height) / 11))), left = Math.round(x * scale - sprite.width * pixel / 2), top = Math.round(y * scale - sprite.height * pixel / 2);
        paintPixels(ctx, sprite, left, top, pixel);
        ctx.restore();
        return true;
    }
    function pearlMarker(canvas, appearance, options = {}) {
        const ctx = context(canvas);
        if (!ctx || !(canvas.width > 0 && canvas.height > 0)) return false;
        const sprite = pearlPixels(appearance, {
            variant: "map"
        }), pixel = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 11)), left = Math.floor((canvas.width - sprite.width * pixel) / 2), top = Math.floor((canvas.height - sprite.height * pixel) / 2);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.imageSmoothingEnabled = false;
        paintPixels(ctx, sprite, left, top, pixel);
        ctx.restore();
        return true;
    }
    function broadcast(canvas, value = "#ffffff") {
        const ctx = context(canvas);
        if (!ctx) return false;
        const width = canvas.width, height = canvas.height;
        if (!(width > 0 && height > 0)) return false;
        const mask = [ "..+####+.....", ".+#....#+....", "+#..++..+....", "#..+##+......", "#.+#.........", "#.+#.##....#.", "#..+.##....#+", "+#.....#..+##", ".++.....#+###", "........+####", ".......+####+", ".....#######.", "......+###+.." ];
        const scale = Math.min(width, height) < 13 ? Math.min(width, height) / 13 : Math.floor(Math.min(width, height) / 13), ox = Math.floor((width - 13 * scale) / 2), oy = Math.floor((height - 13 * scale) / 2);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = color(value, "#ffffff");
        ctx.imageSmoothingEnabled = false;
        for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
            const pixel = mask[y][x];
            if (pixel === ".") continue;
            ctx.globalAlpha = pixel === "+" ? 115 / 255 : 1;
            ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
        ctx.restore();
        return true;
    }
    let serial = 0;
    function appearanceEditor(host, appearance, onChange) {
        if (!host?.append) throw new TypeError("需要外观编辑容器。");
        let value = normalizeAppearance(appearance), destroyed = false, frame = 0;
        const id = "oc-studio-appearance-" + ++serial, listeners = [], controls = new Map;
        const document = host.ownerDocument, win = document.defaultView || scope;
        const node = (tag, className, parent, text) => {
            const e = document.createElement(tag);
            if (className) e.className = className;
            if (text !== undefined) e.textContent = text;
            parent?.append(e);
            return e;
        };
        const listen = (target, event, fn) => {
            target.addEventListener(event, fn);
            listeners.push(() => target.removeEventListener(event, fn));
        };
        const root = node("section", "oc-studio-appearance", host);
        root.setAttribute("aria-label", "珍珠外观");
        const preview = node("canvas", "oc-studio-pearl-preview", root);
        preview.width = 300;
        preview.height = 160;
        preview.setAttribute("role", "img");
        preview.setAttribute("aria-label", "珍珠外观预览");
        const fields = node("div", "oc-studio-appearance-fields", root), dependent = [], effectFields = [], pulseFields = [];
        const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)");
        function draw(time = 0) {
            pearl(preview, value, {
                time: time
            });
        }
        function animate(time) {
            frame = 0;
            if (destroyed) return;
            draw(time);
            if ([ "pulse", "halcyon" ].includes(value.effect) && !reduced?.matches) frame = win.requestAnimationFrame(animate);
        }
        function refresh() {
            dependent.forEach(e => e.hidden = !value.twoTone);
            effectFields.forEach(e => e.hidden = value.effect === "none");
            pulseFields.forEach(e => e.hidden = ![ "pulse", "halcyon" ].includes(value.effect));
            draw();
            if (frame) {
                win.cancelAnimationFrame(frame);
                frame = 0;
            }
            if ([ "pulse", "halcyon" ].includes(value.effect) && !reduced?.matches) frame = win.requestAnimationFrame(animate);
        }
        function change(key, next) {
            if (destroyed || value[key] === next) return;
            value = {
                ...value,
                [key]: next
            };
            refresh();
            if (typeof onChange === "function") onChange({
                ...value
            });
        }
        for (const [key, title] of [ [ "baseColor", "底色 / 主色" ], [ "highlightColor", "高光" ], [ "secondaryColor", "第二种颜色" ], [ "effectColor", "特效颜色" ] ]) {
            const row = node("div", "oc-studio-color-row", fields), label = node("label", "", row, title), picker = node("input", "oc-studio-color", row), hex = node("input", "oc-studio-hex", row);
            picker.id = id + "-" + key;
            picker.type = "color";
            picker.value = value[key];
            picker.setAttribute("aria-label", title);
            label.htmlFor = picker.id;
            hex.type = "text";
            hex.value = value[key];
            hex.maxLength = 7;
            hex.spellcheck = false;
            hex.autocomplete = "off";
            hex.setAttribute("aria-label", title + " HEX");
            const set = v => {
                picker.value = hex.value = v.toLowerCase();
                hex.setCustomValidity("");
                hex.removeAttribute("aria-invalid");
                change(key, v.toLowerCase());
            };
            listen(picker, "input", () => set(picker.value));
            listen(hex, "input", () => {
                const v = hex.value.startsWith("#") ? hex.value : "#" + hex.value;
                if (/^#[a-f\d]{6}$/i.test(v)) set(v); else {
                    hex.setCustomValidity("请输入六位 Hex 颜色，如 #88bbff");
                    hex.setAttribute("aria-invalid", "true");
                }
            });
            listen(hex, "blur", () => {
                if (!hex.checkValidity()) hex.reportValidity();
            });
            controls.set(key, {
                picker: picker,
                hex: hex
            });
            if (key === "secondaryColor") dependent.push(row);
            if (key === "effectColor") effectFields.push(row);
        }
        const twoTone = node("label", "oc-studio-check-row", fields), check = node("input", "", twoTone);
        check.type = "checkbox";
        check.checked = value.twoTone;
        twoTone.append(document.createTextNode("启用双色"));
        listen(check, "change", () => change("twoTone", check.checked));
        controls.set("twoTone", check);
        const effectLabel = node("label", "oc-studio-parameter-row", fields, "特效"), effect = node("select", "", effectLabel);
        effect.setAttribute("aria-label", "特效");
        for (const [v, title] of effects) {
            const option = node("option", "", effect, title);
            option.value = v;
        }
        effect.value = value.effect;
        listen(effect, "change", () => change("effect", effect.value));
        controls.set("effect", effect);
        for (const [key, title, min, max, step] of [ [ "size", "大小", .5, 3, .05 ], [ "effectOpacity", "特效透明度", 0, 1, .01 ], [ "effectSize", "光圈范围", 5, 120, 1 ], [ "pulseSpeed", "脉冲速度", .1, 4, .1 ] ]) {
            const row = node("label", "oc-studio-range-row", fields);
            node("span", "", row, title);
            const input = node("input", "", row), output = node("output", "", row, String(value[key]));
            Object.assign(input, {
                type: "range",
                min: min,
                max: max,
                step: step,
                value: value[key]
            });
            input.setAttribute("aria-label", title);
            input.id = id + "-" + key;
            output.htmlFor = input.id;
            listen(input, "input", () => {
                output.textContent = input.value;
                change(key, Number(input.value));
            });
            controls.set(key, {
                input: input,
                output: output
            });
            if (key.startsWith("effect")) effectFields.push(row);
            if (key === "pulseSpeed") pulseFields.push(row);
        }
        if (reduced?.addEventListener) listen(reduced, "change", refresh);
        refresh();
        return Object.freeze({
            getValue: () => ({
                ...value
            }),
            destroy() {
                if (destroyed) return;
                destroyed = true;
                if (frame) win.cancelAnimationFrame(frame);
                listeners.forEach(fn => fn());
                root.remove();
            }
        });
    }
    const api = Object.freeze({
        pearl: pearl,
        pearlMarker: pearlMarker,
        pearlPixels: pearlPixels,
        broadcast: broadcast,
        appearanceEditor: appearanceEditor,
        normalizeAppearance: normalizeAppearance,
        defaultAppearance: defaultAppearance
    });
    if (typeof module !== "undefined" && module.exports) module.exports = api; else scope.OCStudioIcons = api;
})(typeof window !== "undefined" ? window : globalThis);
