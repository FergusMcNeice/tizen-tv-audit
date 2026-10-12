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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function ddBuf(pid, start, len) {
    try { return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + Math.floor(start / 4096) + " count=" + Math.ceil(len / 4096) + " 2>/dev/null", { timeout: 10000 }); }
    catch (e) { return null; }
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

function sample(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 150000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        var label = line.length > 73 ? line.slice(73).trim() : "";
        if (label.indexOf("[heap]") === 0 || label.indexOf("OCREngine") >= 0 || label === "") {
            if (b > a) regs.push({ start: a, end: Math.min(b, a + 1024 * 1024), label: label || "anon" });
        }
    });
    var out = { regions: regs.length, total_strings: 0, sample: [], per_region: [] };
    for (var i = 0; i < regs.length && i < 25; i++) {
        var data = ddBuf(pid, regs[i].start, regs[i].end - regs[i].start);
        if (!data) continue;
        var strs = stringsOf(data, 5);
        out.per_region.push({ label: regs[i].label, bytes: data.length, strings: strs.length });
        out.total_strings += strs.length;
        for (var j = 0; j < strs.length && out.sample.length < 40; j++) {
            out.sample.push(strs[j].slice(0, 100));
        }
    }
    return out;
}

var out = {};
out.started = new Date().toISOString();
out.ocr = sample(1394);
out.analysis = sample(1395);
out.acr = sample(1962);
out.cpu = sh("ps aux | grep -E 'contents-recognition|contents-analysis|acr' | grep -v grep");
post("/ocr_heap_diag", out);
post("/ocr_heap_diag_done", { started: out.started });
