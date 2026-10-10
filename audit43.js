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

var out = {};
out.started = new Date().toISOString();
out.tcp_test = cp.execSync("node -e \"var n=require('net');var s=n.connect(443,'192.168.1.64',function(){console.log('443 OPEN');s.end();process.exit(0)});s.on('error',function(e){console.log('443 '+e.code);process.exit(0)});setTimeout(function(){console.log('443 TIMEOUT');process.exit(0)},4000);\" 2>&1").toString();
out.tcp53 = cp.execSync("node -e \"var n=require('dgram');var s=n.createSocket('udp4');s.send(Buffer.from('test'),53,'192.168.1.64',function(){console.log('53 UDP sent ok');process.exit(0)});s.on('error',function(e){console.log('53 '+e.code);process.exit(0)});\" 2>&1").toString();
post("/mitm_conn_test", out);
