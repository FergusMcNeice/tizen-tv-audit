"use strict";
// acrfix.js - fix TizenBrew's "could not connect to sdb daemon" + break to home.
// Runs as root via TizenBrew serviceFile. (1) Find TizenBrew's config and set the
// host PC IP to 127.0.0.1 (points TizenBrew at the TV's own sdbd). (2) Inject
// KEY_HOME via /dev/input to force the TV to the home menu. (3) Dump config + ps
// so we can see TizenBrew's layout. node 4.4-safe.
var http = require("http");
var cp = require("child_process");
var fs = require("fs");

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 20000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

// ---- 1. find TizenBrew + its config ----
var id = sh("id", 2000);
var find = sh("find /opt/usr/home /opt/usr/apps /usr/apps /home -iname '*tizenbrew*' -o -iname '*TizenBrew*' 2>/dev/null | grep -v '/proc/' | head -40", 6000);
var confs = sh("find /opt/usr/home /opt/usr/apps /home -type f \\( -name '*.json' -o -name '*.conf' -o -name '*.cfg' -o -name '*.txt' -o -name '*.xml' -o -name '*.js' \\) 2>/dev/null | grep -iE 'tizenbrew|config|setting|pref' | grep -v node_modules | head -30", 6000);
post("/fix_recon", { kind: "diag", ts: new Date().toISOString(), fields: { id: id, paths: find, confs: confs } });

// ---- 2. try to set host PC IP -> 127.0.0.1 in any config that has an IP/host field ----
var patched = [];
var candidates = sh("grep -rlEi 'host.?pc|hostpc|sdb.?daemon|192\\.168\\.[0-9]+\\.[0-9]+' /opt/usr/home /opt/usr/apps /home 2>/dev/null | grep -iE 'tizenbrew|config|setting|pref|\\.json|\\.conf|\\.cfg' | grep -v node_modules | head -15", 6000).split("\n");
for (var i = 0; i < candidates.length; i++) {
    var f = candidates[i].trim();
    if (!f) continue;
    try {
        var c = fs.readFileSync(f, "utf8");
        var orig = c;
        // replace common host-ip keys' values with 127.0.0.1
        c = c.replace(/("(?:host_?pc_?ip|hostpc|sdb_?host|host)"\s*:\s*")[^"]*(")/gi, "$1127.0.0.1$2");
        c = c.replace(/(hostpcip\s*[=:]\s*)[0-9.]+/gi, "$1127.0.0.1");
        c = c.replace(/(192\.168\.[0-9]+\.[0-9]+)/g, "127.0.0.1");
        if (c !== orig) {
            fs.writeFileSync(f, c);
            patched.push(f + " (patched)");
        } else {
            patched.push(f + " (no host-ip field)");
        }
    } catch (e) {
        patched.push(f + " ERR " + String(e && e.message || e).slice(0, 40));
    }
}
post("/fix_patch", { kind: "diag", ts: new Date().toISOString(), fields: { patched: patched } });

// ---- 3. inject KEY_HOME via /dev/input (definitive break-to-home) ----
function ev(type, code, value) {
    var b = new Buffer(16);
    var now = Date.now();
    b.writeUInt32LE(Math.floor(now / 1000), 0);
    b.writeUInt32LE((now % 1000) * 1000, 4);
    b.writeUInt16LE(type, 8);
    b.writeUInt16LE(code, 10);
    b.writeInt32LE(value, 12);
    return b;
}
function keySeq(code) {
    return Buffer.concat([ev(1, code, 1), ev(0, 0, 0), ev(1, code, 0), ev(0, 0, 0)]);
}
var names = sh("ls /dev/input 2>/dev/null | grep event", 3000).split("\n");
var inj = [];
for (var j = 0; j < names.length; j++) {
    var n = names[j].trim();
    if (!n) continue;
    var p = "/dev/input/" + n;
    try {
        var fd = fs.openSync(p, "r+");
        fs.writeSync(fd, keySeq(102));  // KEY_HOME
        fs.writeSync(fd, keySeq(172));  // KEY_HOMEPAGE
        fs.closeSync(fd);
        inj.push(p + " OK");
    } catch (e) {
        inj.push(p + " " + String(e && e.message || e).slice(0, 30));
    }
}
post("/fix_inject", { kind: "diag", ts: new Date().toISOString(), fields: { inject: inj } });

post("/fix_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "patched config + injected HOME" } });
console.log("acrfix done");
