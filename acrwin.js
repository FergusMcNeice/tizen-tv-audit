"use strict";
// acrwin.js - CONTINUOUS query-window scraper. Runs a tight self-rescheduling
// setTimeout chain (back-to-back, ~150ms gap) for 6 minutes so we reliably catch
// the TRANSIENT ACR config JSON (grid/bit-layout/maths + matchInfo) in the heap
// during the query window. Each pass extracts readable JSON strings (contain
// "key": pairs) from heap/anon regions, accumulates unique ones, and flushes the
// accumulated set to the PC :9999 capture channel every ~20s. node 4.4-safe.
// Retrieval: capture_acrwin_*.json on the PC.
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var PORT = 9999;
var DURATION_MS = 360000;   // 6 minutes
var GAP_MS = 150;           // small gap so we don't fully peg the CPU
var FLUSH_MS = 20000;       // flush accumulated JSON every 20s

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
function heapRegions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000), regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var label = line.length > 73 ? line.slice(73).trim() : "";
        // heap + anonymous (where malloc'd live JSON lives); skip file-backed libs
        if (!(label.indexOf("[heap]") === 0 || label === "" || label.indexOf("[") === 0)) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 1024 * 1024) });
    });
    return regs.slice(0, 24);
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
function isJson(s) {
    if (s.indexOf('":') < 0) return false;
    var m = s.match(/"[A-Za-z_][A-Za-z0-9_ .\/-]*"\s*:/g);
    return m && m.length >= 1;
}

var found = {};          // dedupe map
var foundList = [];      // ordered unique
var lastFlush = 0;
var lastPid = null;
var passes = 0;
var start = Date.now();

function scrapeOnce() {
    var pid = findPid();
    lastPid = pid;
    if (!pid) return;
    var regs = heapRegions(pid);
    for (var r = 0; r < regs.length; r++) {
        var data = ddBuf(pid, regs[r].start, regs[r].end - regs[r].start);
        if (!data || !data.length) continue;
        var strs = stringsOf(data, 14);
        for (var i = 0; i < strs.length; i++) {
            var s = strs[i];
            if (s.length > 6000) s = s.slice(0, 6000);
            if (!isJson(s)) continue;
            var k = s.slice(0, 160);
            if (found[k]) continue;
            found[k] = 1;
            foundList.push({ ts: Date.now() - start, text: s });
        }
    }
}

function maybeFlush() {
    var now = Date.now();
    if (now - lastFlush < FLUSH_MS) return;
    lastFlush = now;
    post("/acrwin_flush", { kind: "flush", ts: new Date().toISOString(),
        passes: passes, acr_pid: lastPid, elapsed_ms: now - start,
        total: foundList.length, json: foundList.slice(-80) });
}

function loop() {
    try { scrapeOnce(); } catch (e) {}
    passes++;
    maybeFlush();
    if (Date.now() - start >= DURATION_MS) {
        post("/acrwin_end", { kind: "end", ts: new Date().toISOString(),
            passes: passes, acr_pid: lastPid, total: foundList.length, json: foundList.slice(-120) });
        return;
    }
    setTimeout(loop, GAP_MS);
}

post("/acrwin_boot", { kind: "diag", ts: new Date().toISOString(),
    fields: { note: "acrwin up (6min continuous query-window scrape)", pid: process.pid, dur: DURATION_MS, gap: GAP_MS } });
setTimeout(loop, 200);
console.log("acrwin up");
