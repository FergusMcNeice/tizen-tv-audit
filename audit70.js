"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body, cb) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); if (cb) cb(null); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); if (cb) cb(e); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 10000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function stringsOf(buf, minLen) {
    var out = [];
    var cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 5)) out.push(cur); cur = ""; }
    }
    return out;
}

var out = {};
out.started = new Date().toISOString();
out.kal = sh("grep -ci l2cap /proc/kallsyms; grep -ci bluetooth /proc/kallsyms; grep -ciE 'hci_|sco_|bnep_' /proc/kallsyms; echo ===; wc -l /proc/kallsyms");
out.netmods = sh("ls /usr/lib/modules/4.1.10/kernel/net/ 2>&1 | head -30; echo ===; ls /usr/lib/modules/4.1.10/kernel/net/bluetooth 2>&1");
out.btmod = sh("find /usr/lib/modules -iname '*bluetooth*' -o -iname '*btusb*' 2>/dev/null | head; echo ===; ls -la /usr/lib/modules/4.1.10/kernel/drivers/ | head -20");
post("/blue3", out);

var scan = {};
scan.started = out.started;
try {
    var buf = fs.readFileSync("/usr/lib/libbluetooth.default.so.1.0.0");
    var strs = stringsOf(buf, 5);
    var rx = /(l2cap|L2CAP|config_req|conf_req|smp_|bnep|cmtp|hidp|rfcomm|BlueZ|widcomm|broadcom|stack)/i;
    var keep = [];
    for (var s = 0; s < strs.length && keep.length < 60; s++) {
        if (rx.test(strs[s])) keep.push(strs[s].slice(0, 120));
    }
    scan.libbluetooth_size = buf.length;
    scan.libbluetooth_hits = keep;
} catch (e) { scan.err = String(e.message || e); }
post("/blue4", scan);
post("/blue_done2", { started: out.started });
