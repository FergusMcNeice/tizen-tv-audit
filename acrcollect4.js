"use strict";
// acrcollect4.js - STORE-only ACR scraper. Copies audit36's PROVEN pattern:
// synchronous work at load + one-shot setTimeout posts (audit36's 80s/120s snaps
// arrive; setInterval/async chains do not in this VM). node 4.4-safe.
//
// Captures plaintext JSON from the ACRService heap (root, dd /proc/<pid>/mem):
//   RX  = Samsung -> TV (post-decryption): matchInfo + server-tunable config
//         (query_interval / AdQueryIntervalSec / sorconfigstring / threshold /
//          grid / bit layout / maths)  <- the real tunables
//   TX  = TV -> Samsung (pre-encryption): fingerprint output bits
//         (raws / recog_content / fp_ver) + device ids
//   CFG = a lifted config object (the tunable knobs)
// Retrieval: each scrape POSTs to the PC :9999 capture channel -> capture_ac4_*.json.
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var PORT = 9999;

var TX_KEYS = ["raws", "recog_content", "fp_ver", "device_id", "psid", "uduration",
               "tv_source", "tv_ch", "hdmi_info", "viewing", "query_sum", "try_cnt"];
var RX_KEYS = ["matchInfo", "contentId", "channelId", "programId", "programName",
               "startTime", "mediaTime", "channelName", "bypassData", "engineType"];
var CFG_KEYS = ["query_interval", "AdQueryIntervalSec", "EdgeQueryIntervalSec",
                "refreshInterval", "DelayedServerQueryInterval", "query_mode",
                "sorconfigstring", "matching", "MatchingServerURL", "threshold",
                "thres", "grid", "bit", "layout", "sample", "fft", "mfcc", "lm_",
                "query_info", "query_freq"];

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: PC, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 4000);
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}
function ddBuf(pid, start, len) {
    var skipPages = Math.floor(start / 4096);
    var countPages = Math.ceil(len / 4096);
    try {
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages +
                           " count=" + countPages + " 2>/dev/null", { timeout: 12000, maxBuffer: 24 * 1024 * 1024 });
    } catch (e) { return null; }
}
function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i 'ACRService\\|/usr/bin/acr' | grep -v grep", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) {
        var mm = line.trim().match(/^(\d+)/);
        if (mm && !pid) pid = parseInt(mm[1], 10);
    });
    return pid;
}
function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 1024 * 1024) });
    });
    return regs.slice(0, 30);
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
    return end > idx ? buf.slice(idx, end + 1).toString("utf8") : null;
}
// keep only real JSON objects (start {" and have "key": pairs) - drops binary fp buffers
function looksJson(s) {
    if (!s || s.length > 20000) return false;
    if (s.charAt(0) !== "{") return false;
    var t = s.replace(/^\s+/, "");
    if (t.charAt(1) !== '"') return false;
    if (s.indexOf('":') < 0) return false;
    return true;
}

var seen = {};
var counts = { TX: 0, RX: 0, CFG: 0, BOTH: 0 };
var found = [];

// one synchronous scrape round -> returns summary object with blobs
function scrape(tag) {
    var now = new Date().toISOString();
    var pid = findPid();
    var blobs = [];
    if (pid) {
        var regs = regions(pid);
        for (var r = 0; r < regs.length; r++) {
            var reg = regs[r];
            var data = ddBuf(pid, reg.start, reg.end - reg.start);
            if (!data || !data.length) continue;
            for (var i = 0; i < data.length; i++) {
                if (data[i] !== 123) continue;
                var j = jsonAt(data, i);
                if (!j || j.length < 40 || j.indexOf('"') < 0) continue;
                if (!looksJson(j)) continue;
                var dir = classify(j);
                if (dir === "OTHER") continue;
                var key = dir + "|" + j.slice(0, 200);
                if (seen[key]) continue;
                seen[key] = 1;
                if (counts[dir] !== undefined) counts[dir]++;
                var rec = { dir: dir, len: j.length,
                            fields: pullFields(j, TX_KEYS.concat(RX_KEYS, CFG_KEYS)),
                            text: j.slice(0, 8000) };
                if (blobs.length < 40) blobs.push(rec);
                if (found.length < 800) found.push(rec);
                i += j.length > 2 ? j.length - 2 : 0;
            }
        }
    }
    post("/ac4_" + tag, { kind: "flush", ts: now, tag: tag, acr_pid: pid,
                          counts: counts, total: found.length, blobs: blobs });
}

// ---- audit36-style: synchronous first scrape, then one-shot setTimeouts ----
post("/ac4_boot", { kind: "diag", ts: new Date().toISOString(),
     fields: { note: "acrcollect4 up", node: process.version, pid: process.pid } });
scrape("t0");

setTimeout(function () { scrape("t20"); }, 20000);
setTimeout(function () { scrape("t50"); }, 50000);
setTimeout(function () { scrape("t80"); }, 80000);
setTimeout(function () { scrape("t120"); }, 120000);
setTimeout(function () { scrape("t180"); }, 180000);
setTimeout(function () { scrape("t240"); }, 240000);
setTimeout(function () { scrape("t300"); }, 300000);

console.log("acrcollect4 up");
