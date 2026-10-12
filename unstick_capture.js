"use strict";
// unstick_capture.js - query-window ACR scraper (content is PLAYING). Robust per
// the corrected diagnosis: synchronous writeFileSync progress log (so crashes are
// visible even if async posts vanish) + POST to PC :9999. Continuous self-
// rescheduling setTimeout scrape over ~6min to cross a query window. Captures
//   * JSON strings (the Samsung config/match if it surfaces)
//   * ACR-marker strings (telemetry)
//   * note binary fingerprint regions (the output bits)
// node 4.4-safe.
var http = require("http");
var cp = require("child_process");
var fs = require("fs");

var PC = "192.168.1.64";
var PORT = 9999;
var LOG = "/tmp/acr_cap.log";
var DURATION_MS = 360000;
var GAP_MS = 200;
var FLUSH_MS = 20000;

function slog(msg) {
    try { fs.writeSync(fs.openSync(LOG, "a"), new Date().toISOString() + " " + msg + "\n"); } catch (e) {}
}
function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: PC, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function (e) {});
    req.write(data); req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 10000 }).slice(0, cap || 4000); }
    catch (e) { return ""; }
}
function ddBuf(pid, start, len) {
    var skip = Math.floor(start / 4096), cnt = Math.ceil(len / 4096);
    try { return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skip + " count=" + cnt + " 2>/dev/null", { timeout: 10000, maxBuffer: 24 * 1024 * 1024 }); }
    catch (e) { return null; }
}
function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i 'ACRService\\|/usr/bin/acr' | grep -v grep", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) { var mm = line.trim().match(/^(\d+)/); if (mm && !pid) pid = parseInt(mm[1], 10); });
    return pid;
}
function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000), regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 1024 * 1024) });
    });
    return regs.slice(0, 30);
}
function stringsOf(buf, minLen) {
    var out = [], cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= minLen) out.push(cur); cur = ""; }
    }
    if (cur.length >= minLen) out.push(cur);
    return out;
}

var MARKERS = ["query_interval","AdQueryIntervalSec","EdgeQueryIntervalSec","refreshInterval",
    "DelayedServerQueryInterval","sorconfigstring","MatchingServerURL","threshold","grid",
    "layout","fft","mfcc","fp_ver","raws","recog_content","device_id","psid","uduration",
    "tv_source","tv_ch","hdmi_info","viewing","matchInfo","contentId","channelId","programId",
    "programName","startTime","mediaTime","channelName","bypassData","engineType","genre"];

var found = {};
var foundList = [];
var lastFlush = 0, lastPid = null, passes = 0;
var start = Date.now();

function scrapeOnce() {
    var pid = findPid();
    lastPid = pid;
    if (!pid) return;
    var regs = regions(pid);
    for (var r = 0; r < regs.length; r++) {
        var data = ddBuf(pid, regs[r].start, regs[r].end - regs[r].start);
        if (!data || !data.length) continue;
        var strs = stringsOf(data, 12);
        for (var i = 0; i < strs.length; i++) {
            var s = strs[i];
            if (s.length > 6000) s = s.slice(0, 6000);
            var isJson = s.indexOf('":') >= 0 && /"[A-Za-z_][A-Za-z0-9_ .\/-]*"\s*:/.test(s);
            var hits = [];
            for (var k = 0; k < MARKERS.length; k++) if (s.indexOf(MARKERS[k]) >= 0) hits.push(MARKERS[k]);
            if (!isJson && !hits.length) continue;
            if (s.indexOf("/") >= 0 && s.indexOf("http") < 0 && !isJson) continue;
            var key = s.slice(0, 160);
            if (found[key]) continue;
            found[key] = 1;
            foundList.push({ kind: isJson ? "json" : "str", hits: hits, text: s });
        }
    }
}

function maybeFlush() {
    var now = Date.now();
    if (now - lastFlush < FLUSH_MS) return;
    lastFlush = now;
    slog("flush passes=" + passes + " total=" + foundList.length + " pid=" + lastPid);
    post("/uc_flush", { kind: "flush", ts: new Date().toISOString(), passes: passes,
        acr_pid: lastPid, elapsed_ms: now - start, total: foundList.length, items: foundList.slice(-80) });
}

function loop() {
    try { scrapeOnce(); } catch (e) { slog("scrape err " + String(e && e.message || e)); }
    passes++;
    maybeFlush();
    if (Date.now() - start >= DURATION_MS) {
        slog("end passes=" + passes + " total=" + foundList.length);
        post("/uc_end", { kind: "end", ts: new Date().toISOString(), passes: passes,
            acr_pid: lastPid, total: foundList.length, items: foundList.slice(-120) });
        return;
    }
    setTimeout(loop, GAP_MS);
}

slog("unstick_capture up pid=" + process.pid);
post("/uc_boot", { kind: "diag", ts: new Date().toISOString(), fields: { note: "unstick_capture up (6min, content playing)", pid: process.pid } });
setTimeout(loop, 200);
console.log("unstick_capture up");
