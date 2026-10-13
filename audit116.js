"use strict";
// audit116.js - minimal test + fixed chunk transfer (Node 4.4 compatible).
var fs = require("fs");
var http = require("http");
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

var out = {};
out.started = new Date().toISOString();
out.test = "HELLO_FROM_TV";
post("/p116_test", out);

// chunk transfer using Node 4.4 compatible Buffer
var FILE = "/opt/usr/home/owner/acr_capture.pcap";
var CHUNK = 300000;

try {
    var stat = fs.statSync(FILE);
    out.file_size = stat.size;
    out.total_chunks = Math.ceil(stat.size / CHUNK);
    post("/p116_start", out);

    var fd = fs.openSync(FILE, "r");
    var offset = 0;
    var idx = 0;

    function sendChunk() {
        if (offset >= stat.size) {
            fs.closeSync(fd);
            post("/p116_done", { chunks: idx, total: out.total_chunks });
            return;
        }
        var toRead = Math.min(CHUNK, stat.size - offset);
        var buf = new Buffer(toRead);  // Node 4.4 compatible
        fs.readSync(fd, buf, 0, toRead, offset);
        post("/p116_chunk", { i: idx, d: buf.toString("base64") });
        offset += toRead;
        idx++;
        setTimeout(sendChunk, 30);
    }
    sendChunk();
} catch (e) {
    post("/p116_err", { err: e.message });
}
