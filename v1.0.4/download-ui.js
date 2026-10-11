(function() {
    "use strict";
    const api = window.OCStandalone;
    if (!api) return;
    api.download = (data, name, type = "application/json") => {
        const blob = data instanceof Blob ? data : new Blob([ typeof data === "string" ? data : JSON.stringify(data, null, 2) ], {
            type: type
        });
        const url = URL.createObjectURL(blob), existing = [ ...document.querySelectorAll("dialog[open]") ].reverse().find(d => d.querySelector("h2")?.textContent === "导出");
        const dialog = existing || document.createElement("dialog"), restore = existing?.id === "exportDialog" ? {
            nodes: [ ...existing.childNodes ],
            className: existing.className,
            label: existing.getAttribute("aria-label")
        } : null;
        dialog.className = "sheet file-result";
        dialog.setAttribute("aria-label", "导出文件");
        dialog.replaceChildren();
        const node = (tag, text, cls) => {
            const e = document.createElement(tag);
            if (text) e.textContent = text;
            if (cls) e.className = cls;
            return e;
        };
        const header = node("div", "", "sheet-heading"), title = node("h2", "文件已生成"), close = node("button", "×", "file-close");
        close.type = "button";
        close.setAttribute("aria-label", "关闭");
        close.onclick = () => dialog.close();
        header.append(title, close);
        const filename = node("p", name, "file-name"), status = node("p", "", "file-status"), actions = node("div", "", "sheet-actions"), save = node("a", "保存文件", "outlined");
        status.setAttribute("role", "status");
        save.href = url;
        save.download = name;
        save.onclick = () => {
            status.textContent = "已请求下载";
        };
        actions.append(save);
        const file = new File([ blob ], name, {
            type: blob.type || type
        });
        if (navigator.canShare?.({
            files: [ file ]
        })) {
            const share = node("button", "分享");
            share.type = "button";
            share.onclick = async () => {
                try {
                    await navigator.share({
                        files: [ file ]
                    });
                    status.textContent = "已完成分享";
                } catch (error) {
                    if (error.name !== "AbortError") status.textContent = "分享未完成，请保存文件。";
                }
            };
            actions.append(share);
        }
        dialog.append(header, filename, status, actions);
        if (!existing) {
            document.body.append(dialog);
            dialog.showModal();
        }
        dialog.addEventListener("close", () => {
            if (restore) {
                dialog.replaceChildren(...restore.nodes);
                dialog.className = restore.className;
                if (restore.label) dialog.setAttribute("aria-label", restore.label); else dialog.removeAttribute("aria-label");
            } else dialog.remove();
            setTimeout(() => URL.revokeObjectURL(url), 6e4);
        }, {
            once: true
        });
    };
})();
