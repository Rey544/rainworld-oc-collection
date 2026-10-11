(function(root) {
    "use strict";
    const key = "rwoc-ui-font-percent-v1", limit = v => Math.max(80, Math.min(200, Math.round((Number(v) || 100) / 5) * 5));
    let percent = 100, pagePercent = 100;
    const pageKey = "rwoc-ui-page-percent-v1", pageLimit = v => Math.max(60, Math.min(160, Math.round((Number(v) || 100) / 5) * 5));
    try {
        pagePercent = pageLimit(localStorage.getItem(pageKey));
    } catch {}
    function viewport() {
        const v = root.visualViewport, s = pagePercent / 100, width = Math.max(1, v?.width || root.innerWidth || document.documentElement.clientWidth || 1024), height = Math.max(1, v?.height || root.innerHeight || document.documentElement.clientHeight || 768);
        return {
            width: width,
            height: height,
            left: Math.max(0, v?.offsetLeft || 0),
            top: Math.max(0, v?.offsetTop || 0),
            layoutWidth: width / s,
            layoutHeight: height / s
        };
    }
    let viewportSignature = "";
    function updateViewport() {
        const v = viewport(), style = document.documentElement.style;
        for (const [k, n] of Object.entries({
            width: v.width,
            height: v.height,
            left: v.left,
            top: v.top
        })) style.setProperty("--ui-viewport-" + k, n + "px");
        style.setProperty("--ui-layout-width", v.layoutWidth + "px");
        style.setProperty("--ui-layout-height", v.layoutHeight + "px");
        document.documentElement.classList.toggle("ui-compact", v.layoutWidth < 700);
        document.documentElement.classList.toggle("ui-short", v.layoutHeight < 440 && v.layoutWidth > v.layoutHeight);
        const signature = [ v.width, v.height, v.left, v.top, pagePercent ].join(":");
        if (signature !== viewportSignature) {
            viewportSignature = signature;
            root.dispatchEvent(new Event("oc-ui-viewport-change"));
        }
        return v;
    }
    function applyPage(value, persist = true) {
        pagePercent = pageLimit(value);
        document.documentElement.style.setProperty("--ui-page-scale", pagePercent / 100);
        document.documentElement.style.zoom = "";
        updateViewport();
        if (persist) try {
            localStorage.setItem(pageKey, String(pagePercent));
        } catch {}
        root.dispatchEvent(new Event("oc-ui-font-change"));
        return pagePercent;
    }
    try {
        percent = limit(localStorage.getItem(key));
    } catch {}
    function scaleRules(rules) {
        for (const rule of rules || []) {
            if (rule.cssRules) scaleRules(rule.cssRules);
            const s = rule.style;
            if (!s) continue;
            for (const prop of [ "font-size", "line-height" ]) {
                const value = s.getPropertyValue(prop);
                if (/^\d+(?:\.\d+)?px$/.test(value)) s.setProperty(prop, "calc(" + value + " * var(--ui-text-scale, 1))", s.getPropertyPriority(prop));
            }
        }
    }
    function prepare() {
        for (const sheet of document.styleSheets) try {
            scaleRules(sheet.cssRules);
        } catch {}
    }
    function apply(value, persist = true) {
        percent = limit(value);
        document.documentElement.style.setProperty("--ui-text-scale", percent / 100);
        document.documentElement.classList.toggle("ui-large", percent > 100);
        if (persist) try {
            localStorage.setItem(key, String(percent));
        } catch {}
        prepare();
        root.dispatchEvent(new Event("oc-ui-font-change"));
        return percent;
    }
    function open(options = {}) {
        const prior = document.getElementById("uiFontDialog");
        if (prior) {
            prior.close();
            prior.remove();
        }
        const d = document.createElement("dialog");
        d.id = "uiFontDialog";
        d.className = "sheet compact-sheet ui-font-dialog";
        d.setAttribute("aria-label", "界面设置");
        const title = document.createElement("h2");
        title.textContent = "界面设置";
        const controls = document.createElement("div");
        controls.className = "ui-font-controls";
        const output = document.createElement("output"), slider = document.createElement("input");
        slider.type = "range";
        slider.min = 80;
        slider.max = 200;
        slider.step = 5;
        slider.setAttribute("aria-label", "字号大小");
        const update = value => {
            apply(value);
            slider.value = percent;
            output.textContent = percent + "%";
        };
        const button = (label, fn) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.onclick = fn;
            return b;
        };
        const minus = button("−", () => update(percent - 5)), plus = button("＋", () => update(percent + 5));
        minus.setAttribute("aria-label", "缩小字号");
        plus.setAttribute("aria-label", "放大字号");
        slider.oninput = () => update(slider.value);
        controls.append(minus, slider, plus, output);
        const actions = document.createElement("div");
        actions.className = "ui-font-actions";
        actions.append(button("重置", () => {
            update(100);
            pageUpdate(100);
        }), button("完成", () => d.close()));
        const fontLabel = document.createElement("div");
        fontLabel.textContent = "字号大小";
        d.append(title);
        const columnSettings = options.columnSettings || (options.onColumns ? [ {
            label: "文字列数",
            min: 1,
            value: options.columns,
            onChange: options.onColumns
        } ] : []);
        for (const setting of columnSettings) {
            const label = document.createElement("label");
            label.className = "ui-columns-setting";
            label.textContent = setting.label;
            const select = document.createElement("select");
            select.setAttribute("aria-label", setting.label);
            const min = setting.min || 1;
            for (let n = min; n <= 6; n++) {
                const option = document.createElement("option");
                option.value = n;
                option.textContent = n + "列";
                select.append(option);
            }
            select.value = setting.value || min;
            select.onchange = () => setting.onChange(Math.max(min, Math.min(6, +select.value || min)));
            label.append(select);
            d.append(label);
        }
        d.append(fontLabel, controls);
        const pageLabel = document.createElement("div");
        pageLabel.textContent = "网页比例";
        const pageControls = document.createElement("div");
        pageControls.className = "ui-font-controls";
        const pageSlider = document.createElement("input"), pageOutput = document.createElement("output");
        pageSlider.type = "range";
        pageSlider.min = 60;
        pageSlider.max = 160;
        pageSlider.step = 5;
        pageSlider.setAttribute("aria-label", "网页比例");
        const pageUpdate = v => {
            applyPage(v);
            pageSlider.value = pagePercent;
            pageOutput.textContent = pagePercent + "%";
        };
        pageSlider.oninput = () => pageUpdate(pageSlider.value);
        pageControls.append(button("−", () => pageUpdate(pagePercent - 5)), pageSlider, button("＋", () => pageUpdate(pagePercent + 5)), pageOutput);
        d.append(pageLabel, pageControls);
        pageUpdate(pagePercent);
        d.append(actions);
        d.addEventListener("close", () => d.remove());
        document.body.append(d);
        update(percent);
        d.showModal();
    }
    function gear() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "pixel-gear");
        p.setAttribute("fill-rule", "evenodd");
        p.setAttribute("d", "M9 1h6v1h-6zM9 2h6v1h-6zM3 3h4v1h-4zM9 3h6v1h-6zM17 3h4v1h-4zM3 4h4v1h-4zM8 4h8v1h-8zM17 4h4v1h-4zM3 5h18v1h-18zM3 6h18v1h-18zM5 7h14v1h-14zM4 8h6v1h-6zM14 8h6v1h-6zM1 9h8v1h-8zM15 9h8v1h-8zM1 10h7v1h-7zM16 10h7v1h-7zM1 11h7v1h-7zM16 11h7v1h-7zM1 12h7v1h-7zM16 12h7v1h-7zM1 13h7v1h-7zM16 13h7v1h-7zM1 14h8v1h-8zM15 14h8v1h-8zM4 15h6v1h-6zM14 15h6v1h-6zM5 16h14v1h-14zM3 17h18v1h-18zM3 18h18v1h-18zM3 19h4v1h-4zM8 19h8v1h-8zM17 19h4v1h-4zM3 20h4v1h-4zM9 20h6v1h-6zM17 20h4v1h-4zM9 21h6v1h-6zM9 22h6v1h-6z");
        svg.append(p);
        return svg;
    }
    root.OCUIPreferences = {
        gear: gear,
        open: open,
        apply: apply,
        applyPage: applyPage,
        viewport: viewport,
        updateViewport: updateViewport,
        get pageScale() {
            return pagePercent / 100;
        },
        get pagePercent() {
            return pagePercent;
        },
        get scale() {
            return percent / 100;
        },
        get percent() {
            return percent;
        },
        prepare: prepare
    };
    applyPage(pagePercent, false);
    apply(percent, false);
    document.addEventListener("DOMContentLoaded", () => {
        updateViewport();
        prepare();
        new MutationObserver(records => {
            if (records.some(r => [ ...r.addedNodes ].some(n => n.nodeType === 1 && (n.tagName === "STYLE" || n.tagName === "LINK")))) prepare();
        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    });
    root.addEventListener("load", prepare);
    root.addEventListener("resize", updateViewport);
    root.visualViewport?.addEventListener("resize", updateViewport);
    root.visualViewport?.addEventListener("scroll", updateViewport);
    root.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key === "0") {
            apply(100);
            applyPage(100);
        }
    });
})(window);
