"use strict";
// audit91.js - deploy patched binaries + restart acr. Root is live (CapEff full).
// NO mount remount. Just cp + systemctl restart.
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

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 150", 200);
out.caps = sh("grep CapEff /proc/self/status", 100);

// 1. stop acr so we can replace the binary
out.stop = sh("systemctl stop acr.service 2>&1; echo RC=$?", 200);

// 2. deploy patched acr
out.cp_acr = sh("cp -f /opt/usr/home/owner/acr_patched /usr/bin/acr 2>&1; echo RC=$?", 300);
out.chmod_acr = sh("chmod 755 /usr/bin/acr 2>&1; echo RC=$?", 150);

// 3. deploy patched libVDCurl
out.cp_vd = sh("cp -f /opt/usr/home/owner/libVDCurl.so.0.9.patched /usr/lib/libVDCurl.so.0.9 2>&1; echo RC=$?", 300);
out.chmod_vd = sh("chmod 755 /usr/lib/libVDCurl.so.0.9 2>&1; echo RC=$?", 150);

// 4. verify patches on disk
out.verify_acr = sh("dd if=/usr/bin/acr bs=1 skip=$((0x86c08)) count=4 2>/dev/null | od -An -tx1", 150);
out.verify_acr2 = sh("dd if=/usr/bin/acr bs=1 skip=$((0x87c84)) count=4 2>/dev/null | od -An -tx1", 150);
out.verify_vd = sh("dd if=/usr/lib/libVDCurl.so.0.9 bs=1 skip=$((0xBC24)) count=4 2>/dev/null | od -An -tx1", 150);

// 5. restart acr
out.start = sh("systemctl start acr.service 2>&1; echo RC=$?", 300);
sh("sleep 4", 100);

// 6. verify acr running + patched in memory
out.pidof = sh("pidof acr", 200);
out.svc = sh("systemctl status acr.service --no-pager 2>&1 | head -8", 800);

// check the callback bytes in live memory
var pm = out.pidof.match(/^(\d+)/);
if (pm) {
    var pid = pm[1];
    out.mem_check = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x96c08)) count=4 2>/dev/null | od -An -tx1", 150);
    out.mem_check2 = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x97c84)) count=4 2>/dev/null | od -An -tx1", 150);
    out.maps_vd = sh("cat /proc/" + pid + "/maps | grep VDCurl | head -3", 300);
}

post("/p91_deploy", out);
post("/p91_done", { started: out.started });
