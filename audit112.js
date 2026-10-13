"use strict";
// audit112.js - capture ACR TLS traffic using vd-tcpdump in background.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// 1. start vd-tcpdump in background on wlan0, port 443
// write PID to file so we can kill it later
out.start = sh("rm -f /tmp/acr.pcap; nohup vd-tcpdump -i wlan0 -s 0 -w /tmp/acr.pcap port 443 > /tmp/td_out.log 2>&1 & echo $! > /tmp/.td_pid; sleep 2; cat /tmp/.td_pid; ls -la /tmp/acr.pcap /tmp/td_out.log 2>&1", 1500);

// 2. also try with tcpdump-style args
out.start2 = sh("rm -f /tmp/acr2.pcap; nohup vd-tcpdump -i wlan0 -w /tmp/acr2.pcap 'tcp port 443' > /tmp/td_out2.log 2>&1 & echo $! > /tmp/.td2_pid; sleep 2; cat /tmp/.td2_pid; ls -la /tmp/acr2.pcap /tmp/td_out2.log 2>&1", 1500);

// 3. check running processes
out.ps = sh("ps 2>/dev/null | grep -i 'tcpdump\\|vd-' | grep -v grep | head -10", 1000);

post("/p112_capture", out);
post("/p112_done", { started: out.started });

// 4. after 60s, stop and check
setTimeout(function () {
    var o2 = {};
    o2.stop = sh("kill $(cat /tmp/.td_pid 2>/dev/null) 2>/dev/null; kill $(cat /tmp/.td2_pid 2>/dev/null) 2>/dev/null; echo STOPPED", 200);
    o2.files = sh("ls -la /tmp/acr.pcap /tmp/acr2.pcap /tmp/td_out.log /tmp/td_out2.log 2>&1", 1500);
    o2.out1 = sh("cat /tmp/td_out.log 2>&1 | head -20", 2000);
    o2.out2 = sh("cat /tmp/td_out2.log 2>&1 | head -20", 2000);
    post("/p112_capture_stop", o2);
}, 65000);
