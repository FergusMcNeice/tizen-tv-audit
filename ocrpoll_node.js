"use strict";
var fs = require("fs");
var net = require("net");
var cp = require("child_process");

var PC = "192.168.1.64";
var VIEW_PORT = 19999;
var PIDS = { ocr: 1394, analysis: 1395, acr: 1962 };
var KEYS = ["channelName", "programId", "programName", "contentId", "psid",
            "recog_content", "uduration", "device_id", "mediaTime", "channelId"];

var sock = null;
function send(ev) {
    var line = JSON.stringify(ev) + "\n";
    if (!sock || sock.destroyed) {
        sock = net.connect(VIEW_PORT, PC);
        sock.on("error", function () { sock = null; });
    }
    try { sock.write(line); } catch (e) { sock = null; }
}

function sh(cmd, cap) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 4000);
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function ddBuf(pid, start, len) {
    var skipPages = Math.floor(start / 4096);
    var countPages = Math.ceil(len / 4096);
    try {
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages + " count=" + countPages + " 2>/dev/null", { timeout: 10000 });
    } catch (e) {
        return null;
    }
}

function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 150000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        var label = line.length > 73 ? line.slice(73).trim() : "";
        if (label === "" || label.indexOf("[heap]") === 0 || label.indexOf("libOCREngine") >= 0) {
            if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
        }
    });
    return regs;
}

function stringsOf(buf, minLen) {
    var out = [], cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 4)) out.push(cur); cur = ""; }
    }
    if (cur.length >= (minLen || 4)) out.push(cur);
    return out;
}

var seen = { ocr: {}, analysis: {}, acr: {} };
var counts = { ocr: 0, analysis: 0, acr: 0 };

function poll() {
    var now = new Date().toISOString().slice(11, 19);
    Object.keys(PIDS).forEach(function (tag) {
        var pid = PIDS[tag];
        var regs;
        try { regs = regions(pid); } catch (e) { return; }
        for (var r = 0; r < regs.length; r++) {
            var reg = regs[r];
            var data = ddBuf(pid, reg.start, reg.end - reg.start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, tag === "ocr" ? 4 : 10);
            for (var i = 0; i < strs.length; i++) {
                var s = strs[i];
                if (seen[tag][s]) continue;
                seen[tag][s] = 1;
                counts[tag]++;
                if (counts[tag] > 60000) { seen[tag] = {}; counts[tag] = 0; }
                if (tag === "ocr") {
                    if (/^[A-Za-z0-9][A-Za-z0-9 .,:;'\"()_\-/&%+!?]{2,80}$/.test(s) || /^\d{1,5}$/.test(s)) {
                        send({ kind: "raw", ts: now, text: s.slice(0, 200) });
                    }
                } else {
                    if (s.indexOf("{") >= 0) {
                        var hit = false;
                        for (var k = 0; k < KEYS.length; k++) {
                            if (s.indexOf(KEYS[k]) >= 0) { hit = true; break; }
                        }
                        if (hit) {
                            send({ kind: "tx", ts: now, text: s.slice(0, 2000), fields: { src: tag, len: s.length } });
                            for (var j = 0; j < KEYS.length; j++) {
                                var mm = new RegExp('"' + KEYS[j] + '"\\s*:\\s*"([^"]{0,200})"').exec(s);
                                if (mm) {
                                    var f = {};
                                    f[KEYS[j]] = mm[1];
                                    send({ kind: "ident", ts: now, fields: f });
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

send({ kind: "ident", ts: "boot", fields: { note: "node ocr poller started", pids: PIDS } });

var ticks = 0;
var timer = setInterval(function () {
    ticks++;
    try { poll(); } catch (e) {
        send({ kind: "ident", ts: "err", fields: { poll_error: String(e && e.message || e) } });
    }
    if (ticks % 40 === 0) {
        send({ kind: "ident", ts: new Date().toISOString().slice(11, 19), fields: { heartbeat: ticks, new_ocr: counts.ocr, new_acr: counts.acr, new_an: counts.analysis } });
    }
    if (ticks >= 2000) { clearInterval(timer); send({ kind: "ident", ts: "end", fields: { note: "poller done (30min budget)" } }); }
}, 1500);

console.log("node ocr poller armed");
