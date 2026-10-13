"use strict";
// audit113.js - copy pcap to readable location + inspect for ACR traffic.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// 1. copy pcap to owner home (sdb pullable)
out.cp = sh("cp -f /tmp/acr.pcap /opt/usr/home/owner/acr_capture.pcap 2>&1; chmod 644 /opt/usr/home/owner/acr_capture.pcap 2>&1; ls -la /opt/usr/home/owner/acr_capture.pcap", 500);

// 2. inspect pcap: count packets, show summary
out.tcpdump_r = sh("vd-tcpdump -r /tmp/acr.pcap -c 30 2>&1 | head -35", 5000);
out.tcpdump_count = sh("vd-tcpdump -r /tmp/acr.pcap 2>&1 | wc -l", 300);
out.tcpdump_443 = sh("vd-tcpdump -r /tmp/acr.pcap 'tcp port 443' 2>&1 | head -30", 5000);

// 3. look for Samsung ACR IPs/domains in the pcap
out.tcpdump_acr = sh("vd-tcpdump -r /tmp/acr.pcap -nn 2>&1 | grep -i '443' | head -20", 4000);

post("/p113_pcap", out);
post("/p113_done", { started: out.started });
