"use strict";
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + e.message); });
    req.write(data); req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.killed = sh("kill $(pidof acr) 2>/dev/null; kill $(pidof media-analytics-service) 2>/dev/null; kill $(pidof clogger-daemon) 2>/dev/null; echo KILLED");
out.trigger = sh("touch /tmp/acr/path_exists/acr_ready; sleep 4; ps -A | grep -iE 'acr|analytic|clogger'");
post("/acr63", out);
post("/acr63_done", { started: out.started });
