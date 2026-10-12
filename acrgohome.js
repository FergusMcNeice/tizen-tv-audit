"use strict";
// acrgohome.js - get the TV back to the home screen. Runs as root (TizenBrew
// serviceFile). Dumps the process list to the PC :9999 channel, then switches to
// the home launcher and/or kills the stuck TizenBrew web UI. The kill is done via
// a backgrounded shell so it runs AFTER we post (this module host may be the UI).
// node 4.4-safe.
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: PC, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function (e) {});
    req.write(data); req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 20000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

// 1. dump process list (so we can see the stuck UI)
var ps = sh("ps -A 2>/dev/null | grep -iE 'tizenbrew|browser|webkit|wkc|mini|chrom|home|launcher|menu|was|app' | grep -v grep", 12000);
post("/gohome_ps", { kind: "diag", ts: new Date().toISOString(), fields: { ps: ps } });

// 2. try launching the home launcher (clean switch to home)
var tries = [];
var pkgs = ["org.tizen.home", "org.tizen.launcher", "org.tizen.menu", "org.tizen.appcore"];
for (var i = 0; i < pkgs.length; i++) {
    var r = sh("/usr/bin/app_launcher -s " + pkgs[i] + " 2>&1; echo rc=$?", 1500);
    tries.push(pkgs[i] + " -> " + r.trim().slice(0, 120));
}
post("/gohome_launch", { kind: "diag", ts: new Date().toISOString(), fields: { tries: tries } });

// 3. backgrounded hard fallback: kill the TizenBrew web UI / browser so TV drops
//    to home. Runs 3s later so this POST completes first. TizenBrewStandalone is
//    the module host + likely the UI -> killing it lands on home (we can re-launch
//    TizenBrew later via raw sdb when we need it again).
sh("( sleep 3; pkill -9 -f tizenbrew; pkill -9 -f TizenBrew; pkill -9 -f browser; pkill -9 -f wkc; ) >/dev/null 2>&1 &", 2000);

post("/gohome_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "scheduled go-home: launcher tried + UI kill in 3s" } });
console.log("acrgohome done");
