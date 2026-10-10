"use strict";

// TizenBrew module service: runs inside the TizenBrew service process (root).
// Node 4.4.3 compatible (no async/await).

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function readf(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch (e) {
        return "ERR " + e.message;
    }
}

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request(
        {
            host: HOST,
            port: PORT,
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        },
        function (res) {
            console.log("posted " + path + " -> " + res.statusCode);
        }
    );
    req.on("error", function (e) {
        console.log("post error " + e.message);
    });
    req.write(data);
    req.end();
}

var out = {};
out.started = new Date().toISOString();
out.id = run("id");
out.uname = run("uname -a");
out.info_ini = readf("/etc/info.ini");
out.os_release = run("cat /etc/os-release");
out.hostname = readf("/etc/hostname");
out.resolv = readf("/etc/resolv.conf");
out.ps = run("ps -ef");
out.netstat = run("netstat -an");
out.mounts = run("cat /proc/mounts");
out.cmdline = run("cat /proc/cmdline");
out.dbs = run("ls -la /opt/var/dbs 2>/dev/null; ls -la /opt/var/dbspace 2>/dev/null");
out.apps = run("ls /opt/usr/apps");
out.etc_opt = run("ls /opt/etc");
out.var_opt = run("ls /opt/var");
out.which_tools = run("which buxton2ctl buxtonctl wascmd sdbd dlogutil");
out.caps = run("cat /proc/self/status | grep -i cap");
out.env_keys = run("cat /proc/self/environ | tr '\\0' '\\n'");

post("/audit1", out);
