(function(scope) {
    "use strict";
    const WIDTH = 21, HEIGHT = 19, DEFAULT = "000000001111100000000000000110000011000000000001000000000100000000010000000000010000100010000111000010001110100001000100001011110100001000100001011111100001000100001111110100000111000001011010100000000000001010010101110000011101010010101110000011101010010100110000011001010001100000000000001100000010000000000010000000010000000000010000000001000000000100000000000110000011000000000000001111100000000";
    const copy = v => JSON.parse(JSON.stringify(v)), hex = v => /^#[a-f0-9]{6}$/i.test(v) ? v.toLowerCase() : "#ffffff";
    function normalize(value = {}) {
        if (!value || typeof value !== "object") value = {};
        const width = Number.isInteger(value.width) && value.width >= 1 && value.width <= 128 ? value.width : WIDTH, height = Number.isInteger(value.height) && value.height >= 1 && value.height <= 128 ? value.height : HEIGHT, valid = typeof value.pixels === "string" && value.pixels.length === width * height && !/[^01]/.test(value.pixels);
        return {
            version: 1,
            width: valid ? width : WIDTH,
            height: valid ? height : HEIGHT,
            pixels: valid ? value.pixels : DEFAULT,
            color: hex(value.color)
        };
    }
    function resizeModel(value, width, height, allowCrop = false) {
        const m = normalize(value);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 128 || height > 128) throw Error("画布宽高为 1–128 的整数。");
        const pixels = Array(width * height).fill("0"), dx = Math.floor((width - m.width) / 2), dy = Math.floor((height - m.height) / 2);
        let cropped = false;
        for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.pixels[y * m.width + x] === "1") {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) cropped = true; else pixels[ny * width + nx] = "1";
        }
        if (cropped && !allowCrop) throw Error("新尺寸会裁掉笔画。请增大画布，或勾选允许裁切。");
        return {
            ...m,
            width: width,
            height: height,
            pixels: pixels.join("")
        };
    }
    function isIterator(item) {
        return !!item && (item.kind === "character" || [ item.category, ...item.categories || [] ].includes("迭代器"));
    }
    function fromRecord(item) {
        return normalize({
            ...item?.details?.appearance?.iteratorIcon,
            color: item?.details?.characterColor
        });
    }
    function projectIcons(project, excludeId) {
        return (project?.documents || []).filter(d => d.id !== excludeId && !d.archived && isIterator(d));
    }
    function paint(canvas, value, color) {
        const model = normalize(value);
        canvas.width = model.width;
        canvas.height = model.height;
        const c = canvas.getContext("2d");
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.fillStyle = hex(color || model.color);
        for (let y = 0; y < model.height; y++) for (let x = 0; x < model.width; x++) if (model.pixels[y * model.width + x] === "1") c.fillRect(x * canvas.width / model.width, y * canvas.height / model.height, canvas.width / model.width, canvas.height / model.height);
        return canvas;
    }
    function stroke(value, a, b, {erase: erase = false, size: size = 1, x: x = false, y: y = false} = {}) {
        const model = normalize(value), pixels = model.pixels.split(""), radius = Math.floor((Math.max(1, Math.min(5, size)) - 1) / 2), set = (px, py) => {
            if (px >= 0 && py >= 0 && px < model.width && py < model.height) pixels[py * model.width + px] = erase ? "0" : "1";
        };
        let ax = Math.round(a.x), ay = Math.round(a.y), bx = Math.round(b.x), by = Math.round(b.y), dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1, dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1, error = dx + dy;
        for (let limit = 0; limit < 1e4; limit++) {
            for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
                const px = ax + ox, py = ay + oy;
                set(px, py);
                if (x) set(px, model.height - 1 - py);
                if (y) set(model.width - 1 - px, py);
                if (x && y) set(model.width - 1 - px, model.height - 1 - py);
            }
            if (ax === bx && ay === by) break;
            const e = error * 2;
            if (e >= dy) {
                error += dy;
                ax += sx;
            }
            if (e <= dx) {
                error += dx;
                ay += sy;
            }
        }
        return {
            ...model,
            pixels: pixels.join("")
        };
    }
    function history(value) {
        let current = normalize(value), past = [], future = [];
        return {
            get: () => copy(current),
            set(next) {
                next = normalize(next);
                if (JSON.stringify(next) === JSON.stringify(current)) return false;
                past.push(current);
                if (past.length > 100) past.shift();
                current = next;
                future = [];
                return true;
            },
            undo() {
                if (!past.length) return false;
                future.push(current);
                current = past.pop();
                return true;
            },
            redo() {
                if (!future.length) return false;
                past.push(current);
                current = future.pop();
                return true;
            },
            reset(value) {
                current = normalize(value);
                past = [];
                future = [];
            },
            canUndo: () => !!past.length,
            canRedo: () => !!future.length
        };
    }
    function maskFromRGBA(data, mode = "auto", width = WIDTH, height = HEIGHT) {
        let transparent = false;
        for (let p = 0; p < width * height; p++) if (data[p * 4 + 3] < 240) {
            transparent = true;
            break;
        }
        if (mode === "auto") {
            const indices = [ 0, width - 1, width * (height - 1), width * height - 1 ], light = indices.reduce((s, p) => s + (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3, 0) / 4;
            mode = transparent ? "alpha" : light > 127 ? "white" : "black";
        }
        let pixels = "";
        for (let p = 0; p < width * height; p++) {
            const i = p * 4, alpha = data[i + 3] / 255, luma = (data[i] + data[i + 1] + data[i + 2]) / 765, coverage = mode === "alpha" ? alpha : alpha * (mode === "white" ? 1 - luma : luma);
            pixels += coverage >= .5 ? "1" : "0";
        }
        return pixels;
    }
    function imageModel(image, color, mode = "auto", width = WIDTH, height = HEIGHT) {
        const c = scope.document.createElement("canvas");
        c.width = width;
        c.height = height;
        const ctx = c.getContext("2d"), w = image.naturalWidth || image.width, h = image.naturalHeight || image.height, scale = Math.min(width / w, height / h), dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale)), ox = Math.floor((width - dw) / 2), oy = Math.floor((height - dh) / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, ox, oy, dw, dh);
        let effective = mode;
        if (mode === "auto") {
            const sample = ctx.getImageData(ox, oy, dw, dh).data;
            let alpha = false;
            for (let p = 3; p < sample.length; p += 4) if (sample[p] < 240) {
                alpha = true;
                break;
            }
            if (alpha) effective = "alpha"; else {
                const corners = [ 0, dw - 1, dw * (dh - 1), dw * dh - 1 ];
                effective = corners.reduce((s, p) => s + (sample[p * 4] + sample[p * 4 + 1] + sample[p * 4 + 2]) / 3, 0) / 4 > 127 ? "white" : "black";
            }
        }
        return normalize({
            width: width,
            height: height,
            pixels: maskFromRGBA(ctx.getImageData(0, 0, width, height).data, effective, width, height),
            color: color
        });
    }
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new scope.Image;
            img.onload = () => resolve(img);
            img.onerror = () => reject(Error("图标无法读取。"));
            img.src = src;
        });
    }
    function node(tag, text, cls) {
        const e = scope.document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        if (cls) e.className = cls;
        return e;
    }
    function button(label, fn) {
        const b = node("button", label);
        b.type = "button";
        b.onclick = fn;
        return b;
    }
    function canvas() {
        const c = node("canvas");
        c.width = WIDTH;
        c.height = HEIGHT;
        return c;
    }
    function png(model) {
        return paint(canvas(), model).toDataURL("image/png");
    }
    function recordPatch(model, item) {
        model = normalize(model);
        return {
            characterColor: model.color,
            iconData: png(model),
            appearance: {
                ...item.details?.appearance,
                iteratorIcon: {
                    version: 1,
                    width: model.width,
                    height: model.height,
                    pixels: model.pixels
                }
            }
        };
    }
    function ensureCategory(project) {
        const model = scope.OCCategoryModel;
        if (!model?.forScope) return project;
        const scoped = model.forScope(project, "documents");
        if (scoped.tagCategories.some(c => c.name === "迭代器")) return project;
        return model.mergeScope(project, model.addCategory(scoped, "迭代器"), "documents");
    }
    function shell(title) {
        const d = node("dialog", undefined, "iterator-dialog sheet"), header = node("div", undefined, "iterator-heading"), body = node("div", undefined, "iterator-dialog-body"), footer = node("div", undefined, "iterator-actions");
        header.append(node("h2", title), button("关闭", () => d.close()));
        d.append(header, body, footer);
        scope.document.body.append(d);
        d.addEventListener("close", () => d.remove(), {
            once: true
        });
        d.showModal();
        return {
            d: d,
            body: body,
            footer: footer
        };
    }
    function pick({project: project, excludeId: excludeId, color: color = "#ffffff", width: width = WIDTH, height: height = HEIGHT, onChoose: onChoose}) {
        const {d: d, body: body, footer: footer} = shell("选择迭代器图标"), list = node("div", undefined, "iterator-library"), status = node("p", undefined, "iterator-error");
        status.setAttribute("role", "status");
        body.append(list, status);
        let alive = true;
        d.addEventListener("close", () => alive = false, {
            once: true
        });
        const add = (label, model, fn) => {
            const c = paint(canvas(), model), b = button("", fn);
            b.append(c, node("span", label));
            list.append(b);
            return c;
        };
        add("原版图标", normalize({
            color: color
        }), () => {
            onChoose(normalize({
                color: color
            }), null);
            d.close();
        });
        for (const doc of projectIcons(project, excludeId)) {
            const model = fromRecord(doc), legacy = doc.details?.iconData && !doc.details?.appearance?.iteratorIcon, icon = add(doc.title || "未命名迭代器", model, async () => {
                try {
                    const chosen = legacy ? imageModel(await loadImage(doc.details.iconData), model.color) : model;
                    if (alive) {
                        onChoose(chosen, doc);
                        d.close();
                    }
                } catch (e) {
                    if (alive) status.textContent = e.message;
                }
            });
            if (legacy) loadImage(doc.details.iconData).then(img => {
                if (alive) paint(icon, imageModel(img, model.color));
            }).catch(() => {});
        }
        const input = node("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp";
        input.hidden = true;
        footer.append(input, button("导入图片", () => input.click()));
        input.onchange = async () => {
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            try {
                if (file.size > 20 * 1024 * 1024) throw Error("请选择小于 20 MB 的图片。");
                if (![ "image/png", "image/jpeg", "image/webp" ].includes(file.type)) throw Error("请选择 PNG、JPEG 或 WebP 图片。");
                const src = await new Promise((resolve, reject) => {
                    const reader = new scope.FileReader;
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(Error("图片无法读取。"));
                    reader.readAsDataURL(file);
                }), img = await loadImage(src);
                if (!alive) return;
                const imported = shell("导入图标"), preview = canvas(), mode = node("select"), label = node("label", "背景"), err = node("p", undefined, "iterator-error");
                for (const [v, t] of [ [ "auto", "自动" ], [ "alpha", "透明" ], [ "white", "白色" ], [ "black", "黑色" ] ]) {
                    const o = node("option", t);
                    o.value = v;
                    mode.append(o);
                }
                mode.value = "auto";
                preview.className = "iterator-import-preview";
                let result;
                const render = () => {
                    result = imageModel(img, color, mode.value, width, height);
                    paint(preview, result);
                    err.textContent = result.pixels.includes("1") ? "" : "没有识别到图形，请调整背景。";
                };
                mode.onchange = render;
                label.append(mode);
                imported.body.append(preview, label, err);
                imported.footer.append(button("取消", () => imported.d.close()), button("使用图标", () => {
                    if (!result.pixels.includes("1")) return;
                    onChoose(result, null);
                    imported.d.close();
                    d.close();
                }));
                render();
                d.addEventListener("close", () => imported.d.close(), {
                    once: true
                });
            } catch (e) {
                if (alive) status.textContent = e.message;
            }
        };
        return {
            close: () => d.close()
        };
    }
    function mount(host, item, {project: project, onChange: onChange, notify: notify} = {}) {
        const root = node("section", undefined, "iterator-editor"), heading = node("div", undefined, "iterator-heading"), iconButton = button("", () => choose()), small = canvas(), label = node("strong", "迭代器图标"), dimensions = node("span", "21 × 19", "iterator-dimensions"), toolbar = node("div", undefined, "iterator-tools"), stage = node("div", undefined, "iterator-stage"), board = node("canvas"), color = node("input"), hexInput = node("input"), sym = node("details", undefined, "iterator-symmetry"), symRow = node("div", undefined, "iterator-tools");
        let destroyed = false, picker = null, canvasDialog = null, loading = false, version = 0, tool = "brush", size = 1, axisX = false, axisY = false, boardBackground = "white", drag = null, preview = null;
        const timeline = history(fromRecord(item));
        root.tabIndex = 0;
        root.setAttribute("aria-label", "迭代器图标画板");
        iconButton.title = "更换图标";
        iconButton.setAttribute("aria-label", "更换迭代器图标");
        iconButton.append(small);
        heading.append(iconButton, label, dimensions);
        board.width = WIDTH * 16;
        board.height = HEIGHT * 16;
        board.setAttribute("aria-label", "迭代器图标画布");
        board.setAttribute("role", "img");
        board.tabIndex = 0;
        stage.append(board);
        host.append(root);
        root.append(heading, toolbar, stage);
        const controls = {}, add = (name, label, fn) => {
            const b = button(label, fn);
            controls[name] = b;
            toolbar.append(b);
            return b;
        };
        add("brush", "画笔", () => {
            tool = "brush";
            refresh();
        });
        add("erase", "擦除", () => {
            tool = "erase";
            refresh();
        });
        const brushSize = node("select");
        brushSize.setAttribute("aria-label", "画笔大小");
        for (const n of [ 1, 3, 5 ]) {
            const o = node("option", n + " px");
            o.value = String(n);
            brushSize.append(o);
        }
        brushSize.value = "1";
        brushSize.onchange = () => size = Number(brushSize.value);
        toolbar.append(brushSize);
        add("undo", "撤回", () => travel("undo"));
        add("redo", "恢复", () => travel("redo"));
        add("clear", "清空", () => commit({
            ...timeline.get(),
            pixels: "0".repeat(timeline.get().width * timeline.get().height)
        }));
        const colors = node("div", undefined, "iterator-tools"), colorLabel = node("label", "图标颜色");
        color.type = "color";
        color.setAttribute("aria-label", "图标颜色");
        hexInput.type = "text";
        hexInput.maxLength = 7;
        hexInput.setAttribute("aria-label", "图标颜色 HEX");
        const syncColor = () => {
            color.value = hexInput.value = (preview || timeline.get()).color;
        };
        color.oninput = () => {
            preview = {
                ...timeline.get(),
                color: color.value
            };
            hexInput.value = color.value;
            refresh(false);
        };
        color.onchange = () => commit({
            ...timeline.get(),
            color: color.value
        });
        hexInput.onchange = () => {
            if (/^#[a-f0-9]{6}$/i.test(hexInput.value)) commit({
                ...timeline.get(),
                color: hexInput.value
            }); else syncColor();
        };
        colorLabel.append(color);
        colors.append(colorLabel, hexInput, button("白色", () => commit({
            ...timeline.get(),
            color: "#ffffff"
        })));
        sym.append(node("summary", "对称"), symRow);
        for (const [axis, title] of [ [ "x", "X 轴" ], [ "y", "Y 轴" ] ]) {
            const wrap = node("label"), check = node("input");
            check.type = "checkbox";
            check.setAttribute("aria-label", title + "对称");
            check.onchange = () => {
                if (axis === "x") axisX = check.checked; else axisY = check.checked;
                refresh();
            };
            wrap.append(check, scope.document.createTextNode(title));
            symRow.append(wrap);
        }
        colors.append(sym);
        root.append(colors);
        const display = node("div", undefined, "iterator-tools"), bgLabel = node("label", "画板底色"), background = node("select"), canvasButton = button("画布", () => {
            if (loading) return;
            const box = shell("画布尺寸"), current = timeline.get(), wf = node("label", "宽 / px"), hf = node("label", "高 / px"), wi = node("input"), hi = node("input"), cropLabel = node("label"), crop = node("input"), error = node("p", undefined, "iterator-error");
            for (const i of [ wi, hi ]) {
                i.type = "number";
                i.min = 1;
                i.max = 128;
                i.step = 1;
            }
            canvasDialog = box.d;
            box.d.addEventListener("close", () => {
                canvasDialog = null;
            }, {
                once: true
            });
            wi.value = current.width;
            hi.value = current.height;
            wf.append(wi);
            hf.append(hi);
            crop.type = "checkbox";
            cropLabel.append(crop, scope.document.createTextNode("允许裁切笔画"));
            box.body.append(wf, hf, cropLabel, error);
            box.footer.append(button("取消", () => box.d.close()), button("应用", () => {
                try {
                    commit(resizeModel(timeline.get(), Number(wi.value), Number(hi.value), crop.checked));
                    box.d.close();
                } catch (e) {
                    error.textContent = e.message;
                }
            }));
        });
        background.setAttribute("aria-label", "画板底色");
        for (const [v, t] of [ [ "white", "白色" ], [ "gray", "灰色" ], [ "transparent", "透明棋盘格" ] ]) {
            const o = node("option", t);
            o.value = v;
            background.append(o);
        }
        background.value = boardBackground;
        background.onchange = () => {
            boardBackground = background.value;
            refresh();
        };
        bgLabel.append(background);
        display.append(bgLabel, canvasButton);
        root.append(display);
        function refresh(sync = true) {
            const value = preview || timeline.get();
            paint(small, value);
            const cell = Math.max(2, Math.floor(336 / Math.max(value.width, value.height)));
            board.width = value.width * cell;
            board.height = value.height * cell;
            board.style.aspectRatio = value.width + "/" + value.height;
            dimensions.textContent = value.width + " × " + value.height;
            const c = board.getContext("2d");
            c.fillStyle = boardBackground === "gray" ? "#999999" : "#ffffff";
            c.fillRect(0, 0, board.width, board.height);
            if (boardBackground === "transparent") {
                c.fillStyle = "#dddddd";
                for (let y = 0; y < value.height; y++) for (let x = 0; x < value.width; x++) if ((x + y) % 2) c.fillRect(x * cell, y * cell, cell, cell);
            }
            c.fillStyle = "#000000";
            for (let y = 0; y < value.height; y++) for (let x = 0; x < value.width; x++) if (value.pixels[y * value.width + x] === "1") c.fillRect(x * cell, y * cell, cell, cell);
            if (cell >= 6) {
                c.strokeStyle = boardBackground === "gray" ? "#888888" : "#cccccc";
                c.lineWidth = 1;
                c.beginPath();
                for (let x = 0; x <= value.width; x++) {
                    c.moveTo(x * cell + .5, 0);
                    c.lineTo(x * cell + .5, board.height);
                }
                for (let y = 0; y <= value.height; y++) {
                    c.moveTo(0, y * cell + .5);
                    c.lineTo(board.width, y * cell + .5);
                }
                c.stroke();
            }
            if (axisX || axisY) {
                c.strokeStyle = boardBackground === "gray" ? "#333333" : "#777777";
                c.setLineDash([ 4, 4 ]);
                c.beginPath();
                if (axisX) {
                    c.moveTo(0, board.height / 2);
                    c.lineTo(board.width, board.height / 2);
                }
                if (axisY) {
                    c.moveTo(board.width / 2, 0);
                    c.lineTo(board.width / 2, board.height);
                }
                c.stroke();
                c.setLineDash([]);
            }
            controls.undo.disabled = !timeline.canUndo() || loading;
            controls.redo.disabled = !timeline.canRedo() || loading;
            controls.brush.setAttribute("aria-pressed", String(tool === "brush"));
            controls.erase.setAttribute("aria-pressed", String(tool === "erase"));
            for (const control of [ controls.brush, controls.erase, controls.clear, brushSize, color, hexInput, canvasButton, iconButton ]) control.disabled = loading;
            root.setAttribute("aria-busy", String(loading));
            if (sync) syncColor();
        }
        function emit() {
            version++;
            onChange?.(recordPatch(timeline.get(), item));
        }
        function commit(value) {
            if (destroyed || loading) return;
            preview = null;
            if (timeline.set(value)) emit();
            refresh();
        }
        function travel(action) {
            if (destroyed || loading) return;
            drag = null;
            preview = null;
            if (timeline[action]()) emit();
            refresh();
        }
        function choose() {
            if (destroyed || loading) return;
            picker = pick({
                project: project,
                excludeId: item.id,
                color: timeline.get().color,
                width: timeline.get().width,
                height: timeline.get().height,
                onChoose: model => commit(model)
            });
        }
        const point = e => {
            const b = board.getBoundingClientRect();
            return {
                x: Math.max(-5, Math.min(timeline.get().width + 4, Math.floor((e.clientX - b.left) * timeline.get().width / b.width))),
                y: Math.max(-5, Math.min(timeline.get().height + 4, Math.floor((e.clientY - b.top) * timeline.get().height / b.height)))
            };
        };
        board.onpointerdown = e => {
            if (loading || e.button !== 0 && e.pointerType !== "touch") return;
            if (drag) {
                drag = null;
                preview = null;
                refresh();
                return;
            }
            e.preventDefault();
            board.focus();
            board.setPointerCapture(e.pointerId);
            const p = point(e);
            drag = {
                id: e.pointerId,
                p: p
            };
            preview = stroke(timeline.get(), p, p, {
                erase: tool === "erase",
                size: size,
                x: axisX,
                y: axisY
            });
            refresh();
        };
        board.onpointermove = e => {
            if (!drag || drag.id !== e.pointerId) return;
            e.preventDefault();
            const p = point(e);
            preview = stroke(preview, drag.p, p, {
                erase: tool === "erase",
                size: size,
                x: axisX,
                y: axisY
            });
            drag.p = p;
            refresh();
        };
        board.onpointerup = e => {
            if (drag?.id !== e.pointerId) return;
            const value = preview;
            drag = null;
            commit(value);
        };
        board.onpointercancel = () => {
            drag = null;
            preview = null;
            refresh();
        };
        root.addEventListener("keydown", e => {
            if ([ "INPUT", "TEXTAREA", "SELECT" ].includes(e.target.tagName)) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && [ "z", "y" ].includes(key)) {
                e.preventDefault();
                e.stopPropagation();
                travel(key === "y" || e.shiftKey ? "redo" : "undo");
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey && [ "b", "e" ].includes(key)) {
                e.preventDefault();
                tool = key === "b" ? "brush" : "erase";
                refresh();
            } else if (e.key === "Escape" && drag) {
                e.preventDefault();
                e.stopPropagation();
                drag = null;
                preview = null;
                refresh();
            }
        });
        refresh();
        if (item.details?.iconData && !item.details?.appearance?.iteratorIcon) {
            loading = true;
            const serial = version;
            refresh();
            loadImage(item.details.iconData).then(img => {
                if (destroyed || version !== serial) return;
                loading = false;
                timeline.reset(imageModel(img, timeline.get().color));
                refresh();
            }).catch(e => {
                if (!destroyed) {
                    loading = false;
                    notify?.(e.message);
                    refresh();
                }
            });
        }
        return {
            focus() {
                root.scrollIntoView?.({
                    block: "nearest"
                });
                iconButton.focus();
            },
            choose: choose,
            destroy() {
                destroyed = true;
                picker?.close();
                canvasDialog?.close();
                root.remove();
            },
            getValue: () => timeline.get()
        };
    }
    const mapCache = new Map;
    function resolve(marker, docs) {
        const doc = (docs || []).find(d => d.id === marker.iteratorDocId && isIterator(d)), model = doc ? fromRecord(doc) : normalize(marker.iteratorIcon), src = doc ? doc.details?.appearance?.iteratorIcon ? "" : doc.details?.iconData || "" : marker.iteratorIcon ? "" : marker.icon || "", color = marker.iteratorColorMode === "own" ? model.color : "#ffffff";
        return {
            model: model,
            src: src,
            color: color,
            doc: doc
        };
    }
    async function prepareMap(marker, docs) {
        const r = resolve(marker, docs), out = mapCanvas(marker, docs);
        if (r.src) {
            const img = await loadImage(r.src);
            paint(out, imageModel(img, r.model.color), r.color);
        }
        return out;
    }
    function mapCanvas(marker, docs, onLoad) {
        const r = resolve(marker, docs), key = JSON.stringify([ r.model, r.src, r.color ]);
        if (mapCache.has(key)) return mapCache.get(key);
        const out = paint(canvas(), r.model, r.color);
        mapCache.set(key, out);
        if (mapCache.size > 160) mapCache.delete(mapCache.keys().next().value);
        if (r.src) loadImage(r.src).then(img => {
            paint(out, imageModel(img, r.model.color), r.color);
            onLoad?.();
        }).catch(() => {});
        return out;
    }
    scope.OCIteratorIcons = {
        prepareMap: prepareMap,
        WIDTH: WIDTH,
        HEIGHT: HEIGHT,
        normalize: normalize,
        resizeModel: resizeModel,
        isIterator: isIterator,
        fromRecord: fromRecord,
        projectIcons: projectIcons,
        paint: paint,
        stroke: stroke,
        history: history,
        maskFromRGBA: maskFromRGBA,
        imageModel: imageModel,
        recordPatch: recordPatch,
        ensureCategory: ensureCategory,
        pick: pick,
        mount: mount,
        resolve: resolve,
        mapCanvas: mapCanvas
    };
    if (typeof module !== "undefined" && module.exports) module.exports = scope.OCIteratorIcons;
})(typeof window !== "undefined" ? window : globalThis);
