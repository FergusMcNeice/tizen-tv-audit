"use strict";
// ACR live streamer - runs as root on the TV via the TizenBrew module chain.
// Scrapes the ACRService process heap via dd /proc/<pid>/mem and streams, to the
// PC, every JSON blob it finds. Classifies each blob:
//   TX  = what the TV is ABOUT to send to Samsung  (pre-encryption plaintext:
//         fingerprint "output bits" raws / recog_content / fp_ver + device ids)
//   RX  = what Samsung sent DOWN to the TV         (post-decryption plaintext:
//         matchInfo + the server-tunable config: grid / bit layout / maths /
//         query_interval / AdQueryIntervalSec / sorconfigstring / thresholds)
//   CFG = a nested config object inside either direction (the tunable knobs)
// Everything is forwarded so nothing is lost; the PC side renders + logs it.
var fs = require("fs");
var net = require("net");
var cp = require("child_process");

var PC = "192.168.1.64";
var VIEW_PORT = 19999;

// Keys that mark a blob as OUTBOUND (TV -> Samsung) : the fingerprint payload.
var TX_KEYS = ["raws", "recog_content", "fp_ver", "device_id", "psid", "uduration",
               "tv_source", "tv_ch", "hdmi_info", "viewing", "query_sum", "try_cnt"];
// Keys that mark a blob as INBOUND (Samsung -> TV) : match result + instructions.
var RX_KEYS = ["matchInfo", "contentId", "channelId", "programId", "programName",
               "startTime", "mediaTime", "channelName", "bypassData", "engineType"];
// Keys that are the server-tunable control knobs (the "grid / bit layout / maths").
var CFG_KEYS = ["query_interval", "AdQueryIntervalSec", "EdgeQueryIntervalSec",
                "refreshInterval", "DelayedServerQueryInterval", "query_mode",
                "sorconfigstring", "matching", "MatchingServerURL", "threshold",
                "thres", "grid", "bit", "layout", "sample", "fft", "mfcc", "lm_",
                "query_info", "SetLMThres", "query_freq"];

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
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages +
                           " count=" + countPages + " 2>/dev/null", { timeout: 12000, maxBuffer: 32 * 1024 * 1024 });
    } catch (e) {
        return null;
    }
}

// All readable RW regions (heap + anonymous + any lib .bss). Cap each at 4MB.
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

// Find the ACR engine pid. Prefer the 'ACRService' process name, fall back to /usr/bin/acr.
function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i acr", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) {
        if (/acr/i.test(line) && !/grep/i.test(line)) {
            var mm = line.trim().match(/^(\d+)/) || line.trim().match(/\b(\d{2,7})\b/);
            if (mm && !pid) {
                // prefer the service engine over the small acr-service-app bridge
                if (/ACRService|\/usr\/bin\/acr\b/i.test(line)) pid = parseInt(mm[1], 10);
                else if (!pid) pid = parseInt(mm[1], 10);
            }
        }
    });
    return pid;
}

function classify(s) {
    var has = function (keys) {
        for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i]) >= 0) return true;
        return false;
    };
    var tx = has(TX_KEYS), rx = has(RX_KEYS), cfg = has(CFG_KEYS);
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

// Extract the biggest balanced JSON object starting at idx of '{'.
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

function poll() {
    var now = new Date().toISOString().slice(11, 19);
    var pid = findPid();
    if (!pid) {
        send({ kind: "diag", ts: now, fields: { acr_pid: null, note: "ACRService not found" } });
        return;
    }
    var regs;
    try { regs = regions(pid); } catch (e) {
        send({ kind: "diag", ts: now, fields: { acr_pid: pid, err: String(e && e.message || e) } });
        return;
    }
    for (var r = 0; r < regs.length; r++) {
        var reg = regs[r];
        var data = ddBuf(pid, reg.start, reg.end - reg.start);
        if (!data || !data.length) continue;
        // walk every '{' and try to lift a JSON object
        for (var i = 0; i < data.length; i++) {
            if (data[i] !== 123) continue;
            var j = jsonAt(data, i);
            if (!j) continue;
            // only care about blobs that carry ACR telemetry / config markers
            if (j.length < 40) continue;
            if (j.indexOf('"') < 0) continue;
            var dir = classify(j);
            if (dir === "OTHER") continue;
            // de-dup on a stable slice of the blob
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
            send(ev);
            // lift nested config knobs specifically so they show as their own line
            if (dir !== "CFG" && (j.indexOf("query_interval") >= 0 || j.indexOf("sorconfigstring") >= 0 ||
                j.indexOf("AdQueryIntervalSec") >= 0 || j.indexOf("threshold") >= 0)) {
                send({ kind: "cfg", ts: now, dir: "CFG", fields: pullFields(j, CFG_KEYS) });
            }
            i += j.length > 2 ? j.length - 2 : 0;
        }
    }
    // clear dedup cache periodically so re-sent (updated) values are re-emitted
    if (counts.TX + counts.RX + counts.CFG + counts.BOTH > 4000) { seen = {}; counts = { TX: 0, RX: 0, CFG: 0, BOTH: 0, OTHER: 0 }; }
}

send({ kind: "diag", ts: "boot", fields: { note: "acr streamer armed", pc: PC, port: VIEW_PORT, pid: process.pid } });

var ticks = 0;
var timer = setInterval(function () {
    ticks++;
    try { poll(); } catch (e) {
        send({ kind: "diag", ts: new Date().toISOString().slice(11, 19), fields: { poll_error: String(e && e.message || e) } });
    }
    if (ticks % 20 === 0) {
        send({ kind: "diag", ts: new Date().toISOString().slice(11, 19),
               fields: { heartbeat: ticks, acr_pid: findPid(), TX: counts.TX, RX: counts.RX, CFG: counts.CFG, BOTH: counts.BOTH } });
    }
    if (ticks >= 2000) { clearInterval(timer); send({ kind: "diag", ts: "end", fields: { note: "streamer done (50min budget)", counts: counts } }); }
}, 1500);

console.log("acr streamer armed");
