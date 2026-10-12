"use strict";
// acrprobe.js - broad diagnostic: dump ALL readable strings from the ACRService
// heap (no filter) so we can SEE what Samsung telemetry text is actually present.
// audit36-style sync scrape + one-shot setTimeout posts. node 4.4-safe.
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
function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 200000), regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
    });
    return regs.slice(0, 40);
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

function scrape(tag) {
    var pid = findPid();
    var all = [];
    if (pid) {
        var regs = regions(pid);
        for (var r = 0; r < regs.length; r++) {
            var data = ddBuf(pid, regs[r].start, regs[r].end - regs[r].start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, 16);
            for (var i = 0; i < strs.length; i++) {
                // keep JSON-ish (has "key":) OR long-ish text; skip obvious file paths
                var s = strs[i];
                if (s.length > 3000) s = s.slice(0, 3000);
                if (s.indexOf('":') >= 0 || (s.length >= 25 && s.indexOf("/") < 0)) {
                    all.push(s.slice(0, 500));
                }
            }
        }
    }
    // dedupe + cap
    var seen = {}, uniq = [];
    for (var k = 0; k < all.length; k++) {
        if (seen[all[k]]) continue;
        seen[all[k]] = 1;
        uniq.push(all[k]);
        if (uniq.length >= 200) break;
    }
    post("/probe_" + tag, { kind: "probe", ts: new Date().toISOString(), tag: tag, acr_pid: pid, n: uniq.length, strings: uniq });
}

post("/probe_boot", { kind: "diag", fields: { note: "acrprobe up", pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t20"); }, 20000);
setTimeout(function () { scrape("t60"); }, 60000);
setTimeout(function () { scrape("t120"); }, 120000);
console.log("acrprobe up");
