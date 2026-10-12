"use strict";
// acrcollect6.js - FOCUSED ACR telemetry scraper. Scans ONLY the [heap] and
// anonymous rw regions (where malloc'd live JSON lives) and keeps STRICTLY
// readable JSON strings (contain "key": pairs) - this drops the static D-Bus /
// library string noise and surfaces the real Samsung telemetry:
//   the server-tunable config (query_interval / sorconfigstring / threshold /
//   grid / bit layout / maths) + matchInfo + the fingerprint payload.
// audit36-style sync scrape + one-shot setTimeout posts. node 4.4-safe.
// Retrieval: POSTs to PC :9999 -> capture_ac6_*.json.
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: PC, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) {});
    req.write(data); req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 4000); }
    catch (e) { return ""; }
}
function ddBuf(pid, start, len) {
    var skip = Math.floor(start / 4096), cnt = Math.ceil(len / 4096);
    try { return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skip + " count=" + cnt + " 2>/dev/null", { timeout: 12000, maxBuffer: 24 * 1024 * 1024 }); }
    catch (e) { return null; }
}
function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i 'ACRService\\|/usr/bin/acr' | grep -v grep", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) { var mm = line.trim().match(/^(\d+)/); if (mm && !pid) pid = parseInt(mm[1], 10); });
    return pid;
}
// only [heap] + anonymous rw (no file path) = where live malloc'd JSON lives
function heapRegions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000), regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var label = line.length > 73 ? line.slice(73).trim() : "";
        var isHeap = label.indexOf("[heap]") === 0;
        var isAnon = label === "" || label.indexOf("[") === 0;
        if (!isHeap && !isAnon) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
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
// real JSON = has at least 2 "key": pairs and no binary junk
function isJsonish(s) {
    if (s.indexOf('":') < 0) return false;
    var m = s.match(/"[A-Za-z_][A-Za-z0-9_]*"\s*:/g);
    return m && m.length >= 2;
}

function scrape(tag) {
    var pid = findPid();
    var found = [];
    if (pid) {
        var regs = heapRegions(pid);
        for (var r = 0; r < regs.length; r++) {
            var data = ddBuf(pid, regs[r].start, regs[r].end - regs[r].start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, 16);
            for (var i = 0; i < strs.length; i++) {
                var s = strs[i];
                if (s.length > 4000) s = s.slice(0, 4000);
                if (!isJsonish(s)) continue;
                found.push(s.slice(0, 1500));
                if (found.length >= 300) break;
            }
            if (found.length >= 300) break;
        }
    }
    // dedupe
    var seen = {}, uniq = [];
    for (var k = 0; k < found.length; k++) {
        if (seen[found[k]]) continue;
        seen[found[k]] = 1;
        uniq.push(found[k]);
    }
    post("/ac6_" + tag, { kind: "flush", ts: new Date().toISOString(), tag: tag, acr_pid: pid, n: uniq.length, json: uniq });
}

post("/ac6_boot", { kind: "diag", fields: { note: "acrcollect6 up", pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t20"); }, 20000);
setTimeout(function () { scrape("t50"); }, 50000);
setTimeout(function () { scrape("t90"); }, 90000);
setTimeout(function () { scrape("t150"); }, 150000);
setTimeout(function () { scrape("t240"); }, 240000);
setTimeout(function () { scrape("t330"); }, 330000);
console.log("acrcollect6 up");
