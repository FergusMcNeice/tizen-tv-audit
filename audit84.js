"use strict";
// audit84.js - identify WHICH process on the TV is connecting to the PC :443.
// Match /proc/net/tcp remote ports to /proc/<pid>/fd socket inodes, and list
// every process that has libVDCurl/libssl loaded (candidate TLS clients).
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

// PC IP hex = C0A80140 (192.168.1.64)
out.tcp443 = sh("cat /proc/net/tcp | head -1; cat /proc/net/tcp | grep -i ':01BB' | head -20", 4000);

// find socket inodes for connections to :443
out.inodes = sh("for line in $(cat /proc/net/tcp | grep -i ':01BB'); do echo $line; done | awk '{print $10}' | sort -u | head -20", 1500);

// map inodes to pids
out.pids = sh("for ino in $(cat /proc/net/tcp | grep -i ':01BB' | awk '{print $10}' | sort -u); do for fd in /proc/[0-9]*/fd/*; do ln=$(readlink $fd 2>/dev/null); if [ \"$ln\" = \"socket:[$ino]\" ]; then pid=$(echo $fd | cut -d/ -f3); echo \"inode=$ino pid=$pid $(cat /proc/$pid/cmdline | tr '\\0' ' ')\"; fi; done; done | head -30", 6000);

// all processes with VDCurl or libssl mapped (TLS clients)
out.tls_procs = sh("for p in /proc/[0-9]*; do pid=$(basename $p); if grep -q 'libVDCurl\\|libssl' $p/maps 2>/dev/null; then echo \"PID $pid : $(cat $p/cmdline | tr '\\0' ' ' | head -c 120)\"; fi; done", 6000);

post("/p84_diag", out);
post("/p84_done", { started: out.started });
