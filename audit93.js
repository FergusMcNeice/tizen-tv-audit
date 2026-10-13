"use strict";
// audit93.js - identify which TV process connects to PC :443 (the sink).
// Match /proc/net/tcp remote inode -> /proc/<pid>/fd socket.
var fs = require("fs");
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 10000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// PC IP 192.168.1.64 = C0A80140, in /proc/net/tcp little-endian = 4001A8C0
// port 443 = 01BB
out.tcp443 = sh("cat /proc/net/tcp | grep -i ':01BB' | head -20", 5000);

// find inodes for connections to PC:443 (rem_address = 4001A8C0:01BB)
out.matching = sh("cat /proc/net/tcp | grep '4001A8C0:01BB' | awk '{print $10}'", 1000);

// map inodes to pids
out.pids = sh("for ino in $(cat /proc/net/tcp | grep '4001A8C0:01BB' | awk '{print $10}' | sort -u); do for fd in /proc/[0-9]*/fd/*; do ln=$(readlink $fd 2>/dev/null); if [ \"$ln\" = \"socket:[$ino]\" ]; then pid=$(echo $fd | cut -d/ -f3); echo \"inode=$ino pid=$pid cmd=$(cat /proc/$pid/cmdline | tr '\\0' ' ' | head -c 120)\"; fi; done; done | head -20", 8000);

post("/p93_diag", out);
post("/p93_done", { started: out.started });
