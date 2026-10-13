"use strict";
// audit115.js - POST pcap file to PC in 500KB base64 chunks.
var fs = require("fs");
var http = require("http");
var HOST = "192.168.1.64";
var PORT = 9999;
var FILE = "/opt/usr/home/owner/acr_capture.pcap";
var CHUNK = 400000;  // 400KB raw per chunk

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

try {
    var stat = fs.statSync(FILE);
    out.file_size = stat.size;
    out.total_chunks = Math.ceil(stat.size / CHUNK);
} catch (e) {
    out.err = e.message;
    post("/p115_error", out);
    return;
}

post("/p115_start", out);

// read and send chunks sequentially
var fd = fs.openSync(FILE, "r");
var chunkIdx = 0;
var offset = 0;

function sendChunk() {
    if (offset >= out.file_size) {
        fs.closeSync(fd);
        post("/p115_done", { chunks: chunkIdx, total: out.total_chunks });
        return;
    }
    var toRead = Math.min(CHUNK, out.file_size - offset);
    var buf = Buffer.alloc(toRead);
    fs.readSync(fd, buf, 0, toRead, offset);
    var b64 = buf.toString("base64");
    post("/p115_chunk", { i: chunkIdx, d: b64 });
    offset += toRead;
    chunkIdx++;
    // small delay between chunks to avoid overwhelming
    setTimeout(sendChunk, 50);
}

sendChunk();
