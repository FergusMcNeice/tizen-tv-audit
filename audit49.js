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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.acr_ps = sh("ps -ef | grep -i acr | grep -v grep");
out.acr_files = sh("find /usr/lib/acr /usr/bin /opt -name '*.pem' 2>/dev/null | head -20; echo ---; ls -la /usr/lib/acr/ /usr/lib/acr/cert/ 2>&1 | head -25");
out.acr_links = sh("ls -la /usr/lib/libVDCurl* /usr/lib/libssl.so.1.0.0 2>&1 | head -6; echo ---; strings /usr/bin/acr 2>/dev/null | grep -iE 'ca.pem|cert/|samsungacr|samsungcloud' | head -15");
out.hosts_now = sh("cat /etc/hosts");
out.ipt_now = sh("iptables -t nat -L OUTPUT -n 2>&1 | head -6");
out.uid = sh("id");
post("/acrprobe", out);
