"use strict";

var cp = require("child_process");
var http = require("http");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: timeout || 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
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

out.self_exe = run("readlink /proc/self/exe; readlink /proc/self/cwd; cat /proc/self/cmdline | tr '\\0' ' '; echo");
out.node = run("which node; ls -la /usr/bin/node* /usr/bin/nodejs 2>&1; readlink /usr/bin/node 2>&1");
out.libpython = run("find /usr/lib /lib /opt/usr/lib -name 'libpython*' 2>/dev/null | head -5; ls -la /usr/lib/python2.7 2>/dev/null | head -5");
out.interpreters = run("for t in tclsh lua ruby php node nodejs; do echo -n \"$t: \"; which $t 2>/dev/null || echo missing; done");
out.cat_ps = run("cat /usr/bin/ps > /tmp/ps2; chmod 755 /tmp/ps2; ls -la /tmp/ps2; /tmp/ps2 2>&1 | head -3; echo rc=$?");
out.appbin = run("ls -laR /opt/usr/home/owner/apps_rw/xvvl3S1bvH/bin /opt/usr/home/owner/apps_rw/xvvl3S1bvH/res 2>&1 | head -30");

post("/audit15", out);
