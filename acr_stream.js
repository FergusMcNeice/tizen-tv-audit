"use strict";
// ACR live streamer - runs as root on the TV via TizenBrew node -e.
// Scrapes the ACRService process heap via dd /proc/<pid>/mem and forwards every
// JSON blob. Dual-channel so nothing is lost:
//   * TCP stream -> PC:19999  (live viewer acr_feed.py)
//   * HTTP POST  -> PC:9999   (proven capture channel; lands as capture_*.json)
// Direction classification:
//   TX  = TV -> Samsung (pre-encryption): fingerprint output bits raws/recog_content/fp_ver
//   RX  = Samsung -> TV (post-decryption): matchInfo + server-tunable config
//   CFG = the tunable knobs (query_interval / sorconfigstring / thresholds / grid / bit)
// node 4.4-safe (var / function / no arrows / no template literals / indexOf only).

var fs = require("fs");
var net = require("net");
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var VIEW_PORT = 19999;
var HTTP_PORT = 9999;

var TX_KEYS = ["raws", "recog_content", "fp_ver", "device_id", "psid", "uduration",
               "tv_source", "tv_ch", "hdmi_info", "viewing", "query_sum", "try_cnt"];
var RX_KEYS = ["matchInfo", "contentId", "channelId", "programId", "programName",
               "startTime", "mediaTime", "channelName", "bypassData", "engineType"];
var CFG_KEYS = ["query_interval", "AdQueryIntervalSec", "EdgeQueryIntervalSec",
                "refreshInterval", "DelayedServerQueryInterval", "query_mode",
                "sorconfigstring", "matching", "MatchingServerURL", "threshold",
                "thres", "grid", "bit", "layout", "sample", "fft", "mfcc", "lm_",
                "query_info", "query_freq"];

// ---- TCP live stream (best-effort) ----
var sock = null;
function sendTcp(ev) {
    var line = JSON.stringify(ev) + "\n";
    if (!sock || sock.destroyed) {
        try {
            sock = net.connect(VIEW_PORT, PC);
            sock.on("error", function () { sock = null; });
            sock.on("close", function () { sock = null; });
        } catch (e) { sock = null; }
    }
    try { sock.write(line); } catch (e) { sock = null; }
}

// ---- HTTP POST capture (proven channel) ----
function sendHttp(tag, obj) {
    try {
        var data = JSON.stringify(obj);
        var req = http.request({ host: PC, port: HTTP_PORT, path: "/" + tag, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
            function (res) { try { res.resume(); } catch (e) {} });
        req.on("error", function () {});
        req.write(data);
        req.end();
    } catch (e) {}
}

function emit(ev) {
    sendTcp(ev);
    // also mirror to HTTP capture (throttled to avoid flooding :9999 with every blob)
    if (ev.kind === "diag" || ev.kind === "cfg") {
        sendHttp("acr_" + (ev.kind), ev);
    }
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
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages +
                           " count=" + countPages + " 2>/dev/null", { timeout: 12000, maxBuffer: 32 * 1024 * 1024 });
    } catch (e) {
        return null;
    }
}

function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 4 * 1024 * 1024) });
    });
    return regs;
}

function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i acr", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) {
        if (/acr/i.test(line) && !/grep/i.test(line)) {
            var mm = line.trim().match(/^(\d+)/) || line.trim().match(/\b(\d{2,7})\b/);
            if (mm) {
                if (/ACRService|\/usr\/bin\/acr\b/i.test(line)) pid = parseInt(mm[1], 10);
                else if (!pid) pid = parseInt(mm[1], 10);
            }
        }
    });
    return pid;
}

function has(s, keys) {
    for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i]) >= 0) return true;
    return false;
}

function classify(s) {
    var tx = has(s, TX_KEYS), rx = has(s, RX_KEYS), cfg = has(s, CFG_KEYS);
    if (tx && rx) return "BOTH";
    if (tx) return "TX";
    if (rx) return "RX";
    if (cfg) return "CFG";
    return "OTHER";
}

function pullFields(s, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) {
        var mm = new RegExp('"' + keys[i] + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[-0-9.]+|true|false|null|\\{[^}]{0,400}\\}|\\[[^\\]]{0,400}\\])').exec(s);
        if (mm) out[keys[i]] = mm[1].slice(0, 400);
    }
    return out;
}

