"use strict";
// acrgohome2.js - aggressive go-home. TizenBrew's UI is a node web app under
// /opt/usr/home/owner (pids ~2549/2666) + the webapp runtime. Kill those so the
// TV drops to the running home `menu` process. Kill is backgrounded so it runs
// AFTER we post (this module host is one of those node procs). node 4.4-safe.
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

var before = sh("ps -A 2>/dev/null | grep -iE 'tizenbrew|webapp|liteweb|browser|node|menu|wrt' | grep -v grep", 12000);
post("/gohome2_before", { kind: "diag", ts: new Date().toISOString(), fields: { ps: before } });

// try input injection of KEY_HOME first (clean, non-destructive) if a tool exists
var inject = sh("which xte xdotool input evemu-event 2>/dev/null; echo ---; ls /dev/input 2>/dev/null | head", 3000);
post("/gohome2_tools", { kind: "diag", ts: new Date().toISOString(), fields: { tools: inject } });

// backgrounded aggressive kill: TizenBrew node procs + webapp runtime -> home menu
// KEY_HOME=102 also tried via a raw evdev write to any /dev/input/event* as backup.
var killCmd = "( sleep 2; " +
  "pkill -9 -f tizenbrew; pkill -9 -f TizenBrew; pkill -9 -f webappservice; " +
  "pkill -9 -f litewebapp; pkill -9 -f browser; pkill -9 -f wrt; " +
  "for p in $(ps -A 2>/dev/null | grep '/opt/usr/home' | awk '{print $1}'); do kill -9 $p 2>/dev/null; done; " +
  ") >/dev/null 2>&1 &";
sh(killCmd, 2000);

post("/gohome2_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "scheduled aggressive kill -> home in 2s" } });
console.log("acrgohome2 scheduled");
