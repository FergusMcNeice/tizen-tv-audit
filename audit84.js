"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
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

function rwRegions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 120000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: b, label: line.slice(73).trim() || "anon" });
    });
    return regs;
}

var out = {};
out.started = new Date().toISOString();
out.tools = sh("for t in strings dd od hexdump python3 python; do echo -n \"$t: \"; which $t 2>/dev/null || echo missing; done");

// node-fs /proc/pid/mem test
function sampleNode(pid, wantJson) {
    var regs = rwRegions(pid);
    var result = { regions: regs.length, strings: [], err: null };
    try {
        var fd = fs.openSync("/proc/" + pid + "/mem", "r");
        var total = 0;
        for (var i = 0; i < regs.length && total < 6 * 1024 * 1024; i++) {
            var r = regs[i];
            var len = Math.min(r.end - r.start, 2 * 1024 * 1024);
            var buf = new Buffer(len);
            var n = fs.readSync(fd, buf, 0, len, r.start);
            total += n;
            var strs = stringsOf(buf.slice(0, n), wantJson ? 8 : 5);
            for (var j = 0; j < strs.length; j++) {
                var s = strs[j];
                if (wantJson) {
                    if (/\{/.test(s) && /(channelName|programId|psid|contentId|recog|title|Title|mediaTime)/.test(s)) {
                        result.strings.push(s.slice(0, 400));
                    }
                } else {
                    if (result.strings.length < 50 && /[A-Za-z]{3}/.test(s)) result.strings.push(s.slice(0, 120));
                }
            }
        }
        fs.closeSync(fd);
    } catch (e) {
        result.err = String(e.message || e);
    }
    return result;
}

out.node_mem_ocr = sampleNode(1394, false);
out.node_mem_acr = sampleNode(1962, true);
out.node_mem_analysis = sampleNode(1395, true);

post("/ocr_probe4", out);
post("/ocr_probe4_done", { started: out.started });
