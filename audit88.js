"use strict";
// audit88.js - patch on-disk binaries via node fs (execSync broken after remount).
// /usr/bin/acr  off 0x86c08 + 0x87c84   /usr/lib/libVDCurl.so.0.9 off 0xBC24
// All -> 01 20 70 47 (movs r0,#1 ; bx lr). Then try to start acr via spawn.
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

var STUB = new Buffer([0x01, 0x20, 0x70, 0x47]);
var out = {};
out.started = new Date().toISOString();

function patchFile(path, offsets) {
    var results = [];
    var fd = null;
    try {
        fd = fs.openSync(path, "r+");
    } catch (e) {
        return [{ err: "open: " + e.message }];
    }
    offsets.forEach(function (off) {
        var r = { off: "0x" + off.toString(16) };
        try {
            var before = new Buffer(4);
            fs.readSync(fd, before, 0, 4, off);
            r.before = before.toString("hex");
            fs.writeSync(fd, STUB, 0, 4, off);
            var after = new Buffer(4);
            fs.readSync(fd, after, 0, 4, off);
            r.after = after.toString("hex");
            r.ok = r.after === "01207047";
        } catch (e) {
            r.err = e.message;
        }
        results.push(r);
    });
    fs.closeSync(fd);
    return results;
}

out.acr_patch = patchFile("/usr/bin/acr", [0x86c08, 0x87c84]);
out.vd_patch = patchFile("/usr/lib/libVDCurl.so.0.9", [0xBC24]);

// try spawn (async) to start acr
try {
    var child = cp.spawn("systemctl", ["start", "acr.service"], { detached: true, stdio: "ignore" });
    child.unref();
    out.spawn = "pid=" + child.pid;
} catch (e) {
    out.spawn = "ERR " + e.message;
}

// check after 3s
setTimeout(function () {
    var o2 = {};
    try {
        var pids = fs.readdirSync("/proc").filter(function (x) { return /^\d+$/.test(x); });
        var acrPid = null;
        pids.forEach(function (p) {
            try {
                var cmd = fs.readFileSync("/proc/" + p + "/cmdline", "utf8");
                if (cmd.indexOf("/usr/bin/acr") === 0) acrPid = p;
            } catch (e) {}
        });
        o2.acr_pid = acrPid;
    } catch (e) { o2.err = e.message; }
    post("/p88_after", o2);
}, 3500);

post("/p88_patch", out);
post("/p88_done", { started: out.started });
