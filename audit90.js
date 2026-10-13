"use strict";
// audit90.js - restart TizenBrew service process to regain capabilities.
// The mount remount stripped CapEff to 0, breaking exec. Killing the service
// process (2508) lets TizenBrew parent relaunch it with fresh caps.
var fs = require("fs");
var http = require("http");
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
try { out.caps = fs.readFileSync("/proc/self/status", "utf8").split("\n").filter(function (l) { return l.indexOf("Cap") === 0; }).join(" | "); } catch (e) { out.caps = "ERR " + e.message; }
try { out.smack = fs.readFileSync("/proc/self/attr/current", "utf8"); } catch (e) { out.smack = "ERR"; }
out.pid = process.pid;

post("/p90_before", out);

// give the post 1s to flush, then terminate self
setTimeout(function () {
    try { process.kill(process.pid, "SIGTERM"); } catch (e) {}
    try { process.exit(0); } catch (e) {}
}, 1200);
