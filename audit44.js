'use strict';
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

function sh(cmd, cap) {
    try { return cp.execSync(cmd, { encoding: "utf8", timeout: 20000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
post("/t44_start", out);

var t1 = 'node -e "var n=require(\'net\');var s=n.connect(443,\'192.168.1.64\',function(){console.log(\'OPEN\');process.exit(0)});s.on(\'error\',function(e){console.log(\'ERR \'+e.code);process.exit(0)});setTimeout(function(){console.log(\'TIMEOUT\');process.exit(0)},5000);"';
out.tcp443 = sh(t1 + " 2>&1");
var t2 = 'node -e "var n=require(\'net\');var s=n.connect(5223,\'192.168.1.64\',function(){console.log(\'OPEN\');process.exit(0)});s.on(\'error\',function(e){console.log(\'ERR \'+e.code);process.exit(0)});setTimeout(function(){console.log(\'TIMEOUT\');process.exit(0)},5000);"';
out.tcp5223 = sh(t2 + " 2>&1");
post("/t44_test", out);
