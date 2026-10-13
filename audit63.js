"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 1500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.spawn = "none";
try {
    var c = cp.spawn("/usr/bin/acr", [], { detached: true, stdio: "ignore" });
    c.unref();
    out.spawn = "detached pid=" + c.pid;
} catch (e) { out.spawn = "ERR " + e.message; }
post("/acr_restart3", out);
setTimeout(function () {
    var o = {};
    o.ps = sh("ps -ef | grep -E 'usr/bin/acr|acr-service' | grep -v grep | head -4");
    o.out = sh("tail -5 /tmp/acr.out 2>/dev/null; dmesg 2>/dev/null | tail -3");
    post("/acr_restart3_ps", o);
}, 6000);
