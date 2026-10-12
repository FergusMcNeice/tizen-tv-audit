"use strict";
// acrgohome3.js - inject KEY_HOME via /dev/input evdev (definitive "press Home").
// TizenBrew resisted process-kill, so we inject a real Home key event into the
// input subsystem. Writes a press+release of KEY_HOME (102) / KEY_HOMEPAGE (172)
// to every writable /dev/input/eventN. Also dumps /proc/bus/input/devices so we
// can see the remote's device. node 4.4-safe.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 20000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

// build one input_event (16 bytes on 32-bit ARM): timeval(8) + type(2) + code(2) + value(4)
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
    return Buffer.concat([
        ev(1, code, 1),   // EV_KEY press
        ev(0, 0, 0),      // EV_SYN report
        ev(1, code, 0),   // EV_KEY release
        ev(0, 0, 0)       // EV_SYN report
    ]);
}

// dump input device map
var devices = sh("cat /proc/bus/input/devices 2>/dev/null | head -80", 8000);
post("/gohome3_devices", { kind: "diag", ts: new Date().toISOString(), fields: { devices: devices } });

// inject KEY_HOME (102) + KEY_HOMEPAGE (172) to every eventN we can open
var names = sh("ls /dev/input 2>/dev/null | grep event", 3000).split("\n");
var results = [];
for (var i = 0; i < names.length; i++) {
    var n = names[i].trim();
    if (!n) continue;
    var p = "/dev/input/" + n;
    var status = "";
    try {
        var fd = fs.openSync(p, "r+");
        fs.writeSync(fd, keySeq(102));
        fs.writeSync(fd, keySeq(172));
        fs.closeSync(fd);
        status = "OK";
    } catch (e) {
        // try write-only
        try {
            var fd2 = fs.openSync(p, "w");
            fs.writeSync(fd2, keySeq(102));
            fs.writeSync(fd2, keySeq(172));
            fs.closeSync(fd2);
            status = "OK-wo";
        } catch (e2) {
            status = "fail " + String(e2 && e2.message || e2).slice(0, 40);
        }
    }
    results.push(p + " -> " + status);
}
post("/gohome3_inject", { kind: "diag", ts: new Date().toISOString(), fields: { results: results } });

// also try a few extra common home-ish keys to the devices that accepted writes
post("/gohome3_done", { kind: "diag", ts: new Date().toISOString(), fields: { note: "injected KEY_HOME/KEY_HOMEPAGE" } });
console.log("acrgohome3 injected");
