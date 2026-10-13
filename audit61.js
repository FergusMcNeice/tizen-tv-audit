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
var out = {};
out.ping = "PING-" + new Date().toISOString();
try { out.id = cp.execSync("id", { encoding: "utf8" }); } catch (e) { out.id = "ERR"; }
post("/ping_test", out);
var big = { big: new Array(40000).join("X"), tag: "big" };
post("/ping_big", big);
