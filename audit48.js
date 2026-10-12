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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, 2000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.alive = "KEYINJECT-RUNNING";
out.id = sh("id");
out.devlist = sh("ls /dev/input/ 2>&1");

function ev(type, code, value) {
    var b = new Buffer(16);
    b.fill(0);
    b.writeUInt16LE(type, 8);
    b.writeUInt16LE(code, 10);
    b.writeInt32LE(value, 12);
    return b;
}

var KEY_HOME = 102;
var results = [];
for (var i = 0; i < 8; i++) {
    var dev = "/dev/input/event" + i;
    try {
        var fd = fs.openSync(dev, "w");
        fs.writeSync(fd, ev(1, KEY_HOME, 1));
        fs.writeSync(fd, ev(0, 0, 0));
        fs.writeSync(fd, ev(1, KEY_HOME, 0));
        fs.writeSync(fd, ev(0, 0, 0));
        fs.closeSync(fd);
        results.push(dev + ":OK");
    } catch (e) { results.push(dev + ":" + e.code); }
}
out.inject = results.join(" ");
post("/keyinject", out);
