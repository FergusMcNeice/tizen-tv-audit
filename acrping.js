"use strict";
// acrping.js - minimal delivery test. Posts one marker to :9999 using the exact
// same post() style as audit36.js (known-working). Nothing else. node 4.4-safe.
var http = require("http");
var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

post("/acrping", { kind: "diag", ts: new Date().toISOString(), fields: { note: "acrping delivered", node: process.version, pid: process.pid } });
console.log("acrping.js ran");
