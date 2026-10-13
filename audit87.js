"use strict";
// audit87.js - diagnose broken shell after remount. Use node fs, not child_process.
var fs = require("fs");
var http = require("http");
var cp = require("child_process");
var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function () {});
    req.write(data);
    req.end();
}

var out = {};
out.started = new Date().toISOString();

// 1. node fs works?
try { out.proc_self = fs.readFileSync("/proc/self/status", "utf8").split("\n").slice(0, 8).join(" | "); }
catch (e) { out.proc_self = "ERR " + e.message; }

// 2. maps of acr via fs
try {
    var pids = fs.readdirSync("/proc").filter(function (x) { return /^\d+$/.test(x); });
    out.pids_count = pids.length;
    var acrPid = null;
    pids.forEach(function (p) {
        try {
            var cmd = fs.readFileSync("/proc/" + p + "/cmdline", "utf8");
            if (cmd.indexOf("/usr/bin/acr") === 0) acrPid = p;
        } catch (e) {}
    });
    out.acr_pid = acrPid;
    if (acrPid) {
        try { out.acr_maps = fs.readFileSync("/proc/" + acrPid + "/maps", "utf8").split("\n").filter(function (l) { return l.indexOf("VDCurl") >= 0 || l.indexOf("acr") >= 0; }).slice(0, 8).join("\n"); }
        catch (e) { out.acr_maps = "ERR " + e.message; }
    }
} catch (e) { out.proc_err = e.message; }

// 3. try execSync WITHOUT encoding (buffer) to see raw output
try {
    var buf = cp.execSync("id", { timeout: 5000 });
    out.id_buf_hex = buf.toString("hex").slice(0, 80);
    out.id_str = buf.toString("ascii").slice(0, 120);
} catch (e) {
    out.id_err = e.message;
    try { out.id_err_stdout_hex = e.stdout ? e.stdout.toString("hex").slice(0, 80) : "none"; } catch (e2) {}
}

// 4. try execSync with /system/bin/sh or explicit path
try {
    var buf2 = cp.execSync("/bin/ls /usr/bin/acr", { timeout: 5000 });
    out.ls_str = buf2.toString("ascii").slice(0, 200);
} catch (e) { out.ls_err = e.message; }

post("/p87_diag", out);
post("/p87_done", { started: out.started });
