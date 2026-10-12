"use strict";
// acrconfig.js - capture the ACR "instructions from Samsung" reliably. The server
// tunable config (grid size / bit layout / maths / query_interval / sorconfigstring)
// is STORED after Samsung sends it (vconf db/acr/* + ACR config files). Dump those
// PLUS a few query-window memory scrapes (broad ": filter) to catch the live JSON.
// audit36-style sync work + one-shot setTimeout posts. node 4.4-safe.
// Retrieval: POSTs to PC :9999 -> capture_acfg_*.json.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 20000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

// ---- 1. persistent config: ACR files + vconf db/acr ----
function dumpConfig() {
    var out = {};
    out.pwd = sh("id; echo ---", 2000);
    // ACR config / state files
    out.acr_files = sh("find / -iname '*acr*' -type f 2>/dev/null | grep -v '/proc/' | head -60", 6000);
    out.vconf_acr = sh("find / -path '*db/acr*' 2>/dev/null | head -40", 4000);
    out.disclaimer = sh("find / -iname '*disclaimer*' -o -iname '*homedata*' 2>/dev/null | grep -v '/proc/' | head -20", 3000);
    // vconf keys (config namespace)
    out.vconf_dump = sh("vconftool get db 2>/dev/null | head -40; echo '---'; vconftool get db/acr 2>/dev/null | head -40", 6000);
    // settings-service / config files
    out.ocr_deact = sh("find / -iname 'ocr_deactivation*' 2>/dev/null | head; find / -iname '*acr*config*' -o -iname '*acr*conf*' 2>/dev/null | grep -v /proc/ | head -20", 4000);
    // cat any small acr config/json files found
    out.acr_conf_content = sh("for f in $(find / -iname '*acr*' -type f \\( -name '*.json' -o -name '*.conf' -o -name '*.txt' -o -name '*.cfg' -o -name '*.xml' \\) 2>/dev/null | grep -v /proc/ | head -15); do echo \"FILE:$f\"; head -c 2000 \"$f\"; echo; done", 12000);
    return out;
}

// ---- 2. query-window memory scrape (broad ": filter) ----
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
function scrapeMem(tag) {
    var pid = findPid();
    var found = [];
    if (pid) {
        var txt = sh("cat /proc/" + pid + "/maps", 200000), regs = [];
        txt.split("\n").forEach(function (line) {
            var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
            if (!m) return;
            var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
            if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
        });
        for (var r = 0; r < regs.length && found.length < 200; r++) {
            var data = ddBuf(pid, regs[r].start, regs[r].end - regs[r].start);
            if (!data || !data.length) continue;
            var strs = stringsOf(data, 16);
            for (var i = 0; i < strs.length && found.length < 200; i++) {
                var s = strs[i];
                if (s.indexOf('":') < 0) continue;
                var m = s.match(/"[A-Za-z_][A-Za-z0-9_]*"\s*:/g);
                if (!m || m.length < 1) continue;
                found.push(s.slice(0, 1500));
            }
        }
    }
    var seen = {}, uniq = [];
    for (var k = 0; k < found.length; k++) { if (!seen[found[k]]) { seen[found[k]] = 1; uniq.push(found[k]); } }
    return { tag: tag, acr_pid: pid, n: uniq.length, json: uniq };
}

// boot + config dump
post("/acfg_boot", { kind: "diag", fields: { note: "acrconfig up", pid: process.pid } });
var cfg = dumpConfig();
post("/acfg_config", { kind: "config", ts: new Date().toISOString(), cfg: cfg });

// query-window memory scrapes
var m0 = scrapeMem("t0");
post("/acfg_mem_t0", { kind: "mem", ts: new Date().toISOString(), data: m0 });

setTimeout(function () { post("/acfg_mem_t60", { kind: "mem", ts: new Date().toISOString(), data: scrapeMem("t60") }); }, 60000);
setTimeout(function () { post("/acfg_mem_t120", { kind: "mem", ts: new Date().toISOString(), data: scrapeMem("t120") }); }, 120000);
setTimeout(function () { post("/acfg_mem_t180", { kind: "mem", ts: new Date().toISOString(), data: scrapeMem("t180") }); }, 180000);
setTimeout(function () { post("/acfg_mem_t240", { kind: "mem", ts: new Date().toISOString(), data: scrapeMem("t240") }); }, 240000);
setTimeout(function () { post("/acfg_mem_t300", { kind: "mem", ts: new Date().toISOString(), data: scrapeMem("t300") }); }, 300000);

console.log("acrconfig up");
