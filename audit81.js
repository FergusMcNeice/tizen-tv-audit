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
    return { label: label, output: r.trim().slice(0, 250), marker: mk.trim() };
}

// controls
out.t1_system_lib = try_preload("signed system lib (/lib/libm.so.6)", "/lib/libm.so.6");
sh("cp /lib/libm.so.6 " + SDK + "/lm_copy.so");
out.t2_copy_same_bytes = try_preload("byte-identical copy in sdk_tools", SDK + "/lm_copy.so");
sh("cp /lib/libm.so.6 " + SDK + "/lm_mod.so; printf 'X' >> " + SDK + "/lm_mod.so");
out.t3_modified_copy = try_preload("modified copy (1 byte appended)", SDK + "/lm_mod.so");

// our builds
out.t4_nostdlib = try_preload("our -nostdlib build", SDK + "/tee_probe.so");
out.t5_with_libc = try_preload("our with-libc build", SDK + "/tee_probe_elf.so");
out.t6_softfp = try_preload("our softfp build", SDK + "/tee_probe_softfp.so");

// TV ABI reference
out.tv_abi = sh("grep -a -o 'Tag_ABI_VFP_args[^\x00]\{0,20\}' /lib/libc.so.6 | head -2; grep -a -o 'Tag_CPU_name[^\x00]\{0,12\}' /lib/libc.so.6 | head -2");

// ldd of our .so (its NEEDED deps on the TV)
out.ours_ldd = sh("ldd " + SDK + "/tee_probe_elf.so 2>&1 | head -8");

post("/ocr_uep", out);
post("/ocr_uep_done", { started: out.started });
