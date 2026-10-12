"use strict";
// acrcollect5.js - STORE-only ACR telemetry scraper. Extracts READABLE ASCII
// strings from the ACRService heap (root, dd /proc/<pid>/mem) that contain ACR
// config/match keys - this surfaces the actual JSON text Samsung sends/receives
// (the server-tunable grid/bit-layout/maths + matchInfo + the fingerprint payload)
// rather than binary fingerprint buffers. audit36-style sync scrape + one-shot
// setTimeout posts (the proven pattern). node 4.4-safe.
//
// Retrieval: each scrape POSTs to the PC :9999 capture channel -> capture_ac5_*.json.
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var PORT = 9999;

// key markers that identify ACR telemetry text (config + match + fingerprint)
var MARKERS = [
    "query_interval", "AdQueryIntervalSec", "EdgeQueryIntervalSec", "refreshInterval",
    "DelayedServerQueryInterval", "query_mode", "sorconfigstring", "MatchingServerURL",
    "threshold", "grid", "layout", "fft", "mfcc", "fp_ver",
    "raws", "recog_content", "device_id", "psid", "uduration", "tv_source", "tv_ch",
    "hdmi_info", "viewing", "query_sum", "try_cnt",
    "matchInfo", "contentId", "channelId", "programId", "programName",
    "startTime", "mediaTime", "channelName", "bypassData", "engineType", "genre"
];

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
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
    });
    return regs.slice(0, 40);
}

// extract printable ASCII runs from a buffer
function stringsOf(buf, minLen) {
    var out = [], cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 8)) out.push(cur); cur = ""; }
    }
    if (cur.length >= (minLen || 8)) out.push(cur);
    return out;
}

function markerHits(s) {
    var hits = [];
    for (var i = 0; i < MARKERS.length; i++) {
        if (s.indexOf(MARKERS[i]) >= 0) hits.push(MARKERS[i]);
    }
    return hits;
}

var seen = {};
var found = [];

function scrape(tag) {
    var now = new Date().toISOString();
    var pid = findPid();
    var newCount = 0;
    if (pid) {
        var regs = regions(pid);
        for (var r = 0; r < regs.length; r++) {
            var reg = regs[r];
            var data = ddBuf(pid, reg.start, reg.end - reg.start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, 12);
            for (var i = 0; i < strs.length; i++) {
                var s = strs[i];
                if (s.length > 8000) s = s.slice(0, 8000);
                var hits = markerHits(s);
                if (!hits.length) continue;
                // skip obvious path/library noise
                if (s.indexOf("/") >= 0 && s.indexOf("http") < 0) continue;
                var key = s.slice(0, 200);
                if (seen[key]) continue;
                seen[key] = 1;
                newCount++;
                var rec = { kind: "acrstr", ts: now, hits: hits, len: s.length, text: s };
                if (found.length < 800) found.push(rec);
            }
        }
    }
    post("/ac5_" + tag, { kind: "flush", ts: now, tag: tag, acr_pid: pid,
                          newCount: newCount, total: found.length,
                          strings: found.slice(-50) });
}

post("/ac5_boot", { kind: "diag", ts: new Date().toISOString(),
     fields: { note: "acrcollect5 up", node: process.version, pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t20"); }, 20000);
setTimeout(function () { scrape("t50"); }, 50000);
setTimeout(function () { scrape("t80"); }, 80000);
setTimeout(function () { scrape("t120"); }, 120000);
setTimeout(function () { scrape("t180"); }, 180000);
setTimeout(function () { scrape("t240"); }, 240000);
setTimeout(function () { scrape("t300"); }, 300000);

console.log("acrcollect5 up");
