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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 2500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.started = new Date().toISOString();
out.mounted = sh("md5sum /opt/acr-ca/ca.pem /usr/lib/acr/cert/ca.pem; grep -c 'BEGIN CERTIFICATE' /usr/lib/acr/cert/ca.pem; tail -c 250 /usr/lib/acr/cert/ca.pem");
out.acr = sh("ps -ef | grep -iE 'acr|bonfire' | grep -v grep | head -4; echo ---; ls -la /usr/lib/acr/acr_ccd/ 2>&1 | head -6");
post("/acr_verify", out);
