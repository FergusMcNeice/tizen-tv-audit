"use strict";
var http = require("http");
var cp = require("child_process");
function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + e.message); });
    req.write(data); req.end();
}
var id;
try { id = cp.execSync("id", { encoding: "utf8", timeout: 10000 }); } catch (e) { id = "ERR " + e.message; }
post("/ping48", { started: new Date().toISOString(), id: id });
