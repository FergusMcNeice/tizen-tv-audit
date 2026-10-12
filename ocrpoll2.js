"use strict";
// ocrpoll2.js - live OCR telemetry poller v2.
// - primes the dedupe set silently on first scan (no burst of stale strings)
// - buffers events while the viewer socket is down
// - emits periodic snapshots of current text-like strings
// - heartbeat with poll timing
var net = require("net");
var cp = require("child_process");

var PC = "192.168.1.64";
var VIEW_PORT = 19999;
var PIDS = { ocr: 1394, analysis: 1395, acr: 1962 };
var KEYS = ["channelName", "programId", "programName", "contentId", "psid",
            "recog_content", "uduration", "device_id", "mediaTime", "channelId"];

var queue = [];
var sock = null;
function send(ev) {
    if (queue.length > 400) queue.shift();
    queue.push(JSON.stringify(ev) + "\n");
    flush();
}
function flush() {
    if (!sock || sock.destroyed) {
        try {
            sock = net.connect(VIEW_PORT, PC);
            sock.on("error", function () { sock = null; });
            sock.on("connect", function () { while (queue.length) { try { sock.write(queue.shift()); } catch (e) { break; } } });
        } catch (e) { sock = null; return; }
    }
    while (queue.length) {
        try { sock.write(queue.shift()); } catch (e) { break; }
    }
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 150000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        var label = line.length > 73 ? line.slice(73).trim() : "";
        if (label.indexOf("[heap]") === 0 || label.indexOf("libOCREngine") >= 0 ||
            (label === "" && b - a >= 4096 && b - a <= 2 * 1024 * 1024)) {
            if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
        }
    });
    return regs;
}

function ddBuf(pid, start, len) {
    try {
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + Math.floor(start / 4096) +
            " count=" + Math.ceil(len / 4096) + " 2>/dev/null", { timeout: 10000 });
    } catch (e) { return null; }
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

var TEXTISH = /^[A-Za-z0-9][A-Za-z0-9 .,:;'\"()_\-/&%+!?]{2,80}$/;
var seen = { ocr: {}, analysis: {}, acr: {} };
var current = { ocr: [], analysis: [], acr: [] };
var primed = false;

function poll() {
    var t0 = Date.now();
    Object.keys(PIDS).forEach(function (tag) {
        var pid = PIDS[tag];
        var regs;
        try { regs = regions(pid); } catch (e) { return; }
        current[tag] = [];
        for (var r = 0; r < regs.length; r++) {
            var reg = regs[r];
            var data = ddBuf(pid, reg.start, reg.end - reg.start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, tag === "ocr" ? 4 : 10);
            for (var i = 0; i < strs.length; i++) {
                var s = strs[i];
                if (tag === "ocr" && (TEXTISH.test(s) || /^\d{1,5}$/.test(s))) {
                    if (current[tag].length < 60) current[tag].push(s);
                }
                if (seen[tag][s]) continue;
                seen[tag][s] = 1;
                if (!primed) continue;
                var now = new Date().toISOString().slice(11, 19);
                if (tag === "ocr") {
                    if (TEXTISH.test(s) || /^\d{1,5}$/.test(s)) {
                        send({ kind: "raw", ts: now, text: s.slice(0, 200) });
                    }
                } else {
                    if (s.indexOf("{") >= 0) {
                        var hit = false;
                        for (var k = 0; k < KEYS.length; k++) if (s.indexOf(KEYS[k]) >= 0) { hit = true; break; }
                        if (hit) {
                            send({ kind: "tx", ts: now, text: s.slice(0, 2000), fields: { src: tag, len: s.length } });
                            for (var j = 0; j < KEYS.length; j++) {
                                var mm = new RegExp('"' + KEYS[j] + '"\\s*:\\s*"([^"]{0,200})"').exec(s);
                                if (mm) { var f = {}; f[KEYS[j]] = mm[1]; send({ kind: "ident", ts: now, fields: f }); }
                            }
                        }
                    }
                }
            }
        }
    });
    primed = true;
    return Date.now() - t0;
}

send({ kind: "ident", ts: "boot", fields: { note: "ocr poller v2 started (priming first scan)", pids: PIDS } });

var ticks = 0, lastMs = 0;
var timer = setInterval(function () {
    ticks++;
    try { lastMs = poll(); } catch (e) {
        send({ kind: "ident", ts: "err", fields: { poll_error: String(e && e.message || e) } });
    }
    if (ticks % 8 === 0) {
        send({ kind: "ident", ts: new Date().toISOString().slice(11, 19),
               fields: { heartbeat: ticks, poll_ms: lastMs, queued: queue.length } });
        send({ kind: "raw", ts: new Date().toISOString().slice(11, 19),
               text: "SNAPSHOT ocr: " + current.ocr.slice(0, 8).join(" | "),
               fields: { mode: "snapshot" } });
    }
}, 2000);

console.log("ocr poller v2 armed");
