"use strict";
// acrgohome4.js - DETACHED force-kill of the TizenBrew UI stack. The earlier
// backgrounded kill died with its host; this spawns a FULLY DETACHED killer
// (detached:true + unref) that survives TizenBrew's death and repeatedly kills
// TizenBrew node + browser + webapp runtime so the home `menu` takes over.
// Runs as root (TizenBrew serviceFile). node 4.4-safe.
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

// find the stuck UI process PIDs (TizenBrew node + browser + webapp runtime)
var ps = sh("ps -A 2>/dev/null | grep -iE 'tizenbrew|webapp|liteweb|browser|wrt|/opt/usr/home' | grep -v grep", 12000);
post("/gohome4_ps", { kind: "diag", ts: new Date().toISOString(), fields: { ps: ps } });

// build an aggressive kill: repeatedly kill the UI stack over ~6s to catch respawns.
// KEY_HOME also injected to any writable /dev/input as a backup (root can write).
var killCmd = "for i in 1 2 3 4 5 6; do " +
  "pkill -9 -f tizenbrew; pkill -9 -f TizenBrew; pkill -9 -f webappservice; " +
  "pkill -9 -f litewebapp; pkill -9 -f browser; pkill -9 -f wrt; " +
  "for p in $(ps -A 2>/dev/null | grep -E '/opt/usr/home|appbinary' | awk '{print $1}'); do kill -9 $p 2>/dev/null; done; " +
  "sleep 1; done";

// spawn FULLY DETACHED so it survives TizenBrew (our host) being killed.
try {
    var child = cp.spawn("/bin/sh", ["-c", killCmd], { detached: true, stdio: "ignore" });
    child.unref();
    post("/gohome4_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "detached killer spawned (kills TizenBrew/browser/webapp over 6s -> home)", pid: child.pid } });
} catch (e) {
    post("/gohome4_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "spawn failed", err: String(e && e.message || e) } });
}
console.log("acrgohome4 detached killer spawned");