function jsonAt(buf, idx) {
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var i = idx; i < buf.length && i < idx + 200000; i++) {
        var c = buf[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === 92) esc = true;
            else if (c === 34) inStr = false;
            continue;
        }
        if (c === 34) { inStr = true; continue; }
        if (c === 123) depth++;
        else if (c === 125) { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > idx ? buf.slice(idx, end + 1) : null;
}

var seen = {};
var counts = { TX: 0, RX: 0, CFG: 0, BOTH: 0, OTHER: 0 };
var firstBlobPosted = false;

function poll() {
    var now = new Date().toISOString().slice(11, 19);
    var pid = findPid();
    if (!pid) {
        emit({ kind: "diag", ts: now, fields: { acr_pid: null, note: "ACRService not found" } });
        return;
    }
    var regs;
    try { regs = regions(pid); } catch (e) {
        emit({ kind: "diag", ts: now, fields: { acr_pid: pid, err: String(e && e.message || e) } });
        return;
    }
    for (var r = 0; r < regs.length; r++) {
        var reg = regs[r];
        var data = ddBuf(pid, reg.start, reg.end - reg.start);
        if (!data || !data.length) continue;
        for (var i = 0; i < data.length; i++) {
            if (data[i] !== 123) continue;
            var j = jsonAt(data, i);
            if (!j || j.length < 40 || j.indexOf('"') < 0) continue;
            var dir = classify(j);
            if (dir === "OTHER") continue;
            var key = dir + "|" + j.slice(0, 240);
            if (seen[key]) continue;
            seen[key] = 1;
            if (counts[dir] !== undefined) counts[dir]++;
            var ev = {
                kind: "acr", ts: now, dir: dir,
                addr: "0x" + reg.start.toString(16),
                len: j.length,
                fields: pullFields(j, TX_KEYS.concat(RX_KEYS, CFG_KEYS)),
                text: j.slice(0, 6000)
            };
            emit(ev);
            // post the first blob of each direction to :9999 as hard proof + full text
            if (!firstBlobPosted || dir === "TX" || dir === "RX") {
                sendHttp("acrblob_" + dir, ev);
            }
            if (dir !== "CFG" && (j.indexOf("query_interval") >= 0 || j.indexOf("sorconfigstring") >= 0 ||
                j.indexOf("AdQueryIntervalSec") >= 0 || j.indexOf("threshold") >= 0)) {
                emit({ kind: "cfg", ts: now, dir: "CFG", fields: pullFields(j, CFG_KEYS) });
            }
            i += j.length > 2 ? j.length - 2 : 0;
        }
    }
    if (counts.TX + counts.RX + counts.CFG + counts.BOTH > 4000) {
        seen = {}; counts = { TX: 0, RX: 0, CFG: 0, BOTH: 0, OTHER: 0 };
    }
}

// boot beacon to BOTH channels immediately (proof the module runs)
var boot = { kind: "diag", ts: "boot", fields: { note: "acr streamer armed", pc: PC, port: VIEW_PORT, http: HTTP_PORT, pid: process.pid, node: process.version } };
sendTcp(boot);
sendHttp("acrboot", boot);

var ticks = 0;
var timer = setInterval(function () {
    ticks++;
    try { poll(); } catch (e) {
        emit({ kind: "diag", ts: new Date().toISOString().slice(11, 19), fields: { poll_error: String(e && e.message || e) } });
    }
    if (ticks % 20 === 0) {
        var hb = { kind: "diag", ts: new Date().toISOString().slice(11, 19),
                   fields: { heartbeat: ticks, acr_pid: findPid(), TX: counts.TX, RX: counts.RX, CFG: counts.CFG, BOTH: counts.BOTH } };
        emit(hb);
        sendHttp("acrheartbeat", hb);
    }
    if (ticks >= 2000) {
        clearInterval(timer);
        var end = { kind: "diag", ts: "end", fields: { note: "streamer done", counts: counts } };
        emit(end);
        sendHttp("acrend", end);
    }
}, 1500);

console.log("acr streamer armed node=" + process.version);
