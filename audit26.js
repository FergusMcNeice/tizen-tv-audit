"use strict";
var fs = require("fs");
var http = require("http");

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

var out = {};
out.started = new Date().toISOString();
out.pid = process.pid;
out.execPath = process.execPath;

try {
    var maps = fs.readFileSync("/proc/self/maps", "utf8");
    var lines = maps.split("\n");
    out.maps_head = lines.slice(0, 6).join(" | ");

    var mem = fs.openSync("/proc/self/mem", "r+");
    function rd(addr, len) {
        var b = new Buffer(len);
        for (var i = 0; i < len; i++) b[i] = 0xAA;
        var n = fs.readSync(mem, b, 0, len, addr);
        return { n: n, hex: b.toString("hex") };
    }
    out.site_a = rd(0x7aef1c, 8);
    out.site_b = rd(0x7af2d0, 8);
    out.sc_region = rd(0x9be000, 24);
    out.tramp = rd(0x9bed50, 16);
    out.tailptr = rd(0x9befe0, 8);
    out.gap = rd(0x2052c, 16);
    fs.closeSync(mem);

    var bin = fs.openSync(process.execPath, "r");
    function rdf(addr, len) {
        var b = new Buffer(len);
        var n = fs.readSync(bin, b, 0, len, addr);
        return { n: n, hex: b.toString("hex") };
    }
    out.file_site_a = rdf(0x79ef1c, 8);
    out.file_gap = rdf(0x1f52c, 16);
    fs.closeSync(bin);
} catch (e) {
    out.error = "" + (e && e.stack ? e.stack : e);
}
post("/g26_diag", out);
