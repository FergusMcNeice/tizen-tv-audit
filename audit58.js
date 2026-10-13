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
out.started = new Date().toISOString();
try {
    var so = fs.readFileSync("/usr/lib/libVDCurl.so.0.9");
    out.size = so.length;
    out.b64 = so.toString("base64");
} catch (e) { out.err = "" + e.message; }
out.maps = (function () {
    try {
        var ps = cp.execSync("ps -ef | grep '/usr/bin/acr' | grep -v grep | head -1", { encoding: "utf8" });
        var pid = ps.trim().split(/[ \t]+/)[1];
        out.acr_pid = pid;
        return cp.execSync("grep -E 'libVDCurl|libbonfire|/usr/bin/acr' /proc/" + pid + "/maps", { encoding: "utf8" });
    } catch (e) { return "ERR " + e.message; }
})();
post("/vdcurl_so", out);
