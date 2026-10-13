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
out.started = new Date().toISOString();
out.step1 = sh("ls -la /opt/acr-ca/libVDCurl.so.0.9; md5sum /opt/acr-ca/libVDCurl.so.0.9 /usr/lib/libVDCurl.so.0.9");
out.step2 = sh("mount --bind /opt/acr-ca/libVDCurl.so.0.9 /usr/lib/libVDCurl.so.0.9 && echo BIND_OK; md5sum /usr/lib/libVDCurl.so.0.9");
out.step3 = sh("pkill -f '/usr/bin/acr' ; sleep 1; nohup /usr/bin/acr >/tmp/acr.out 2>&1 & sleep 2; ps -ef | grep -i acr | grep -v grep | head -3");
post("/vdcurl_install", out);
