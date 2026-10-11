(function(root) {
    "use strict";
    const copy = v => JSON.parse(JSON.stringify(v)), node = (tag, text) => {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
    }, btn = (text, fn) => {
        const b = node("button", text);
        b.type = "button";
        b.onclick = fn;
        return b;
    };
    let context = null;
    function ensureCategories(project) {
        const model = root.OCCategoryModel;
        if (!model?.forScope) return project;
        for (const name of [ "区域", "回响" ]) {
            const scoped = model.forScope(project, "documents");
            if (!scoped.tagCategories.some(c => c.name === name)) project = model.mergeScope(project, model.addCategory(scoped, name), "documents");
        }
        return project;
    }
    function isRegion(d) {
        return d?.category === "区域" || !!d?.details?.regionProfiles?.length;
    }
    function isEcho(d) {
        return d?.category === "回响" || d?.kind === "echo";
    }
    function mount(host, item, {onChange: onChange, onContent: onContent} = {}) {
        if (!isRegion(item) && !isEcho(item)) return null;
        const section = node("section");
        section.className = "map-record-fields";
        host.append(section);
        const update = patch => {
            item.details = {
                ...item.details,
                ...patch
            };
            onChange?.(patch);
        }, field = (label, value, fn, multi = false) => {
            const wrap = node("label", label), input = node(multi ? "textarea" : "input");
            input.value = value ?? "";
            input.setAttribute("aria-label", label);
            if (multi) input.rows = 4;
            input.oninput = () => fn(input.value);
            wrap.append(input);
            section.append(wrap);
            return input;
        };
        if (isEcho(item)) {
            const echo = {
                karma: 1,
                type: "once",
                room: "",
                ...item.details?.echo || {}
            };
            const emit = () => update({
                echo: copy(echo)
            });
            const k = field("给予业力", echo.karma, v => {
                echo.karma = Math.max(1, Math.min(10, +v || 1));
                emit();
            });
            k.type = "number";
            k.min = 1;
            k.max = 10;
            const label = node("label", "回响类型"), type = node("select");
            for (const [v, t] of [ [ "once", "一次回响" ], [ "twice", "二次回响" ], [ "other", "其他类型" ] ]) type.append(new Option(t, v));
            type.value = echo.type;
            type.onchange = () => {
                echo.type = type.value;
                emit();
            };
            label.append(type);
            section.append(label);
            field("所属房间", echo.room, v => {
                echo.room = v;
                emit();
            });
            field("类型备注", echo.typeNote || "", v => {
                echo.typeNote = v;
                emit();
            });
            field("回响文本", item.content || "", v => {
                item.content = v;
                onContent?.(v);
                onChange?.({});
            }, true);
            return {
                preview: target => preview(target, item),
                destroy: () => section.remove()
            };
        }
        field("英文名", item.details?.english || "", v => update({
            english: v
        }));
        const wrap = node("div");
        wrap.className = "map-record-profiles";
        section.append(wrap);
        let profiles = copy(item.details?.regionProfiles || []);
        const emit = () => update({
            regionProfiles: copy(profiles)
        });
        const render = () => {
            wrap.replaceChildren();
            for (const profile of profiles) {
                const fold = node("details");
                fold.open = true;
                fold.append(node("summary", profile.title || "时间线 / 剧情地点"));
                for (const [key, label, multi] of [ [ "title", "时间线 / 剧情地点", false ], [ "synopsis", "简介", true ], [ "content", "详情", true ], [ "notes", "备注", true ] ]) {
                    const box = node("label", label), input = node(multi ? "textarea" : "input");
                    input.value = profile[key] || "";
                    input.setAttribute("aria-label", label);
                    if (multi) input.rows = 3;
                    input.oninput = () => {
                        profile[key] = input.value;
                        emit();
                        if (key === "title") fold.querySelector("summary").textContent = input.value;
                    };
                    box.append(input);
                    fold.append(box);
                }
                const tags = node("label", "标签"), ti = node("input");
                ti.value = (profile.tags || []).join("，");
                ti.oninput = () => {
                    profile.tags = ti.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
                    emit();
                };
                tags.append(ti);
                fold.append(tags, btn("删除此介绍", () => {
                    profiles = profiles.filter(p => p.id !== profile.id);
                    emit();
                    render();
                }));
                wrap.append(fold);
            }
        };
        section.append(btn("新增时间线 / 地点介绍", () => {
            profiles.push({
                id: "profile_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                title: "新的介绍",
                sceneId: "",
                synopsis: "",
                content: "",
                notes: "",
                tags: []
            });
            emit();
            render();
        }));
        render();
        return {
            preview: target => preview(target, item),
            destroy: () => section.remove()
        };
    }
    function preview(target, item) {
        if (!isRegion(item) && !isEcho(item)) return false;
        target.replaceChildren();
        if (item.details?.synopsis) target.append(node("p", item.details.synopsis));
        if (isEcho(item)) {
            const e = item.details?.echo || {};
            target.append(node("p", {
                once: "一次回响",
                twice: "二次回响",
                other: "其他类型"
            }[e.type] || "一次回响"), node("p", "给予业力：" + (e.karma || 1)), node("p", e.room || ""));
        }
        const text = node("div", item.content || "");
        text.style.whiteSpace = "pre-wrap";
        target.append(text);
        for (const p of item.details?.regionProfiles || []) {
            const group = node("details");
            group.open = true;
            group.append(node("summary", p.title || "介绍"), node("p", p.synopsis || ""));
            const content = node("div", p.content || "");
            content.style.whiteSpace = "pre-wrap";
            group.append(content);
            if (p.notes) group.append(node("p", p.notes));
            if (p.tags?.length) group.append(node("p", p.tags.join(" · ")));
            target.append(group);
        }
        return true;
    }
    root.OCMapRecords = {
        ensureCategories: ensureCategories,
        mount: mount,
        preview: preview,
        isRegion: isRegion,
        isEcho: isEcho,
        setContext: w => context = w,
        get context() {
            return context;
        }
    };
})(window);
