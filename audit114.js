"use strict";
// audit114.js - serve pcap file over TCP for PC download.
var fs = require("fs");
var net = require("net");
var http = require("http");
var HOST = "192.168.1.64";
var PORT = 9999;
var FILE = "/opt/usr/home/owner/acr_capture.pcap";

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

// check file size
try {
    var stat = fs.statSync(FILE);
    out.file_size = stat.size;
} catch (e) {
    out.file_err = e.message;
    post("/p114_error", out);
    post("/p114_done", { started: out.started });
    return;
}

// start TCP server on 19998
var srv = net.createServer(function (sock) {
    var rs = fs.createReadStream(FILE);
    rs.pipe(sock);
    rs.on("end", function () {
        post("/p114_sent", { size: out.file_size, at: new Date().toISOString() });
        sock.end();
        srv.close();
    });
    rs.on("error", function (e) {
        post("/p114_error", { err: e.message });
        sock.end();
    });
});

srv.listen(19998, "0.0.0.0", function () {
    out.status = "LISTENING on 19998";
    post("/p114_ready", out);
});

// auto-close after 120s
setTimeout(function () {
    try { srv.close(); } catch (e) {}
    post("/p114_timeout", { at: new Date().toISOString() });
}, 120000);
