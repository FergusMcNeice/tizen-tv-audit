"use strict";
// audit110.js - remove DNS hijack, start tcpdump on TV to capture ACR TLS traffic.
// Capture on the TV's network interface, port 443.
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

// 1. remove DNS hijack so traffic goes to Samsung directly
out.iptables_flush = sh("iptables -t nat -F OUTPUT 2>&1; echo RC=$?", 200);
out.iptables_verify = sh("iptables -t nat -L OUTPUT -n 2>&1 | head -10", 500);

// 2. find network interface
out.ifaces = sh("ip link show 2>/dev/null | grep -E '^[0-9]+:' | head -10 || ls /sys/class/net/ 2>/dev/null", 500);

// 3. check if tcpdump is available
out.tcpdump = sh("which tcpdump 2>&1; ls -la /usr/sbin/tcpdump /usr/bin/tcpdump /sbin/tcpdump 2>&1 | head -5", 500);
out.vd_tcpdump = sh("ls -la /usr/sbin/vd-tcpdump 2>&1", 300);

// 4. start tcpdump capture on all interfaces, port 443, 120 seconds
// write to /tmp/acr_capture.pcap
out.capture = sh("nohup tcpdump -i any -s 0 -w /tmp/acr_capture.pcap port 443 2>/tmp/td_err.log & echo PID=$!; sleep 2; ls -la /tmp/acr_capture.pcap 2>&1", 1500);

post("/p110_capture_start", out);
post("/p110_done", { started: out.started });

// 5. after 90s, stop tcpdump and report
setTimeout(function () {
    var o2 = {};
    o2.stop = sh("kill $(cat /tmp/.td_pid 2>/dev/null) 2>/dev/null; pkill tcpdump 2>/dev/null; sleep 1; echo STOPPED", 200);
    o2.pcap_info = sh("ls -la /tmp/acr_capture.pcap 2>&1; tcpdump -r /tmp/acr_capture.pcap -c 20 2>&1 | head -25", 3000);
    o2.pcap_size = sh("wc -c /tmp/acr_capture.pcap 2>&1", 200);
    post("/p110_capture_stop", o2);
}, 95000);
