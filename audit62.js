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
out.before = sh("ps -ef | grep -E 'usr/bin/acr|acr-service' | grep -v grep | head -4");
out.kill = sh("kill $(ps -ef | grep '/usr/bin/acr' | grep -v grep | awk '{print $2}') 2>/dev/null; echo done");
out.spawn = sh("(nohup /usr/bin/acr >/tmp/acr.out 2>&1 &) ; sleep 3; ps -ef | grep -E 'usr/bin/acr|acr-service' | grep -v grep | head -4");
post("/acr_restart2", out);
