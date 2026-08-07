import { createRequire as _cr } from 'module';const require = _cr(import.meta.url); const __filename = import.meta.filename; const __dirname = import.meta.dirname;var _ew=process.emitWarning;process.emitWarning=function(w,...a){if(String(w).includes('SQLite')&&(a[0]==='ExperimentalWarning'||(a[0]&&a[0].type==='ExperimentalWarning')))return;return _ew.call(process,w,...a)};
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target2) => (target2 = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target2, "default", { value: mod, enumerable: true }) : target2,
  mod
));

// ../core/constants/lib/index.js
var LOCKFILE_MAJOR_VERSION, LOCKFILE_VERSION, ENGINE_NAME;
var init_lib = __esm({
  "../core/constants/lib/index.js"() {
    "use strict";
    LOCKFILE_MAJOR_VERSION = "9";
    LOCKFILE_VERSION = `${LOCKFILE_MAJOR_VERSION}.0`;
    ENGINE_NAME = `${process.platform};${process.arch};node${process.version.split(".")[0].substring(1)}`;
  }
});

// ../core/error/lib/index.js
var PnpmError;
var init_lib2 = __esm({
  "../core/error/lib/index.js"() {
    "use strict";
    init_lib();
    PnpmError = class extends Error {
      code;
      hint;
      attempts;
      prefix;
      pkgsStack;
      constructor(code, message, opts2) {
        super(message, { cause: opts2?.cause });
        this.code = code.startsWith("ERR_PNPM_") ? code : `ERR_PNPM_${code}`;
        this.hint = opts2?.hint;
        this.attempts = opts2?.attempts;
      }
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants2 = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs13) {
      if (constants2.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs13);
      }
      if (!fs13.lutimes) {
        patchLutimes(fs13);
      }
      fs13.chown = chownFix(fs13.chown);
      fs13.fchown = chownFix(fs13.fchown);
      fs13.lchown = chownFix(fs13.lchown);
      fs13.chmod = chmodFix(fs13.chmod);
      fs13.fchmod = chmodFix(fs13.fchmod);
      fs13.lchmod = chmodFix(fs13.lchmod);
      fs13.chownSync = chownFixSync(fs13.chownSync);
      fs13.fchownSync = chownFixSync(fs13.fchownSync);
      fs13.lchownSync = chownFixSync(fs13.lchownSync);
      fs13.chmodSync = chmodFixSync(fs13.chmodSync);
      fs13.fchmodSync = chmodFixSync(fs13.fchmodSync);
      fs13.lchmodSync = chmodFixSync(fs13.lchmodSync);
      fs13.stat = statFix(fs13.stat);
      fs13.fstat = statFix(fs13.fstat);
      fs13.lstat = statFix(fs13.lstat);
      fs13.statSync = statFixSync(fs13.statSync);
      fs13.fstatSync = statFixSync(fs13.fstatSync);
      fs13.lstatSync = statFixSync(fs13.lstatSync);
      if (fs13.chmod && !fs13.lchmod) {
        fs13.lchmod = function(path17, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs13.lchmodSync = function() {
        };
      }
      if (fs13.chown && !fs13.lchown) {
        fs13.lchown = function(path17, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs13.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs13.rename = typeof fs13.rename !== "function" ? fs13.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs13.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs13.rename);
      }
      fs13.read = typeof fs13.read !== "function" ? fs13.read : (function(fs$read) {
        function read2(fd, buffer, offset, length, position3, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs13, fd, buffer, offset, length, position3, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs13, fd, buffer, offset, length, position3, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read2, fs$read);
        return read2;
      })(fs13.read);
      fs13.readSync = typeof fs13.readSync !== "function" ? fs13.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position3) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs13, fd, buffer, offset, length, position3);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs13.readSync);
      function patchLchmod(fs14) {
        fs14.lchmod = function(path17, mode, callback) {
          fs14.open(
            path17,
            constants2.O_WRONLY | constants2.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs14.fchmod(fd, mode, function(err2) {
                fs14.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs14.lchmodSync = function(path17, mode) {
          var fd = fs14.openSync(path17, constants2.O_WRONLY | constants2.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs14.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs14.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs14.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs14) {
        if (constants2.hasOwnProperty("O_SYMLINK") && fs14.futimes) {
          fs14.lutimes = function(path17, at, mt, cb) {
            fs14.open(path17, constants2.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs14.futimes(fd, at, mt, function(er2) {
                fs14.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs14.lutimesSync = function(path17, at, mt) {
            var fd = fs14.openSync(path17, constants2.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs14.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs14.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs14.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs14.futimes) {
          fs14.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs14.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target2, mode, cb) {
          return orig.call(fs13, target2, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target2, mode) {
          try {
            return orig.call(fs13, target2, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target2, uid, gid, cb) {
          return orig.call(fs13, target2, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target2, uid, gid) {
          try {
            return orig.call(fs13, target2, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target2, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs13, target2, options, callback) : orig.call(fs13, target2, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target2, options) {
          var stats = options ? orig.call(fs13, target2, options) : orig.call(fs13, target2);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs13) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path17, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path17, options);
        Stream.call(this);
        var self2 = this;
        this.path = path17;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self2._read();
          });
          return;
        }
        fs13.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self2.emit("error", err);
            self2.readable = false;
            return;
          }
          self2.fd = fd;
          self2.emit("open", fd);
          self2._read();
        });
      }
      function WriteStream(path17, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path17, options);
        Stream.call(this);
        this.path = path17;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs13.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy2 = { __proto__: getPrototypeOf(obj) };
      else
        var copy2 = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy2, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy2;
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/graceful-fs/4.2.11/e60a23841f60609f733db41b2b1eced16c30ec8fe2e67c2a9b80e2dab0755700/node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs13 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util9 = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util9.debuglog)
      debug = util9.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util9.format.apply(util9, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs13[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs13, queue);
      fs13.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs13, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs13.close);
      fs13.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs13, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs13.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs13[gracefulQueue]);
          __require("assert").equal(fs13[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs13[gracefulQueue]);
    }
    module.exports = patch(clone(fs13));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs13.__patched) {
      module.exports = patch(fs13);
      fs13.__patched = true;
    }
    function patch(fs14) {
      polyfills(fs14);
      fs14.gracefulify = patch;
      fs14.createReadStream = createReadStream;
      fs14.createWriteStream = createWriteStream;
      var fs$readFile = fs14.readFile;
      fs14.readFile = readFile;
      function readFile(path17, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path17, options, cb);
        function go$readFile(path18, options2, cb2, startTime) {
          return fs$readFile(path18, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path18, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs14.writeFile;
      fs14.writeFile = writeFile2;
      function writeFile2(path17, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path17, data, options, cb);
        function go$writeFile(path18, data2, options2, cb2, startTime) {
          return fs$writeFile(path18, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path18, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs14.appendFile;
      if (fs$appendFile)
        fs14.appendFile = appendFile;
      function appendFile(path17, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path17, data, options, cb);
        function go$appendFile(path18, data2, options2, cb2, startTime) {
          return fs$appendFile(path18, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path18, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs14.copyFile;
      if (fs$copyFile)
        fs14.copyFile = copyFile;
      function copyFile(src2, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src2, dest, flags, cb);
        function go$copyFile(src3, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src3, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE" || err.code === "EBUSY"))
              enqueue([go$copyFile, [src3, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs14.readdir;
      fs14.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path17, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path18, options2, cb2, startTime) {
          return fs$readdir(path18, fs$readdirCallback(
            path18,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path18, options2, cb2, startTime) {
          return fs$readdir(path18, options2, fs$readdirCallback(
            path18,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path17, options, cb);
        function fs$readdirCallback(path18, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path18, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs14);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs14.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs14.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs14, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs14, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs14, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs14, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path17, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path17, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path17, options) {
        return new fs14.ReadStream(path17, options);
      }
      function createWriteStream(path17, options) {
        return new fs14.WriteStream(path17, options);
      }
      var fs$open = fs14.open;
      fs14.open = open;
      function open(path17, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path17, flags, mode, cb);
        function go$open(path18, flags2, mode2, cb2, startTime) {
          return fs$open(path18, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path18, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs14;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs13[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs13[gracefulQueue].length; ++i) {
        if (fs13[gracefulQueue][i].length > 2) {
          fs13[gracefulQueue][i][3] = now;
          fs13[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs13[gracefulQueue].length === 0)
        return;
      var elem = fs13[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs13[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// ../fs/graceful-fs/lib/index.js
import util, { promisify } from "node:util";
function withEagainRetry(fn, maxRetries = 15) {
  return (...args) => {
    let attempts = 0;
    while (attempts <= maxRetries) {
      try {
        return fn(...args);
      } catch (err) {
        if (util.types.isNativeError(err) && "code" in err && err.code === "EAGAIN" && attempts < maxRetries) {
          attempts++;
          const delay = Math.min(Math.pow(2, attempts), 300);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
          continue;
        }
        throw err;
      }
    }
    throw new Error("Unreachable");
  };
}
var import_graceful_fs, lib_default;
var init_lib3 = __esm({
  "../fs/graceful-fs/lib/index.js"() {
    "use strict";
    import_graceful_fs = __toESM(require_graceful_fs(), 1);
    lib_default = {
      chmod: promisify(import_graceful_fs.default.chmod),
      copyFile: promisify(import_graceful_fs.default.copyFile),
      copyFileSync: withEagainRetry(import_graceful_fs.default.copyFileSync),
      createReadStream: import_graceful_fs.default.createReadStream,
      link: promisify(import_graceful_fs.default.link),
      linkSync: withEagainRetry(import_graceful_fs.default.linkSync),
      mkdir: promisify(import_graceful_fs.default.mkdir),
      mkdirSync: withEagainRetry(import_graceful_fs.default.mkdirSync),
      renameSync: withEagainRetry(import_graceful_fs.default.renameSync),
      readFile: promisify(import_graceful_fs.default.readFile),
      readFileSync: import_graceful_fs.default.readFileSync,
      readdirSync: import_graceful_fs.default.readdirSync,
      stat: promisify(import_graceful_fs.default.stat),
      statSync: import_graceful_fs.default.statSync,
      unlink: promisify(import_graceful_fs.default.unlink),
      unlinkSync: import_graceful_fs.default.unlinkSync,
      writeFile: promisify(import_graceful_fs.default.writeFile),
      writeFileSync: withEagainRetry(import_graceful_fs.default.writeFileSync)
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fast-safe-stringify/2.1.1/71177aa317bf9c10d6ba54feb1e03d154d670845bac275960b4cc587a01d5783/node_modules/fast-safe-stringify/index.js
var require_fast_safe_stringify = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fast-safe-stringify/2.1.1/71177aa317bf9c10d6ba54feb1e03d154d670845bac275960b4cc587a01d5783/node_modules/fast-safe-stringify/index.js"(exports, module) {
    module.exports = stringify;
    stringify.default = stringify;
    stringify.stable = deterministicStringify;
    stringify.stableStringify = deterministicStringify;
    var LIMIT_REPLACE_NODE = "[...]";
    var CIRCULAR_REPLACE_NODE = "[Circular]";
    var arr = [];
    var replacerStack = [];
    function defaultOptions2() {
      return {
        depthLimit: Number.MAX_SAFE_INTEGER,
        edgesLimit: Number.MAX_SAFE_INTEGER
      };
    }
    function stringify(obj, replacer, spacer, options) {
      if (typeof options === "undefined") {
        options = defaultOptions2();
      }
      decirc(obj, "", 0, [], void 0, 0, options);
      var res;
      try {
        if (replacerStack.length === 0) {
          res = JSON.stringify(obj, replacer, spacer);
        } else {
          res = JSON.stringify(obj, replaceGetterValues(replacer), spacer);
        }
      } catch (_) {
        return JSON.stringify("[unable to serialize, circular reference is too complex to analyze]");
      } finally {
        while (arr.length !== 0) {
          var part = arr.pop();
          if (part.length === 4) {
            Object.defineProperty(part[0], part[1], part[3]);
          } else {
            part[0][part[1]] = part[2];
          }
        }
      }
      return res;
    }
    function setReplace(replace, val, k, parent) {
      var propertyDescriptor = Object.getOwnPropertyDescriptor(parent, k);
      if (propertyDescriptor.get !== void 0) {
        if (propertyDescriptor.configurable) {
          Object.defineProperty(parent, k, { value: replace });
          arr.push([parent, k, val, propertyDescriptor]);
        } else {
          replacerStack.push([val, k, replace]);
        }
      } else {
        parent[k] = replace;
        arr.push([parent, k, val]);
      }
    }
    function decirc(val, k, edgeIndex, stack, parent, depth, options) {
      depth += 1;
      var i;
      if (typeof val === "object" && val !== null) {
        for (i = 0; i < stack.length; i++) {
          if (stack[i] === val) {
            setReplace(CIRCULAR_REPLACE_NODE, val, k, parent);
            return;
          }
        }
        if (typeof options.depthLimit !== "undefined" && depth > options.depthLimit) {
          setReplace(LIMIT_REPLACE_NODE, val, k, parent);
          return;
        }
        if (typeof options.edgesLimit !== "undefined" && edgeIndex + 1 > options.edgesLimit) {
          setReplace(LIMIT_REPLACE_NODE, val, k, parent);
          return;
        }
        stack.push(val);
        if (Array.isArray(val)) {
          for (i = 0; i < val.length; i++) {
            decirc(val[i], i, i, stack, val, depth, options);
          }
        } else {
          var keys = Object.keys(val);
          for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            decirc(val[key], key, i, stack, val, depth, options);
          }
        }
        stack.pop();
      }
    }
    function compareFunction(a, b) {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    }
    function deterministicStringify(obj, replacer, spacer, options) {
      if (typeof options === "undefined") {
        options = defaultOptions2();
      }
      var tmp = deterministicDecirc(obj, "", 0, [], void 0, 0, options) || obj;
      var res;
      try {
        if (replacerStack.length === 0) {
          res = JSON.stringify(tmp, replacer, spacer);
        } else {
          res = JSON.stringify(tmp, replaceGetterValues(replacer), spacer);
        }
      } catch (_) {
        return JSON.stringify("[unable to serialize, circular reference is too complex to analyze]");
      } finally {
        while (arr.length !== 0) {
          var part = arr.pop();
          if (part.length === 4) {
            Object.defineProperty(part[0], part[1], part[3]);
          } else {
            part[0][part[1]] = part[2];
          }
        }
      }
      return res;
    }
    function deterministicDecirc(val, k, edgeIndex, stack, parent, depth, options) {
      depth += 1;
      var i;
      if (typeof val === "object" && val !== null) {
        for (i = 0; i < stack.length; i++) {
          if (stack[i] === val) {
            setReplace(CIRCULAR_REPLACE_NODE, val, k, parent);
            return;
          }
        }
        try {
          if (typeof val.toJSON === "function") {
            return;
          }
        } catch (_) {
          return;
        }
        if (typeof options.depthLimit !== "undefined" && depth > options.depthLimit) {
          setReplace(LIMIT_REPLACE_NODE, val, k, parent);
          return;
        }
        if (typeof options.edgesLimit !== "undefined" && edgeIndex + 1 > options.edgesLimit) {
          setReplace(LIMIT_REPLACE_NODE, val, k, parent);
          return;
        }
        stack.push(val);
        if (Array.isArray(val)) {
          for (i = 0; i < val.length; i++) {
            deterministicDecirc(val[i], i, i, stack, val, depth, options);
          }
        } else {
          var tmp = {};
          var keys = Object.keys(val).sort(compareFunction);
          for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            deterministicDecirc(val[key], key, i, stack, val, depth, options);
            tmp[key] = val[key];
          }
          if (typeof parent !== "undefined") {
            arr.push([parent, k, val]);
            parent[k] = tmp;
          } else {
            return tmp;
          }
        }
        stack.pop();
      }
    }
    function replaceGetterValues(replacer) {
      replacer = typeof replacer !== "undefined" ? replacer : function(k, v) {
        return v;
      };
      return function(key, val) {
        if (replacerStack.length > 0) {
          for (var i = 0; i < replacerStack.length; i++) {
            var part = replacerStack[i];
            if (part[1] === key && part[0] === val) {
              val = part[2];
              replacerStack.splice(i, 1);
              break;
            }
          }
        }
        return replacer.call(this, key, val);
      };
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/individual/3.0.0/82ec8ef054bfaf915092db8496dd7cdf5d8a529ff6202ce432d93772b51b5045/node_modules/individual/index.js
var require_individual = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/individual/3.0.0/82ec8ef054bfaf915092db8496dd7cdf5d8a529ff6202ce432d93772b51b5045/node_modules/individual/index.js"(exports, module) {
    "use strict";
    var root = typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {};
    module.exports = Individual;
    function Individual(key, value) {
      if (key in root) {
        return root[key];
      }
      root[key] = value;
      return value;
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/bole/5.0.29/6922e0a3a11b46fb67db71b821bacb20a87db33d8d1fb079a84a148dc6373834/node_modules/bole/format.js
var require_format = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/bole/5.0.29/6922e0a3a11b46fb67db71b821bacb20a87db33d8d1fb079a84a148dc6373834/node_modules/bole/format.js"(exports, module) {
    var utilformat = __require("util").format;
    function format(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16) {
      if (a16 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16);
      }
      if (a15 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15);
      }
      if (a14 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14);
      }
      if (a13 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13);
      }
      if (a12 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12);
      }
      if (a11 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11);
      }
      if (a10 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
      }
      if (a9 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8, a9);
      }
      if (a8 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7, a8);
      }
      if (a7 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6, a7);
      }
      if (a6 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5, a6);
      }
      if (a5 !== void 0) {
        return utilformat(a1, a2, a3, a4, a5);
      }
      if (a4 !== void 0) {
        return utilformat(a1, a2, a3, a4);
      }
      if (a3 !== void 0) {
        return utilformat(a1, a2, a3);
      }
      if (a2 !== void 0) {
        return utilformat(a1, a2);
      }
      return a1;
    }
    module.exports = format;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/bole/5.0.29/6922e0a3a11b46fb67db71b821bacb20a87db33d8d1fb079a84a148dc6373834/node_modules/bole/bole.js
var require_bole = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/bole/5.0.29/6922e0a3a11b46fb67db71b821bacb20a87db33d8d1fb079a84a148dc6373834/node_modules/bole/bole.js"(exports, module) {
    "use strict";
    var _stringify = require_fast_safe_stringify();
    var individual = require_individual()("$$bole", { fastTime: false });
    var format = require_format();
    var levels = "debug info warn error".split(" ");
    var os = __require("os");
    var pid = process.pid;
    var hasObjMode = false;
    var scache = [];
    var hostname;
    try {
      hostname = os.hostname();
    } catch (e) {
      hostname = os.version().indexOf("Windows 7 ") === 0 ? "windows7" : "hostname-unknown";
    }
    var hostnameSt = _stringify(hostname);
    for (const level of levels) {
      scache[level] = ',"hostname":' + hostnameSt + ',"pid":' + pid + ',"level":"' + level;
      Number(scache[level]);
      if (!Array.isArray(individual[level])) {
        individual[level] = [];
      }
    }
    function stackToString(e) {
      let s = e.stack;
      let ce;
      if (typeof e.cause === "function" && (ce = e.cause())) {
        s += "\nCaused by: " + stackToString(ce);
      }
      return s;
    }
    function errorToOut(err, out) {
      out.err = {
        name: err.name,
        message: err.message,
        code: err.code,
        // perhaps
        stack: stackToString(err)
      };
    }
    function requestToOut(req2, out) {
      out.req = {
        method: req2.method,
        url: req2.url,
        headers: req2.headers,
        remoteAddress: req2.connection.remoteAddress,
        remotePort: req2.connection.remotePort
      };
    }
    function objectToOut(obj, out) {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== void 0) {
          out[k] = obj[k];
        }
      }
    }
    function objectMode(stream) {
      return stream._writableState && stream._writableState.objectMode === true;
    }
    function stringify(level, name, message, obj) {
      let s = '{"time":' + (individual.fastTime ? Date.now() : '"' + (/* @__PURE__ */ new Date()).toISOString() + '"') + scache[level] + '","name":' + name + (message !== void 0 ? ',"message":' + _stringify(message) : "");
      for (const k in obj) {
        s += "," + _stringify(k) + ":" + _stringify(obj[k]);
      }
      s += "}";
      Number(s);
      return s;
    }
    function extend(level, name, message, obj) {
      const newObj = {
        time: individual.fastTime ? Date.now() : (/* @__PURE__ */ new Date()).toISOString(),
        hostname,
        pid,
        level,
        name
      };
      if (message !== void 0) {
        obj.message = message;
      }
      for (const k in obj) {
        newObj[k] = obj[k];
      }
      return newObj;
    }
    function levelLogger(level, name) {
      const outputs = individual[level];
      const nameSt = _stringify(name);
      return function namedLevelLogger(inp, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16) {
        if (outputs.length === 0) {
          return;
        }
        const out = {};
        let objectOut;
        let i = 0;
        const l = outputs.length;
        let stringified;
        let message;
        if (typeof inp === "string" || inp == null) {
          if (!(message = format(inp, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16))) {
            message = void 0;
          }
        } else {
          if (inp instanceof Error) {
            if (typeof a2 === "object") {
              objectToOut(a2, out);
              errorToOut(inp, out);
              if (!(message = format(a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16))) {
                message = void 0;
              }
            } else {
              errorToOut(inp, out);
              if (!(message = format(a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16))) {
                message = void 0;
              }
            }
          } else {
            if (!(message = format(a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16))) {
              message = void 0;
            }
          }
          if (typeof inp === "boolean") {
            message = String(inp);
          } else if (typeof inp === "object" && !(inp instanceof Error)) {
            if (inp.method && inp.url && inp.headers && inp.socket) {
              requestToOut(inp, out);
            } else {
              objectToOut(inp, out);
            }
          }
        }
        if (l === 1 && !hasObjMode) {
          outputs[0].write(Buffer.from(stringify(level, nameSt, message, out) + "\n"));
          return;
        }
        for (; i < l; i++) {
          if (objectMode(outputs[i])) {
            if (objectOut === void 0) {
              objectOut = extend(level, name, message, out);
            }
            outputs[i].write(objectOut);
          } else {
            if (stringified === void 0) {
              stringified = Buffer.from(stringify(level, nameSt, message, out) + "\n");
            }
            outputs[i].write(stringified);
          }
        }
      };
    }
    function bole4(name) {
      function boleLogger(subname) {
        return bole4(name + ":" + subname);
      }
      function makeLogger(p, level) {
        p[level] = levelLogger(level, name);
        return p;
      }
      return levels.reduce(makeLogger, boleLogger);
    }
    bole4.output = function output(opt) {
      let b = false;
      if (Array.isArray(opt)) {
        opt.forEach(bole4.output);
        return bole4;
      }
      if (typeof opt.level !== "string") {
        throw new TypeError('Must provide a "level" option');
      }
      for (const level of levels) {
        if (!b && level === opt.level) {
          b = true;
        }
        if (b) {
          if (opt.stream && objectMode(opt.stream)) {
            hasObjMode = true;
          }
          individual[level].push(opt.stream);
        }
      }
      return bole4;
    };
    bole4.reset = function reset() {
      for (const level of levels) {
        individual[level].splice(0, individual[level].length);
      }
      individual.fastTime = false;
      return bole4;
    };
    bole4.setFastTime = function setFastTime(b) {
      if (!arguments.length) {
        individual.fastTime = true;
      } else {
        individual.fastTime = b;
      }
      return bole4;
    };
    module.exports = bole4;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/split2/4.2.0/40e414c630ab7f443818aa50ee06a670a46fe60cf81f7f81a46733d76a4ce6ba/node_modules/split2/index.js
var require_split2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/split2/4.2.0/40e414c630ab7f443818aa50ee06a670a46fe60cf81f7f81a46733d76a4ce6ba/node_modules/split2/index.js"(exports, module) {
    "use strict";
    var { Transform } = __require("stream");
    var { StringDecoder } = __require("string_decoder");
    var kLast = /* @__PURE__ */ Symbol("last");
    var kDecoder = /* @__PURE__ */ Symbol("decoder");
    function transform(chunk, enc, cb) {
      let list;
      if (this.overflow) {
        const buf = this[kDecoder].write(chunk);
        list = buf.split(this.matcher);
        if (list.length === 1) return cb();
        list.shift();
        this.overflow = false;
      } else {
        this[kLast] += this[kDecoder].write(chunk);
        list = this[kLast].split(this.matcher);
      }
      this[kLast] = list.pop();
      for (let i = 0; i < list.length; i++) {
        try {
          push(this, this.mapper(list[i]));
        } catch (error) {
          return cb(error);
        }
      }
      this.overflow = this[kLast].length > this.maxLength;
      if (this.overflow && !this.skipOverflow) {
        cb(new Error("maximum buffer reached"));
        return;
      }
      cb();
    }
    function flush(cb) {
      this[kLast] += this[kDecoder].end();
      if (this[kLast]) {
        try {
          push(this, this.mapper(this[kLast]));
        } catch (error) {
          return cb(error);
        }
      }
      cb();
    }
    function push(self2, val) {
      if (val !== void 0) {
        self2.push(val);
      }
    }
    function noop(incoming) {
      return incoming;
    }
    function split2(matcher, mapper, options) {
      matcher = matcher || /\r?\n/;
      mapper = mapper || noop;
      options = options || {};
      switch (arguments.length) {
        case 1:
          if (typeof matcher === "function") {
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof matcher === "object" && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
            options = matcher;
            matcher = /\r?\n/;
          }
          break;
        case 2:
          if (typeof matcher === "function") {
            options = mapper;
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof mapper === "object") {
            options = mapper;
            mapper = noop;
          }
      }
      options = Object.assign({}, options);
      options.autoDestroy = true;
      options.transform = transform;
      options.flush = flush;
      options.readableObjectMode = true;
      const stream = new Transform(options);
      stream[kLast] = "";
      stream[kDecoder] = new StringDecoder("utf8");
      stream.matcher = matcher;
      stream.mapper = mapper;
      stream.maxLength = options.maxLength;
      stream.skipOverflow = options.skipOverflow || false;
      stream.overflow = false;
      stream._destroy = function(err, cb) {
        this._writableState.errorEmitted = false;
        cb(err);
      };
      return stream;
    }
    module.exports = split2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/universalify/2.0.1/3983135594189f71b00fc07b6b17387b476e8a92e19ec2a61c1f0e0d68895f4d/node_modules/universalify/index.js
var require_universalify = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/universalify/2.0.1/3983135594189f71b00fc07b6b17387b476e8a92e19ec2a61c1f0e0d68895f4d/node_modules/universalify/index.js"(exports) {
    "use strict";
    exports.fromCallback = function(fn) {
      return Object.defineProperty(function(...args) {
        if (typeof args[args.length - 1] === "function") fn.apply(this, args);
        else {
          return new Promise((resolve, reject) => {
            args.push((err, res) => err != null ? reject(err) : resolve(res));
            fn.apply(this, args);
          });
        }
      }, "name", { value: fn.name });
    };
    exports.fromPromise = function(fn) {
      return Object.defineProperty(function(...args) {
        const cb = args[args.length - 1];
        if (typeof cb !== "function") return fn.apply(this, args);
        else {
          args.pop();
          fn.apply(this, args).then((r) => cb(null, r), cb);
        }
      }, "name", { value: fn.name });
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/fs/index.js
var require_fs = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/fs/index.js"(exports) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs13 = require_graceful_fs();
    var api = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "cp",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "glob",
      "lchmod",
      "lchown",
      "lutimes",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "statfs",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((key) => {
      return typeof fs13[key] === "function";
    });
    Object.assign(exports, fs13);
    api.forEach((method) => {
      exports[method] = u(fs13[method]);
    });
    exports.exists = function(filename, callback) {
      if (typeof callback === "function") {
        return fs13.exists(filename, callback);
      }
      return new Promise((resolve) => {
        return fs13.exists(filename, resolve);
      });
    };
    exports.read = function(fd, buffer, offset, length, position3, callback) {
      if (typeof callback === "function") {
        return fs13.read(fd, buffer, offset, length, position3, callback);
      }
      return new Promise((resolve, reject) => {
        fs13.read(fd, buffer, offset, length, position3, (err, bytesRead, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffer: buffer2 });
        });
      });
    };
    exports.write = function(fd, buffer, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.write(fd, buffer, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.write(fd, buffer, ...args, (err, bytesWritten, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffer: buffer2 });
        });
      });
    };
    exports.readv = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.readv(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.readv(fd, buffers, ...args, (err, bytesRead, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffers: buffers2 });
        });
      });
    };
    exports.writev = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.writev(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.writev(fd, buffers, ...args, (err, bytesWritten, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffers: buffers2 });
        });
      });
    };
    if (typeof fs13.realpath.native === "function") {
      exports.realpath.native = u(fs13.realpath.native);
    } else {
      process.emitWarning(
        "fs.realpath.native is not a function. Is fs being monkey-patched?",
        "Warning",
        "fs-extra-WARN0003"
      );
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/utils.js"(exports, module) {
    "use strict";
    var path17 = __require("path");
    module.exports.checkPath = function checkPath(pth) {
      if (process.platform === "win32") {
        const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path17.parse(pth).root, ""));
        if (pathHasInvalidWinCharacters) {
          const error = new Error(`Path contains invalid characters: ${pth}`);
          error.code = "EINVAL";
          throw error;
        }
      }
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/make-dir.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var { checkPath } = require_utils();
    var getMode = (options) => {
      const defaults = { mode: 511 };
      if (typeof options === "number") return options;
      return { ...defaults, ...options }.mode;
    };
    module.exports.makeDir = async (dir, options) => {
      checkPath(dir);
      return fs13.mkdir(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
    module.exports.makeDirSync = (dir, options) => {
      checkPath(dir);
      return fs13.mkdirSync(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/mkdirs/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var { makeDir: _makeDir, makeDirSync } = require_make_dir();
    var makeDir = u(_makeDir);
    module.exports = {
      mkdirs: makeDir,
      mkdirsSync: makeDirSync,
      // alias
      mkdirp: makeDir,
      mkdirpSync: makeDirSync,
      ensureDir: makeDir,
      ensureDirSync: makeDirSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/path-exists/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs();
    function pathExists(path17) {
      return fs13.access(path17).then(() => true).catch(() => false);
    }
    module.exports = {
      pathExists: u(pathExists),
      pathExistsSync: fs13.existsSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/utimes.js
var require_utimes = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/utimes.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var u = require_universalify().fromPromise;
    async function utimesMillis(path17, atime, mtime) {
      const fd = await fs13.open(path17, "r+");
      let closeErr = null;
      try {
        await fs13.futimes(fd, atime, mtime);
      } finally {
        try {
          await fs13.close(fd);
        } catch (e) {
          closeErr = e;
        }
      }
      if (closeErr) {
        throw closeErr;
      }
    }
    function utimesMillisSync(path17, atime, mtime) {
      const fd = fs13.openSync(path17, "r+");
      fs13.futimesSync(fd, atime, mtime);
      return fs13.closeSync(fd);
    }
    module.exports = {
      utimesMillis: u(utimesMillis),
      utimesMillisSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/stat.js
var require_stat = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/stat.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var path17 = __require("path");
    var u = require_universalify().fromPromise;
    function getStats(src2, dest, opts2) {
      const statFunc = opts2.dereference ? (file) => fs13.stat(file, { bigint: true }) : (file) => fs13.lstat(file, { bigint: true });
      return Promise.all([
        statFunc(src2),
        statFunc(dest).catch((err) => {
          if (err.code === "ENOENT") return null;
          throw err;
        })
      ]).then(([srcStat, destStat]) => ({ srcStat, destStat }));
    }
    function getStatsSync(src2, dest, opts2) {
      let destStat;
      const statFunc = opts2.dereference ? (file) => fs13.statSync(file, { bigint: true }) : (file) => fs13.lstatSync(file, { bigint: true });
      const srcStat = statFunc(src2);
      try {
        destStat = statFunc(dest);
      } catch (err) {
        if (err.code === "ENOENT") return { srcStat, destStat: null };
        throw err;
      }
      return { srcStat, destStat };
    }
    async function checkPaths(src2, dest, funcName, opts2) {
      const { srcStat, destStat } = await getStats(src2, dest, opts2);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path17.basename(src2);
          const destBaseName = path17.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src2}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src2}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src2, dest)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return { srcStat, destStat };
    }
    function checkPathsSync(src2, dest, funcName, opts2) {
      const { srcStat, destStat } = getStatsSync(src2, dest, opts2);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path17.basename(src2);
          const destBaseName = path17.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src2}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src2}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src2, dest)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return { srcStat, destStat };
    }
    async function checkParentPaths(src2, srcStat, dest, funcName) {
      const srcParent = path17.resolve(path17.dirname(src2));
      const destParent = path17.resolve(path17.dirname(dest));
      if (destParent === srcParent || destParent === path17.parse(destParent).root) return;
      let destStat;
      try {
        destStat = await fs13.stat(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return checkParentPaths(src2, srcStat, destParent, funcName);
    }
    function checkParentPathsSync(src2, srcStat, dest, funcName) {
      const srcParent = path17.resolve(path17.dirname(src2));
      const destParent = path17.resolve(path17.dirname(dest));
      if (destParent === srcParent || destParent === path17.parse(destParent).root) return;
      let destStat;
      try {
        destStat = fs13.statSync(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return checkParentPathsSync(src2, srcStat, destParent, funcName);
    }
    function areIdentical(srcStat, destStat) {
      return destStat.ino !== void 0 && destStat.dev !== void 0 && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
    }
    function isSrcSubdir(src2, dest) {
      const srcArr = path17.resolve(src2).split(path17.sep).filter((i) => i);
      const destArr = path17.resolve(dest).split(path17.sep).filter((i) => i);
      return srcArr.every((cur, i) => destArr[i] === cur);
    }
    function errMsg(src2, dest, funcName) {
      return `Cannot ${funcName} '${src2}' to a subdirectory of itself, '${dest}'.`;
    }
    module.exports = {
      // checkPaths
      checkPaths: u(checkPaths),
      checkPathsSync,
      // checkParent
      checkParentPaths: u(checkParentPaths),
      checkParentPathsSync,
      // Misc
      isSrcSubdir,
      areIdentical
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/async.js
var require_async = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/util/async.js"(exports, module) {
    "use strict";
    async function asyncIteratorConcurrentProcess(iterator, fn) {
      const promises = [];
      for await (const item of iterator) {
        promises.push(
          fn(item).then(
            () => null,
            (err) => err ?? new Error("unknown error")
          )
        );
      }
      await Promise.all(
        promises.map(
          (promise) => promise.then((possibleErr) => {
            if (possibleErr !== null) throw possibleErr;
          })
        )
      );
    }
    module.exports = {
      asyncIteratorConcurrentProcess
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/copy.js
var require_copy = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/copy.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var path17 = __require("path");
    var { mkdirs } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { utimesMillis } = require_utimes();
    var stat = require_stat();
    var { asyncIteratorConcurrentProcess } = require_async();
    async function copy2(src2, dest, opts2 = {}) {
      if (typeof opts2 === "function") {
        opts2 = { filter: opts2 };
      }
      opts2.clobber = "clobber" in opts2 ? !!opts2.clobber : true;
      opts2.overwrite = "overwrite" in opts2 ? !!opts2.overwrite : opts2.clobber;
      if (opts2.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0001"
        );
      }
      const { srcStat, destStat } = await stat.checkPaths(src2, dest, "copy", opts2);
      await stat.checkParentPaths(src2, srcStat, dest, "copy");
      const include = await runFilter(src2, dest, opts2);
      if (!include) return;
      const destParent = path17.dirname(dest);
      const dirExists = await pathExists(destParent);
      if (!dirExists) {
        await mkdirs(destParent);
      }
      await getStatsAndPerformCopy(destStat, src2, dest, opts2);
    }
    async function runFilter(src2, dest, opts2) {
      if (!opts2.filter) return true;
      return opts2.filter(src2, dest);
    }
    async function getStatsAndPerformCopy(destStat, src2, dest, opts2) {
      const statFn = opts2.dereference ? fs13.stat : fs13.lstat;
      const srcStat = await statFn(src2);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src2, dest, opts2);
      if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src2, dest, opts2);
      if (srcStat.isSymbolicLink()) return onLink(destStat, src2, dest, opts2);
      if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src2}`);
      if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src2}`);
      throw new Error(`Unknown file: ${src2}`);
    }
    async function onFile(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return copyFile(srcStat, src2, dest, opts2);
      if (opts2.overwrite) {
        await fs13.unlink(dest);
        return copyFile(srcStat, src2, dest, opts2);
      }
      if (opts2.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    async function copyFile(srcStat, src2, dest, opts2) {
      await fs13.copyFile(src2, dest);
      if (opts2.preserveTimestamps) {
        if (fileIsNotWritable(srcStat.mode)) {
          await makeFileWritable(dest, srcStat.mode);
        }
        const updatedSrcStat = await fs13.stat(src2);
        await utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
      }
      return fs13.chmod(dest, srcStat.mode);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return fs13.chmod(dest, srcMode | 128);
    }
    async function onDir(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) {
        await fs13.mkdir(dest);
      }
      await asyncIteratorConcurrentProcess(await fs13.opendir(src2), async (item) => {
        const srcItem = path17.join(src2, item.name);
        const destItem = path17.join(dest, item.name);
        const include = await runFilter(srcItem, destItem, opts2);
        if (include) {
          const { destStat: destStat2 } = await stat.checkPaths(srcItem, destItem, "copy", opts2);
          await getStatsAndPerformCopy(destStat2, srcItem, destItem, opts2);
        }
      });
      if (!destStat) {
        await fs13.chmod(dest, srcStat.mode);
      }
    }
    async function onLink(destStat, src2, dest, opts2) {
      let resolvedSrc = await fs13.readlink(src2);
      if (opts2.dereference) {
        resolvedSrc = path17.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs13.symlink(resolvedSrc, dest);
      }
      let resolvedDest = null;
      try {
        resolvedDest = await fs13.readlink(dest);
      } catch (e) {
        if (e.code === "EINVAL" || e.code === "UNKNOWN") return fs13.symlink(resolvedSrc, dest);
        throw e;
      }
      if (opts2.dereference) {
        resolvedDest = path17.resolve(process.cwd(), resolvedDest);
      }
      if (resolvedSrc !== resolvedDest) {
        if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
          throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
        }
        if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
          throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
        }
      }
      await fs13.unlink(dest);
      return fs13.symlink(resolvedSrc, dest);
    }
    module.exports = copy2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/copy-sync.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var path17 = __require("path");
    var mkdirsSync = require_mkdirs().mkdirsSync;
    var utimesMillisSync = require_utimes().utimesMillisSync;
    var stat = require_stat();
    function copySync2(src2, dest, opts2) {
      if (typeof opts2 === "function") {
        opts2 = { filter: opts2 };
      }
      opts2 = opts2 || {};
      opts2.clobber = "clobber" in opts2 ? !!opts2.clobber : true;
      opts2.overwrite = "overwrite" in opts2 ? !!opts2.overwrite : opts2.clobber;
      if (opts2.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0002"
        );
      }
      const { srcStat, destStat } = stat.checkPathsSync(src2, dest, "copy", opts2);
      stat.checkParentPathsSync(src2, srcStat, dest, "copy");
      if (opts2.filter && !opts2.filter(src2, dest)) return;
      const destParent = path17.dirname(dest);
      if (!fs13.existsSync(destParent)) mkdirsSync(destParent);
      return getStats(destStat, src2, dest, opts2);
    }
    function getStats(destStat, src2, dest, opts2) {
      const statSync = opts2.dereference ? fs13.statSync : fs13.lstatSync;
      const srcStat = statSync(src2);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src2, dest, opts2);
      else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src2, dest, opts2);
      else if (srcStat.isSymbolicLink()) return onLink(destStat, src2, dest, opts2);
      else if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src2}`);
      else if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src2}`);
      throw new Error(`Unknown file: ${src2}`);
    }
    function onFile(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return copyFile(srcStat, src2, dest, opts2);
      return mayCopyFile(srcStat, src2, dest, opts2);
    }
    function mayCopyFile(srcStat, src2, dest, opts2) {
      if (opts2.overwrite) {
        fs13.unlinkSync(dest);
        return copyFile(srcStat, src2, dest, opts2);
      } else if (opts2.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    function copyFile(srcStat, src2, dest, opts2) {
      fs13.copyFileSync(src2, dest);
      if (opts2.preserveTimestamps) handleTimestamps(srcStat.mode, src2, dest);
      return setDestMode(dest, srcStat.mode);
    }
    function handleTimestamps(srcMode, src2, dest) {
      if (fileIsNotWritable(srcMode)) makeFileWritable(dest, srcMode);
      return setDestTimestamps(src2, dest);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return setDestMode(dest, srcMode | 128);
    }
    function setDestMode(dest, srcMode) {
      return fs13.chmodSync(dest, srcMode);
    }
    function setDestTimestamps(src2, dest) {
      const updatedSrcStat = fs13.statSync(src2);
      return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
    }
    function onDir(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return mkDirAndCopy(srcStat.mode, src2, dest, opts2);
      return copyDir(src2, dest, opts2);
    }
    function mkDirAndCopy(srcMode, src2, dest, opts2) {
      fs13.mkdirSync(dest);
      copyDir(src2, dest, opts2);
      return setDestMode(dest, srcMode);
    }
    function copyDir(src2, dest, opts2) {
      const dir = fs13.opendirSync(src2);
      try {
        let dirent;
        while ((dirent = dir.readSync()) !== null) {
          copyDirItem(dirent.name, src2, dest, opts2);
        }
      } finally {
        dir.closeSync();
      }
    }
    function copyDirItem(item, src2, dest, opts2) {
      const srcItem = path17.join(src2, item);
      const destItem = path17.join(dest, item);
      if (opts2.filter && !opts2.filter(srcItem, destItem)) return;
      const { destStat } = stat.checkPathsSync(srcItem, destItem, "copy", opts2);
      return getStats(destStat, srcItem, destItem, opts2);
    }
    function onLink(destStat, src2, dest, opts2) {
      let resolvedSrc = fs13.readlinkSync(src2);
      if (opts2.dereference) {
        resolvedSrc = path17.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs13.symlinkSync(resolvedSrc, dest);
      } else {
        let resolvedDest;
        try {
          resolvedDest = fs13.readlinkSync(dest);
        } catch (err) {
          if (err.code === "EINVAL" || err.code === "UNKNOWN") return fs13.symlinkSync(resolvedSrc, dest);
          throw err;
        }
        if (opts2.dereference) {
          resolvedDest = path17.resolve(process.cwd(), resolvedDest);
        }
        if (resolvedSrc !== resolvedDest) {
          if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
            throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
          }
          if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
            throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
          }
        }
        return copyLink(resolvedSrc, dest);
      }
    }
    function copyLink(resolvedSrc, dest) {
      fs13.unlinkSync(dest);
      return fs13.symlinkSync(resolvedSrc, dest);
    }
    module.exports = copySync2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/index.js
var require_copy2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/copy/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      copy: u(require_copy()),
      copySync: require_copy_sync()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/remove/index.js
var require_remove = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/remove/index.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var u = require_universalify().fromCallback;
    function remove(path17, callback) {
      fs13.rm(path17, { recursive: true, force: true }, callback);
    }
    function removeSync(path17) {
      fs13.rmSync(path17, { recursive: true, force: true });
    }
    module.exports = {
      remove: u(remove),
      removeSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/empty/index.js
var require_empty = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/empty/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs();
    var path17 = __require("path");
    var mkdir = require_mkdirs();
    var remove = require_remove();
    var emptyDir = u(async function emptyDir2(dir) {
      let items;
      try {
        items = await fs13.readdir(dir);
      } catch {
        return mkdir.mkdirs(dir);
      }
      return Promise.all(items.map((item) => remove.remove(path17.join(dir, item))));
    });
    function emptyDirSync(dir) {
      let items;
      try {
        items = fs13.readdirSync(dir);
      } catch {
        return mkdir.mkdirsSync(dir);
      }
      items.forEach((item) => {
        item = path17.join(dir, item);
        remove.removeSync(item);
      });
    }
    module.exports = {
      emptyDirSync,
      emptydirSync: emptyDirSync,
      emptyDir,
      emptydir: emptyDir
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/file.js
var require_file = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/file.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs();
    var mkdir = require_mkdirs();
    async function createFile(file) {
      let stats;
      try {
        stats = await fs13.stat(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path17.dirname(file);
      let dirStats = null;
      try {
        dirStats = await fs13.stat(dir);
      } catch (err) {
        if (err.code === "ENOENT") {
          await mkdir.mkdirs(dir);
          await fs13.writeFile(file, "");
          return;
        } else {
          throw err;
        }
      }
      if (dirStats.isDirectory()) {
        await fs13.writeFile(file, "");
      } else {
        await fs13.readdir(dir);
      }
    }
    function createFileSync(file) {
      let stats;
      try {
        stats = fs13.statSync(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path17.dirname(file);
      try {
        if (!fs13.statSync(dir).isDirectory()) {
          fs13.readdirSync(dir);
        }
      } catch (err) {
        if (err && err.code === "ENOENT") mkdir.mkdirsSync(dir);
        else throw err;
      }
      fs13.writeFileSync(file, "");
    }
    module.exports = {
      createFile: u(createFile),
      createFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/link.js
var require_link = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/link.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs();
    var mkdir = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createLink(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = await fs13.lstat(dstpath);
      } catch {
      }
      let srcStat;
      try {
        srcStat = await fs13.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      if (dstStat && areIdentical(srcStat, dstStat)) return;
      const dir = path17.dirname(dstpath);
      const dirExists = await pathExists(dir);
      if (!dirExists) {
        await mkdir.mkdirs(dir);
      }
      await fs13.link(srcpath, dstpath);
    }
    function createLinkSync(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = fs13.lstatSync(dstpath);
      } catch {
      }
      try {
        const srcStat = fs13.lstatSync(srcpath);
        if (dstStat && areIdentical(srcStat, dstStat)) return;
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      const dir = path17.dirname(dstpath);
      const dirExists = fs13.existsSync(dir);
      if (dirExists) return fs13.linkSync(srcpath, dstpath);
      mkdir.mkdirsSync(dir);
      return fs13.linkSync(srcpath, dstpath);
    }
    module.exports = {
      createLink: u(createLink),
      createLinkSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink-paths.js"(exports, module) {
    "use strict";
    var path17 = __require("path");
    var fs13 = require_fs();
    var { pathExists } = require_path_exists();
    var u = require_universalify().fromPromise;
    async function symlinkPaths(srcpath, dstpath) {
      if (path17.isAbsolute(srcpath)) {
        try {
          await fs13.lstat(srcpath);
        } catch (err) {
          err.message = err.message.replace("lstat", "ensureSymlink");
          throw err;
        }
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path17.dirname(dstpath);
      const relativeToDst = path17.join(dstdir, srcpath);
      const exists = await pathExists(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      try {
        await fs13.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureSymlink");
        throw err;
      }
      return {
        toCwd: srcpath,
        toDst: path17.relative(dstdir, srcpath)
      };
    }
    function symlinkPathsSync(srcpath, dstpath) {
      if (path17.isAbsolute(srcpath)) {
        const exists2 = fs13.existsSync(srcpath);
        if (!exists2) throw new Error("absolute srcpath does not exist");
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path17.dirname(dstpath);
      const relativeToDst = path17.join(dstdir, srcpath);
      const exists = fs13.existsSync(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      const srcExists = fs13.existsSync(srcpath);
      if (!srcExists) throw new Error("relative srcpath does not exist");
      return {
        toCwd: srcpath,
        toDst: path17.relative(dstdir, srcpath)
      };
    }
    module.exports = {
      symlinkPaths: u(symlinkPaths),
      symlinkPathsSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink-type.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var u = require_universalify().fromPromise;
    async function symlinkType(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = await fs13.lstat(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    function symlinkTypeSync(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = fs13.lstatSync(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    module.exports = {
      symlinkType: u(symlinkType),
      symlinkTypeSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/symlink.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs();
    var { mkdirs, mkdirsSync } = require_mkdirs();
    var { symlinkPaths, symlinkPathsSync } = require_symlink_paths();
    var { symlinkType, symlinkTypeSync } = require_symlink_type();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createSymlink(srcpath, dstpath, type) {
      let stats;
      try {
        stats = await fs13.lstat(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        let srcStat;
        if (path17.isAbsolute(srcpath)) {
          srcStat = await fs13.stat(srcpath);
        } else {
          const dstdir = path17.dirname(dstpath);
          const relativeToDst = path17.join(dstdir, srcpath);
          try {
            srcStat = await fs13.stat(relativeToDst);
          } catch {
            srcStat = await fs13.stat(srcpath);
          }
        }
        const dstStat = await fs13.stat(dstpath);
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = await symlinkPaths(srcpath, dstpath);
      srcpath = relative.toDst;
      const toType = await symlinkType(relative.toCwd, type);
      const dir = path17.dirname(dstpath);
      if (!await pathExists(dir)) {
        await mkdirs(dir);
      }
      return fs13.symlink(srcpath, dstpath, toType);
    }
    function createSymlinkSync2(srcpath, dstpath, type) {
      let stats;
      try {
        stats = fs13.lstatSync(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        let srcStat;
        if (path17.isAbsolute(srcpath)) {
          srcStat = fs13.statSync(srcpath);
        } else {
          const dstdir = path17.dirname(dstpath);
          const relativeToDst = path17.join(dstdir, srcpath);
          try {
            srcStat = fs13.statSync(relativeToDst);
          } catch {
            srcStat = fs13.statSync(srcpath);
          }
        }
        const dstStat = fs13.statSync(dstpath);
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = symlinkPathsSync(srcpath, dstpath);
      srcpath = relative.toDst;
      type = symlinkTypeSync(relative.toCwd, type);
      const dir = path17.dirname(dstpath);
      const exists = fs13.existsSync(dir);
      if (exists) return fs13.symlinkSync(srcpath, dstpath, type);
      mkdirsSync(dir);
      return fs13.symlinkSync(srcpath, dstpath, type);
    }
    module.exports = {
      createSymlink: u(createSymlink),
      createSymlinkSync: createSymlinkSync2
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/index.js
var require_ensure = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/ensure/index.js"(exports, module) {
    "use strict";
    var { createFile, createFileSync } = require_file();
    var { createLink, createLinkSync } = require_link();
    var { createSymlink, createSymlinkSync: createSymlinkSync2 } = require_symlink();
    module.exports = {
      // file
      createFile,
      createFileSync,
      ensureFile: createFile,
      ensureFileSync: createFileSync,
      // link
      createLink,
      createLinkSync,
      ensureLink: createLink,
      ensureLinkSync: createLinkSync,
      // symlink
      createSymlink,
      createSymlinkSync: createSymlinkSync2,
      ensureSymlink: createSymlink,
      ensureSymlinkSync: createSymlinkSync2
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/jsonfile/6.2.1/4eef6320b797a6391b2bd057b7f45a61f6df9e0461d95dbbea0e70d498ea3860/node_modules/jsonfile/utils.js
var require_utils2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/jsonfile/6.2.1/4eef6320b797a6391b2bd057b7f45a61f6df9e0461d95dbbea0e70d498ea3860/node_modules/jsonfile/utils.js"(exports, module) {
    function stringify(obj, { EOL = "\n", finalEOL = true, replacer = null, spaces } = {}) {
      const EOF = finalEOL ? EOL : "";
      const str = JSON.stringify(obj, replacer, spaces);
      if (str === void 0) {
        throw new TypeError(`Converting ${typeof obj} value to JSON is not supported`);
      }
      return str.replace(/\n/g, EOL) + EOF;
    }
    function stripBom2(content) {
      if (Buffer.isBuffer(content)) content = content.toString("utf8");
      return content.replace(/^\uFEFF/, "");
    }
    module.exports = { stringify, stripBom: stripBom2 };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/jsonfile/6.2.1/4eef6320b797a6391b2bd057b7f45a61f6df9e0461d95dbbea0e70d498ea3860/node_modules/jsonfile/index.js
var require_jsonfile = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/jsonfile/6.2.1/4eef6320b797a6391b2bd057b7f45a61f6df9e0461d95dbbea0e70d498ea3860/node_modules/jsonfile/index.js"(exports, module) {
    var _fs;
    try {
      _fs = require_graceful_fs();
    } catch (_) {
      _fs = __require("fs");
    }
    var universalify = require_universalify();
    var { stringify, stripBom: stripBom2 } = require_utils2();
    async function _readFile(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs13 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      let data = await universalify.fromCallback(fs13.readFile)(file, options);
      data = stripBom2(data);
      let obj;
      try {
        obj = JSON.parse(data, options ? options.reviver : null);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
      return obj;
    }
    var readFile = universalify.fromPromise(_readFile);
    function readFileSync(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs13 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      try {
        let content = fs13.readFileSync(file, options);
        content = stripBom2(content);
        return JSON.parse(content, options.reviver);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
    }
    async function _writeFile(file, obj, options = {}) {
      const fs13 = options.fs || _fs;
      const str = stringify(obj, options);
      await universalify.fromCallback(fs13.writeFile)(file, str, options);
    }
    var writeFile2 = universalify.fromPromise(_writeFile);
    function writeFileSync(file, obj, options = {}) {
      const fs13 = options.fs || _fs;
      const str = stringify(obj, options);
      return fs13.writeFileSync(file, str, options);
    }
    module.exports = {
      readFile,
      readFileSync,
      writeFile: writeFile2,
      writeFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/jsonfile.js"(exports, module) {
    "use strict";
    var jsonFile = require_jsonfile();
    module.exports = {
      // jsonfile exports
      readJson: jsonFile.readFile,
      readJsonSync: jsonFile.readFileSync,
      writeJson: jsonFile.writeFile,
      writeJsonSync: jsonFile.writeFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/output-file/index.js
var require_output_file = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/output-file/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs();
    var path17 = __require("path");
    var mkdir = require_mkdirs();
    var pathExists = require_path_exists().pathExists;
    async function outputFile(file, data, encoding = "utf-8") {
      const dir = path17.dirname(file);
      if (!await pathExists(dir)) {
        await mkdir.mkdirs(dir);
      }
      return fs13.writeFile(file, data, encoding);
    }
    function outputFileSync(file, ...args) {
      const dir = path17.dirname(file);
      if (!fs13.existsSync(dir)) {
        mkdir.mkdirsSync(dir);
      }
      fs13.writeFileSync(file, ...args);
    }
    module.exports = {
      outputFile: u(outputFile),
      outputFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/output-json.js
var require_output_json = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/output-json.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFile } = require_output_file();
    async function outputJson(file, data, options = {}) {
      const str = stringify(data, options);
      await outputFile(file, str, options);
    }
    module.exports = outputJson;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/output-json-sync.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFileSync } = require_output_file();
    function outputJsonSync(file, data, options) {
      const str = stringify(data, options);
      outputFileSync(file, str, options);
    }
    module.exports = outputJsonSync;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/index.js
var require_json = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/json/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var jsonFile = require_jsonfile2();
    jsonFile.outputJson = u(require_output_json());
    jsonFile.outputJsonSync = require_output_json_sync();
    jsonFile.outputJSON = jsonFile.outputJson;
    jsonFile.outputJSONSync = jsonFile.outputJsonSync;
    jsonFile.writeJSON = jsonFile.writeJson;
    jsonFile.writeJSONSync = jsonFile.writeJsonSync;
    jsonFile.readJSON = jsonFile.readJson;
    jsonFile.readJSONSync = jsonFile.readJsonSync;
    module.exports = jsonFile;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/move.js
var require_move = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/move.js"(exports, module) {
    "use strict";
    var fs13 = require_fs();
    var path17 = __require("path");
    var { copy: copy2 } = require_copy2();
    var { remove } = require_remove();
    var { mkdirp } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var stat = require_stat();
    async function move(src2, dest, opts2 = {}) {
      const overwrite = opts2.overwrite || opts2.clobber || false;
      const { srcStat, isChangingCase = false } = await stat.checkPaths(src2, dest, "move", opts2);
      await stat.checkParentPaths(src2, srcStat, dest, "move");
      const destParent = path17.dirname(dest);
      const parsedParentPath = path17.parse(destParent);
      if (parsedParentPath.root !== destParent) {
        await mkdirp(destParent);
      }
      return doRename(src2, dest, overwrite, isChangingCase);
    }
    async function doRename(src2, dest, overwrite, isChangingCase) {
      if (!isChangingCase) {
        if (overwrite) {
          await remove(dest);
        } else if (await pathExists(dest)) {
          throw new Error("dest already exists.");
        }
      }
      try {
        await fs13.rename(src2, dest);
      } catch (err) {
        if (err.code !== "EXDEV") {
          throw err;
        }
        await moveAcrossDevice(src2, dest, overwrite);
      }
    }
    async function moveAcrossDevice(src2, dest, overwrite) {
      const opts2 = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      await copy2(src2, dest, opts2);
      return remove(src2);
    }
    module.exports = move;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/move-sync.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var path17 = __require("path");
    var copySync2 = require_copy2().copySync;
    var removeSync = require_remove().removeSync;
    var mkdirpSync = require_mkdirs().mkdirpSync;
    var stat = require_stat();
    function moveSync(src2, dest, opts2) {
      opts2 = opts2 || {};
      const overwrite = opts2.overwrite || opts2.clobber || false;
      const { srcStat, isChangingCase = false } = stat.checkPathsSync(src2, dest, "move", opts2);
      stat.checkParentPathsSync(src2, srcStat, dest, "move");
      if (!isParentRoot(dest)) mkdirpSync(path17.dirname(dest));
      return doRename(src2, dest, overwrite, isChangingCase);
    }
    function isParentRoot(dest) {
      const parent = path17.dirname(dest);
      const parsedPath = path17.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src2, dest, overwrite, isChangingCase) {
      if (isChangingCase) return rename(src2, dest, overwrite);
      if (overwrite) {
        removeSync(dest);
        return rename(src2, dest, overwrite);
      }
      if (fs13.existsSync(dest)) throw new Error("dest already exists.");
      return rename(src2, dest, overwrite);
    }
    function rename(src2, dest, overwrite) {
      try {
        fs13.renameSync(src2, dest);
      } catch (err) {
        if (err.code !== "EXDEV") throw err;
        return moveAcrossDevice(src2, dest, overwrite);
      }
    }
    function moveAcrossDevice(src2, dest, overwrite) {
      const opts2 = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      copySync2(src2, dest, opts2);
      return removeSync(src2);
    }
    module.exports = moveSync;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/index.js
var require_move2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/move/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      move: u(require_move()),
      moveSync: require_move_sync()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/index.js
var require_lib = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.4/4cb0d718f8660ad2564c0d882d89a7255b59466c803fa7e6007de96d8c5aa18b/node_modules/fs-extra/lib/index.js"(exports, module) {
    "use strict";
    module.exports = {
      // Export promiseified graceful-fs:
      ...require_fs(),
      // Export extra methods:
      ...require_copy2(),
      ...require_empty(),
      ...require_ensure(),
      ...require_json(),
      ...require_mkdirs(),
      ...require_move2(),
      ...require_output_file(),
      ...require_path_exists(),
      ...require_remove()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@zkochan/rimraf/4.0.0/e7aeecc18d1d120ecda04415cbe146a0ad1e4d158a9823e79bfdce5ee3173719/node_modules/@zkochan/rimraf/index.js
import fs from "node:fs";
function rimrafSync(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}
var init_rimraf = __esm({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@zkochan/rimraf/4.0.0/e7aeecc18d1d120ecda04415cbe146a0ad1e4d158a9823e79bfdce5ee3173719/node_modules/@zkochan/rimraf/index.js"() {
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/rename-overwrite/7.0.1/87428b418e43a94bf7c7f463bfc62ae5e0dc2e0a72cb36b94d07cf207fc3347b/node_modules/rename-overwrite/index.js
import crypto2 from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";
function renameOverwriteSync(oldPath, newPath, retry = 0) {
  try {
    fs2.renameSync(oldPath, newPath);
  } catch (err) {
    retry++;
    if (retry > 3) throw err;
    switch (err.code) {
      // Windows Antivirus issues
      case "EPERM":
      case "EACCESS":
      case "EBUSY": {
        try {
          rimrafSync(newPath);
        } catch {
        }
        const start = Date.now();
        let backoff = 0;
        let lastError = err;
        while (Date.now() - start < 6e4 && (lastError.code === "EPERM" || lastError.code === "EACCESS" || lastError.code === "EBUSY")) {
          const waitUntil = Date.now() + backoff;
          while (waitUntil > Date.now()) {
          }
          try {
            fs2.renameSync(oldPath, newPath);
            return;
          } catch (err2) {
            lastError = err2;
          }
          if (backoff < 100) {
            backoff += 10;
          }
        }
        throw lastError;
      }
      case "ENOTEMPTY":
      case "EEXIST":
      case "ENOTDIR":
        try {
          swapRenameSync(oldPath, newPath);
        } catch {
          rimrafSync(newPath);
          fs2.renameSync(oldPath, newPath);
        }
        break;
      case "ENOENT":
        fs2.mkdirSync(path2.dirname(newPath), { recursive: true });
        renameOverwriteSync(oldPath, newPath, retry);
        return;
      // Crossing filesystem boundaries so rename is not available
      case "EXDEV":
        try {
          rimrafSync(newPath);
        } catch (rimrafErr) {
          if (rimrafErr.code !== "ENOENT") {
            throw rimrafErr;
          }
        }
        copySync(oldPath, newPath);
        rimrafSync(oldPath);
        break;
      default:
        throw err;
    }
  }
}
function tempPath(p) {
  return `${p}_${process.pid.toString(16)}_${crypto2.randomBytes(4).toString("hex")}`;
}
function swapRenameSync(oldPath, newPath) {
  const temp = tempPath(newPath);
  fs2.renameSync(newPath, temp);
  try {
    fs2.renameSync(oldPath, newPath);
  } catch (err) {
    try {
      fs2.renameSync(temp, newPath);
    } catch {
    }
    throw err;
  }
  try {
    rimrafSync(temp);
  } catch {
  }
}
var import_fs_extra, copySync, copy;
var init_rename_overwrite = __esm({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/rename-overwrite/7.0.1/87428b418e43a94bf7c7f463bfc62ae5e0dc2e0a72cb36b94d07cf207fc3347b/node_modules/rename-overwrite/index.js"() {
    import_fs_extra = __toESM(require_lib(), 1);
    init_rimraf();
    ({ copySync, copy } = import_fs_extra.default);
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-windows/1.0.2/8de297753f5a2f0d3154b27e41b774686b53f5e3c186cf9f734f0a5ce4054b2e/node_modules/is-windows/index.js
var require_is_windows = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-windows/1.0.2/8de297753f5a2f0d3154b27e41b774686b53f5e3c186cf9f734f0a5ce4054b2e/node_modules/is-windows/index.js"(exports, module) {
    (function(factory) {
      if (exports && typeof exports === "object" && typeof module !== "undefined") {
        module.exports = factory();
      } else if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof window !== "undefined") {
        window.isWindows = factory();
      } else if (typeof global !== "undefined") {
        global.isWindows = factory();
      } else if (typeof self !== "undefined") {
        self.isWindows = factory();
      } else {
        this.isWindows = factory();
      }
    })(function() {
      "use strict";
      return function isWindows2() {
        return process && (process.platform === "win32" || /^(msys|cygwin)$/.test(process.env.OSTYPE));
      };
    });
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/better-path-resolve/2.0.0/e066f8a0a157777f698ec4707dc0026edc830ea8827eeb29a3d32906ea207d48/node_modules/better-path-resolve/index.js
import path4 from "node:path";
function winResolve(p) {
  if (arguments.length === 0) return path4.resolve();
  if (typeof p !== "string") {
    return path4.resolve(p);
  }
  if (p[1] === ":") {
    const cc = p[0].charCodeAt();
    if (cc < 65 || cc > 90) {
      p = `${p[0].toUpperCase()}${p.substr(1)}`;
    }
  }
  if (p.endsWith(":")) {
    return p;
  }
  return path4.resolve(p);
}
var import_is_windows, betterPathResolve;
var init_better_path_resolve = __esm({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/better-path-resolve/2.0.0/e066f8a0a157777f698ec4707dc0026edc830ea8827eeb29a3d32906ea207d48/node_modules/better-path-resolve/index.js"() {
    import_is_windows = __toESM(require_is_windows(), 1);
    betterPathResolve = (0, import_is_windows.default)() ? winResolve : path4.resolve;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-subdir/2.0.0/86b3cd44735afb9f459dad7b43ddfc23f1a21495323a3fb38b9ab590c29f23ce/node_modules/is-subdir/index.js
import path6 from "node:path";
function isSubdir(parentDir, subdir) {
  const rParent = `${betterPathResolve(parentDir)}${path6.sep}`;
  const rDir = `${betterPathResolve(subdir)}${path6.sep}`;
  return rDir.startsWith(rParent);
}
var init_is_subdir = __esm({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-subdir/2.0.0/86b3cd44735afb9f459dad7b43ddfc23f1a21495323a3fb38b9ab590c29f23ce/node_modules/is-subdir/index.js"() {
    init_better_path_resolve();
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/strip-bom/5.0.0/c5abc9f591760d7581de2026bc6da7f255db82a0b75d02fcc6cebf460005b3e6/node_modules/strip-bom/index.js
function stripBom(string) {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a string, got ${typeof string}`);
  }
  if (string.charCodeAt(0) === 65279) {
    return string.slice(1);
  }
  return string;
}
var init_strip_bom = __esm({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/strip-bom/5.0.0/c5abc9f591760d7581de2026bc6da7f255db82a0b75d02fcc6cebf460005b3e6/node_modules/strip-bom/index.js"() {
  }
});

// ../store/cafs/lib/parseJson.js
function parseJsonBufferSync(buffer) {
  return JSON.parse(stripBom(buffer.toString()));
}
var init_parseJson = __esm({
  "../store/cafs/lib/parseJson.js"() {
    "use strict";
    init_strip_bom();
  }
});

// ../store/cafs/lib/addFilesFromDir.js
import fs5, {} from "node:fs";
import path7 from "node:path";
import util3 from "node:util";
function addFilesFromDir(addBuffer, dirname, opts2 = {}) {
  const filesIndex = /* @__PURE__ */ new Map();
  let manifest;
  let files;
  const resolvedRoot = fs5.realpathSync(dirname);
  if (opts2.files) {
    files = [];
    for (const file of opts2.files) {
      const absolutePath = path7.join(dirname, file);
      const stat = getStatIfContained(absolutePath, resolvedRoot);
      if (!stat) {
        continue;
      }
      files.push({
        absolutePath,
        relativePath: file,
        stat
      });
    }
  } else {
    files = findFilesInDir(dirname, resolvedRoot, opts2);
  }
  for (const { absolutePath, relativePath, stat } of files) {
    const buffer = lib_default.readFileSync(absolutePath);
    if (opts2.readManifest && relativePath === "package.json") {
      manifest = parseJsonBufferSync(buffer);
    }
    const mode = stat.mode & 511;
    filesIndex.set(relativePath, {
      mode,
      size: stat.size,
      ...addBuffer(buffer, mode)
    });
  }
  return { manifest, filesIndex };
}
function getStatIfContained(absolutePath, rootDir) {
  let lstat;
  try {
    lstat = fs5.lstatSync(absolutePath);
  } catch (err) {
    if (util3.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
  if (lstat.isSymbolicLink()) {
    return getSymlinkStatIfContained(absolutePath, rootDir)?.stat ?? null;
  }
  return lstat;
}
function getSymlinkStatIfContained(absolutePath, rootDir) {
  let realPath;
  try {
    realPath = fs5.realpathSync(absolutePath);
  } catch (err) {
    if (util3.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
  if (!isSubdir(rootDir, realPath)) {
    return null;
  }
  return { stat: fs5.statSync(realPath), realPath };
}
function findFilesInDir(dir, rootDir, opts2) {
  const files = [];
  const ctx = {
    filesList: files,
    includeNodeModules: opts2.includeNodeModules ?? false,
    rootDir,
    visited: /* @__PURE__ */ new Set([rootDir])
  };
  findFiles(ctx, dir, "", rootDir);
  return files;
}
function findFiles(ctx, dir, relativeDir, currentRealPath) {
  const files = fs5.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const relativeSubdir = `${relativeDir}${relativeDir ? "/" : ""}${file.name}`;
    const absolutePath = path7.join(dir, file.name);
    let nextRealDir;
    if (file.isSymbolicLink()) {
      const res = getSymlinkStatIfContained(absolutePath, ctx.rootDir);
      if (!res) {
        continue;
      }
      if (res.stat.isDirectory()) {
        nextRealDir = res.realPath;
      } else {
        ctx.filesList.push({
          relativePath: relativeSubdir,
          absolutePath,
          stat: res.stat
        });
        continue;
      }
    } else if (file.isDirectory()) {
      nextRealDir = path7.join(currentRealPath, file.name);
    }
    if (nextRealDir) {
      if (ctx.visited.has(nextRealDir))
        continue;
      if (relativeDir !== "" || file.name !== "node_modules" || ctx.includeNodeModules) {
        ctx.visited.add(nextRealDir);
        findFiles(ctx, absolutePath, relativeSubdir, nextRealDir);
        ctx.visited.delete(nextRealDir);
      }
      continue;
    }
    let stat;
    try {
      stat = fs5.statSync(absolutePath);
    } catch (err) {
      if (util3.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
        continue;
      }
      throw err;
    }
    ctx.filesList.push({
      relativePath: relativeSubdir,
      absolutePath,
      stat
    });
  }
}
var init_addFilesFromDir = __esm({
  "../store/cafs/lib/addFilesFromDir.js"() {
    "use strict";
    init_lib3();
    init_is_subdir();
    init_parseJson();
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-gzip/2.0.0/82a8e17050fa38e95e62aa7580ddf517da43682e2ea1a94728382ef43c644d04/node_modules/is-gzip/index.js
var require_is_gzip = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/is-gzip/2.0.0/82a8e17050fa38e95e62aa7580ddf517da43682e2ea1a94728382ef43c644d04/node_modules/is-gzip/index.js"(exports, module) {
    "use strict";
    module.exports = (buf) => {
      if (!buf || buf.length < 3) {
        return false;
      }
      return buf[0] === 31 && buf[1] === 139 && buf[2] === 8;
    };
  }
});

// ../store/cafs/lib/parseTarball.js
import path8 from "node:path";
function parseTarball(buffer) {
  const files = /* @__PURE__ */ new Map();
  let pathTrimmed = false;
  let mode = 0;
  let fileSize = 0;
  let fileType = 0;
  let prefix = "";
  let fileName = "";
  let longLinkPath = "";
  let paxHeaderPath = "";
  let paxHeaderFileSize;
  let blockBytes = 0;
  let blockStart = 0;
  while (buffer[blockStart] !== 0) {
    fileType = buffer[blockStart + FILE_TYPE_OFFSET];
    if (paxHeaderFileSize !== void 0) {
      fileSize = paxHeaderFileSize;
      paxHeaderFileSize = void 0;
    } else {
      fileSize = parseOctal(blockStart + FILE_SIZE_OFFSET, 12);
    }
    blockBytes = (fileSize & ~511) + (fileSize & 511 ? 1024 : 512);
    const expectedCheckSum = parseOctal(blockStart + CHECKSUM_OFFSET, 8);
    const actualCheckSum = checkSum(blockStart);
    if (expectedCheckSum !== actualCheckSum) {
      throw new Error(`Invalid checksum for TAR header at offset ${blockStart}. Expected ${expectedCheckSum}, got ${actualCheckSum}`);
    }
    pathTrimmed = false;
    if (longLinkPath) {
      fileName = longLinkPath;
      longLinkPath = "";
    } else if (paxHeaderPath) {
      fileName = paxHeaderPath;
      paxHeaderPath = "";
    } else {
      prefix = parseString(blockStart + PREFIX_OFFSET, 155);
      if (prefix && !pathTrimmed) {
        pathTrimmed = true;
        prefix = "";
      }
      fileName = parseString(blockStart, MODE_OFFSET);
      if (prefix) {
        fileName = `${prefix}/${fileName}`;
      }
    }
    if (fileName.includes("./") || fileName.includes(".\\")) {
      fileName = path8.posix.join("/", fileName.replaceAll("\\", "/")).slice(1);
    }
    switch (fileType) {
      case 0:
      case ZERO:
      case FILE_TYPE_HARD_LINK:
        mode = parseOctal(blockStart + MODE_OFFSET, 8);
        files.set(fileName.replaceAll("//", "/"), { offset: blockStart + 512, mode, size: fileSize });
        break;
      case FILE_TYPE_DIRECTORY:
      case FILE_TYPE_SYMLINK:
        break;
      case FILE_TYPE_PAX_HEADER:
        parsePaxHeader(blockStart + 512, fileSize, false);
        break;
      case FILE_TYPE_PAX_GLOBAL_HEADER:
        parsePaxHeader(blockStart + 512, fileSize, true);
        break;
      case FILE_TYPE_LONGLINK: {
        longLinkPath = buffer.toString("utf8", blockStart + 512, blockStart + 512 + fileSize).replace(/\0.*/, "");
        const slashIndex = longLinkPath.indexOf("/");
        if (slashIndex >= 0) {
          longLinkPath = longLinkPath.slice(slashIndex + 1);
        }
        break;
      }
      default:
        throw new Error(`Unsupported file type ${fileType} for file ${fileName}.`);
    }
    blockStart += blockBytes;
  }
  return { files, buffer: buffer.buffer };
  function checkSum(offset) {
    let sum = 256;
    let i = offset;
    const checksumStart = offset + 148;
    const checksumEnd = offset + 156;
    const blockEnd = offset + 512;
    for (; i < checksumStart; i++) {
      sum += buffer[i];
    }
    for (i = checksumEnd; i < blockEnd; i++) {
      sum += buffer[i];
    }
    return sum;
  }
  function parsePaxHeader(offset, length, global2) {
    const end = offset + length;
    let i = offset;
    while (i < end) {
      const lineStart = i;
      while (i < end && buffer[i] !== SPACE) {
        i++;
      }
      const strLen = buffer.toString("utf-8", lineStart, i);
      const len = parseInt(strLen, 10);
      if (!len) {
        throw new Error(`Invalid length in PAX record: ${strLen}`);
      }
      i++;
      const lineEnd = lineStart + len;
      const record = buffer.toString("utf-8", i, lineEnd - 1);
      i = lineEnd;
      const equalSign = record.indexOf("=");
      const keyword = record.slice(0, equalSign);
      if (keyword === "path") {
        const slashIndex = record.indexOf("/", equalSign + 1);
        if (global2) {
          throw new Error(`Unexpected global PAX path: ${record}`);
        }
        paxHeaderPath = record.slice(slashIndex >= 0 ? slashIndex + 1 : equalSign + 1);
      } else if (keyword === "size") {
        const size = parseInt(record.slice(equalSign + 1), 10);
        if (isNaN(size) || size < 0) {
          throw new Error(`Invalid size in PAX record: ${record}`);
        }
        if (global2) {
          throw new Error(`Unexpected global PAX file size: ${record}`);
        }
        paxHeaderFileSize = size;
      } else {
        continue;
      }
    }
  }
  function parseString(offset, length) {
    let end = offset;
    const max = length + offset;
    for (let char = buffer[end]; char !== 0 && end !== max; char = buffer[++end]) {
      if (!pathTrimmed && (char === SLASH || char === BACKSLASH)) {
        pathTrimmed = true;
        offset = end + 1;
      }
    }
    return buffer.toString("utf8", offset, end);
  }
  function parseOctal(offset, length) {
    const val = buffer.subarray(offset, offset + length);
    offset = 0;
    while (offset < val.length && val[offset] === SPACE)
      offset++;
    const end = clamp(indexOf(val, SPACE, offset, val.length), val.length, val.length);
    while (offset < end && val[offset] === 0)
      offset++;
    if (end === offset)
      return 0;
    return parseInt(val.subarray(offset, end).toString(), 8);
  }
}
function indexOf(block, num, offset, end) {
  for (; offset < end; offset++) {
    if (block[offset] === num)
      return offset;
  }
  return end;
}
function clamp(index, len, defaultValue) {
  if (typeof index !== "number")
    return defaultValue;
  index = ~~index;
  if (index >= len)
    return len;
  if (index >= 0)
    return index;
  index += len;
  if (index >= 0)
    return index;
  return 0;
}
var ZERO, FILE_TYPE_HARD_LINK, FILE_TYPE_SYMLINK, FILE_TYPE_DIRECTORY, SPACE, SLASH, BACKSLASH, FILE_TYPE_PAX_HEADER, FILE_TYPE_PAX_GLOBAL_HEADER, FILE_TYPE_LONGLINK, MODE_OFFSET, FILE_SIZE_OFFSET, CHECKSUM_OFFSET, FILE_TYPE_OFFSET, PREFIX_OFFSET;
var init_parseTarball = __esm({
  "../store/cafs/lib/parseTarball.js"() {
    "use strict";
    ZERO = "0".charCodeAt(0);
    FILE_TYPE_HARD_LINK = "1".charCodeAt(0);
    FILE_TYPE_SYMLINK = "2".charCodeAt(0);
    FILE_TYPE_DIRECTORY = "5".charCodeAt(0);
    SPACE = " ".charCodeAt(0);
    SLASH = "/".charCodeAt(0);
    BACKSLASH = "\\".charCodeAt(0);
    FILE_TYPE_PAX_HEADER = "x".charCodeAt(0);
    FILE_TYPE_PAX_GLOBAL_HEADER = "g".charCodeAt(0);
    FILE_TYPE_LONGLINK = "L".charCodeAt(0);
    MODE_OFFSET = 100;
    FILE_SIZE_OFFSET = 124;
    CHECKSUM_OFFSET = 148;
    FILE_TYPE_OFFSET = 156;
    PREFIX_OFFSET = 345;
  }
});

// ../store/cafs/lib/addFilesFromTarball.js
import { gunzipSync } from "node:zlib";
function addFilesFromTarball(addBufferToCafs2, tarballBuffer, readManifest, ignore) {
  const tarContent = (0, import_is_gzip.default)(tarballBuffer) ? gunzipSync(tarballBuffer, { chunkSize: 128 * 1024 }) : Buffer.isBuffer(tarballBuffer) ? tarballBuffer : Buffer.from(tarballBuffer);
  const { files } = parseTarball(tarContent);
  const filesIndex = /* @__PURE__ */ new Map();
  let manifestBuffer;
  for (const [relativePath, { mode, offset, size }] of files) {
    if (ignore?.(relativePath))
      continue;
    const fileBuffer = tarContent.subarray(offset, offset + size);
    if (readManifest && relativePath === "package.json") {
      manifestBuffer = fileBuffer;
    }
    filesIndex.set(relativePath, {
      mode,
      size,
      ...addBufferToCafs2(fileBuffer, mode)
    });
  }
  return {
    filesIndex,
    manifest: manifestBuffer ? parseJsonBufferSync(manifestBuffer) : void 0
  };
}
var import_is_gzip;
var init_addFilesFromTarball = __esm({
  "../store/cafs/lib/addFilesFromTarball.js"() {
    "use strict";
    import_is_gzip = __toESM(require_is_gzip(), 1);
    init_parseJson();
    init_parseTarball();
  }
});

// ../store/cafs/lib/getFilePathInCafs.js
import path9 from "node:path";
function getFilePathByModeInCafs(storeDir, hexDigest, mode) {
  const fileType = modeIsExecutable(mode) ? "exec" : "nonexec";
  return `${storeDir}${SEP}${contentPathFromHex(fileType, hexDigest)}`;
}
function contentPathFromHex(fileType, hex) {
  const p = `files${SEP}${hex.slice(0, 2)}${SEP}${hex.slice(2)}`;
  switch (fileType) {
    case "exec":
      return `${p}-exec`;
    case "nonexec":
      return p;
  }
}
var SEP, modeIsExecutable;
var init_getFilePathInCafs = __esm({
  "../store/cafs/lib/getFilePathInCafs.js"() {
    "use strict";
    SEP = path9.sep;
    modeIsExecutable = (mode) => (mode & 73) !== 0;
  }
});

// ../store/cafs/lib/checkPkgFilesIntegrity.js
import crypto3 from "node:crypto";
import fs6 from "node:fs";
import util4 from "node:util";
function checkPkgFilesIntegrity(storeDir, pkgIndex) {
  const verifiedFilesCache = /* @__PURE__ */ new Set();
  const _checkFilesIntegrity = checkFilesIntegrity.bind(null, verifiedFilesCache, storeDir, pkgIndex.algo);
  const verified = _checkFilesIntegrity(pkgIndex.files);
  if (!verified.passed)
    return verified;
  const sideEffectsMaps = /* @__PURE__ */ new Map();
  if (pkgIndex.sideEffects) {
    for (const [sideEffectName, { added, deleted }] of pkgIndex.sideEffects) {
      if (added) {
        const result = _checkFilesIntegrity(added);
        if (!result.passed) {
          continue;
        } else {
          sideEffectsMaps.set(sideEffectName, { added: result.filesMap, deleted });
        }
      } else if (deleted) {
        sideEffectsMaps.set(sideEffectName, { deleted });
      }
    }
  }
  return {
    ...verified,
    sideEffectsMaps: sideEffectsMaps.size > 0 ? sideEffectsMaps : void 0
  };
}
function buildFileMapsFromIndex(storeDir, pkgIndex) {
  const filesMap = /* @__PURE__ */ new Map();
  for (const [f, fstat] of pkgIndex.files) {
    const filename = getFilePathByModeInCafs(storeDir, fstat.digest, fstat.mode);
    filesMap.set(f, filename);
  }
  const sideEffectsMaps = /* @__PURE__ */ new Map();
  if (pkgIndex.sideEffects) {
    for (const [sideEffectName, { added, deleted }] of pkgIndex.sideEffects) {
      const sideEffectEntry = {};
      if (added) {
        const addedFilesMap = /* @__PURE__ */ new Map();
        for (const [f, fstat] of added) {
          const filename = getFilePathByModeInCafs(storeDir, fstat.digest, fstat.mode);
          addedFilesMap.set(f, filename);
        }
        sideEffectEntry.added = addedFilesMap;
      }
      if (deleted) {
        sideEffectEntry.deleted = deleted;
      }
      sideEffectsMaps.set(sideEffectName, sideEffectEntry);
    }
  }
  return {
    passed: true,
    filesMap,
    sideEffectsMaps: sideEffectsMaps.size > 0 ? sideEffectsMaps : void 0
  };
}
function checkFilesIntegrity(verifiedFilesCache, storeDir, algo, files) {
  let allVerified = true;
  const filesMap = /* @__PURE__ */ new Map();
  for (const [f, fstat] of files) {
    if (!fstat.digest) {
      throw new PnpmError("MISSING_CONTENT_DIGEST", `Content digest is missing for ${f}`);
    }
    const filename = getFilePathByModeInCafs(storeDir, fstat.digest, fstat.mode);
    filesMap.set(f, filename);
    if (verifiedFilesCache.has(filename))
      continue;
    const passed = verifyFile(filename, fstat, algo);
    if (passed) {
      verifiedFilesCache.add(filename);
    } else {
      allVerified = false;
    }
  }
  return {
    passed: allVerified,
    filesMap
  };
}
function verifyFile(filename, fstat, algorithm) {
  const currentFile = checkFile(filename, fstat.checkedAt);
  if (currentFile == null)
    return false;
  if (currentFile.isModified) {
    if (currentFile.size !== fstat.size) {
      rimrafSync(filename);
      return false;
    }
    const passed = verifyFileIntegrity(filename, { digest: fstat.digest, algorithm });
    if (!passed) {
      lib_default.unlinkSync(filename);
    }
    return passed;
  }
  return true;
}
function verifyFileIntegrity(filename, integrity) {
  global["verifiedFileIntegrity"]++;
  let data;
  try {
    data = lib_default.readFileSync(filename);
  } catch (err) {
    if (util4.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
  try {
    return crypto3.hash(integrity.algorithm, data, "hex") === integrity.digest;
  } catch {
    return false;
  }
}
function checkFile(filename, checkedAt) {
  try {
    const { mtimeMs, size } = fs6.statSync(filename);
    return {
      isModified: mtimeMs - (checkedAt ?? 0) > 100,
      size
    };
  } catch (err) {
    if (util4.types.isNativeError(err) && "code" in err && err.code === "ENOENT")
      return null;
    throw err;
  }
}
var init_checkPkgFilesIntegrity = __esm({
  "../store/cafs/lib/checkPkgFilesIntegrity.js"() {
    "use strict";
    init_lib2();
    init_lib3();
    init_rimraf();
    init_getFilePathInCafs();
    global["verifiedFileIntegrity"] = 0;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src2 = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src2[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src2[t.NUMERICIDENTIFIER]})\\.(${src2[t.NUMERICIDENTIFIER]})\\.(${src2[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src2[t.NUMERICIDENTIFIERLOOSE]})\\.(${src2[t.NUMERICIDENTIFIERLOOSE]})\\.(${src2[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src2[t.NONNUMERICIDENTIFIER]}|${src2[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src2[t.NONNUMERICIDENTIFIER]}|${src2[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src2[t.PRERELEASEIDENTIFIER]}(?:\\.${src2[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src2[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src2[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src2[t.BUILDIDENTIFIER]}(?:\\.${src2[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src2[t.MAINVERSION]}${src2[t.PRERELEASE]}?${src2[t.BUILD]}?`);
    createToken("FULL", `^${src2[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src2[t.MAINVERSIONLOOSE]}${src2[t.PRERELEASELOOSE]}?${src2[t.BUILD]}?`);
    createToken("LOOSE", `^${src2[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src2[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src2[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src2[t.XRANGEIDENTIFIER]})(?:\\.(${src2[t.XRANGEIDENTIFIER]})(?:\\.(${src2[t.XRANGEIDENTIFIER]})(?:${src2[t.PRERELEASE]})?${src2[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:${src2[t.PRERELEASELOOSE]})?${src2[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src2[t.GTLT]}\\s*${src2[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src2[t.GTLT]}\\s*${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src2[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src2[t.COERCEPLAIN] + `(?:${src2[t.PRERELEASE]})?(?:${src2[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src2[t.COERCE], true);
    createToken("COERCERTLFULL", src2[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src2[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src2[t.LONETILDE]}${src2[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src2[t.LONETILDE]}${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src2[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src2[t.LONECARET]}${src2[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src2[t.LONECARET]}${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src2[t.GTLT]}\\s*(${src2[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src2[t.GTLT]}\\s*(${src2[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src2[t.GTLT]}\\s*(${src2[t.LOOSEPLAIN]}|${src2[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src2[t.XRANGEPLAIN]})\\s+-\\s+(${src2[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src2[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src2[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse2 = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse2 = require_parse();
    var valid = (version, options) => {
      const v = parse2(version, options);
      return v ? v.version : null;
    };
    module.exports = valid;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse2 = require_parse();
    var clean = (version, options) => {
      const s = parse2(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse2 = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse2(version1, null, true);
      const v2 = parse2(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse2 = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse2(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module.exports = rcompare;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module.exports = compareLoose;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module.exports = gt;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module.exports = lt;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module.exports = eq;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse2 = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse2(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/semver/7.7.4/699aabe58bc6296111c94403a8c2b7ffaf809ddfa4712aff9adff738daef26df/node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants2 = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse2 = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse: parse2,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants2.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants2.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// ../store/cafs/lib/normalizeBundledManifest.js
function normalizeBundledManifest(manifest) {
  let result;
  for (const key of BUNDLED_MANIFEST_FIELDS) {
    if (manifest[key] != null) {
      if (!result)
        result = {};
      result[key] = manifest[key];
    }
  }
  let scripts;
  if (manifest.scripts) {
    for (const key of LIFECYCLE_SCRIPTS) {
      if (manifest.scripts[key]) {
        if (!scripts)
          scripts = {};
        scripts[key] = manifest.scripts[key];
      }
    }
  }
  if (!result && !scripts)
    return void 0;
  return {
    version: import_semver.default.clean(manifest.version ?? "0.0.0", { loose: true }) ?? manifest.version,
    ...result,
    ...scripts ? { scripts } : {}
  };
}
var import_semver, BUNDLED_MANIFEST_FIELDS, LIFECYCLE_SCRIPTS;
var init_normalizeBundledManifest = __esm({
  "../store/cafs/lib/normalizeBundledManifest.js"() {
    "use strict";
    import_semver = __toESM(require_semver2(), 1);
    BUNDLED_MANIFEST_FIELDS = [
      "bin",
      "bundledDependencies",
      "bundleDependencies",
      "cpu",
      "dependencies",
      "devDependencies",
      "directories",
      "engines",
      "libc",
      "name",
      "optionalDependencies",
      "os",
      "peerDependencies",
      "peerDependenciesMeta"
    ];
    LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"];
  }
});

// ../store/cafs/lib/writeFile.js
import path10 from "node:path";
function writeFile(fileDest, buffer, mode) {
  makeDirForFile(fileDest);
  lib_default.writeFileSync(fileDest, buffer, { mode });
}
function writeFileExclusive(fileDest, buffer, mode) {
  makeDirForFile(fileDest);
  lib_default.writeFileSync(fileDest, buffer, { mode, flag: "wx" });
}
function makeDirForFile(fileDest) {
  const dir = path10.dirname(fileDest);
  if (!dirs.has(dir)) {
    lib_default.mkdirSync(dir, { recursive: true });
    dirs.add(dir);
  }
}
var dirs;
var init_writeFile = __esm({
  "../store/cafs/lib/writeFile.js"() {
    "use strict";
    init_lib3();
    dirs = /* @__PURE__ */ new Set();
  }
});

// ../store/cafs/lib/writeBufferToCafs.js
import fs7 from "node:fs";
import path11 from "node:path";
import util5 from "node:util";
import workerThreads from "node:worker_threads";
function writeBufferToCafs(locker, storeDir, buffer, fileDest, mode, integrity) {
  fileDest = path11.join(storeDir, fileDest);
  if (locker.has(fileDest)) {
    return {
      checkedAt: locker.get(fileDest),
      filePath: fileDest
    };
  }
  const checkedAt = writeOrCheck(fileDest, buffer, mode, integrity);
  locker.set(fileDest, checkedAt);
  return {
    checkedAt,
    filePath: fileDest
  };
}
function writeOrCheck(fileDest, buffer, mode, integrity) {
  const existingFile = fs7.statSync(fileDest, { throwIfNoEntry: false });
  if (existingFile) {
    if (verifyFileIntegrity(fileDest, integrity)) {
      return Date.now();
    }
    return writeFileAtomic(fileDest, buffer, mode);
  }
  try {
    writeFileExclusive(fileDest, buffer, mode);
  } catch (err) {
    if (util5.types.isNativeError(err) && "code" in err && err.code === "EEXIST") {
      if (verifyFileIntegrity(fileDest, integrity)) {
        return Date.now();
      }
      return writeFileAtomic(fileDest, buffer, mode);
    }
    throw err;
  }
  return Date.now();
}
function writeFileAtomic(fileDest, buffer, mode) {
  const temp = pathTemp2(fileDest);
  writeFile(temp, buffer, mode);
  optimisticRenameOverwrite(temp, fileDest);
  return Date.now();
}
function optimisticRenameOverwrite(temp, fileDest) {
  try {
    renameOverwriteSync(temp, fileDest);
  } catch (err) {
    if (!(util5.types.isNativeError(err) && "code" in err && err.code === "ENOENT") || !fs7.existsSync(fileDest))
      throw err;
  }
}
function pathTemp2(file) {
  const basename = removeSuffix(path11.basename(file));
  return path11.join(path11.dirname(file), `${basename}${process.pid}${workerThreads.threadId}`);
}
function removeSuffix(filePath) {
  const dashPosition = filePath.indexOf("-");
  if (dashPosition === -1)
    return filePath;
  const withoutSuffix = filePath.substring(0, dashPosition);
  if (filePath.substring(dashPosition) === "-exec") {
    return `${withoutSuffix}x`;
  }
  return withoutSuffix;
}
var init_writeBufferToCafs = __esm({
  "../store/cafs/lib/writeBufferToCafs.js"() {
    "use strict";
    init_rename_overwrite();
    init_checkPkgFilesIntegrity();
    init_writeFile();
  }
});

// ../core/types/lib/config.js
var init_config = __esm({
  "../core/types/lib/config.js"() {
    "use strict";
  }
});

// ../core/types/lib/misc.js
var DEPENDENCIES_FIELDS, DEPENDENCIES_OR_PEER_FIELDS;
var init_misc = __esm({
  "../core/types/lib/misc.js"() {
    "use strict";
    DEPENDENCIES_FIELDS = [
      "optionalDependencies",
      "dependencies",
      "devDependencies"
    ];
    DEPENDENCIES_OR_PEER_FIELDS = [
      ...DEPENDENCIES_FIELDS,
      "peerDependencies"
    ];
  }
});

// ../core/types/lib/options.js
var init_options = __esm({
  "../core/types/lib/options.js"() {
    "use strict";
  }
});

// ../core/types/lib/package.js
var init_package = __esm({
  "../core/types/lib/package.js"() {
    "use strict";
  }
});

// ../core/types/lib/peerDependencyIssues.js
var init_peerDependencyIssues = __esm({
  "../core/types/lib/peerDependencyIssues.js"() {
    "use strict";
  }
});

// ../core/types/lib/project.js
var init_project = __esm({
  "../core/types/lib/project.js"() {
    "use strict";
  }
});

// ../core/types/lib/index.js
var init_lib4 = __esm({
  "../core/types/lib/index.js"() {
    "use strict";
    init_config();
    init_misc();
    init_options();
    init_package();
    init_peerDependencyIssues();
    init_project();
  }
});

// ../store/cafs/lib/index.js
var lib_exports = {};
__export(lib_exports, {
  HASH_ALGORITHM: () => HASH_ALGORITHM,
  buildFileMapsFromIndex: () => buildFileMapsFromIndex,
  checkPkgFilesIntegrity: () => checkPkgFilesIntegrity,
  contentPathFromHex: () => contentPathFromHex,
  createCafs: () => createCafs,
  getFilePathByModeInCafs: () => getFilePathByModeInCafs,
  normalizeBundledManifest: () => normalizeBundledManifest
});
import crypto4 from "node:crypto";
function createCafs(storeDir, { ignoreFile, cafsLocker: cafsLocker2 } = {}) {
  const _writeBufferToCafs = writeBufferToCafs.bind(null, cafsLocker2 ?? /* @__PURE__ */ new Map(), storeDir);
  const addBuffer = addBufferToCafs.bind(null, _writeBufferToCafs);
  return {
    addFilesFromDir: addFilesFromDir.bind(null, addBuffer),
    addFilesFromTarball: (tarballBuffer, readManifest, callIgnore) => addFilesFromTarball(addBuffer, tarballBuffer, readManifest, combineIgnore(ignoreFile, callIgnore)),
    addFile: addBuffer,
    getFilePathByModeInCafs: getFilePathByModeInCafs.bind(null, storeDir)
  };
}
function combineIgnore(a, b) {
  if (!a)
    return b;
  if (!b)
    return a;
  return (filename) => a(filename) || b(filename);
}
function addBufferToCafs(writeBufferToCafs2, buffer, mode) {
  const digest = crypto4.hash(HASH_ALGORITHM, buffer, "hex");
  const isExecutable = modeIsExecutable(mode);
  const fileDest = contentPathFromHex(isExecutable ? "exec" : "nonexec", digest);
  const { checkedAt, filePath } = writeBufferToCafs2(buffer, fileDest, isExecutable ? 493 : void 0, { digest, algorithm: HASH_ALGORITHM });
  return { checkedAt, filePath, digest };
}
var HASH_ALGORITHM;
var init_lib5 = __esm({
  "../store/cafs/lib/index.js"() {
    "use strict";
    init_addFilesFromDir();
    init_addFilesFromTarball();
    init_checkPkgFilesIntegrity();
    init_getFilePathInCafs();
    init_normalizeBundledManifest();
    init_writeBufferToCafs();
    init_lib4();
    HASH_ALGORITHM = "sha512";
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/fs/index.js
var require_fs2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/fs/index.js"(exports) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs13 = require_graceful_fs();
    var api = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "cp",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "glob",
      "lchmod",
      "lchown",
      "lutimes",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "statfs",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((key) => {
      return typeof fs13[key] === "function";
    });
    Object.assign(exports, fs13);
    api.forEach((method) => {
      exports[method] = u(fs13[method]);
    });
    exports.exists = function(filename, callback) {
      if (typeof callback === "function") {
        return fs13.exists(filename, callback);
      }
      return new Promise((resolve) => {
        return fs13.exists(filename, resolve);
      });
    };
    exports.read = function(fd, buffer, offset, length, position3, callback) {
      if (typeof callback === "function") {
        return fs13.read(fd, buffer, offset, length, position3, callback);
      }
      return new Promise((resolve, reject) => {
        fs13.read(fd, buffer, offset, length, position3, (err, bytesRead, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffer: buffer2 });
        });
      });
    };
    exports.write = function(fd, buffer, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.write(fd, buffer, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.write(fd, buffer, ...args, (err, bytesWritten, buffer2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffer: buffer2 });
        });
      });
    };
    exports.readv = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.readv(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.readv(fd, buffers, ...args, (err, bytesRead, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesRead, buffers: buffers2 });
        });
      });
    };
    exports.writev = function(fd, buffers, ...args) {
      if (typeof args[args.length - 1] === "function") {
        return fs13.writev(fd, buffers, ...args);
      }
      return new Promise((resolve, reject) => {
        fs13.writev(fd, buffers, ...args, (err, bytesWritten, buffers2) => {
          if (err) return reject(err);
          resolve({ bytesWritten, buffers: buffers2 });
        });
      });
    };
    if (typeof fs13.realpath.native === "function") {
      exports.realpath.native = u(fs13.realpath.native);
    } else {
      process.emitWarning(
        "fs.realpath.native is not a function. Is fs being monkey-patched?",
        "Warning",
        "fs-extra-WARN0003"
      );
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils3 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/utils.js"(exports, module) {
    "use strict";
    var path17 = __require("path");
    module.exports.checkPath = function checkPath(pth) {
      if (process.platform === "win32") {
        const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path17.parse(pth).root, ""));
        if (pathHasInvalidWinCharacters) {
          const error = new Error(`Path contains invalid characters: ${pth}`);
          error.code = "EINVAL";
          throw error;
        }
      }
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/make-dir.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var { checkPath } = require_utils3();
    var getMode = (options) => {
      const defaults = { mode: 511 };
      if (typeof options === "number") return options;
      return { ...defaults, ...options }.mode;
    };
    module.exports.makeDir = async (dir, options) => {
      checkPath(dir);
      return fs13.mkdir(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
    module.exports.makeDirSync = (dir, options) => {
      checkPath(dir);
      return fs13.mkdirSync(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/mkdirs/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var { makeDir: _makeDir, makeDirSync } = require_make_dir2();
    var makeDir = u(_makeDir);
    module.exports = {
      mkdirs: makeDir,
      mkdirsSync: makeDirSync,
      // alias
      mkdirp: makeDir,
      mkdirpSync: makeDirSync,
      ensureDir: makeDir,
      ensureDirSync: makeDirSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/path-exists/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs2();
    function pathExists(path17) {
      return fs13.access(path17).then(() => true).catch(() => false);
    }
    module.exports = {
      pathExists: u(pathExists),
      pathExistsSync: fs13.existsSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/utimes.js
var require_utimes2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/utimes.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var u = require_universalify().fromPromise;
    async function utimesMillis(path17, atime, mtime) {
      const fd = await fs13.open(path17, "r+");
      let error = null;
      try {
        await fs13.futimes(fd, atime, mtime);
      } catch (futimesErr) {
        error = futimesErr;
      } finally {
        try {
          await fs13.close(fd);
        } catch (closeErr) {
          if (!error) error = closeErr;
        }
      }
      if (error) {
        throw error;
      }
    }
    function utimesMillisSync(path17, atime, mtime) {
      const fd = fs13.openSync(path17, "r+");
      let error = null;
      try {
        fs13.futimesSync(fd, atime, mtime);
      } catch (futimesErr) {
        error = futimesErr;
      } finally {
        try {
          fs13.closeSync(fd);
        } catch (closeErr) {
          if (!error) error = closeErr;
        }
      }
      if (error) {
        throw error;
      }
    }
    module.exports = {
      utimesMillis: u(utimesMillis),
      utimesMillisSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/stat.js
var require_stat2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/stat.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var path17 = __require("path");
    var u = require_universalify().fromPromise;
    function getStats(src2, dest, opts2) {
      const statFunc = opts2.dereference ? (file) => fs13.stat(file, { bigint: true }) : (file) => fs13.lstat(file, { bigint: true });
      return Promise.all([
        statFunc(src2),
        statFunc(dest).catch((err) => {
          if (err.code === "ENOENT") return null;
          throw err;
        })
      ]).then(([srcStat, destStat]) => ({ srcStat, destStat }));
    }
    function getStatsSync(src2, dest, opts2) {
      let destStat;
      const statFunc = opts2.dereference ? (file) => fs13.statSync(file, { bigint: true }) : (file) => fs13.lstatSync(file, { bigint: true });
      const srcStat = statFunc(src2);
      try {
        destStat = statFunc(dest);
      } catch (err) {
        if (err.code === "ENOENT") return { srcStat, destStat: null };
        throw err;
      }
      return { srcStat, destStat };
    }
    async function checkPaths(src2, dest, funcName, opts2) {
      const { srcStat, destStat } = await getStats(src2, dest, opts2);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path17.basename(src2);
          const destBaseName = path17.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src2}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src2}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src2, dest)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return { srcStat, destStat };
    }
    function checkPathsSync(src2, dest, funcName, opts2) {
      const { srcStat, destStat } = getStatsSync(src2, dest, opts2);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path17.basename(src2);
          const destBaseName = path17.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src2}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src2}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src2, dest)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return { srcStat, destStat };
    }
    async function checkParentPaths(src2, srcStat, dest, funcName) {
      const srcParent = path17.resolve(path17.dirname(src2));
      const destParent = path17.resolve(path17.dirname(dest));
      if (destParent === srcParent || destParent === path17.parse(destParent).root) return;
      let destStat;
      try {
        destStat = await fs13.stat(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return checkParentPaths(src2, srcStat, destParent, funcName);
    }
    function checkParentPathsSync(src2, srcStat, dest, funcName) {
      const srcParent = path17.resolve(path17.dirname(src2));
      const destParent = path17.resolve(path17.dirname(dest));
      if (destParent === srcParent || destParent === path17.parse(destParent).root) return;
      let destStat;
      try {
        destStat = fs13.statSync(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src2, dest, funcName));
      }
      return checkParentPathsSync(src2, srcStat, destParent, funcName);
    }
    function areIdentical(srcStat, destStat) {
      return destStat.ino !== void 0 && destStat.dev !== void 0 && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
    }
    function isSrcSubdir(src2, dest) {
      const srcArr = path17.resolve(src2).split(path17.sep).filter((i) => i);
      const destArr = path17.resolve(dest).split(path17.sep).filter((i) => i);
      return srcArr.every((cur, i) => destArr[i] === cur);
    }
    function errMsg(src2, dest, funcName) {
      return `Cannot ${funcName} '${src2}' to a subdirectory of itself, '${dest}'.`;
    }
    module.exports = {
      // checkPaths
      checkPaths: u(checkPaths),
      checkPathsSync,
      // checkParent
      checkParentPaths: u(checkParentPaths),
      checkParentPathsSync,
      // Misc
      isSrcSubdir,
      areIdentical
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/async.js
var require_async2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/util/async.js"(exports, module) {
    "use strict";
    async function asyncIteratorConcurrentProcess(iterator, fn) {
      const promises = [];
      for await (const item of iterator) {
        promises.push(
          fn(item).then(
            () => null,
            (err) => err ?? new Error("unknown error")
          )
        );
      }
      await Promise.all(
        promises.map(
          (promise) => promise.then((possibleErr) => {
            if (possibleErr !== null) throw possibleErr;
          })
        )
      );
    }
    module.exports = {
      asyncIteratorConcurrentProcess
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/copy.js
var require_copy3 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/copy.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var path17 = __require("path");
    var { mkdirs } = require_mkdirs2();
    var { pathExists } = require_path_exists2();
    var { utimesMillis } = require_utimes2();
    var stat = require_stat2();
    var { asyncIteratorConcurrentProcess } = require_async2();
    async function copy2(src2, dest, opts2 = {}) {
      if (typeof opts2 === "function") {
        opts2 = { filter: opts2 };
      }
      opts2.clobber = "clobber" in opts2 ? !!opts2.clobber : true;
      opts2.overwrite = "overwrite" in opts2 ? !!opts2.overwrite : opts2.clobber;
      if (opts2.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0001"
        );
      }
      const { srcStat, destStat } = await stat.checkPaths(src2, dest, "copy", opts2);
      await stat.checkParentPaths(src2, srcStat, dest, "copy");
      const include = await runFilter(src2, dest, opts2);
      if (!include) return;
      const destParent = path17.dirname(dest);
      const dirExists = await pathExists(destParent);
      if (!dirExists) {
        await mkdirs(destParent);
      }
      await getStatsAndPerformCopy(destStat, src2, dest, opts2);
    }
    async function runFilter(src2, dest, opts2) {
      if (!opts2.filter) return true;
      return opts2.filter(src2, dest);
    }
    async function getStatsAndPerformCopy(destStat, src2, dest, opts2) {
      const statFn = opts2.dereference ? fs13.stat : fs13.lstat;
      const srcStat = await statFn(src2);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src2, dest, opts2);
      if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src2, dest, opts2);
      if (srcStat.isSymbolicLink()) return onLink(destStat, src2, dest, opts2);
      if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src2}`);
      if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src2}`);
      throw new Error(`Unknown file: ${src2}`);
    }
    async function onFile(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return copyFile(srcStat, src2, dest, opts2);
      if (opts2.overwrite) {
        await fs13.unlink(dest);
        return copyFile(srcStat, src2, dest, opts2);
      }
      if (opts2.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    async function copyFile(srcStat, src2, dest, opts2) {
      await fs13.copyFile(src2, dest);
      if (opts2.preserveTimestamps) {
        if (fileIsNotWritable(srcStat.mode)) {
          await makeFileWritable(dest, srcStat.mode);
        }
        const updatedSrcStat = await fs13.stat(src2);
        await utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
      }
      return fs13.chmod(dest, srcStat.mode);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return fs13.chmod(dest, srcMode | 128);
    }
    async function onDir(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) {
        await fs13.mkdir(dest);
      }
      await asyncIteratorConcurrentProcess(await fs13.opendir(src2), async (item) => {
        const srcItem = path17.join(src2, item.name);
        const destItem = path17.join(dest, item.name);
        const include = await runFilter(srcItem, destItem, opts2);
        if (include) {
          const { destStat: destStat2 } = await stat.checkPaths(srcItem, destItem, "copy", opts2);
          await getStatsAndPerformCopy(destStat2, srcItem, destItem, opts2);
        }
      });
      if (!destStat) {
        await fs13.chmod(dest, srcStat.mode);
      }
    }
    async function onLink(destStat, src2, dest, opts2) {
      let resolvedSrc = await fs13.readlink(src2);
      if (opts2.dereference) {
        resolvedSrc = path17.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs13.symlink(resolvedSrc, dest);
      }
      let resolvedDest = null;
      try {
        resolvedDest = await fs13.readlink(dest);
      } catch (e) {
        if (e.code === "EINVAL" || e.code === "UNKNOWN") return fs13.symlink(resolvedSrc, dest);
        throw e;
      }
      if (opts2.dereference) {
        resolvedDest = path17.resolve(process.cwd(), resolvedDest);
      }
      if (resolvedSrc !== resolvedDest) {
        if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
          throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
        }
        if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
          throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
        }
      }
      await fs13.unlink(dest);
      return fs13.symlink(resolvedSrc, dest);
    }
    module.exports = copy2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/copy-sync.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var path17 = __require("path");
    var mkdirsSync = require_mkdirs2().mkdirsSync;
    var utimesMillisSync = require_utimes2().utimesMillisSync;
    var stat = require_stat2();
    function copySync2(src2, dest, opts2) {
      if (typeof opts2 === "function") {
        opts2 = { filter: opts2 };
      }
      opts2 = opts2 || {};
      opts2.clobber = "clobber" in opts2 ? !!opts2.clobber : true;
      opts2.overwrite = "overwrite" in opts2 ? !!opts2.overwrite : opts2.clobber;
      if (opts2.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0002"
        );
      }
      const { srcStat, destStat } = stat.checkPathsSync(src2, dest, "copy", opts2);
      stat.checkParentPathsSync(src2, srcStat, dest, "copy");
      if (opts2.filter && !opts2.filter(src2, dest)) return;
      const destParent = path17.dirname(dest);
      if (!fs13.existsSync(destParent)) mkdirsSync(destParent);
      return getStats(destStat, src2, dest, opts2);
    }
    function getStats(destStat, src2, dest, opts2) {
      const statSync = opts2.dereference ? fs13.statSync : fs13.lstatSync;
      const srcStat = statSync(src2);
      if (srcStat.isDirectory()) return onDir(srcStat, destStat, src2, dest, opts2);
      else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src2, dest, opts2);
      else if (srcStat.isSymbolicLink()) return onLink(destStat, src2, dest, opts2);
      else if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src2}`);
      else if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src2}`);
      throw new Error(`Unknown file: ${src2}`);
    }
    function onFile(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return copyFile(srcStat, src2, dest, opts2);
      return mayCopyFile(srcStat, src2, dest, opts2);
    }
    function mayCopyFile(srcStat, src2, dest, opts2) {
      if (opts2.overwrite) {
        fs13.unlinkSync(dest);
        return copyFile(srcStat, src2, dest, opts2);
      } else if (opts2.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    function copyFile(srcStat, src2, dest, opts2) {
      fs13.copyFileSync(src2, dest);
      if (opts2.preserveTimestamps) handleTimestamps(srcStat.mode, src2, dest);
      return setDestMode(dest, srcStat.mode);
    }
    function handleTimestamps(srcMode, src2, dest) {
      if (fileIsNotWritable(srcMode)) makeFileWritable(dest, srcMode);
      return setDestTimestamps(src2, dest);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return setDestMode(dest, srcMode | 128);
    }
    function setDestMode(dest, srcMode) {
      return fs13.chmodSync(dest, srcMode);
    }
    function setDestTimestamps(src2, dest) {
      const updatedSrcStat = fs13.statSync(src2);
      return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
    }
    function onDir(srcStat, destStat, src2, dest, opts2) {
      if (!destStat) return mkDirAndCopy(srcStat.mode, src2, dest, opts2);
      return copyDir(src2, dest, opts2);
    }
    function mkDirAndCopy(srcMode, src2, dest, opts2) {
      fs13.mkdirSync(dest);
      copyDir(src2, dest, opts2);
      return setDestMode(dest, srcMode);
    }
    function copyDir(src2, dest, opts2) {
      const dir = fs13.opendirSync(src2);
      try {
        let dirent;
        while ((dirent = dir.readSync()) !== null) {
          copyDirItem(dirent.name, src2, dest, opts2);
        }
      } finally {
        dir.closeSync();
      }
    }
    function copyDirItem(item, src2, dest, opts2) {
      const srcItem = path17.join(src2, item);
      const destItem = path17.join(dest, item);
      if (opts2.filter && !opts2.filter(srcItem, destItem)) return;
      const { destStat } = stat.checkPathsSync(srcItem, destItem, "copy", opts2);
      return getStats(destStat, srcItem, destItem, opts2);
    }
    function onLink(destStat, src2, dest, opts2) {
      let resolvedSrc = fs13.readlinkSync(src2);
      if (opts2.dereference) {
        resolvedSrc = path17.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs13.symlinkSync(resolvedSrc, dest);
      } else {
        let resolvedDest;
        try {
          resolvedDest = fs13.readlinkSync(dest);
        } catch (err) {
          if (err.code === "EINVAL" || err.code === "UNKNOWN") return fs13.symlinkSync(resolvedSrc, dest);
          throw err;
        }
        if (opts2.dereference) {
          resolvedDest = path17.resolve(process.cwd(), resolvedDest);
        }
        if (resolvedSrc !== resolvedDest) {
          if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
            throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
          }
          if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
            throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
          }
        }
        return copyLink(resolvedSrc, dest);
      }
    }
    function copyLink(resolvedSrc, dest) {
      fs13.unlinkSync(dest);
      return fs13.symlinkSync(resolvedSrc, dest);
    }
    module.exports = copySync2;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/index.js
var require_copy4 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/copy/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      copy: u(require_copy3()),
      copySync: require_copy_sync2()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/remove/index.js
var require_remove2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/remove/index.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var u = require_universalify().fromCallback;
    function remove(path17, callback) {
      fs13.rm(path17, { recursive: true, force: true }, callback);
    }
    function removeSync(path17) {
      fs13.rmSync(path17, { recursive: true, force: true });
    }
    module.exports = {
      remove: u(remove),
      removeSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/empty/index.js
var require_empty2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/empty/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs2();
    var path17 = __require("path");
    var mkdir = require_mkdirs2();
    var remove = require_remove2();
    var emptyDir = u(async function emptyDir2(dir) {
      let items;
      try {
        items = await fs13.readdir(dir);
      } catch {
        return mkdir.mkdirs(dir);
      }
      return Promise.all(items.map((item) => remove.remove(path17.join(dir, item))));
    });
    function emptyDirSync(dir) {
      let items;
      try {
        items = fs13.readdirSync(dir);
      } catch {
        return mkdir.mkdirsSync(dir);
      }
      items.forEach((item) => {
        item = path17.join(dir, item);
        remove.removeSync(item);
      });
    }
    module.exports = {
      emptyDirSync,
      emptydirSync: emptyDirSync,
      emptyDir,
      emptydir: emptyDir
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/file.js
var require_file2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/file.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs2();
    var mkdir = require_mkdirs2();
    async function createFile(file) {
      let stats;
      try {
        stats = await fs13.stat(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path17.dirname(file);
      let dirStats = null;
      try {
        dirStats = await fs13.stat(dir);
      } catch (err) {
        if (err.code === "ENOENT") {
          await mkdir.mkdirs(dir);
          await fs13.writeFile(file, "");
          return;
        } else {
          throw err;
        }
      }
      if (dirStats.isDirectory()) {
        await fs13.writeFile(file, "");
      } else {
        await fs13.readdir(dir);
      }
    }
    function createFileSync(file) {
      let stats;
      try {
        stats = fs13.statSync(file);
      } catch {
      }
      if (stats && stats.isFile()) return;
      const dir = path17.dirname(file);
      try {
        if (!fs13.statSync(dir).isDirectory()) {
          fs13.readdirSync(dir);
        }
      } catch (err) {
        if (err && err.code === "ENOENT") mkdir.mkdirsSync(dir);
        else throw err;
      }
      fs13.writeFileSync(file, "");
    }
    module.exports = {
      createFile: u(createFile),
      createFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/link.js
var require_link2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/link.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs2();
    var mkdir = require_mkdirs2();
    var { pathExists } = require_path_exists2();
    var { areIdentical } = require_stat2();
    async function createLink(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = await fs13.lstat(dstpath, { bigint: true });
      } catch {
      }
      let srcStat;
      try {
        srcStat = await fs13.lstat(srcpath, { bigint: true });
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      if (dstStat && areIdentical(srcStat, dstStat)) return;
      const dir = path17.dirname(dstpath);
      const dirExists = await pathExists(dir);
      if (!dirExists) {
        await mkdir.mkdirs(dir);
      }
      await fs13.link(srcpath, dstpath);
    }
    function createLinkSync(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = fs13.lstatSync(dstpath, { bigint: true });
      } catch {
      }
      try {
        const srcStat = fs13.lstatSync(srcpath, { bigint: true });
        if (dstStat && areIdentical(srcStat, dstStat)) return;
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      const dir = path17.dirname(dstpath);
      const dirExists = fs13.existsSync(dir);
      if (dirExists) return fs13.linkSync(srcpath, dstpath);
      mkdir.mkdirsSync(dir);
      return fs13.linkSync(srcpath, dstpath);
    }
    module.exports = {
      createLink: u(createLink),
      createLinkSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink-paths.js"(exports, module) {
    "use strict";
    var path17 = __require("path");
    var fs13 = require_fs2();
    var { pathExists } = require_path_exists2();
    var u = require_universalify().fromPromise;
    async function symlinkPaths(srcpath, dstpath) {
      if (path17.isAbsolute(srcpath)) {
        try {
          await fs13.lstat(srcpath);
        } catch (err) {
          err.message = err.message.replace("lstat", "ensureSymlink");
          throw err;
        }
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path17.dirname(dstpath);
      const relativeToDst = path17.join(dstdir, srcpath);
      const exists = await pathExists(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      try {
        await fs13.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureSymlink");
        throw err;
      }
      return {
        toCwd: srcpath,
        toDst: path17.relative(dstdir, srcpath)
      };
    }
    function symlinkPathsSync(srcpath, dstpath) {
      if (path17.isAbsolute(srcpath)) {
        const exists2 = fs13.existsSync(srcpath);
        if (!exists2) throw new Error("absolute srcpath does not exist");
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path17.dirname(dstpath);
      const relativeToDst = path17.join(dstdir, srcpath);
      const exists = fs13.existsSync(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      const srcExists = fs13.existsSync(srcpath);
      if (!srcExists) throw new Error("relative srcpath does not exist");
      return {
        toCwd: srcpath,
        toDst: path17.relative(dstdir, srcpath)
      };
    }
    module.exports = {
      symlinkPaths: u(symlinkPaths),
      symlinkPathsSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink-type.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var u = require_universalify().fromPromise;
    async function symlinkType(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = await fs13.lstat(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    function symlinkTypeSync(srcpath, type) {
      if (type) return type;
      let stats;
      try {
        stats = fs13.lstatSync(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    module.exports = {
      symlinkType: u(symlinkType),
      symlinkTypeSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/symlink.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path17 = __require("path");
    var fs13 = require_fs2();
    var { mkdirs, mkdirsSync } = require_mkdirs2();
    var { symlinkPaths, symlinkPathsSync } = require_symlink_paths2();
    var { symlinkType, symlinkTypeSync } = require_symlink_type2();
    var { pathExists } = require_path_exists2();
    var { areIdentical } = require_stat2();
    async function createSymlink(srcpath, dstpath, type) {
      let stats;
      try {
        stats = await fs13.lstat(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        let srcStat;
        if (path17.isAbsolute(srcpath)) {
          srcStat = await fs13.stat(srcpath, { bigint: true });
        } else {
          const dstdir = path17.dirname(dstpath);
          const relativeToDst = path17.join(dstdir, srcpath);
          try {
            srcStat = await fs13.stat(relativeToDst, { bigint: true });
          } catch {
            srcStat = await fs13.stat(srcpath, { bigint: true });
          }
        }
        const dstStat = await fs13.stat(dstpath, { bigint: true });
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = await symlinkPaths(srcpath, dstpath);
      srcpath = relative.toDst;
      const toType = await symlinkType(relative.toCwd, type);
      const dir = path17.dirname(dstpath);
      if (!await pathExists(dir)) {
        await mkdirs(dir);
      }
      return fs13.symlink(srcpath, dstpath, toType);
    }
    function createSymlinkSync2(srcpath, dstpath, type) {
      let stats;
      try {
        stats = fs13.lstatSync(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        let srcStat;
        if (path17.isAbsolute(srcpath)) {
          srcStat = fs13.statSync(srcpath, { bigint: true });
        } else {
          const dstdir = path17.dirname(dstpath);
          const relativeToDst = path17.join(dstdir, srcpath);
          try {
            srcStat = fs13.statSync(relativeToDst, { bigint: true });
          } catch {
            srcStat = fs13.statSync(srcpath, { bigint: true });
          }
        }
        const dstStat = fs13.statSync(dstpath, { bigint: true });
        if (areIdentical(srcStat, dstStat)) return;
      }
      const relative = symlinkPathsSync(srcpath, dstpath);
      srcpath = relative.toDst;
      type = symlinkTypeSync(relative.toCwd, type);
      const dir = path17.dirname(dstpath);
      const exists = fs13.existsSync(dir);
      if (exists) return fs13.symlinkSync(srcpath, dstpath, type);
      mkdirsSync(dir);
      return fs13.symlinkSync(srcpath, dstpath, type);
    }
    module.exports = {
      createSymlink: u(createSymlink),
      createSymlinkSync: createSymlinkSync2
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/index.js
var require_ensure2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/ensure/index.js"(exports, module) {
    "use strict";
    var { createFile, createFileSync } = require_file2();
    var { createLink, createLinkSync } = require_link2();
    var { createSymlink, createSymlinkSync: createSymlinkSync2 } = require_symlink2();
    module.exports = {
      // file
      createFile,
      createFileSync,
      ensureFile: createFile,
      ensureFileSync: createFileSync,
      // link
      createLink,
      createLinkSync,
      ensureLink: createLink,
      ensureLinkSync: createLinkSync,
      // symlink
      createSymlink,
      createSymlinkSync: createSymlinkSync2,
      ensureSymlink: createSymlink,
      ensureSymlinkSync: createSymlinkSync2
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile3 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/jsonfile.js"(exports, module) {
    "use strict";
    var jsonFile = require_jsonfile();
    module.exports = {
      // jsonfile exports
      readJson: jsonFile.readFile,
      readJsonSync: jsonFile.readFileSync,
      writeJson: jsonFile.writeFile,
      writeJsonSync: jsonFile.writeFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/output-file/index.js
var require_output_file2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/output-file/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs13 = require_fs2();
    var path17 = __require("path");
    var mkdir = require_mkdirs2();
    var pathExists = require_path_exists2().pathExists;
    async function outputFile(file, data, encoding = "utf-8") {
      const dir = path17.dirname(file);
      if (!await pathExists(dir)) {
        await mkdir.mkdirs(dir);
      }
      return fs13.writeFile(file, data, encoding);
    }
    function outputFileSync(file, ...args) {
      const dir = path17.dirname(file);
      if (!fs13.existsSync(dir)) {
        mkdir.mkdirsSync(dir);
      }
      fs13.writeFileSync(file, ...args);
    }
    module.exports = {
      outputFile: u(outputFile),
      outputFileSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/output-json.js
var require_output_json2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/output-json.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFile } = require_output_file2();
    async function outputJson(file, data, options = {}) {
      const str = stringify(data, options);
      await outputFile(file, str, options);
    }
    module.exports = outputJson;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/output-json-sync.js"(exports, module) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFileSync } = require_output_file2();
    function outputJsonSync(file, data, options) {
      const str = stringify(data, options);
      outputFileSync(file, str, options);
    }
    module.exports = outputJsonSync;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/index.js
var require_json2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/json/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    var jsonFile = require_jsonfile3();
    jsonFile.outputJson = u(require_output_json2());
    jsonFile.outputJsonSync = require_output_json_sync2();
    jsonFile.outputJSON = jsonFile.outputJson;
    jsonFile.outputJSONSync = jsonFile.outputJsonSync;
    jsonFile.writeJSON = jsonFile.writeJson;
    jsonFile.writeJSONSync = jsonFile.writeJsonSync;
    jsonFile.readJSON = jsonFile.readJson;
    jsonFile.readJSONSync = jsonFile.readJsonSync;
    module.exports = jsonFile;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/move.js
var require_move3 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/move.js"(exports, module) {
    "use strict";
    var fs13 = require_fs2();
    var path17 = __require("path");
    var { copy: copy2 } = require_copy4();
    var { remove } = require_remove2();
    var { mkdirp } = require_mkdirs2();
    var { pathExists } = require_path_exists2();
    var stat = require_stat2();
    async function move(src2, dest, opts2 = {}) {
      const overwrite = opts2.overwrite || opts2.clobber || false;
      const { srcStat, isChangingCase = false } = await stat.checkPaths(src2, dest, "move", opts2);
      await stat.checkParentPaths(src2, srcStat, dest, "move");
      const destParent = path17.dirname(dest);
      const parsedParentPath = path17.parse(destParent);
      if (parsedParentPath.root !== destParent) {
        await mkdirp(destParent);
      }
      return doRename(src2, dest, overwrite, isChangingCase);
    }
    async function doRename(src2, dest, overwrite, isChangingCase) {
      if (!isChangingCase) {
        if (overwrite) {
          await remove(dest);
        } else if (await pathExists(dest)) {
          throw new Error("dest already exists.");
        }
      }
      try {
        await fs13.rename(src2, dest);
      } catch (err) {
        if (err.code !== "EXDEV") {
          throw err;
        }
        await moveAcrossDevice(src2, dest, overwrite);
      }
    }
    async function moveAcrossDevice(src2, dest, overwrite) {
      const opts2 = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      await copy2(src2, dest, opts2);
      return remove(src2);
    }
    module.exports = move;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/move-sync.js"(exports, module) {
    "use strict";
    var fs13 = require_graceful_fs();
    var path17 = __require("path");
    var copySync2 = require_copy4().copySync;
    var removeSync = require_remove2().removeSync;
    var mkdirpSync = require_mkdirs2().mkdirpSync;
    var stat = require_stat2();
    function moveSync(src2, dest, opts2) {
      opts2 = opts2 || {};
      const overwrite = opts2.overwrite || opts2.clobber || false;
      const { srcStat, isChangingCase = false } = stat.checkPathsSync(src2, dest, "move", opts2);
      stat.checkParentPathsSync(src2, srcStat, dest, "move");
      if (!isParentRoot(dest)) mkdirpSync(path17.dirname(dest));
      return doRename(src2, dest, overwrite, isChangingCase);
    }
    function isParentRoot(dest) {
      const parent = path17.dirname(dest);
      const parsedPath = path17.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src2, dest, overwrite, isChangingCase) {
      if (isChangingCase) return rename(src2, dest, overwrite);
      if (overwrite) {
        removeSync(dest);
        return rename(src2, dest, overwrite);
      }
      if (fs13.existsSync(dest)) throw new Error("dest already exists.");
      return rename(src2, dest, overwrite);
    }
    function rename(src2, dest, overwrite) {
      try {
        fs13.renameSync(src2, dest);
      } catch (err) {
        if (err.code !== "EXDEV") throw err;
        return moveAcrossDevice(src2, dest, overwrite);
      }
    }
    function moveAcrossDevice(src2, dest, overwrite) {
      const opts2 = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      copySync2(src2, dest, opts2);
      return removeSync(src2);
    }
    module.exports = moveSync;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/index.js
var require_move4 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/move/index.js"(exports, module) {
    "use strict";
    var u = require_universalify().fromPromise;
    module.exports = {
      move: u(require_move3()),
      moveSync: require_move_sync2()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/index.js
var require_lib2 = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/fs-extra/11.3.5/7db7b8254b482200b4fe34058554947e1242ee5fa7e05ff4418e9403104cd8c3/node_modules/fs-extra/lib/index.js"(exports, module) {
    "use strict";
    module.exports = {
      // Export promiseified graceful-fs:
      ...require_fs2(),
      // Export extra methods:
      ...require_copy4(),
      ...require_empty2(),
      ...require_ensure2(),
      ...require_json2(),
      ...require_mkdirs2(),
      ...require_move4(),
      ...require_output_file2(),
      ...require_path_exists2(),
      ...require_remove2()
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/truncate-utf8-bytes/1.0.2/a125ab6f857e769c1c35dafd31e6b108b9a2517e088148da14ad32169c2567ee/node_modules/truncate-utf8-bytes/lib/truncate.js
var require_truncate = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/truncate-utf8-bytes/1.0.2/a125ab6f857e769c1c35dafd31e6b108b9a2517e088148da14ad32169c2567ee/node_modules/truncate-utf8-bytes/lib/truncate.js"(exports, module) {
    "use strict";
    function isHighSurrogate(codePoint) {
      return codePoint >= 55296 && codePoint <= 56319;
    }
    function isLowSurrogate(codePoint) {
      return codePoint >= 56320 && codePoint <= 57343;
    }
    module.exports = function truncate(getLength, string, byteLength) {
      if (typeof string !== "string") {
        throw new Error("Input must be string");
      }
      var charLength = string.length;
      var curByteLength = 0;
      var codePoint;
      var segment;
      for (var i = 0; i < charLength; i += 1) {
        codePoint = string.charCodeAt(i);
        segment = string[i];
        if (isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {
          i += 1;
          segment += string[i];
        }
        curByteLength += getLength(segment);
        if (curByteLength === byteLength) {
          return string.slice(0, i + 1);
        } else if (curByteLength > byteLength) {
          return string.slice(0, i - segment.length + 1);
        }
      }
      return string;
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/truncate-utf8-bytes/1.0.2/a125ab6f857e769c1c35dafd31e6b108b9a2517e088148da14ad32169c2567ee/node_modules/truncate-utf8-bytes/index.js
var require_truncate_utf8_bytes = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/truncate-utf8-bytes/1.0.2/a125ab6f857e769c1c35dafd31e6b108b9a2517e088148da14ad32169c2567ee/node_modules/truncate-utf8-bytes/index.js"(exports, module) {
    "use strict";
    var truncate = require_truncate();
    var getLength = Buffer.byteLength.bind(Buffer);
    module.exports = truncate.bind(null, getLength);
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/sanitize-filename/1.6.4/5f553bde92425a76e0b51eddf2a9a22faa7626146298aecdcafaf8de748aa2e6/node_modules/sanitize-filename/index.js
var require_sanitize_filename = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/sanitize-filename/1.6.4/5f553bde92425a76e0b51eddf2a9a22faa7626146298aecdcafaf8de748aa2e6/node_modules/sanitize-filename/index.js"(exports, module) {
    "use strict";
    var truncate = require_truncate_utf8_bytes();
    var illegalRe = /[\/\?<>\\:\*\|"]/g;
    var controlRe = /[\x00-\x1f\x80-\x9f]/g;
    var reservedRe = /^\.+$/;
    var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    function replaceTrailingDotsAndSpaces(str, replacement) {
      var end = str.length;
      while (end > 0 && (str[end - 1] === "." || str[end - 1] === " ")) end--;
      return end < str.length ? str.slice(0, end) + replacement : str;
    }
    function sanitize(input, replacement) {
      if (typeof input !== "string") {
        throw new Error("Input must be string");
      }
      var sanitized = input.replace(illegalRe, replacement).replace(controlRe, replacement).replace(reservedRe, replacement).replace(windowsReservedRe, replacement);
      sanitized = replaceTrailingDotsAndSpaces(sanitized, replacement);
      return truncate(sanitized, 255);
    }
    module.exports = function(input, options) {
      var replacement = options && options.replacement || "";
      var output = sanitize(input, replacement);
      if (replacement === "") {
        return output;
      }
      return sanitize(output, "");
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/process.js
var require_process = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/process.js"(exports, module) {
    "use strict";
    var isLinux = () => process.platform === "linux";
    var report = null;
    var getReport = () => {
      if (!report) {
        if (isLinux() && process.report) {
          const orig = process.report.excludeNetwork;
          process.report.excludeNetwork = true;
          report = process.report.getReport();
          process.report.excludeNetwork = orig;
        } else {
          report = {};
        }
      }
      return report;
    };
    module.exports = { isLinux, getReport };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/filesystem.js
var require_filesystem = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/filesystem.js"(exports, module) {
    "use strict";
    var fs13 = __require("fs");
    var LDD_PATH = "/usr/bin/ldd";
    var SELF_PATH = "/proc/self/exe";
    var MAX_LENGTH = 2048;
    var readFileSync = (path17) => {
      const fd = fs13.openSync(path17, "r");
      const buffer = Buffer.alloc(MAX_LENGTH);
      const bytesRead = fs13.readSync(fd, buffer, 0, MAX_LENGTH, 0);
      fs13.close(fd, () => {
      });
      return buffer.subarray(0, bytesRead);
    };
    var readFile = (path17) => new Promise((resolve, reject) => {
      fs13.open(path17, "r", (err, fd) => {
        if (err) {
          reject(err);
        } else {
          const buffer = Buffer.alloc(MAX_LENGTH);
          fs13.read(fd, buffer, 0, MAX_LENGTH, 0, (_, bytesRead) => {
            resolve(buffer.subarray(0, bytesRead));
            fs13.close(fd, () => {
            });
          });
        }
      });
    });
    module.exports = {
      LDD_PATH,
      SELF_PATH,
      readFileSync,
      readFile
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/elf.js
var require_elf = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/elf.js"(exports, module) {
    "use strict";
    var interpreterPath = (elf) => {
      if (elf.length < 64) {
        return null;
      }
      if (elf.readUInt32BE(0) !== 2135247942) {
        return null;
      }
      if (elf.readUInt8(4) !== 2) {
        return null;
      }
      if (elf.readUInt8(5) !== 1) {
        return null;
      }
      const offset = elf.readUInt32LE(32);
      const size = elf.readUInt16LE(54);
      const count = elf.readUInt16LE(56);
      for (let i = 0; i < count; i++) {
        const headerOffset = offset + i * size;
        const type = elf.readUInt32LE(headerOffset);
        if (type === 3) {
          const fileOffset = elf.readUInt32LE(headerOffset + 8);
          const fileSize = elf.readUInt32LE(headerOffset + 32);
          return elf.subarray(fileOffset, fileOffset + fileSize).toString().replace(/\0.*$/g, "");
        }
      }
      return null;
    };
    module.exports = {
      interpreterPath
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/detect-libc.js
var require_detect_libc = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/detect-libc/2.1.2/a1e36129e998f9971b8906296c04a9314f612077e4f1e2a4342793f735c2fb37/node_modules/detect-libc/lib/detect-libc.js"(exports, module) {
    "use strict";
    var childProcess = __require("child_process");
    var { isLinux, getReport } = require_process();
    var { LDD_PATH, SELF_PATH, readFile, readFileSync } = require_filesystem();
    var { interpreterPath } = require_elf();
    var cachedFamilyInterpreter;
    var cachedFamilyFilesystem;
    var cachedVersionFilesystem;
    var command = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true";
    var commandOut = "";
    var safeCommand = () => {
      if (!commandOut) {
        return new Promise((resolve) => {
          childProcess.exec(command, (err, out) => {
            commandOut = err ? " " : out;
            resolve(commandOut);
          });
        });
      }
      return commandOut;
    };
    var safeCommandSync = () => {
      if (!commandOut) {
        try {
          commandOut = childProcess.execSync(command, { encoding: "utf8" });
        } catch (_err) {
          commandOut = " ";
        }
      }
      return commandOut;
    };
    var GLIBC = "glibc";
    var RE_GLIBC_VERSION = /LIBC[a-z0-9 \-).]*?(\d+\.\d+)/i;
    var MUSL = "musl";
    var isFileMusl = (f) => f.includes("libc.musl-") || f.includes("ld-musl-");
    var familyFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return GLIBC;
      }
      if (Array.isArray(report.sharedObjects)) {
        if (report.sharedObjects.some(isFileMusl)) {
          return MUSL;
        }
      }
      return null;
    };
    var familyFromCommand = (out) => {
      const [getconf, ldd1] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return GLIBC;
      }
      if (ldd1 && ldd1.includes(MUSL)) {
        return MUSL;
      }
      return null;
    };
    var familyFromInterpreterPath = (path17) => {
      if (path17) {
        if (path17.includes("/ld-musl-")) {
          return MUSL;
        } else if (path17.includes("/ld-linux-")) {
          return GLIBC;
        }
      }
      return null;
    };
    var getFamilyFromLddContent = (content) => {
      content = content.toString();
      if (content.includes("musl")) {
        return MUSL;
      }
      if (content.includes("GNU C Library")) {
        return GLIBC;
      }
      return null;
    };
    var familyFromFilesystem = async () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromFilesystemSync = () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromInterpreter = async () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = await readFile(SELF_PATH);
        const path17 = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path17);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var familyFromInterpreterSync = () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = readFileSync(SELF_PATH);
        const path17 = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path17);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var family = async () => {
      let family2 = null;
      if (isLinux()) {
        family2 = await familyFromInterpreter();
        if (!family2) {
          family2 = await familyFromFilesystem();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = await safeCommand();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var familySync = () => {
      let family2 = null;
      if (isLinux()) {
        family2 = familyFromInterpreterSync();
        if (!family2) {
          family2 = familyFromFilesystemSync();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = safeCommandSync();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var isNonGlibcLinux = async () => isLinux() && await family() !== GLIBC;
    var isNonGlibcLinuxSync = () => isLinux() && familySync() !== GLIBC;
    var versionFromFilesystem = async () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromFilesystemSync = () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return report.header.glibcVersionRuntime;
      }
      return null;
    };
    var versionSuffix = (s) => s.trim().split(/\s+/)[1];
    var versionFromCommand = (out) => {
      const [getconf, ldd1, ldd2] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return versionSuffix(getconf);
      }
      if (ldd1 && ldd2 && ldd1.includes(MUSL)) {
        return versionSuffix(ldd2);
      }
      return null;
    };
    var version = async () => {
      let version2 = null;
      if (isLinux()) {
        version2 = await versionFromFilesystem();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = await safeCommand();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    var versionSync = () => {
      let version2 = null;
      if (isLinux()) {
        version2 = versionFromFilesystemSync();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = safeCommandSync();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    module.exports = {
      GLIBC,
      MUSL,
      family,
      familySync,
      isNonGlibcLinux,
      isNonGlibcLinuxSync,
      version,
      versionSync
    };
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/node-gyp-build-optional-packages/5.2.2/e2d2fc28f4d0eaa7fac1904123db86f87839f4cdd1ffc0e2b124adc9c1d9f616/node_modules/node-gyp-build-optional-packages/node-gyp-build.js
var require_node_gyp_build = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/node-gyp-build-optional-packages/5.2.2/e2d2fc28f4d0eaa7fac1904123db86f87839f4cdd1ffc0e2b124adc9c1d9f616/node_modules/node-gyp-build-optional-packages/node-gyp-build.js"(exports, module) {
    var fs13 = __require("fs");
    var path17 = __require("path");
    var url = __require("url");
    var os = __require("os");
    var runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : __require;
    var vars = process.config && process.config.variables || {};
    var prebuildsOnly = !!process.env.PREBUILDS_ONLY;
    var versions = process.versions;
    var abi = versions.modules;
    if (versions.deno || process.isBun) {
      abi = "unsupported";
    }
    var runtime = isElectron() ? "electron" : isNwjs() ? "node-webkit" : "node";
    var arch = process.env.npm_config_arch || os.arch();
    var platform = process.env.npm_config_platform || os.platform();
    var libc = process.env.LIBC || (isMusl(platform) ? "musl" : "glibc");
    var armv = process.env.ARM_VERSION || (arch === "arm64" ? "8" : vars.arm_version) || "";
    var uv = (versions.uv || "").split(".")[0];
    module.exports = load;
    function load(dir) {
      return runtimeRequire(load.resolve(dir));
    }
    load.resolve = load.path = function(dir) {
      dir = path17.resolve(dir || ".");
      var packageName = "";
      var packageNameError;
      try {
        packageName = runtimeRequire(path17.join(dir, "package.json")).name;
        var varName = packageName.toUpperCase().replace(/-/g, "_");
        if (process.env[varName + "_PREBUILD"]) dir = process.env[varName + "_PREBUILD"];
      } catch (err) {
        packageNameError = err;
      }
      if (!prebuildsOnly) {
        var release = getFirst(path17.join(dir, "build/Release"), matchBuild);
        if (release) return release;
        var debug = getFirst(path17.join(dir, "build/Debug"), matchBuild);
        if (debug) return debug;
      }
      var prebuild = resolve(dir);
      if (prebuild) return prebuild;
      var nearby = resolve(path17.dirname(process.execPath));
      if (nearby) return nearby;
      var platformPackage = (packageName[0] == "@" ? "" : "@" + packageName + "/") + packageName + "-" + platform + "-" + arch;
      var packageResolutionError;
      try {
        var prebuildPackage = path17.dirname(__require("module").createRequire(url.pathToFileURL(path17.join(dir, "package.json"))).resolve(platformPackage));
        return resolveFile(prebuildPackage);
      } catch (error) {
        packageResolutionError = error;
      }
      var target2 = [
        "platform=" + platform,
        "arch=" + arch,
        "runtime=" + runtime,
        "abi=" + abi,
        "uv=" + uv,
        armv ? "armv=" + armv : "",
        "libc=" + libc,
        "node=" + process.versions.node,
        process.versions.electron ? "electron=" + process.versions.electron : "",
        typeof __webpack_require__ === "function" ? "webpack=true" : ""
        // eslint-disable-line
      ].filter(Boolean).join(" ");
      let errMessage = "No native build was found for " + target2 + "\n    attempted loading from: " + dir + " and package: " + platformPackage + "\n";
      if (packageNameError) {
        errMessage += "Error finding package.json: " + packageNameError.message + "\n";
      }
      if (packageResolutionError) {
        errMessage += "Error resolving package: " + packageResolutionError.message + "\n";
      }
      throw new Error(errMessage);
      function resolve(dir2) {
        var tuples = readdirSync(path17.join(dir2, "prebuilds")).map(parseTuple);
        var tuple = tuples.filter(matchTuple(platform, arch)).sort(compareTuples)[0];
        if (!tuple) return;
        return resolveFile(path17.join(dir2, "prebuilds", tuple.name));
      }
      function resolveFile(prebuilds) {
        var parsed = readdirSync(prebuilds).map(parseTags);
        var candidates = parsed.filter(matchTags(runtime, abi));
        var winner = candidates.sort(compareTags(runtime))[0];
        if (winner) return path17.join(prebuilds, winner.file);
      }
    };
    function readdirSync(dir) {
      try {
        return fs13.readdirSync(dir);
      } catch (err) {
        return [];
      }
    }
    function getFirst(dir, filter) {
      var files = readdirSync(dir).filter(filter);
      return files[0] && path17.join(dir, files[0]);
    }
    function matchBuild(name) {
      return /\.node$/.test(name);
    }
    function parseTuple(name) {
      var arr = name.split("-");
      if (arr.length !== 2) return;
      var platform2 = arr[0];
      var architectures = arr[1].split("+");
      if (!platform2) return;
      if (!architectures.length) return;
      if (!architectures.every(Boolean)) return;
      return { name, platform: platform2, architectures };
    }
    function matchTuple(platform2, arch2) {
      return function(tuple) {
        if (tuple == null) return false;
        if (tuple.platform !== platform2) return false;
        return tuple.architectures.includes(arch2);
      };
    }
    function compareTuples(a, b) {
      return a.architectures.length - b.architectures.length;
    }
    function parseTags(file) {
      var arr = file.split(".");
      var extension = arr.pop();
      var tags = { file, specificity: 0 };
      if (extension !== "node") return;
      for (var i = 0; i < arr.length; i++) {
        var tag = arr[i];
        if (tag === "node" || tag === "electron" || tag === "node-webkit") {
          tags.runtime = tag;
        } else if (tag === "napi") {
          tags.napi = true;
        } else if (tag.slice(0, 3) === "abi") {
          tags.abi = tag.slice(3);
        } else if (tag.slice(0, 2) === "uv") {
          tags.uv = tag.slice(2);
        } else if (tag.slice(0, 4) === "armv") {
          tags.armv = tag.slice(4);
        } else if (tag === "glibc" || tag === "musl") {
          tags.libc = tag;
        } else {
          continue;
        }
        tags.specificity++;
      }
      return tags;
    }
    function matchTags(runtime2, abi2) {
      return function(tags) {
        if (tags == null) return false;
        if (tags.runtime !== runtime2 && !runtimeAgnostic(tags)) return false;
        if (tags.abi !== abi2 && !tags.napi) return false;
        if (tags.uv && tags.uv !== uv) return false;
        if (tags.armv && tags.armv !== armv) return false;
        if (tags.libc && tags.libc !== libc) return false;
        return true;
      };
    }
    function runtimeAgnostic(tags) {
      return tags.runtime === "node" && tags.napi;
    }
    function compareTags(runtime2) {
      return function(a, b) {
        if (a.runtime !== b.runtime) {
          return a.runtime === runtime2 ? -1 : 1;
        } else if (a.abi !== b.abi) {
          return a.abi ? -1 : 1;
        } else if (a.specificity !== b.specificity) {
          return a.specificity > b.specificity ? -1 : 1;
        } else {
          return 0;
        }
      };
    }
    function isNwjs() {
      return !!(process.versions && process.versions.nw);
    }
    function isElectron() {
      if (process.versions && process.versions.electron) return true;
      if (process.env.ELECTRON_RUN_AS_NODE) return true;
      return typeof window !== "undefined" && window.process && window.process.type === "renderer";
    }
    function isMusl(platform2) {
      if (platform2 !== "linux") return false;
      const { familySync, MUSL } = require_detect_libc();
      return familySync() === MUSL;
    }
    load.parseTags = parseTags;
    load.matchTags = matchTags;
    load.compareTags = compareTags;
    load.parseTuple = parseTuple;
    load.matchTuple = matchTuple;
    load.compareTuples = compareTuples;
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/node-gyp-build-optional-packages/5.2.2/e2d2fc28f4d0eaa7fac1904123db86f87839f4cdd1ffc0e2b124adc9c1d9f616/node_modules/node-gyp-build-optional-packages/index.js
var require_node_gyp_build_optional_packages = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/node-gyp-build-optional-packages/5.2.2/e2d2fc28f4d0eaa7fac1904123db86f87839f4cdd1ffc0e2b124adc9c1d9f616/node_modules/node-gyp-build-optional-packages/index.js"(exports, module) {
    var runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : __require;
    if (typeof runtimeRequire.addon === "function") {
      module.exports = runtimeRequire.addon.bind(runtimeRequire);
    } else {
      module.exports = require_node_gyp_build();
    }
  }
});

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr-extract/3.0.3/dc63a7e9c8306acc1418464548648c97e4a5c8c81989d7240121ad9e55103078/node_modules/msgpackr-extract/index.js
var require_msgpackr_extract = __commonJS({
  "../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr-extract/3.0.3/dc63a7e9c8306acc1418464548648c97e4a5c8c81989d7240121ad9e55103078/node_modules/msgpackr-extract/index.js"(exports, module) {
    module.exports = require_node_gyp_build_optional_packages()(__dirname);
  }
});

// ../worker/lib/start.js
import crypto5 from "node:crypto";
import fs12 from "node:fs";
import path16 from "node:path";
import util8 from "node:util";
import { parentPort } from "node:worker_threads";

// ../building/pkg-requires-build/lib/index.js
function pkgRequiresBuild(manifest, filesIndex) {
  return Boolean(manifest?.scripts != null && (Boolean(manifest.scripts.preinstall) || Boolean(manifest.scripts.install) || Boolean(manifest.scripts.postinstall)) || filesIncludeInstallScripts(filesIndex));
}
function filesIncludeInstallScripts(filesIndex) {
  const keys = filesIndex instanceof Map ? filesIndex.keys() : Object.keys(filesIndex);
  for (const filename of keys) {
    if (filename === "binding.gyp") {
      return true;
    }
    if (filename.match(/^\.hooks[\\/]/) != null) {
      return true;
    }
  }
  return false;
}

// ../crypto/integrity/lib/index.js
init_lib2();
var INTEGRITY_REGEX = /^([^-]+)-([a-z0-9+/=]+)$/i;
function parseIntegrity(integrity) {
  const match = integrity.match(INTEGRITY_REGEX);
  if (!match) {
    throw new PnpmError("INVALID_INTEGRITY", `Invalid integrity format: expected "algo-base64hash", got "${integrity}"`);
  }
  const hexDigest = Buffer.from(match[2], "base64").toString("hex");
  if (hexDigest.length === 0) {
    throw new PnpmError("INVALID_INTEGRITY", "Invalid integrity: base64 hash decoded to empty digest");
  }
  return { algorithm: match[1], hexDigest };
}
function formatIntegrity(algorithm, hexDigest) {
  return `${algorithm}-${Buffer.from(hexDigest, "hex").toString("base64")}`;
}

// ../worker/lib/start.js
init_lib2();

// ../fs/hard-link-dir/lib/index.js
init_lib3();
import assert from "node:assert";
import fs3 from "node:fs";
import path3 from "node:path";
import util2 from "node:util";

// ../core/logger/lib/logger.js
var import_bole = __toESM(require_bole(), 1);
import_bole.default.setFastTime();
var logger = (0, import_bole.default)("pnpm");
var globalLogger = (0, import_bole.default)("pnpm:global");
function globalWarn(message) {
  globalLogger.warn(message);
}
function globalInfo(message) {
  globalLogger.info(message);
}

// ../core/logger/lib/streamParser.js
var import_bole2 = __toESM(require_bole(), 1);

// ../core/logger/lib/ndjsonParse.js
var import_split2 = __toESM(require_split2(), 1);
var opts = { strict: true };
function parse() {
  function parseRow(row) {
    try {
      if (row)
        return JSON.parse(row);
    } catch (_e) {
      if (opts.strict) {
        this.emit("error", new Error(`Could not parse row "${row.length > 50 ? `${row.slice(0, 50)}...` : row}"`));
      }
    }
  }
  return (0, import_split2.default)(parseRow, opts);
}

// ../core/logger/lib/streamParser.js
var streamParser = createStreamParser();
function createStreamParser() {
  const sp = parse();
  import_bole2.default.output([
    {
      level: "debug",
      stream: sp
    }
  ]);
  return sp;
}

// ../core/logger/lib/writeToConsole.js
var import_bole3 = __toESM(require_bole(), 1);

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/path-temp/3.0.0/8b4b1aa7fd55674c92bd1b76de62ec746ab9b416377d8b2ecb6a51c4d56db367/node_modules/path-temp/index.js
import path from "node:path";

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/crypto-random-string/4.0.0/62825d7a2c34eedb81d0d583bb2f53f6aba7872f7f7458f24e1bf78c432f86ed/node_modules/crypto-random-string/index.js
import { promisify as promisify2 } from "util";
import crypto from "crypto";
var randomBytesAsync = promisify2(crypto.randomBytes);
var urlSafeCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~".split("");
var numericCharacters = "0123456789".split("");
var distinguishableCharacters = "CDEHKMPRTUWXY012458".split("");
var asciiPrintableCharacters = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".split("");
var alphanumericCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
var generateForCustomCharacters = (length, characters) => {
  const characterCount = characters.length;
  const maxValidSelector = Math.floor(65536 / characterCount) * characterCount - 1;
  const entropyLength = 2 * Math.ceil(1.1 * length);
  let string = "";
  let stringLength = 0;
  while (stringLength < length) {
    const entropy = crypto.randomBytes(entropyLength);
    let entropyPosition = 0;
    while (entropyPosition < entropyLength && stringLength < length) {
      const entropyValue = entropy.readUInt16LE(entropyPosition);
      entropyPosition += 2;
      if (entropyValue > maxValidSelector) {
        continue;
      }
      string += characters[entropyValue % characterCount];
      stringLength++;
    }
  }
  return string;
};
var generateForCustomCharactersAsync = async (length, characters) => {
  const characterCount = characters.length;
  const maxValidSelector = Math.floor(65536 / characterCount) * characterCount - 1;
  const entropyLength = 2 * Math.ceil(1.1 * length);
  let string = "";
  let stringLength = 0;
  while (stringLength < length) {
    const entropy = await randomBytesAsync(entropyLength);
    let entropyPosition = 0;
    while (entropyPosition < entropyLength && stringLength < length) {
      const entropyValue = entropy.readUInt16LE(entropyPosition);
      entropyPosition += 2;
      if (entropyValue > maxValidSelector) {
        continue;
      }
      string += characters[entropyValue % characterCount];
      stringLength++;
    }
  }
  return string;
};
var generateRandomBytes = (byteLength, type, length) => crypto.randomBytes(byteLength).toString(type).slice(0, length);
var generateRandomBytesAsync = async (byteLength, type, length) => {
  const buffer = await randomBytesAsync(byteLength);
  return buffer.toString(type).slice(0, length);
};
var allowedTypes = /* @__PURE__ */ new Set([
  void 0,
  "hex",
  "base64",
  "url-safe",
  "numeric",
  "distinguishable",
  "ascii-printable",
  "alphanumeric"
]);
var createGenerator = (generateForCustomCharacters2, generateRandomBytes2) => ({ length, type, characters }) => {
  if (!(length >= 0 && Number.isFinite(length))) {
    throw new TypeError("Expected a `length` to be a non-negative finite number");
  }
  if (type !== void 0 && characters !== void 0) {
    throw new TypeError("Expected either `type` or `characters`");
  }
  if (characters !== void 0 && typeof characters !== "string") {
    throw new TypeError("Expected `characters` to be string");
  }
  if (!allowedTypes.has(type)) {
    throw new TypeError(`Unknown type: ${type}`);
  }
  if (type === void 0 && characters === void 0) {
    type = "hex";
  }
  if (type === "hex" || type === void 0 && characters === void 0) {
    return generateRandomBytes2(Math.ceil(length * 0.5), "hex", length);
  }
  if (type === "base64") {
    return generateRandomBytes2(Math.ceil(length * 0.75), "base64", length);
  }
  if (type === "url-safe") {
    return generateForCustomCharacters2(length, urlSafeCharacters);
  }
  if (type === "numeric") {
    return generateForCustomCharacters2(length, numericCharacters);
  }
  if (type === "distinguishable") {
    return generateForCustomCharacters2(length, distinguishableCharacters);
  }
  if (type === "ascii-printable") {
    return generateForCustomCharacters2(length, asciiPrintableCharacters);
  }
  if (type === "alphanumeric") {
    return generateForCustomCharacters2(length, alphanumericCharacters);
  }
  if (characters.length === 0) {
    throw new TypeError("Expected `characters` string length to be greater than or equal to 1");
  }
  if (characters.length > 65536) {
    throw new TypeError("Expected `characters` string length to be less or equal to 65536");
  }
  return generateForCustomCharacters2(length, characters.split(""));
};
var cryptoRandomString = createGenerator(generateForCustomCharacters, generateRandomBytes);
cryptoRandomString.async = createGenerator(generateForCustomCharactersAsync, generateRandomBytesAsync);
var crypto_random_string_default = cryptoRandomString;

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/unique-string/3.0.0/a866cc9b5c54cfdb51fd873a65f819a8cf9cedf7f734bec6917212cc97bd4e56/node_modules/unique-string/index.js
function uniqueString() {
  return crypto_random_string_default({ length: 32 });
}

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/path-temp/3.0.0/8b4b1aa7fd55674c92bd1b76de62ec746ab9b416377d8b2ecb6a51c4d56db367/node_modules/path-temp/index.js
import { threadId } from "node:worker_threads";
function pathTemp(folder) {
  return path.join(folder, `_tmp_${process.pid}_${uniqueString()}`);
}
function fastPathTemp(file) {
  return path.join(path.dirname(file), `${path.basename(file)}_tmp_${process.pid}_${threadId}`);
}

// ../fs/hard-link-dir/lib/index.js
init_rename_overwrite();
function hardLinkDir(src2, destDirs) {
  if (destDirs.length === 0)
    return;
  const filteredDestDirs = [];
  const tempDestDirs = [];
  for (const destDir of destDirs) {
    if (path3.relative(destDir, src2) === "") {
      continue;
    }
    filteredDestDirs.push(destDir);
    tempDestDirs.push(pathTemp(path3.dirname(destDir)));
  }
  _hardLinkDir(src2, tempDestDirs, true);
  for (let i = 0; i < filteredDestDirs.length; i++) {
    renameOverwriteSync(tempDestDirs[i], filteredDestDirs[i]);
  }
}
function _hardLinkDir(src2, destDirs, isRoot) {
  let files = [];
  try {
    files = fs3.readdirSync(src2);
  } catch (err) {
    if (!isRoot || !(util2.types.isNativeError(err) && "code" in err && err.code === "ENOENT"))
      throw err;
    globalWarn(`Source directory not found when creating hardLinks for: ${src2}. Creating destinations as empty: ${destDirs.join(", ")}`);
    for (const dir of destDirs) {
      lib_default.mkdirSync(dir, { recursive: true });
    }
    return;
  }
  for (const file of files) {
    if (file === "node_modules")
      continue;
    const srcFile = path3.join(src2, file);
    if (fs3.lstatSync(srcFile).isDirectory()) {
      const destSubdirs = destDirs.map((destDir) => {
        const destSubdir = path3.join(destDir, file);
        try {
          lib_default.mkdirSync(destSubdir, { recursive: true });
        } catch (err) {
          if (!(util2.types.isNativeError(err) && "code" in err && err.code === "EEXIST"))
            throw err;
        }
        return destSubdir;
      });
      _hardLinkDir(srcFile, destSubdirs);
      continue;
    }
    for (const destDir of destDirs) {
      const destFile = path3.join(destDir, file);
      try {
        linkOrCopyFile(srcFile, destFile);
      } catch (err) {
        if (util2.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
          continue;
        }
        throw err;
      }
    }
  }
}
function linkOrCopyFile(srcFile, destFile) {
  try {
    linkOrCopy(srcFile, destFile);
  } catch (err) {
    assert(util2.types.isNativeError(err));
    if ("code" in err && err.code === "ENOENT") {
      lib_default.mkdirSync(path3.dirname(destFile), { recursive: true });
      linkOrCopy(srcFile, destFile);
      return;
    }
    if (!("code" in err && err.code === "EEXIST")) {
      throw err;
    }
  }
}
function linkOrCopy(srcFile, destFile) {
  try {
    lib_default.linkSync(srcFile, destFile);
  } catch (err) {
    if (util2.types.isNativeError(err) && "code" in err && (err.code === "EXDEV" || err.code === "ENOENT")) {
      lib_default.copyFileSync(srcFile, destFile);
    } else {
      throw err;
    }
  }
}

// ../fs/symlink-dependency/lib/index.js
import path5 from "node:path";

// ../core/core-loggers/lib/contextLogger.js
var contextLogger = logger("context");

// ../core/core-loggers/lib/deprecationLogger.js
var deprecationLogger = logger("deprecation");

// ../core/core-loggers/lib/executionTimeLogger.js
var executionTimeLogger = logger("execution-time");

// ../core/core-loggers/lib/fetchingProgressLogger.js
var fetchingProgressLogger = logger("fetching-progress");

// ../core/core-loggers/lib/hookLogger.js
var hookLogger = logger("hook");

// ../core/core-loggers/lib/ignoredScriptsLogger.js
var ignoredScriptsLogger = logger("ignored-scripts");

// ../core/core-loggers/lib/installCheckLogger.js
var installCheckLogger = logger("install-check");

// ../core/core-loggers/lib/installingConfigDeps.js
var installingConfigDepsLogger = logger("installing-config-deps");

// ../core/core-loggers/lib/lifecycleLogger.js
var lifecycleLogger = logger("lifecycle");

// ../core/core-loggers/lib/linkLogger.js
var linkLogger = logger("link");

// ../core/core-loggers/lib/packageImportMethodLogger.js
var packageImportMethodLogger = logger("package-import-method");

// ../core/core-loggers/lib/packageManifestLogger.js
var packageManifestLogger = logger("package-manifest");

// ../core/core-loggers/lib/peerDependencyIssues.js
var peerDependencyIssuesLogger = logger("peer-dependency-issues");

// ../core/core-loggers/lib/progressLogger.js
var progressLogger = logger("progress");

// ../core/core-loggers/lib/removalLogger.js
var removalLogger = logger("removal");

// ../core/core-loggers/lib/requestRetryLogger.js
var requestRetryLogger = logger("request-retry");

// ../core/core-loggers/lib/rootLogger.js
var rootLogger = logger("root");

// ../core/core-loggers/lib/scopeLogger.js
var scopeLogger = logger("scope");

// ../core/core-loggers/lib/skippedOptionalDependencyLogger.js
var skippedOptionalDependencyLogger = logger("skipped-optional-dependency");

// ../core/core-loggers/lib/stageLogger.js
var stageLogger = logger("stage");

// ../core/core-loggers/lib/statsLogger.js
var statsLogger = logger("stats");

// ../core/core-loggers/lib/summaryLogger.js
var summaryLogger = logger("summary");

// ../core/core-loggers/lib/updateCheckLogger.js
var updateCheckLogger = logger("update-check");

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/symlink-dir/10.0.1/99651a995e6d76e095bc87316473b0e784f9c820abf21dbac80a697d2ae16c64/node_modules/symlink-dir/dist/index.js
init_better_path_resolve();
init_rename_overwrite();
import { promises as fs4, symlinkSync, mkdirSync, readlinkSync, unlinkSync } from "fs";
import { types } from "util";
import pathLib from "path";
var IS_WINDOWS = process.platform === "win32" || /^(msys|cygwin)$/.test(process.env.OSTYPE);
function resolveSrcOnWinJunction(src2) {
  return `${src2}\\`;
}
function resolveSrcOnTrueSymlink(src2, dest) {
  return pathLib.relative(pathLib.dirname(dest), src2);
}
function symlinkDirSync(target2, path17, opts2) {
  path17 = betterPathResolve(path17);
  target2 = betterPathResolve(target2);
  if (target2 === path17)
    throw new Error(`Symlink path is the same as the target path (${target2})`);
  return forceSymlinkSync(target2, path17, opts2);
}
function isExistingSymlinkUpToDate(wantedTarget, path17, linkString) {
  const existingTarget = pathLib.isAbsolute(linkString) ? linkString : pathLib.join(pathLib.dirname(path17), linkString);
  return pathLib.relative(wantedTarget, existingTarget) === "";
}
var createSymlinkAsync;
var createSymlinkSync;
if (IS_WINDOWS) {
  createSymlinkAsync = async (target2, path17) => {
    try {
      await createTrueSymlinkAsync(target2, path17);
      createSymlinkSync = createTrueSymlinkSync;
      createSymlinkAsync = createTrueSymlinkAsync;
    } catch (err) {
      if (err.code === "EPERM") {
        await createJunctionAsync(target2, path17);
        createSymlinkSync = createJunctionSync;
        createSymlinkAsync = createJunctionAsync;
      } else {
        throw err;
      }
    }
  };
  createSymlinkSync = (target2, path17) => {
    try {
      createTrueSymlinkSync(target2, path17);
      createSymlinkSync = createTrueSymlinkSync;
      createSymlinkAsync = createTrueSymlinkAsync;
    } catch (err) {
      if (err.code === "EPERM") {
        createJunctionSync(target2, path17);
        createSymlinkSync = createJunctionSync;
        createSymlinkAsync = createJunctionAsync;
      } else {
        throw err;
      }
    }
  };
} else {
  createSymlinkAsync = createTrueSymlinkAsync;
  createSymlinkSync = createTrueSymlinkSync;
}
function createTrueSymlinkAsync(target2, path17) {
  return fs4.symlink(resolveSrcOnTrueSymlink(target2, path17), path17, "dir");
}
function createTrueSymlinkSync(target2, path17) {
  symlinkSync(resolveSrcOnTrueSymlink(target2, path17), path17, "dir");
}
function createJunctionAsync(target2, path17) {
  return fs4.symlink(resolveSrcOnWinJunction(target2), path17, "junction");
}
function createJunctionSync(target2, path17) {
  symlinkSync(resolveSrcOnWinJunction(target2), path17, "junction");
}
function forceSymlinkSync(target2, path17, opts2) {
  let initialErr;
  try {
    if (opts2?.noJunction === true) {
      createTrueSymlinkSync(target2, path17);
    } else {
      createSymlinkSync(target2, path17);
    }
    return { reused: false };
  } catch (err) {
    initialErr = err;
    switch (err.code) {
      case "ENOENT":
        try {
          mkdirSync(pathLib.dirname(path17), { recursive: true });
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${target2}" to "${path17}". The error happened while trying to create the parent directory for the symlink target. Details: ${mkdirError}`;
          throw mkdirError;
        }
        forceSymlinkSync(target2, path17, opts2);
        return { reused: false };
      case "EEXIST":
      case "EISDIR":
        break;
      default:
        throw err;
    }
  }
  let linkString;
  try {
    linkString = readlinkSync(path17);
  } catch (err) {
    if (opts2?.overwrite === false) {
      throw initialErr;
    }
    const parentDir = pathLib.dirname(path17);
    let warn;
    if (opts2?.renameTried) {
      unlinkSync(path17);
      warn = `Symlink wanted name was occupied by directory or file. Old entity removed: "${parentDir}${pathLib.sep}{${pathLib.basename(path17)}".`;
    } else {
      const ignore = `.ignored_${pathLib.basename(path17)}`;
      try {
        renameOverwriteSync(path17, pathLib.join(parentDir, ignore));
      } catch (error) {
        if (types.isNativeError(error) && "code" in error && error.code === "ENOENT") {
          throw initialErr;
        }
        throw error;
      }
      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${pathLib.sep}{${pathLib.basename(path17)} => ${ignore}".`;
    }
    return {
      ...forceSymlinkSync(target2, path17, { ...opts2, renameTried: true }),
      warn
    };
  }
  if (isExistingSymlinkUpToDate(target2, path17, linkString)) {
    return { reused: true };
  }
  if (opts2?.overwrite === false) {
    throw initialErr;
  }
  try {
    unlinkSync(path17);
  } catch (error) {
    if (!types.isNativeError(error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  return forceSymlinkSync(target2, path17, opts2);
}

// ../fs/symlink-dependency/lib/index.js
function symlinkDependencySync(dependencyRealLocation, destModulesDir, importAs) {
  const link = path5.join(destModulesDir, importAs);
  linkLogger.debug({ target: dependencyRealLocation, link });
  return symlinkDirSync(dependencyRealLocation, link);
}

// ../worker/lib/start.js
init_lib5();

// ../store/create-cafs-store/lib/index.js
import { promises as fs10 } from "node:fs";
import path15 from "node:path";

// ../fs/indexed-pkg-importer/lib/index.js
import assert2 from "node:assert";
import { constants, existsSync } from "node:fs";
import path14 from "node:path";
import util7 from "node:util";
init_lib3();
init_rename_overwrite();

// ../fs/indexed-pkg-importer/lib/importIndexedDir.js
init_lib3();
import fs9 from "node:fs";
import path13 from "node:path";
import util6 from "node:util";
init_rimraf();
var import_fs_extra2 = __toESM(require_lib2(), 1);

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/make-empty-dir/4.0.0/3607722a2f7d328bdf182e4db3290941113e732fd2d785b1a5837ab89bb24489/node_modules/make-empty-dir/index.js
init_rimraf();
import fs8 from "node:fs";
import path12 from "node:path";
function makeEmptyDirSync(dir, opts2) {
  if (opts2 && opts2.recursive) {
    fs8.mkdirSync(path12.dirname(dir), { recursive: true });
  }
  try {
    fs8.mkdirSync(dir);
    return "created";
  } catch (err) {
    if (err.code === "EEXIST") {
      removeContentsOfDirSync(dir);
      return "emptied";
    }
    throw err;
  }
}
function removeContentsOfDirSync(dir) {
  const items = fs8.readdirSync(dir);
  for (const item of items) {
    rimrafSync(path12.join(dir, item));
  }
}

// ../fs/indexed-pkg-importer/lib/importIndexedDir.js
init_rename_overwrite();
var import_sanitize_filename = __toESM(require_sanitize_filename(), 1);
var filenameConflictsLogger = logger("_filename-conflicts");
function importIndexedDir(importer, newDir, filenames, opts2) {
  if (!opts2.keepModulesDir)
    try {
      if (opts2.safeToSkip) {
        fs9.mkdirSync(newDir, { recursive: true });
      } else {
        makeEmptyDirSync(newDir, { recursive: true });
      }
      tryImportIndexedDir(importer, newDir, filenames);
      return;
    } catch (err) {
      if (util6.types.isNativeError(err) && "code" in err && err.code === "EEXIST") {
        if (allFilesMatch(newDir, filenames))
          return;
      }
    }
  const stage = fastPathTemp(newDir);
  try {
    makeEmptyDirSync(stage, { recursive: true });
    tryImportIndexedDir({ importFile: importer.importFile, importFileAtomic: importer.importFile }, stage, filenames);
    if (opts2.keepModulesDir) {
      moveOrMergeModulesDirs(path13.join(newDir, "node_modules"), path13.join(stage, "node_modules"));
    }
  } catch (err) {
    try {
      rimrafSync(stage);
    } catch {
    }
    if (util6.types.isNativeError(err) && "code" in err && err.code === "EEXIST") {
      const { uniqueFileMap, conflictingFileNames } = getUniqueFileMap(filenames);
      if (conflictingFileNames.size === 0)
        throw err;
      filenameConflictsLogger.debug({
        conflicts: Object.fromEntries(conflictingFileNames),
        writingTo: newDir
      });
      globalWarn(`Not all files were linked to "${path13.relative(process.cwd(), newDir)}". Some of the files have equal names in different case, which is an issue on case-insensitive filesystems. The conflicting file names are: ${JSON.stringify(Object.fromEntries(conflictingFileNames))}`);
      importIndexedDir(importer, newDir, uniqueFileMap, opts2);
      return;
    }
    if (util6.types.isNativeError(err) && "code" in err && err.code === "ENOENT") {
      if (retryWithSanitizedFilenames(importer, newDir, filenames, opts2))
        return;
      throw err;
    }
    throw err;
  }
  if (opts2.safeToSkip) {
    try {
      fs9.renameSync(stage, newDir);
      return;
    } catch (err) {
      if (util6.types.isNativeError(err) && "code" in err && (err.code === "ENOTEMPTY" || err.code === "EEXIST" || err.code === "EPERM")) {
        if (allFilesMatch(newDir, filenames)) {
          try {
            rimrafSync(stage);
          } catch {
          }
          return;
        }
      }
    }
  }
  try {
    renameOverwriteSync(stage, newDir);
  } catch (renameErr) {
    try {
      rimrafSync(stage);
    } catch {
    }
    throw renameErr;
  }
}
function allFilesMatch(dir, filenames) {
  for (const [f, src2] of filenames) {
    const target2 = path13.join(dir, f);
    try {
      const targetStat = lib_default.statSync(target2);
      const srcStat = lib_default.statSync(src2);
      if (targetStat.ino === srcStat.ino && targetStat.dev === srcStat.dev)
        continue;
      if (targetStat.size !== srcStat.size) {
        globalInfo(`Re-importing "${dir}" because file "${f}" has a different size`);
        return false;
      }
      if (!lib_default.readFileSync(target2).equals(lib_default.readFileSync(src2))) {
        globalInfo(`Re-importing "${dir}" because file "${f}" has different content`);
        return false;
      }
    } catch {
      globalInfo(`Re-importing "${dir}" because file "${f}" is missing or unreadable`);
      return false;
    }
  }
  return true;
}
function retryWithSanitizedFilenames(importer, newDir, filenames, opts2) {
  const { sanitizedFilenames, invalidFilenames } = sanitizeFilenames(filenames);
  if (invalidFilenames.length === 0)
    return false;
  globalWarn(`The package linked to "${path13.relative(process.cwd(), newDir)}" had files with invalid names: ${invalidFilenames.join(", ")}. They were renamed.`);
  importIndexedDir(importer, newDir, sanitizedFilenames, opts2);
  return true;
}
function sanitizeFilenames(filenames) {
  const sanitizedFilenames = /* @__PURE__ */ new Map();
  const invalidFilenames = [];
  for (const [filename, src2] of filenames) {
    const sanitizedFilename = filename.split("/").map((f) => (0, import_sanitize_filename.default)(f)).join("/");
    if (sanitizedFilename !== filename) {
      invalidFilenames.push(filename);
    }
    sanitizedFilenames.set(sanitizedFilename, src2);
  }
  return { sanitizedFilenames, invalidFilenames };
}
function tryImportIndexedDir({ importFile, importFileAtomic }, newDir, filenames) {
  const allDirs = /* @__PURE__ */ new Set();
  for (const f of filenames.keys()) {
    const dir = path13.dirname(f);
    if (dir === ".")
      continue;
    allDirs.add(dir);
  }
  Array.from(allDirs).sort((d1, d2) => d1.length - d2.length).forEach((dir) => fs9.mkdirSync(path13.join(newDir, dir), { recursive: true }));
  let packageJsonSrc;
  for (const [f, src2] of filenames) {
    if (f === "package.json") {
      packageJsonSrc = src2;
      continue;
    }
    importFile(src2, path13.join(newDir, f));
  }
  if (packageJsonSrc !== void 0) {
    importFileAtomic(packageJsonSrc, path13.join(newDir, "package.json"));
  }
}
function getUniqueFileMap(fileMap) {
  const lowercaseFiles = /* @__PURE__ */ new Map();
  const conflictingFileNames = /* @__PURE__ */ new Map();
  const uniqueFileMap = /* @__PURE__ */ new Map();
  for (const filename of Array.from(fileMap.keys()).sort()) {
    const lowercaseFilename = filename.toLowerCase();
    if (lowercaseFiles.has(lowercaseFilename)) {
      conflictingFileNames.set(filename, lowercaseFiles.get(lowercaseFilename));
      continue;
    }
    lowercaseFiles.set(lowercaseFilename, filename);
    uniqueFileMap.set(filename, fileMap.get(filename));
  }
  return {
    conflictingFileNames,
    uniqueFileMap
  };
}
function moveOrMergeModulesDirs(src2, dest) {
  try {
    renameEvenAcrossDevices(src2, dest);
  } catch (err) {
    switch (util6.types.isNativeError(err) && "code" in err && err.code) {
      case "ENOENT":
        return;
      case "ENOTEMPTY":
      case "EPERM":
        mergeModulesDirs(src2, dest);
        return;
      default:
        throw err;
    }
  }
}
function renameEvenAcrossDevices(src2, dest) {
  try {
    lib_default.renameSync(src2, dest);
  } catch (err) {
    if (!(util6.types.isNativeError(err) && "code" in err && err.code === "EXDEV"))
      throw err;
    import_fs_extra2.default.copySync(src2, dest);
  }
}
function mergeModulesDirs(src2, dest) {
  const srcFiles = fs9.readdirSync(src2);
  const destFiles = new Set(fs9.readdirSync(dest));
  const filesToMove = srcFiles.filter((file) => !destFiles.has(file));
  for (const file of filesToMove) {
    renameEvenAcrossDevices(path13.join(src2, file), path13.join(dest, file));
  }
}

// ../fs/indexed-pkg-importer/lib/index.js
function createIndexedPkgImporter(packageImportMethod) {
  const importPackage2 = createImportPackage(packageImportMethod);
  return importPackage2;
}
function createImportPackage(packageImportMethod) {
  switch (packageImportMethod ?? "auto") {
    case "clone":
      packageImportMethodLogger.debug({ method: "clone" });
      return createClonePkg();
    case "hardlink":
      packageImportMethodLogger.debug({ method: "hardlink" });
      return hardlinkPkg.bind(null, linkOrCopy2);
    case "auto": {
      return createAutoImporter();
    }
    case "clone-or-copy":
      return createCloneOrCopyImporter();
    case "copy":
      packageImportMethodLogger.debug({ method: "copy" });
      return copyPkg;
    default:
      throw new Error(`Unknown package import method ${packageImportMethod}`);
  }
}
function createAutoImporter() {
  let auto = initialAuto;
  return (to, opts2) => auto(to, opts2);
  function initialAuto(to, opts2) {
    if (process.platform !== "win32") {
      try {
        if (!tryClonePkg(to, opts2))
          return void 0;
        packageImportMethodLogger.debug({ method: "clone" });
        auto = createClonePkg();
        return "clone";
      } catch {
      }
    }
    try {
      if (!hardlinkPkg(lib_default.linkSync, to, opts2))
        return void 0;
      packageImportMethodLogger.debug({ method: "hardlink" });
      auto = hardlinkPkg.bind(null, linkOrCopy2);
      return "hardlink";
    } catch (err) {
      assert2(util7.types.isNativeError(err));
      if (err.message.startsWith("EXDEV: cross-device link not permitted")) {
        globalWarn(err.message);
        globalInfo("Falling back to copying packages from store");
        packageImportMethodLogger.debug({ method: "copy" });
        auto = copyPkg;
        return auto(to, opts2);
      }
      packageImportMethodLogger.debug({ method: "hardlink" });
      auto = hardlinkPkg.bind(null, linkOrCopy2);
      return auto(to, opts2);
    }
  }
}
function createCloneOrCopyImporter() {
  let auto = initialAuto;
  return (to, opts2) => auto(to, opts2);
  function initialAuto(to, opts2) {
    try {
      if (!tryClonePkg(to, opts2))
        return void 0;
      packageImportMethodLogger.debug({ method: "clone" });
      auto = createClonePkg();
      return "clone";
    } catch {
    }
    packageImportMethodLogger.debug({ method: "copy" });
    auto = copyPkg;
    return auto(to, opts2);
  }
}
function tryClonePkg(to, opts2) {
  if (opts2.resolvedFrom !== "store" || opts2.force || !pkgExistsAtTargetDir(to, opts2.filesMap)) {
    const clone = createCloneFunction();
    importIndexedDir({ importFile: clone, importFileAtomic: clone }, to, opts2.filesMap, opts2);
    return "clone";
  }
  return void 0;
}
function createClonePkg() {
  const clone = createCloneFunction();
  const withFallback = (fallback) => (src2, dest) => {
    try {
      clone(src2, dest);
    } catch (err) {
      if (util7.types.isNativeError(err) && "code" in err && err.code === "ENOTSUP") {
        fallback(src2, dest);
        return;
      }
      throw err;
    }
  };
  const importer = {
    importFile: withFallback(resilientCopyFileSync),
    importFileAtomic: withFallback(atomicCopyFileSync)
  };
  return (to, opts2) => {
    if (opts2.resolvedFrom !== "store" || opts2.force || !pkgExistsAtTargetDir(to, opts2.filesMap)) {
      importIndexedDir(importer, to, opts2.filesMap, opts2);
      return "clone";
    }
    return void 0;
  };
}
function pkgExistsAtTargetDir(targetDir, filesMap) {
  return existsSync(path14.join(targetDir, pickFileFromFilesMap(filesMap)));
}
function pickFileFromFilesMap(filesMap) {
  if (filesMap.has("package.json")) {
    return "package.json";
  }
  if (filesMap.size === 0) {
    throw new Error("pickFileFromFilesMap cannot pick a file from an empty FilesMap");
  }
  return filesMap.keys().next().value;
}
var _cloneFunction;
function createCloneFunction() {
  if (_cloneFunction)
    return _cloneFunction;
  if (process.platform === "darwin" || process.platform === "win32") {
    const { reflinkFileSync } = __require("@reflink/reflink");
    _cloneFunction = (fr, to) => {
      try {
        reflinkFileSync(fr, to);
      } catch (err) {
        if (!util7.types.isNativeError(err) || !("code" in err) || err.code !== "EEXIST")
          throw err;
      }
    };
  } else {
    _cloneFunction = (src2, dest) => {
      try {
        lib_default.copyFileSync(src2, dest, constants.COPYFILE_FICLONE_FORCE);
      } catch (err) {
        if (!(util7.types.isNativeError(err) && "code" in err && err.code === "EEXIST"))
          throw err;
      }
    };
  }
  return _cloneFunction;
}
function hardlinkPkg(importFile, to, opts2) {
  if (opts2.force || shouldRelinkPkg(to, opts2)) {
    importIndexedDir({ importFile, importFileAtomic: importFile }, to, opts2.filesMap, opts2);
    return "hardlink";
  }
  return void 0;
}
function shouldRelinkPkg(to, opts2) {
  if (opts2.disableRelinkLocalDirDeps && opts2.resolvedFrom === "local-dir") {
    try {
      const files = lib_default.readdirSync(to);
      return files.length === 0 || files.length === 1 && files[0] === "node_modules";
    } catch {
      return true;
    }
  }
  return opts2.resolvedFrom !== "store" || !pkgLinkedToStore(opts2.filesMap, to);
}
function linkOrCopy2(existingPath, newPath) {
  try {
    lib_default.linkSync(existingPath, newPath);
  } catch (err) {
    if (util7.types.isNativeError(err) && "code" in err && err.code === "EEXIST")
      return;
    resilientCopyFileSync(existingPath, newPath);
  }
}
function resilientCopyFileSync(src2, dest) {
  try {
    lib_default.copyFileSync(src2, dest);
  } catch (err) {
    if (util7.types.isNativeError(err) && "code" in err && err.code === "ENOTSUP") {
      const srcMode = lib_default.statSync(src2).mode;
      lib_default.writeFileSync(dest, lib_default.readFileSync(src2), { mode: srcMode });
    } else {
      throw err;
    }
  }
}
function pkgLinkedToStore(filesMap, linkedPkgDir) {
  const filename = pickFileFromFilesMap(filesMap);
  const linkedFile = path14.join(linkedPkgDir, filename);
  let stats0;
  try {
    stats0 = lib_default.statSync(linkedFile);
  } catch (err) {
    if (util7.types.isNativeError(err) && "code" in err && err.code === "ENOENT")
      return false;
  }
  const stats1 = lib_default.statSync(filesMap.get(filename));
  if (stats0.ino === stats1.ino)
    return true;
  globalInfo(`Relinking ${linkedPkgDir} from the store`);
  return false;
}
function copyPkg(to, opts2) {
  if (opts2.resolvedFrom !== "store" || opts2.force || !pkgExistsAtTargetDir(to, opts2.filesMap)) {
    importIndexedDir({ importFile: resilientCopyFileSync, importFileAtomic: atomicCopyFileSync }, to, opts2.filesMap, opts2);
    return "copy";
  }
  return void 0;
}
function atomicCopyFileSync(src2, dest) {
  const tmp = fastPathTemp(dest);
  try {
    resilientCopyFileSync(src2, tmp);
  } catch (err) {
    try {
      lib_default.unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
  renameOverwriteSync(tmp, dest);
}

// ../store/create-cafs-store/lib/index.js
init_lib5();

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/mimic-function/5.0.1/42ffd44e2cba19e8e133b2bdc7d5939811fa14bc8061d1a5739a299c53ffa2b6/node_modules/mimic-function/index.js
var copyProperty = (to, from, property, ignoreNonConfigurable) => {
  if (property === "length" || property === "prototype") {
    return;
  }
  if (property === "arguments" || property === "caller") {
    return;
  }
  const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
  const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);
  if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) {
    return;
  }
  Object.defineProperty(to, property, fromDescriptor);
};
var canCopyProperty = function(toDescriptor, fromDescriptor) {
  return toDescriptor === void 0 || toDescriptor.configurable || toDescriptor.writable === fromDescriptor.writable && toDescriptor.enumerable === fromDescriptor.enumerable && toDescriptor.configurable === fromDescriptor.configurable && (toDescriptor.writable || toDescriptor.value === fromDescriptor.value);
};
var changePrototype = (to, from) => {
  const fromPrototype = Object.getPrototypeOf(from);
  if (fromPrototype === Object.getPrototypeOf(to)) {
    return;
  }
  Object.setPrototypeOf(to, fromPrototype);
};
var wrappedToString = (withName, fromBody) => `/* Wrapped ${withName}*/
${fromBody}`;
var toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
var toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, "name");
var changeToString = (to, from, name) => {
  const withName = name === "" ? "" : `with ${name.trim()}() `;
  const newToString = wrappedToString.bind(null, withName, from.toString());
  Object.defineProperty(newToString, "name", toStringName);
  const { writable, enumerable, configurable } = toStringDescriptor;
  Object.defineProperty(to, "toString", { value: newToString, writable, enumerable, configurable });
};
function mimicFunction(to, from, { ignoreNonConfigurable = false } = {}) {
  const { name } = to;
  for (const property of Reflect.ownKeys(from)) {
    copyProperty(to, from, property, ignoreNonConfigurable);
  }
  changePrototype(to, from);
  changeToString(to, from, name);
  return to;
}

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/memoize/10.2.0/323bb1b5af24035419af756a2146ba6504ede83a0757ebeada615ae4ff286517/node_modules/memoize/distribution/index.js
var maxTimeoutValue = 2147483647;
var cacheStore = /* @__PURE__ */ new WeakMap();
var cacheTimerStore = /* @__PURE__ */ new WeakMap();
var cacheKeyStore = /* @__PURE__ */ new WeakMap();
function getValidCacheItem(cache, key) {
  const item = cache.get(key);
  if (!item) {
    return void 0;
  }
  if (item.maxAge <= Date.now()) {
    cache.delete(key);
    return void 0;
  }
  return item;
}
function memoize(function_, { cacheKey, cache = /* @__PURE__ */ new Map(), maxAge } = {}) {
  if (maxAge === 0) {
    return function_;
  }
  if (typeof maxAge === "number" && Number.isFinite(maxAge)) {
    if (maxAge > maxTimeoutValue) {
      throw new TypeError(`The \`maxAge\` option cannot exceed ${maxTimeoutValue}.`);
    }
    if (maxAge < 0) {
      throw new TypeError("The `maxAge` option should not be a negative number.");
    }
  }
  const memoized = function(...arguments_) {
    const key = cacheKey ? cacheKey(arguments_) : arguments_[0];
    const cacheItem = getValidCacheItem(cache, key);
    if (cacheItem) {
      return cacheItem.data;
    }
    const result = function_.apply(this, arguments_);
    const computedMaxAge = typeof maxAge === "function" ? maxAge(...arguments_) : maxAge;
    if (computedMaxAge !== void 0 && computedMaxAge !== Number.POSITIVE_INFINITY) {
      if (!Number.isFinite(computedMaxAge)) {
        throw new TypeError("The `maxAge` function must return a finite number, `0`, or `Infinity`.");
      }
      if (computedMaxAge <= 0) {
        return result;
      }
      if (computedMaxAge > maxTimeoutValue) {
        throw new TypeError(`The \`maxAge\` function result cannot exceed ${maxTimeoutValue}.`);
      }
    }
    cache.set(key, {
      data: result,
      maxAge: computedMaxAge === void 0 || computedMaxAge === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Date.now() + computedMaxAge
    });
    if (computedMaxAge !== void 0 && computedMaxAge !== Number.POSITIVE_INFINITY) {
      const timer = setTimeout(() => {
        cache.delete(key);
        cacheTimerStore.get(memoized)?.delete(timer);
      }, computedMaxAge);
      timer.unref?.();
      const timers = cacheTimerStore.get(memoized) ?? /* @__PURE__ */ new Set();
      timers.add(timer);
      cacheTimerStore.set(memoized, timers);
    }
    return result;
  };
  mimicFunction(memoized, function_, {
    ignoreNonConfigurable: true
  });
  cacheStore.set(memoized, cache);
  cacheKeyStore.set(memoized, cacheKey ?? ((arguments_) => arguments_[0]));
  return memoized;
}

// ../store/create-cafs-store/lib/index.js
function createPackageImporter(opts2) {
  const cachedImporterCreator = opts2.importIndexedPackage ? () => opts2.importIndexedPackage : memoize(createIndexedPkgImporter);
  const packageImportMethod = opts2.packageImportMethod;
  const gfm = getFlatMap.bind(null, opts2.storeDir);
  return (to, opts3) => {
    const { filesMap, isBuilt } = gfm(opts3.filesResponse, opts3.sideEffectsCacheKey);
    const willBeBuilt = !isBuilt && opts3.requiresBuild;
    const pkgImportMethod = willBeBuilt ? "clone-or-copy" : opts3.filesResponse.packageImportMethod ?? packageImportMethod;
    const impPkg = cachedImporterCreator(pkgImportMethod);
    const importMethod = impPkg(to, {
      disableRelinkLocalDirDeps: opts3.disableRelinkLocalDirDeps,
      filesMap,
      resolvedFrom: opts3.filesResponse.resolvedFrom,
      force: opts3.force,
      keepModulesDir: Boolean(opts3.keepModulesDir),
      safeToSkip: opts3.safeToSkip
    });
    return { importMethod, isBuilt };
  };
}
function getFlatMap(storeDir, filesResponse, targetEngine) {
  if (targetEngine && filesResponse.sideEffectsMaps?.has(targetEngine)) {
    const sideEffectMap = filesResponse.sideEffectsMaps.get(targetEngine);
    const filesMap = applySideEffectsDiffWithMaps(filesResponse.filesMap, sideEffectMap);
    return {
      filesMap,
      isBuilt: true
    };
  }
  return {
    filesMap: filesResponse.filesMap,
    isBuilt: false
  };
}
function applySideEffectsDiffWithMaps(baseFiles, { added, deleted }) {
  const filesWithSideEffects = /* @__PURE__ */ new Map();
  if (added) {
    for (const [name, filePath] of added.entries()) {
      filesWithSideEffects.set(name, filePath);
    }
  }
  for (const [fileName, filePath] of baseFiles) {
    if (!deleted?.includes(fileName) && !filesWithSideEffects.has(fileName)) {
      filesWithSideEffects.set(fileName, filePath);
    }
  }
  return filesWithSideEffects;
}
function createCafsStore(storeDir, opts2) {
  const baseTempDir = path15.join(storeDir, "tmp");
  const importPackage2 = createPackageImporter({
    importIndexedPackage: opts2?.importPackage,
    packageImportMethod: opts2?.packageImportMethod,
    storeDir
  });
  return {
    ...createCafs(storeDir, opts2),
    storeDir,
    importPackage: importPackage2,
    tempDir: async () => {
      const tmpDir = pathTemp(baseTempDir);
      await fs10.mkdir(tmpDir, { recursive: true });
      return tmpDir;
    }
  };
}

// ../store/index/lib/index.js
import fs11 from "node:fs";
import { createRequire as createRequire2 } from "node:module";

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr/1.11.8/46dd53c5eb8ac19961b8dcfdc6cb3c46229e7d03ddda6f31cf5a680868f31b80/node_modules/msgpackr/unpack.js
var decoder;
try {
  decoder = new TextDecoder();
} catch (error) {
}
var src;
var srcEnd;
var position = 0;
var EMPTY_ARRAY = [];
var strings = EMPTY_ARRAY;
var stringPosition = 0;
var currentUnpackr = {};
var currentStructures;
var srcString;
var srcStringStart = 0;
var srcStringEnd = 0;
var bundledStrings;
var referenceMap;
var currentExtensions = [];
var dataView;
var defaultOptions = {
  useRecords: false,
  mapsAsObjects: true
};
var C1Type = class {
};
var C1 = new C1Type();
C1.name = "MessagePack 0xC1";
var sequentialMode = false;
var inlineObjectReadThreshold = 2;
var readStruct;
var onLoadedStructures;
var onSaveState;
try {
  new Function("");
} catch (error) {
  inlineObjectReadThreshold = Infinity;
}
var Unpackr = class _Unpackr {
  constructor(options) {
    if (options) {
      if (options.useRecords === false && options.mapsAsObjects === void 0)
        options.mapsAsObjects = true;
      if (options.sequential && options.trusted !== false) {
        options.trusted = true;
        if (!options.structures && options.useRecords != false) {
          options.structures = [];
          if (!options.maxSharedStructures)
            options.maxSharedStructures = 0;
        }
      }
      if (options.structures)
        options.structures.sharedLength = options.structures.length;
      else if (options.getStructures) {
        (options.structures = []).uninitialized = true;
        options.structures.sharedLength = 0;
      }
      if (options.int64AsNumber) {
        options.int64AsType = "number";
      }
    }
    Object.assign(this, options);
  }
  unpack(source, options) {
    if (src) {
      return saveState(() => {
        clearSource();
        return this ? this.unpack(source, options) : _Unpackr.prototype.unpack.call(defaultOptions, source, options);
      });
    }
    if (!source.buffer && source.constructor === ArrayBuffer)
      source = typeof Buffer !== "undefined" ? Buffer.from(source) : new Uint8Array(source);
    if (typeof options === "object") {
      srcEnd = options.end || source.length;
      position = options.start || 0;
    } else {
      position = 0;
      srcEnd = options > -1 ? options : source.length;
    }
    stringPosition = 0;
    srcStringEnd = 0;
    srcString = null;
    strings = EMPTY_ARRAY;
    bundledStrings = null;
    src = source;
    try {
      dataView = source.dataView || (source.dataView = new DataView(source.buffer, source.byteOffset, source.byteLength));
    } catch (error) {
      src = null;
      if (source instanceof Uint8Array)
        throw error;
      throw new Error("Source must be a Uint8Array or Buffer but was a " + (source && typeof source == "object" ? source.constructor.name : typeof source));
    }
    if (this instanceof _Unpackr) {
      currentUnpackr = this;
      if (this.structures) {
        currentStructures = this.structures;
        return checkedRead(options);
      } else if (!currentStructures || currentStructures.length > 0) {
        currentStructures = [];
      }
    } else {
      currentUnpackr = defaultOptions;
      if (!currentStructures || currentStructures.length > 0)
        currentStructures = [];
    }
    return checkedRead(options);
  }
  unpackMultiple(source, forEach) {
    let values, lastPosition = 0;
    try {
      sequentialMode = true;
      let size = source.length;
      let value = this ? this.unpack(source, size) : defaultUnpackr.unpack(source, size);
      if (forEach) {
        if (forEach(value, lastPosition, position) === false) return;
        while (position < size) {
          lastPosition = position;
          if (forEach(checkedRead(), lastPosition, position) === false) {
            return;
          }
        }
      } else {
        values = [value];
        while (position < size) {
          lastPosition = position;
          values.push(checkedRead());
        }
        return values;
      }
    } catch (error) {
      error.lastPosition = lastPosition;
      error.values = values;
      throw error;
    } finally {
      sequentialMode = false;
      clearSource();
    }
  }
  _mergeStructures(loadedStructures, existingStructures) {
    if (onLoadedStructures)
      loadedStructures = onLoadedStructures.call(this, loadedStructures);
    loadedStructures = loadedStructures || [];
    if (Object.isFrozen(loadedStructures))
      loadedStructures = loadedStructures.map((structure) => structure.slice(0));
    for (let i = 0, l = loadedStructures.length; i < l; i++) {
      let structure = loadedStructures[i];
      if (structure) {
        structure.isShared = true;
        if (i >= 32)
          structure.highByte = i - 32 >> 5;
      }
    }
    loadedStructures.sharedLength = loadedStructures.length;
    for (let id in existingStructures || []) {
      if (id >= 0) {
        let structure = loadedStructures[id];
        let existing = existingStructures[id];
        if (existing) {
          if (structure)
            (loadedStructures.restoreStructures || (loadedStructures.restoreStructures = []))[id] = structure;
          loadedStructures[id] = existing;
        }
      }
    }
    return this.structures = loadedStructures;
  }
  decode(source, options) {
    return this.unpack(source, options);
  }
};
function checkedRead(options) {
  try {
    if (!currentUnpackr.trusted && !sequentialMode) {
      let sharedLength = currentStructures.sharedLength || 0;
      if (sharedLength < currentStructures.length)
        currentStructures.length = sharedLength;
    }
    let result;
    if (currentUnpackr.randomAccessStructure && src[position] < 64 && src[position] >= 32 && readStruct) {
      result = readStruct(src, position, srcEnd, currentUnpackr);
      src = null;
      if (!(options && options.lazy) && result)
        result = result.toJSON();
      position = srcEnd;
    } else
      result = read();
    if (bundledStrings) {
      position = bundledStrings.postBundlePosition;
      bundledStrings = null;
    }
    if (sequentialMode)
      currentStructures.restoreStructures = null;
    if (position == srcEnd) {
      if (currentStructures && currentStructures.restoreStructures)
        restoreStructures();
      currentStructures = null;
      src = null;
      if (referenceMap)
        referenceMap = null;
    } else if (position > srcEnd) {
      throw new Error("Unexpected end of MessagePack data");
    } else if (!sequentialMode) {
      let jsonView;
      try {
        jsonView = JSON.stringify(result, (_, value) => typeof value === "bigint" ? `${value}n` : value).slice(0, 100);
      } catch (error) {
        jsonView = "(JSON view not available " + error + ")";
      }
      throw new Error("Data read, but end of buffer not reached " + jsonView);
    }
    return result;
  } catch (error) {
    if (currentStructures && currentStructures.restoreStructures)
      restoreStructures();
    clearSource();
    if (error instanceof RangeError || error.message.startsWith("Unexpected end of buffer") || position > srcEnd) {
      error.incomplete = true;
    }
    throw error;
  }
}
function restoreStructures() {
  for (let id in currentStructures.restoreStructures) {
    currentStructures[id] = currentStructures.restoreStructures[id];
  }
  currentStructures.restoreStructures = null;
}
function read() {
  let token = src[position++];
  if (token < 160) {
    if (token < 128) {
      if (token < 64)
        return token;
      else {
        let structure = currentStructures[token & 63] || currentUnpackr.getStructures && loadStructures()[token & 63];
        if (structure) {
          if (!structure.read) {
            structure.read = createStructureReader(structure, token & 63);
          }
          return structure.read();
        } else
          return token;
      }
    } else if (token < 144) {
      token -= 128;
      if (currentUnpackr.mapsAsObjects) {
        let object = {};
        for (let i = 0; i < token; i++) {
          let key = readKey();
          if (key === "__proto__")
            key = "__proto_";
          object[key] = read();
        }
        return object;
      } else {
        let map = /* @__PURE__ */ new Map();
        for (let i = 0; i < token; i++) {
          map.set(read(), read());
        }
        return map;
      }
    } else {
      token -= 144;
      let array = new Array(token);
      for (let i = 0; i < token; i++) {
        array[i] = read();
      }
      if (currentUnpackr.freezeData)
        return Object.freeze(array);
      return array;
    }
  } else if (token < 192) {
    let length = token - 160;
    if (srcStringEnd >= position) {
      return srcString.slice(position - srcStringStart, (position += length) - srcStringStart);
    }
    if (srcStringEnd == 0 && srcEnd < 140) {
      let string = length < 16 ? shortStringInJS(length) : longStringInJS(length);
      if (string != null)
        return string;
    }
    return readFixedString(length);
  } else {
    let value;
    switch (token) {
      case 192:
        return null;
      case 193:
        if (bundledStrings) {
          value = read();
          if (value > 0)
            return bundledStrings[1].slice(bundledStrings.position1, bundledStrings.position1 += value);
          else
            return bundledStrings[0].slice(bundledStrings.position0, bundledStrings.position0 -= value);
        }
        return C1;
      // "never-used", return special object to denote that
      case 194:
        return false;
      case 195:
        return true;
      case 196:
        value = src[position++];
        if (value === void 0)
          throw new Error("Unexpected end of buffer");
        return readBin(value);
      case 197:
        value = dataView.getUint16(position);
        position += 2;
        return readBin(value);
      case 198:
        value = dataView.getUint32(position);
        position += 4;
        return readBin(value);
      case 199:
        return readExt(src[position++]);
      case 200:
        value = dataView.getUint16(position);
        position += 2;
        return readExt(value);
      case 201:
        value = dataView.getUint32(position);
        position += 4;
        return readExt(value);
      case 202:
        value = dataView.getFloat32(position);
        if (currentUnpackr.useFloat32 > 2) {
          let multiplier = mult10[(src[position] & 127) << 1 | src[position + 1] >> 7];
          position += 4;
          return (multiplier * value + (value > 0 ? 0.5 : -0.5) >> 0) / multiplier;
        }
        position += 4;
        return value;
      case 203:
        value = dataView.getFloat64(position);
        position += 8;
        return value;
      // uint handlers
      case 204:
        return src[position++];
      case 205:
        value = dataView.getUint16(position);
        position += 2;
        return value;
      case 206:
        value = dataView.getUint32(position);
        position += 4;
        return value;
      case 207:
        if (currentUnpackr.int64AsType === "number") {
          value = dataView.getUint32(position) * 4294967296;
          value += dataView.getUint32(position + 4);
        } else if (currentUnpackr.int64AsType === "string") {
          value = dataView.getBigUint64(position).toString();
        } else if (currentUnpackr.int64AsType === "auto") {
          value = dataView.getBigUint64(position);
          if (value <= BigInt(2) << BigInt(52)) value = Number(value);
        } else
          value = dataView.getBigUint64(position);
        position += 8;
        return value;
      // int handlers
      case 208:
        return dataView.getInt8(position++);
      case 209:
        value = dataView.getInt16(position);
        position += 2;
        return value;
      case 210:
        value = dataView.getInt32(position);
        position += 4;
        return value;
      case 211:
        if (currentUnpackr.int64AsType === "number") {
          value = dataView.getInt32(position) * 4294967296;
          value += dataView.getUint32(position + 4);
        } else if (currentUnpackr.int64AsType === "string") {
          value = dataView.getBigInt64(position).toString();
        } else if (currentUnpackr.int64AsType === "auto") {
          value = dataView.getBigInt64(position);
          if (value >= BigInt(-2) << BigInt(52) && value <= BigInt(2) << BigInt(52)) value = Number(value);
        } else
          value = dataView.getBigInt64(position);
        position += 8;
        return value;
      case 212:
        value = src[position++];
        if (value == 114) {
          return recordDefinition(src[position++] & 63);
        } else {
          let extension = currentExtensions[value];
          if (extension) {
            if (extension.read) {
              position++;
              return extension.read(read());
            } else if (extension.noBuffer) {
              position++;
              return extension();
            } else
              return extension(src.subarray(position, ++position));
          } else
            throw new Error("Unknown extension " + value);
        }
      case 213:
        value = src[position];
        if (value == 114) {
          position++;
          return recordDefinition(src[position++] & 63, src[position++]);
        } else
          return readExt(2);
      case 214:
        return readExt(4);
      case 215:
        return readExt(8);
      case 216:
        return readExt(16);
      case 217:
        value = src[position++];
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString8(value);
      case 218:
        value = dataView.getUint16(position);
        position += 2;
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString16(value);
      case 219:
        value = dataView.getUint32(position);
        position += 4;
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString32(value);
      case 220:
        value = dataView.getUint16(position);
        position += 2;
        return readArray(value);
      case 221:
        value = dataView.getUint32(position);
        position += 4;
        return readArray(value);
      case 222:
        value = dataView.getUint16(position);
        position += 2;
        return readMap(value);
      case 223:
        value = dataView.getUint32(position);
        position += 4;
        return readMap(value);
      default:
        if (token >= 224)
          return token - 256;
        if (token === void 0) {
          let error = new Error("Unexpected end of MessagePack data");
          error.incomplete = true;
          throw error;
        }
        throw new Error("Unknown MessagePack token " + token);
    }
  }
}
var validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
function createStructureReader(structure, firstId) {
  function readObject() {
    if (readObject.count++ > inlineObjectReadThreshold) {
      let readObject2 = structure.read = new Function("r", "return function(){return " + (currentUnpackr.freezeData ? "Object.freeze" : "") + "({" + structure.map((key) => key === "__proto__" ? "__proto_:r()" : validName.test(key) ? key + ":r()" : "[" + JSON.stringify(key) + "]:r()").join(",") + "})}")(read);
      if (structure.highByte === 0)
        structure.read = createSecondByteReader(firstId, structure.read);
      return readObject2();
    }
    let object = {};
    for (let i = 0, l = structure.length; i < l; i++) {
      let key = structure[i];
      if (key === "__proto__")
        key = "__proto_";
      object[key] = read();
    }
    if (currentUnpackr.freezeData)
      return Object.freeze(object);
    return object;
  }
  readObject.count = 0;
  if (structure.highByte === 0) {
    return createSecondByteReader(firstId, readObject);
  }
  return readObject;
}
var createSecondByteReader = (firstId, read0) => {
  return function() {
    let highByte = src[position++];
    if (highByte === 0)
      return read0();
    let id = firstId < 32 ? -(firstId + (highByte << 5)) : firstId + (highByte << 5);
    let structure = currentStructures[id] || loadStructures()[id];
    if (!structure) {
      throw new Error("Record id is not defined for " + id);
    }
    if (!structure.read)
      structure.read = createStructureReader(structure, firstId);
    return structure.read();
  };
};
function loadStructures() {
  let loadedStructures = saveState(() => {
    src = null;
    return currentUnpackr.getStructures();
  });
  return currentStructures = currentUnpackr._mergeStructures(loadedStructures, currentStructures);
}
var readFixedString = readStringJS;
var readString8 = readStringJS;
var readString16 = readStringJS;
var readString32 = readStringJS;
var isNativeAccelerationEnabled = false;
function setExtractor(extractStrings) {
  isNativeAccelerationEnabled = true;
  readFixedString = readString2(1);
  readString8 = readString2(2);
  readString16 = readString2(3);
  readString32 = readString2(5);
  function readString2(headerLength) {
    return function readString3(length) {
      let string = strings[stringPosition++];
      if (string == null) {
        if (bundledStrings)
          return readStringJS(length);
        let byteOffset = src.byteOffset;
        let extraction = extractStrings(position - headerLength + byteOffset, srcEnd + byteOffset, src.buffer);
        if (typeof extraction == "string") {
          string = extraction;
          strings = EMPTY_ARRAY;
        } else {
          strings = extraction;
          stringPosition = 1;
          srcStringEnd = 1;
          string = strings[0];
          if (string === void 0)
            throw new Error("Unexpected end of buffer");
        }
      }
      let srcStringLength = string.length;
      if (srcStringLength <= length) {
        position += length;
        return string;
      }
      srcString = string;
      srcStringStart = position;
      srcStringEnd = position + srcStringLength;
      position += length;
      return string.slice(0, length);
    };
  }
}
function readStringJS(length) {
  let result;
  if (length < 16) {
    if (result = shortStringInJS(length))
      return result;
  }
  if (length > 64 && decoder)
    return decoder.decode(src.subarray(position, position += length));
  const end = position + length;
  const units = [];
  result = "";
  while (position < end) {
    const byte1 = src[position++];
    if ((byte1 & 128) === 0) {
      units.push(byte1);
    } else if ((byte1 & 224) === 192) {
      const byte2 = src[position++] & 63;
      units.push((byte1 & 31) << 6 | byte2);
    } else if ((byte1 & 240) === 224) {
      const byte2 = src[position++] & 63;
      const byte3 = src[position++] & 63;
      units.push((byte1 & 31) << 12 | byte2 << 6 | byte3);
    } else if ((byte1 & 248) === 240) {
      const byte2 = src[position++] & 63;
      const byte3 = src[position++] & 63;
      const byte4 = src[position++] & 63;
      let unit = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
      if (unit > 65535) {
        unit -= 65536;
        units.push(unit >>> 10 & 1023 | 55296);
        unit = 56320 | unit & 1023;
      }
      units.push(unit);
    } else {
      units.push(byte1);
    }
    if (units.length >= 4096) {
      result += fromCharCode.apply(String, units);
      units.length = 0;
    }
  }
  if (units.length > 0) {
    result += fromCharCode.apply(String, units);
  }
  return result;
}
function readString(source, start, length) {
  let existingSrc = src;
  src = source;
  position = start;
  try {
    return readStringJS(length);
  } finally {
    src = existingSrc;
  }
}
function readArray(length) {
  let array = new Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = read();
  }
  if (currentUnpackr.freezeData)
    return Object.freeze(array);
  return array;
}
function readMap(length) {
  if (currentUnpackr.mapsAsObjects) {
    let object = {};
    for (let i = 0; i < length; i++) {
      let key = readKey();
      if (key === "__proto__")
        key = "__proto_";
      object[key] = read();
    }
    return object;
  } else {
    let map = /* @__PURE__ */ new Map();
    for (let i = 0; i < length; i++) {
      map.set(read(), read());
    }
    return map;
  }
}
var fromCharCode = String.fromCharCode;
function longStringInJS(length) {
  let start = position;
  let bytes = new Array(length);
  for (let i = 0; i < length; i++) {
    const byte = src[position++];
    if ((byte & 128) > 0) {
      position = start;
      return;
    }
    bytes[i] = byte;
  }
  return fromCharCode.apply(String, bytes);
}
function shortStringInJS(length) {
  if (length < 4) {
    if (length < 2) {
      if (length === 0)
        return "";
      else {
        let a = src[position++];
        if ((a & 128) > 1) {
          position -= 1;
          return;
        }
        return fromCharCode(a);
      }
    } else {
      let a = src[position++];
      let b = src[position++];
      if ((a & 128) > 0 || (b & 128) > 0) {
        position -= 2;
        return;
      }
      if (length < 3)
        return fromCharCode(a, b);
      let c = src[position++];
      if ((c & 128) > 0) {
        position -= 3;
        return;
      }
      return fromCharCode(a, b, c);
    }
  } else {
    let a = src[position++];
    let b = src[position++];
    let c = src[position++];
    let d = src[position++];
    if ((a & 128) > 0 || (b & 128) > 0 || (c & 128) > 0 || (d & 128) > 0) {
      position -= 4;
      return;
    }
    if (length < 6) {
      if (length === 4)
        return fromCharCode(a, b, c, d);
      else {
        let e = src[position++];
        if ((e & 128) > 0) {
          position -= 5;
          return;
        }
        return fromCharCode(a, b, c, d, e);
      }
    } else if (length < 8) {
      let e = src[position++];
      let f = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0) {
        position -= 6;
        return;
      }
      if (length < 7)
        return fromCharCode(a, b, c, d, e, f);
      let g = src[position++];
      if ((g & 128) > 0) {
        position -= 7;
        return;
      }
      return fromCharCode(a, b, c, d, e, f, g);
    } else {
      let e = src[position++];
      let f = src[position++];
      let g = src[position++];
      let h = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0 || (g & 128) > 0 || (h & 128) > 0) {
        position -= 8;
        return;
      }
      if (length < 10) {
        if (length === 8)
          return fromCharCode(a, b, c, d, e, f, g, h);
        else {
          let i = src[position++];
          if ((i & 128) > 0) {
            position -= 9;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i);
        }
      } else if (length < 12) {
        let i = src[position++];
        let j = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0) {
          position -= 10;
          return;
        }
        if (length < 11)
          return fromCharCode(a, b, c, d, e, f, g, h, i, j);
        let k = src[position++];
        if ((k & 128) > 0) {
          position -= 11;
          return;
        }
        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
      } else {
        let i = src[position++];
        let j = src[position++];
        let k = src[position++];
        let l = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0 || (k & 128) > 0 || (l & 128) > 0) {
          position -= 12;
          return;
        }
        if (length < 14) {
          if (length === 12)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
          else {
            let m = src[position++];
            if ((m & 128) > 0) {
              position -= 13;
              return;
            }
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
          }
        } else {
          let m = src[position++];
          let n = src[position++];
          if ((m & 128) > 0 || (n & 128) > 0) {
            position -= 14;
            return;
          }
          if (length < 15)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
          let o = src[position++];
          if ((o & 128) > 0) {
            position -= 15;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
        }
      }
    }
  }
}
function readOnlyJSString() {
  let token = src[position++];
  let length;
  if (token < 192) {
    length = token - 160;
  } else {
    switch (token) {
      case 217:
        length = src[position++];
        break;
      case 218:
        length = dataView.getUint16(position);
        position += 2;
        break;
      case 219:
        length = dataView.getUint32(position);
        position += 4;
        break;
      default:
        throw new Error("Expected string");
    }
  }
  return readStringJS(length);
}
function readBin(length) {
  return currentUnpackr.copyBuffers ? (
    // specifically use the copying slice (not the node one)
    Uint8Array.prototype.slice.call(src, position, position += length)
  ) : src.subarray(position, position += length);
}
function readExt(length) {
  let type = src[position++];
  if (currentExtensions[type]) {
    let end;
    return currentExtensions[type](src.subarray(position, end = position += length), (readPosition) => {
      position = readPosition;
      try {
        return read();
      } finally {
        position = end;
      }
    });
  } else
    throw new Error("Unknown extension type " + type);
}
var keyCache = new Array(4096);
function readKey() {
  let length = src[position++];
  if (length >= 160 && length < 192) {
    length = length - 160;
    if (srcStringEnd >= position)
      return srcString.slice(position - srcStringStart, (position += length) - srcStringStart);
    else if (!(srcStringEnd == 0 && srcEnd < 180))
      return readFixedString(length);
  } else {
    position--;
    return asSafeString(read());
  }
  let key = (length << 5 ^ (length > 1 ? dataView.getUint16(position) : length > 0 ? src[position] : 0)) & 4095;
  let entry = keyCache[key];
  let checkPosition = position;
  let end = position + length - 3;
  let chunk;
  let i = 0;
  if (entry && entry.bytes == length) {
    while (checkPosition < end) {
      chunk = dataView.getUint32(checkPosition);
      if (chunk != entry[i++]) {
        checkPosition = 1879048192;
        break;
      }
      checkPosition += 4;
    }
    end += 3;
    while (checkPosition < end) {
      chunk = src[checkPosition++];
      if (chunk != entry[i++]) {
        checkPosition = 1879048192;
        break;
      }
    }
    if (checkPosition === end) {
      position = checkPosition;
      return entry.string;
    }
    end -= 3;
    checkPosition = position;
  }
  entry = [];
  keyCache[key] = entry;
  entry.bytes = length;
  while (checkPosition < end) {
    chunk = dataView.getUint32(checkPosition);
    entry.push(chunk);
    checkPosition += 4;
  }
  end += 3;
  while (checkPosition < end) {
    chunk = src[checkPosition++];
    entry.push(chunk);
  }
  let string = length < 16 ? shortStringInJS(length) : longStringInJS(length);
  if (string != null)
    return entry.string = string;
  return entry.string = readFixedString(length);
}
function asSafeString(property) {
  if (typeof property === "string") return property;
  if (typeof property === "number" || typeof property === "boolean" || typeof property === "bigint") return property.toString();
  if (property == null) return property + "";
  if (currentUnpackr.allowArraysInMapKeys && Array.isArray(property) && property.flat().every((item) => ["string", "number", "boolean", "bigint"].includes(typeof item))) {
    return property.flat().toString();
  }
  throw new Error(`Invalid property type for record: ${typeof property}`);
}
var recordDefinition = (id, highByte) => {
  let structure = read().map(asSafeString);
  let firstByte = id;
  if (highByte !== void 0) {
    id = id < 32 ? -((highByte << 5) + id) : (highByte << 5) + id;
    structure.highByte = highByte;
  }
  let existingStructure = currentStructures[id];
  if (existingStructure && (existingStructure.isShared || sequentialMode)) {
    (currentStructures.restoreStructures || (currentStructures.restoreStructures = []))[id] = existingStructure;
  }
  currentStructures[id] = structure;
  structure.read = createStructureReader(structure, firstByte);
  return structure.read();
};
currentExtensions[0] = () => {
};
currentExtensions[0].noBuffer = true;
currentExtensions[66] = (data) => {
  let headLength = data.byteLength % 8 || 8;
  let head = BigInt(data[0] & 128 ? data[0] - 256 : data[0]);
  for (let i = 1; i < headLength; i++) {
    head <<= BigInt(8);
    head += BigInt(data[i]);
  }
  if (data.byteLength !== headLength) {
    let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let decode2 = (start, end) => {
      let length = end - start;
      if (length <= 40) {
        let out = view.getBigUint64(start);
        for (let i = start + 8; i < end; i += 8) {
          out <<= BigInt(64n);
          out |= view.getBigUint64(i);
        }
        return out;
      }
      let middle = start + (length >> 4 << 3);
      let left = decode2(start, middle);
      let right = decode2(middle, end);
      return left << BigInt((end - middle) * 8) | right;
    };
    head = head << BigInt((view.byteLength - headLength) * 8) | decode2(headLength, view.byteLength);
  }
  return head;
};
var errors = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError: typeof AggregateError === "function" ? AggregateError : null
};
currentExtensions[101] = () => {
  let data = read();
  if (!errors[data[0]]) {
    let error = Error(data[1], { cause: data[2] });
    error.name = data[0];
    return error;
  }
  return errors[data[0]](data[1], { cause: data[2] });
};
currentExtensions[105] = (data) => {
  if (currentUnpackr.structuredClone === false) throw new Error("Structured clone extension is disabled");
  let id = dataView.getUint32(position - 4);
  if (!referenceMap)
    referenceMap = /* @__PURE__ */ new Map();
  let token = src[position];
  let target2;
  if (token >= 144 && token < 160 || token == 220 || token == 221)
    target2 = [];
  else if (token >= 128 && token < 144 || token == 222 || token == 223)
    target2 = /* @__PURE__ */ new Map();
  else if ((token >= 199 && token <= 201 || token >= 212 && token <= 216) && src[position + 1] === 115)
    target2 = /* @__PURE__ */ new Set();
  else
    target2 = {};
  let refEntry = { target: target2 };
  referenceMap.set(id, refEntry);
  let targetProperties = read();
  if (!refEntry.used) {
    return refEntry.target = targetProperties;
  } else {
    Object.assign(target2, targetProperties);
  }
  if (target2 instanceof Map)
    for (let [k, v] of targetProperties.entries()) target2.set(k, v);
  if (target2 instanceof Set)
    for (let i of Array.from(targetProperties)) target2.add(i);
  return target2;
};
currentExtensions[112] = (data) => {
  if (currentUnpackr.structuredClone === false) throw new Error("Structured clone extension is disabled");
  let id = dataView.getUint32(position - 4);
  let refEntry = referenceMap.get(id);
  refEntry.used = true;
  return refEntry.target;
};
currentExtensions[115] = () => new Set(read());
var typedArrays = ["Int8", "Uint8", "Uint8Clamped", "Int16", "Uint16", "Int32", "Uint32", "Float32", "Float64", "BigInt64", "BigUint64"].map((type) => type + "Array");
var glbl = typeof globalThis === "object" ? globalThis : window;
currentExtensions[116] = (data) => {
  let typeCode = data[0];
  let buffer = Uint8Array.prototype.slice.call(data, 1).buffer;
  let typedArrayName = typedArrays[typeCode];
  if (!typedArrayName) {
    if (typeCode === 16) return buffer;
    if (typeCode === 17) return new DataView(buffer);
    throw new Error("Could not find typed array for code " + typeCode);
  }
  return new glbl[typedArrayName](buffer);
};
currentExtensions[120] = () => {
  let data = read();
  return new RegExp(data[0], data[1]);
};
var TEMP_BUNDLE = [];
currentExtensions[98] = (data) => {
  let dataSize = (data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3];
  let dataPosition = position;
  position += dataSize - data.length;
  bundledStrings = TEMP_BUNDLE;
  bundledStrings = [readOnlyJSString(), readOnlyJSString()];
  bundledStrings.position0 = 0;
  bundledStrings.position1 = 0;
  bundledStrings.postBundlePosition = position;
  position = dataPosition;
  return read();
};
currentExtensions[255] = (data) => {
  if (data.length == 4)
    return new Date((data[0] * 16777216 + (data[1] << 16) + (data[2] << 8) + data[3]) * 1e3);
  else if (data.length == 8)
    return new Date(
      ((data[0] << 22) + (data[1] << 14) + (data[2] << 6) + (data[3] >> 2)) / 1e6 + ((data[3] & 3) * 4294967296 + data[4] * 16777216 + (data[5] << 16) + (data[6] << 8) + data[7]) * 1e3
    );
  else if (data.length == 12)
    return new Date(
      ((data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3]) / 1e6 + ((data[4] & 128 ? -281474976710656 : 0) + data[6] * 1099511627776 + data[7] * 4294967296 + data[8] * 16777216 + (data[9] << 16) + (data[10] << 8) + data[11]) * 1e3
    );
  else
    return /* @__PURE__ */ new Date("invalid");
};
function saveState(callback) {
  if (onSaveState)
    onSaveState();
  let savedSrcEnd = srcEnd;
  let savedPosition = position;
  let savedStringPosition = stringPosition;
  let savedSrcStringStart = srcStringStart;
  let savedSrcStringEnd = srcStringEnd;
  let savedSrcString = srcString;
  let savedStrings = strings;
  let savedReferenceMap = referenceMap;
  let savedBundledStrings = bundledStrings;
  let savedSrc = new Uint8Array(src.slice(0, srcEnd));
  let savedStructures = currentStructures;
  let savedStructuresContents = currentStructures.slice(0, currentStructures.length);
  let savedPackr = currentUnpackr;
  let savedSequentialMode = sequentialMode;
  let value = callback();
  srcEnd = savedSrcEnd;
  position = savedPosition;
  stringPosition = savedStringPosition;
  srcStringStart = savedSrcStringStart;
  srcStringEnd = savedSrcStringEnd;
  srcString = savedSrcString;
  strings = savedStrings;
  referenceMap = savedReferenceMap;
  bundledStrings = savedBundledStrings;
  src = savedSrc;
  sequentialMode = savedSequentialMode;
  currentStructures = savedStructures;
  currentStructures.splice(0, currentStructures.length, ...savedStructuresContents);
  currentUnpackr = savedPackr;
  dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return value;
}
function clearSource() {
  src = null;
  referenceMap = null;
  currentStructures = null;
}
var mult10 = new Array(147);
for (let i = 0; i < 256; i++) {
  mult10[i] = +("1e" + Math.floor(45.15 - i * 0.30103));
}
var defaultUnpackr = new Unpackr({ useRecords: false });
var unpack = defaultUnpackr.unpack;
var unpackMultiple = defaultUnpackr.unpackMultiple;
var decode = defaultUnpackr.unpack;
var FLOAT32_OPTIONS = {
  NEVER: 0,
  ALWAYS: 1,
  DECIMAL_ROUND: 3,
  DECIMAL_FIT: 4
};
var f32Array = new Float32Array(1);
var u8Array = new Uint8Array(f32Array.buffer, 0, 4);
function setReadStruct(updatedReadStruct, loadedStructs, saveState3) {
  readStruct = updatedReadStruct;
  onLoadedStructures = loadedStructs;
  onSaveState = saveState3;
}

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr/1.11.8/46dd53c5eb8ac19961b8dcfdc6cb3c46229e7d03ddda6f31cf5a680868f31b80/node_modules/msgpackr/pack.js
var textEncoder;
try {
  textEncoder = new TextEncoder();
} catch (error) {
}
var extensions;
var extensionClasses;
var hasNodeBuffer = typeof Buffer !== "undefined";
var ByteArrayAllocate = hasNodeBuffer ? function(length) {
  return Buffer.allocUnsafeSlow(length);
} : Uint8Array;
var ByteArray = hasNodeBuffer ? Buffer : Uint8Array;
var MAX_BUFFER_SIZE = hasNodeBuffer ? 4294967296 : 2144337920;
var target;
var keysTarget;
var targetView;
var position2 = 0;
var safeEnd;
var bundledStrings2 = null;
var writeStructSlots;
var MAX_BUNDLE_SIZE = 21760;
var hasNonLatin = /[\u0080-\uFFFF]/;
var RECORD_SYMBOL = /* @__PURE__ */ Symbol("record-id");
var Packr = class extends Unpackr {
  constructor(options) {
    super(options);
    this.offset = 0;
    let typeBuffer;
    let start;
    let hasSharedUpdate;
    let structures;
    let referenceMap2;
    let encodeUtf82 = ByteArray.prototype.utf8Write ? function(string, position3) {
      return target.utf8Write(string, position3, target.byteLength - position3);
    } : textEncoder && textEncoder.encodeInto ? function(string, position3) {
      return textEncoder.encodeInto(string, target.subarray(position3)).written;
    } : false;
    let packr2 = this;
    if (!options)
      options = {};
    let isSequential = options && options.sequential;
    let hasSharedStructures = options.structures || options.saveStructures;
    let maxSharedStructures = options.maxSharedStructures;
    if (maxSharedStructures == null)
      maxSharedStructures = hasSharedStructures ? 32 : 0;
    if (maxSharedStructures > 8160)
      throw new Error("Maximum maxSharedStructure is 8160");
    if (options.structuredClone && options.moreTypes == void 0) {
      this.moreTypes = true;
    }
    let maxOwnStructures = options.maxOwnStructures;
    if (maxOwnStructures == null)
      maxOwnStructures = hasSharedStructures ? 32 : 64;
    if (!this.structures && options.useRecords != false)
      this.structures = [];
    let useTwoByteRecords = maxSharedStructures > 32 || maxOwnStructures + maxSharedStructures > 64;
    let sharedLimitId = maxSharedStructures + 64;
    let maxStructureId = maxSharedStructures + maxOwnStructures + 64;
    if (maxStructureId > 8256) {
      throw new Error("Maximum maxSharedStructure + maxOwnStructure is 8192");
    }
    let recordIdsToRemove = [];
    let transitionsCount = 0;
    let serializationsSinceTransitionRebuild = 0;
    this.pack = this.encode = function(value, encodeOptions) {
      if (!target) {
        target = new ByteArrayAllocate(8192);
        targetView = target.dataView || (target.dataView = new DataView(target.buffer, 0, 8192));
        position2 = 0;
      }
      safeEnd = target.length - 10;
      if (safeEnd - position2 < 2048) {
        target = new ByteArrayAllocate(target.length);
        targetView = target.dataView || (target.dataView = new DataView(target.buffer, 0, target.length));
        safeEnd = target.length - 10;
        position2 = 0;
      } else
        position2 = position2 + 7 & 2147483640;
      start = position2;
      if (encodeOptions & RESERVE_START_SPACE) position2 += encodeOptions & 255;
      referenceMap2 = packr2.structuredClone ? /* @__PURE__ */ new Map() : null;
      if (packr2.bundleStrings && typeof value !== "string") {
        bundledStrings2 = [];
        bundledStrings2.size = Infinity;
      } else
        bundledStrings2 = null;
      structures = packr2.structures;
      if (structures) {
        if (structures.uninitialized)
          structures = packr2._mergeStructures(packr2.getStructures());
        let sharedLength = structures.sharedLength || 0;
        if (sharedLength > maxSharedStructures) {
          throw new Error("Shared structures is larger than maximum shared structures, try increasing maxSharedStructures to " + structures.sharedLength);
        }
        if (!structures.transitions) {
          structures.transitions = /* @__PURE__ */ Object.create(null);
          for (let i = 0; i < sharedLength; i++) {
            let keys = structures[i];
            if (!keys)
              continue;
            let nextTransition, transition = structures.transitions;
            for (let j = 0, l = keys.length; j < l; j++) {
              let key = keys[j];
              nextTransition = transition[key];
              if (!nextTransition) {
                nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
              }
              transition = nextTransition;
            }
            transition[RECORD_SYMBOL] = i + 64;
          }
          this.lastNamedStructuresLength = sharedLength;
        }
        if (!isSequential) {
          structures.nextId = sharedLength + 64;
        }
      }
      if (hasSharedUpdate)
        hasSharedUpdate = false;
      let encodingError;
      try {
        if (packr2.randomAccessStructure && value && typeof value === "object") {
          if (value.constructor === Object) writeStruct2(value);
          else if (value.constructor !== Map && !Array.isArray(value) && !extensionClasses.some((extClass) => value instanceof extClass)) {
            writeStruct2(value.toJSON ? value.toJSON() : value);
          } else pack2(value);
        } else
          pack2(value);
        let lastBundle = bundledStrings2;
        if (bundledStrings2)
          writeBundles(start, pack2, 0);
        if (referenceMap2 && referenceMap2.idsToInsert) {
          let idsToInsert = referenceMap2.idsToInsert.sort((a, b) => a.offset > b.offset ? 1 : -1);
          let i = idsToInsert.length;
          let incrementPosition = -1;
          while (lastBundle && i > 0) {
            let insertionPoint = idsToInsert[--i].offset + start;
            if (insertionPoint < lastBundle.stringsPosition + start && incrementPosition === -1)
              incrementPosition = 0;
            if (insertionPoint > lastBundle.position + start) {
              if (incrementPosition >= 0)
                incrementPosition += 6;
            } else {
              if (incrementPosition >= 0) {
                targetView.setUint32(
                  lastBundle.position + start,
                  targetView.getUint32(lastBundle.position + start) + incrementPosition
                );
                incrementPosition = -1;
              }
              lastBundle = lastBundle.previous;
              i++;
            }
          }
          if (incrementPosition >= 0 && lastBundle) {
            targetView.setUint32(
              lastBundle.position + start,
              targetView.getUint32(lastBundle.position + start) + incrementPosition
            );
          }
          position2 += idsToInsert.length * 6;
          if (position2 > safeEnd)
            makeRoom(position2);
          packr2.offset = position2;
          let serialized = insertIds(target.subarray(start, position2), idsToInsert);
          referenceMap2 = null;
          return serialized;
        }
        packr2.offset = position2;
        if (encodeOptions & REUSE_BUFFER_MODE) {
          target.start = start;
          target.end = position2;
          return target;
        }
        return target.subarray(start, position2);
      } catch (error) {
        encodingError = error;
        throw error;
      } finally {
        if (structures) {
          resetStructures();
          if (hasSharedUpdate && packr2.saveStructures) {
            let sharedLength = structures.sharedLength || 0;
            let returnBuffer = target.subarray(start, position2);
            let newSharedData = prepareStructures(structures, packr2);
            if (!encodingError) {
              if (packr2.saveStructures(newSharedData, newSharedData.isCompatible) === false) {
                return packr2.pack(value, encodeOptions);
              }
              packr2.lastNamedStructuresLength = sharedLength;
              if (target.length > 1073741824) target = null;
              return returnBuffer;
            }
          }
        }
        if (target.length > 1073741824) target = null;
        if (encodeOptions & RESET_BUFFER_MODE)
          position2 = start;
      }
    };
    const resetStructures = () => {
      if (serializationsSinceTransitionRebuild < 10)
        serializationsSinceTransitionRebuild++;
      let sharedLength = structures.sharedLength || 0;
      if (structures.length > sharedLength && !isSequential)
        structures.length = sharedLength;
      if (transitionsCount > 1e4) {
        structures.transitions = null;
        serializationsSinceTransitionRebuild = 0;
        transitionsCount = 0;
        if (recordIdsToRemove.length > 0)
          recordIdsToRemove = [];
      } else if (recordIdsToRemove.length > 0 && !isSequential) {
        for (let i = 0, l = recordIdsToRemove.length; i < l; i++) {
          recordIdsToRemove[i][RECORD_SYMBOL] = 0;
        }
        recordIdsToRemove = [];
      }
    };
    const packArray = (value) => {
      var length = value.length;
      if (length < 16) {
        target[position2++] = 144 | length;
      } else if (length < 65536) {
        target[position2++] = 220;
        target[position2++] = length >> 8;
        target[position2++] = length & 255;
      } else {
        target[position2++] = 221;
        targetView.setUint32(position2, length);
        position2 += 4;
      }
      for (let i = 0; i < length; i++) {
        pack2(value[i]);
      }
    };
    const pack2 = (value) => {
      if (position2 > safeEnd)
        target = makeRoom(position2);
      var type = typeof value;
      var length;
      if (type === "string") {
        let strLength = value.length;
        if (bundledStrings2 && strLength >= 4 && strLength < 4096) {
          if ((bundledStrings2.size += strLength) > MAX_BUNDLE_SIZE) {
            let extStart;
            let maxBytes2 = (bundledStrings2[0] ? bundledStrings2[0].length * 3 + bundledStrings2[1].length : 0) + 10;
            if (position2 + maxBytes2 > safeEnd)
              target = makeRoom(position2 + maxBytes2);
            let lastBundle;
            if (bundledStrings2.position) {
              lastBundle = bundledStrings2;
              target[position2] = 200;
              position2 += 3;
              target[position2++] = 98;
              extStart = position2 - start;
              position2 += 4;
              writeBundles(start, pack2, 0);
              targetView.setUint16(extStart + start - 3, position2 - start - extStart);
            } else {
              target[position2++] = 214;
              target[position2++] = 98;
              extStart = position2 - start;
              position2 += 4;
            }
            bundledStrings2 = ["", ""];
            bundledStrings2.previous = lastBundle;
            bundledStrings2.size = 0;
            bundledStrings2.position = extStart;
          }
          let twoByte = hasNonLatin.test(value);
          bundledStrings2[twoByte ? 0 : 1] += value;
          target[position2++] = 193;
          pack2(twoByte ? -strLength : strLength);
          return;
        }
        let headerSize;
        if (strLength < 32) {
          headerSize = 1;
        } else if (strLength < 256) {
          headerSize = 2;
        } else if (strLength < 65536) {
          headerSize = 3;
        } else {
          headerSize = 5;
        }
        let maxBytes = strLength * 3;
        if (position2 + maxBytes > safeEnd)
          target = makeRoom(position2 + maxBytes);
        if (strLength < 64 || !encodeUtf82) {
          let i, c1, c2, strPosition = position2 + headerSize;
          for (i = 0; i < strLength; i++) {
            c1 = value.charCodeAt(i);
            if (c1 < 128) {
              target[strPosition++] = c1;
            } else if (c1 < 2048) {
              target[strPosition++] = c1 >> 6 | 192;
              target[strPosition++] = c1 & 63 | 128;
            } else if ((c1 & 64512) === 55296 && ((c2 = value.charCodeAt(i + 1)) & 64512) === 56320) {
              c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
              i++;
              target[strPosition++] = c1 >> 18 | 240;
              target[strPosition++] = c1 >> 12 & 63 | 128;
              target[strPosition++] = c1 >> 6 & 63 | 128;
              target[strPosition++] = c1 & 63 | 128;
            } else {
              target[strPosition++] = c1 >> 12 | 224;
              target[strPosition++] = c1 >> 6 & 63 | 128;
              target[strPosition++] = c1 & 63 | 128;
            }
          }
          length = strPosition - position2 - headerSize;
        } else {
          length = encodeUtf82(value, position2 + headerSize);
        }
        if (length < 32) {
          target[position2++] = 160 | length;
        } else if (length < 256) {
          if (headerSize < 2) {
            target.copyWithin(position2 + 2, position2 + 1, position2 + 1 + length);
          }
          target[position2++] = 217;
          target[position2++] = length;
        } else if (length < 65536) {
          if (headerSize < 3) {
            target.copyWithin(position2 + 3, position2 + 2, position2 + 2 + length);
          }
          target[position2++] = 218;
          target[position2++] = length >> 8;
          target[position2++] = length & 255;
        } else {
          if (headerSize < 5) {
            target.copyWithin(position2 + 5, position2 + 3, position2 + 3 + length);
          }
          target[position2++] = 219;
          targetView.setUint32(position2, length);
          position2 += 4;
        }
        position2 += length;
      } else if (type === "number") {
        if (value >>> 0 === value) {
          if (value < 32 || value < 128 && this.useRecords === false || value < 64 && !this.randomAccessStructure) {
            target[position2++] = value;
          } else if (value < 256) {
            target[position2++] = 204;
            target[position2++] = value;
          } else if (value < 65536) {
            target[position2++] = 205;
            target[position2++] = value >> 8;
            target[position2++] = value & 255;
          } else {
            target[position2++] = 206;
            targetView.setUint32(position2, value);
            position2 += 4;
          }
        } else if (value >> 0 === value) {
          if (value >= -32) {
            target[position2++] = 256 + value;
          } else if (value >= -128) {
            target[position2++] = 208;
            target[position2++] = value + 256;
          } else if (value >= -32768) {
            target[position2++] = 209;
            targetView.setInt16(position2, value);
            position2 += 2;
          } else {
            target[position2++] = 210;
            targetView.setInt32(position2, value);
            position2 += 4;
          }
        } else {
          let useFloat32;
          if ((useFloat32 = this.useFloat32) > 0 && value < 4294967296 && value >= -2147483648) {
            target[position2++] = 202;
            targetView.setFloat32(position2, value);
            let xShifted;
            if (useFloat32 < 4 || // this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
            (xShifted = value * mult10[(target[position2] & 127) << 1 | target[position2 + 1] >> 7]) >> 0 === xShifted) {
              position2 += 4;
              return;
            } else
              position2--;
          }
          target[position2++] = 203;
          targetView.setFloat64(position2, value);
          position2 += 8;
        }
      } else if (type === "object" || type === "function") {
        if (!value)
          target[position2++] = 192;
        else {
          if (referenceMap2) {
            let referee = referenceMap2.get(value);
            if (referee) {
              if (!referee.id) {
                let idsToInsert = referenceMap2.idsToInsert || (referenceMap2.idsToInsert = []);
                referee.id = idsToInsert.push(referee);
              }
              target[position2++] = 214;
              target[position2++] = 112;
              targetView.setUint32(position2, referee.id);
              position2 += 4;
              return;
            } else
              referenceMap2.set(value, { offset: position2 - start });
          }
          let constructor = value.constructor;
          if (constructor === Object) {
            writeObject(value);
          } else if (constructor === Array) {
            packArray(value);
          } else if (constructor === Map) {
            if (this.mapAsEmptyObject) target[position2++] = 128;
            else {
              length = value.size;
              if (length < 16) {
                target[position2++] = 128 | length;
              } else if (length < 65536) {
                target[position2++] = 222;
                target[position2++] = length >> 8;
                target[position2++] = length & 255;
              } else {
                target[position2++] = 223;
                targetView.setUint32(position2, length);
                position2 += 4;
              }
              for (let [key, entryValue] of value) {
                pack2(key);
                pack2(entryValue);
              }
            }
          } else {
            for (let i = 0, l = extensions.length; i < l; i++) {
              let extensionClass = extensionClasses[i];
              if (value instanceof extensionClass) {
                let extension = extensions[i];
                if (extension.write) {
                  if (extension.type) {
                    target[position2++] = 212;
                    target[position2++] = extension.type;
                    target[position2++] = 0;
                  }
                  let writeResult = extension.write.call(this, value);
                  if (writeResult === value) {
                    if (Array.isArray(value)) {
                      packArray(value);
                    } else {
                      writeObject(value);
                    }
                  } else {
                    pack2(writeResult);
                  }
                  return;
                }
                let currentTarget = target;
                let currentTargetView = targetView;
                let currentPosition = position2;
                target = null;
                let result;
                try {
                  result = extension.pack.call(this, value, (size) => {
                    target = currentTarget;
                    currentTarget = null;
                    position2 += size;
                    if (position2 > safeEnd)
                      makeRoom(position2);
                    return {
                      target,
                      targetView,
                      position: position2 - size
                    };
                  }, pack2);
                } finally {
                  if (currentTarget) {
                    target = currentTarget;
                    targetView = currentTargetView;
                    position2 = currentPosition;
                    safeEnd = target.length - 10;
                  }
                }
                if (result) {
                  if (result.length + position2 > safeEnd)
                    makeRoom(result.length + position2);
                  position2 = writeExtensionData(result, target, position2, extension.type);
                }
                return;
              }
            }
            if (Array.isArray(value)) {
              packArray(value);
            } else {
              if (value.toJSON) {
                const json = value.toJSON();
                if (json !== value)
                  return pack2(json);
              }
              if (type === "function")
                return pack2(this.writeFunction && this.writeFunction(value));
              writeObject(value);
            }
          }
        }
      } else if (type === "boolean") {
        target[position2++] = value ? 195 : 194;
      } else if (type === "bigint") {
        if (value < 9223372036854776e3 && value >= -9223372036854776e3) {
          target[position2++] = 211;
          targetView.setBigInt64(position2, value);
        } else if (value < 18446744073709552e3 && value > 0) {
          target[position2++] = 207;
          targetView.setBigUint64(position2, value);
        } else {
          if (this.largeBigIntToFloat) {
            target[position2++] = 203;
            targetView.setFloat64(position2, Number(value));
          } else if (this.largeBigIntToString) {
            return pack2(value.toString());
          } else if (this.useBigIntExtension || this.moreTypes) {
            let empty = value < 0 ? BigInt(-1) : BigInt(0);
            let array;
            if (value >> BigInt(65536) === empty) {
              let mask = BigInt(18446744073709552e3) - BigInt(1);
              let chunks = [];
              while (true) {
                chunks.push(value & mask);
                if (value >> BigInt(63) === empty) break;
                value >>= BigInt(64);
              }
              array = new Uint8Array(new BigUint64Array(chunks).buffer);
              array.reverse();
            } else {
              let invert = value < 0;
              let string = (invert ? ~value : value).toString(16);
              if (string.length % 2) {
                string = "0" + string;
              } else if (parseInt(string.charAt(0), 16) >= 8) {
                string = "00" + string;
              }
              if (hasNodeBuffer) {
                array = Buffer.from(string, "hex");
              } else {
                array = new Uint8Array(string.length / 2);
                for (let i = 0; i < array.length; i++) {
                  array[i] = parseInt(string.slice(i * 2, i * 2 + 2), 16);
                }
              }
              if (invert) {
                for (let i = 0; i < array.length; i++) array[i] = ~array[i];
              }
            }
            if (array.length + position2 > safeEnd)
              makeRoom(array.length + position2);
            position2 = writeExtensionData(array, target, position2, 66);
            return;
          } else {
            throw new RangeError(value + " was too large to fit in MessagePack 64-bit integer format, use useBigIntExtension, or set largeBigIntToFloat to convert to float-64, or set largeBigIntToString to convert to string");
          }
        }
        position2 += 8;
      } else if (type === "undefined") {
        if (this.encodeUndefinedAsNil)
          target[position2++] = 192;
        else {
          target[position2++] = 212;
          target[position2++] = 0;
          target[position2++] = 0;
        }
      } else {
        throw new Error("Unknown type: " + type);
      }
    };
    const writePlainObject = this.variableMapSize || this.coercibleKeyAsNumber || this.skipValues ? (object) => {
      let keys;
      if (this.skipValues) {
        keys = [];
        for (let key2 in object) {
          if ((typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key2)) && !this.skipValues.includes(object[key2]))
            keys.push(key2);
        }
      } else {
        keys = Object.keys(object);
      }
      let length = keys.length;
      if (length < 16) {
        target[position2++] = 128 | length;
      } else if (length < 65536) {
        target[position2++] = 222;
        target[position2++] = length >> 8;
        target[position2++] = length & 255;
      } else {
        target[position2++] = 223;
        targetView.setUint32(position2, length);
        position2 += 4;
      }
      let key;
      if (this.coercibleKeyAsNumber) {
        for (let i = 0; i < length; i++) {
          key = keys[i];
          let num = Number(key);
          pack2(isNaN(num) ? key : num);
          pack2(object[key]);
        }
      } else {
        for (let i = 0; i < length; i++) {
          pack2(key = keys[i]);
          pack2(object[key]);
        }
      }
    } : (object) => {
      target[position2++] = 222;
      let objectOffset = position2 - start;
      position2 += 2;
      let size = 0;
      for (let key in object) {
        if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
          pack2(key);
          pack2(object[key]);
          size++;
        }
      }
      if (size > 65535) {
        throw new Error('Object is too large to serialize with fast 16-bit map size, use the "variableMapSize" option to serialize this object');
      }
      target[objectOffset++ + start] = size >> 8;
      target[objectOffset + start] = size & 255;
    };
    const writeRecord = this.useRecords === false ? writePlainObject : options.progressiveRecords && !useTwoByteRecords ? (
      // this is about 2% faster for highly stable structures, since it only requires one for-in loop (but much more expensive when new structure needs to be written)
      (object) => {
        let nextTransition, transition = structures.transitions || (structures.transitions = /* @__PURE__ */ Object.create(null));
        let objectOffset = position2++ - start;
        let wroteKeys;
        for (let key in object) {
          if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
            nextTransition = transition[key];
            if (nextTransition)
              transition = nextTransition;
            else {
              let keys = Object.keys(object);
              let lastTransition = transition;
              transition = structures.transitions;
              let newTransitions = 0;
              for (let i = 0, l = keys.length; i < l; i++) {
                let key2 = keys[i];
                nextTransition = transition[key2];
                if (!nextTransition) {
                  nextTransition = transition[key2] = /* @__PURE__ */ Object.create(null);
                  newTransitions++;
                }
                transition = nextTransition;
              }
              if (objectOffset + start + 1 == position2) {
                position2--;
                newRecord(transition, keys, newTransitions);
              } else
                insertNewRecord(transition, keys, objectOffset, newTransitions);
              wroteKeys = true;
              transition = lastTransition[key];
            }
            pack2(object[key]);
          }
        }
        if (!wroteKeys) {
          let recordId = transition[RECORD_SYMBOL];
          if (recordId)
            target[objectOffset + start] = recordId;
          else
            insertNewRecord(transition, Object.keys(object), objectOffset, 0);
        }
      }
    ) : (object) => {
      let nextTransition, transition = structures.transitions || (structures.transitions = /* @__PURE__ */ Object.create(null));
      let newTransitions = 0;
      for (let key in object) if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
        nextTransition = transition[key];
        if (!nextTransition) {
          nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
          newTransitions++;
        }
        transition = nextTransition;
      }
      let recordId = transition[RECORD_SYMBOL];
      if (recordId) {
        if (recordId >= 96 && useTwoByteRecords) {
          target[position2++] = ((recordId -= 96) & 31) + 96;
          target[position2++] = recordId >> 5;
        } else
          target[position2++] = recordId;
      } else {
        newRecord(transition, transition.__keys__ || Object.keys(object), newTransitions);
      }
      for (let key in object)
        if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
          pack2(object[key]);
        }
    };
    const checkUseRecords = typeof this.useRecords == "function" && this.useRecords;
    const writeObject = checkUseRecords ? (object) => {
      checkUseRecords(object) ? writeRecord(object) : writePlainObject(object);
    } : writeRecord;
    const makeRoom = (end) => {
      let newSize;
      if (end > 16777216) {
        if (end - start > MAX_BUFFER_SIZE)
          throw new Error("Packed buffer would be larger than maximum buffer size");
        newSize = Math.min(
          MAX_BUFFER_SIZE,
          Math.round(Math.max((end - start) * (end > 67108864 ? 1.25 : 2), 4194304) / 4096) * 4096
        );
      } else
        newSize = (Math.max(end - start << 2, target.length - 1) >> 12) + 1 << 12;
      let newBuffer = new ByteArrayAllocate(newSize);
      targetView = newBuffer.dataView || (newBuffer.dataView = new DataView(newBuffer.buffer, 0, newSize));
      end = Math.min(end, target.length);
      if (target.copy)
        target.copy(newBuffer, 0, start, end);
      else
        newBuffer.set(target.slice(start, end));
      position2 -= start;
      start = 0;
      safeEnd = newBuffer.length - 10;
      return target = newBuffer;
    };
    const newRecord = (transition, keys, newTransitions) => {
      let recordId = structures.nextId;
      if (!recordId)
        recordId = 64;
      if (recordId < sharedLimitId && this.shouldShareStructure && !this.shouldShareStructure(keys)) {
        recordId = structures.nextOwnId;
        if (!(recordId < maxStructureId))
          recordId = sharedLimitId;
        structures.nextOwnId = recordId + 1;
      } else {
        if (recordId >= maxStructureId)
          recordId = sharedLimitId;
        structures.nextId = recordId + 1;
      }
      let highByte = keys.highByte = recordId >= 96 && useTwoByteRecords ? recordId - 96 >> 5 : -1;
      transition[RECORD_SYMBOL] = recordId;
      transition.__keys__ = keys;
      structures[recordId - 64] = keys;
      if (recordId < sharedLimitId) {
        keys.isShared = true;
        structures.sharedLength = recordId - 63;
        hasSharedUpdate = true;
        if (highByte >= 0) {
          target[position2++] = (recordId & 31) + 96;
          target[position2++] = highByte;
        } else {
          target[position2++] = recordId;
        }
      } else {
        if (highByte >= 0) {
          target[position2++] = 213;
          target[position2++] = 114;
          target[position2++] = (recordId & 31) + 96;
          target[position2++] = highByte;
        } else {
          target[position2++] = 212;
          target[position2++] = 114;
          target[position2++] = recordId;
        }
        if (newTransitions)
          transitionsCount += serializationsSinceTransitionRebuild * newTransitions;
        if (recordIdsToRemove.length >= maxOwnStructures)
          recordIdsToRemove.shift()[RECORD_SYMBOL] = 0;
        recordIdsToRemove.push(transition);
        pack2(keys);
      }
    };
    const insertNewRecord = (transition, keys, insertionOffset, newTransitions) => {
      let mainTarget = target;
      let mainPosition = position2;
      let mainSafeEnd = safeEnd;
      let mainStart = start;
      target = keysTarget;
      position2 = 0;
      start = 0;
      if (!target)
        keysTarget = target = new ByteArrayAllocate(8192);
      safeEnd = target.length - 10;
      newRecord(transition, keys, newTransitions);
      keysTarget = target;
      let keysPosition = position2;
      target = mainTarget;
      position2 = mainPosition;
      safeEnd = mainSafeEnd;
      start = mainStart;
      if (keysPosition > 1) {
        let newEnd = position2 + keysPosition - 1;
        if (newEnd > safeEnd)
          makeRoom(newEnd);
        let insertionPosition = insertionOffset + start;
        target.copyWithin(insertionPosition + keysPosition, insertionPosition + 1, position2);
        target.set(keysTarget.slice(0, keysPosition), insertionPosition);
        position2 = newEnd;
      } else {
        target[insertionOffset + start] = keysTarget[0];
      }
    };
    const writeStruct2 = (object) => {
      let newPosition = writeStructSlots(object, target, start, position2, structures, makeRoom, (value, newPosition2, notifySharedUpdate) => {
        if (notifySharedUpdate)
          return hasSharedUpdate = true;
        position2 = newPosition2;
        let startTarget = target;
        pack2(value);
        resetStructures();
        if (startTarget !== target) {
          return { position: position2, targetView, target };
        }
        return position2;
      }, this);
      if (newPosition === 0)
        return writeObject(object);
      position2 = newPosition;
    };
  }
  useBuffer(buffer) {
    target = buffer;
    target.dataView || (target.dataView = new DataView(target.buffer, target.byteOffset, target.byteLength));
    targetView = target.dataView;
    position2 = 0;
  }
  set position(value) {
    position2 = value;
  }
  get position() {
    return position2;
  }
  clearSharedData() {
    if (this.structures)
      this.structures = [];
    if (this.typedStructs)
      this.typedStructs = [];
  }
};
extensionClasses = [Date, Set, Error, RegExp, ArrayBuffer, Object.getPrototypeOf(Uint8Array.prototype).constructor, DataView, C1Type];
extensions = [{
  pack(date, allocateForWrite, pack2) {
    let seconds = date.getTime() / 1e3;
    if ((this.useTimestamp32 || date.getMilliseconds() === 0) && seconds >= 0 && seconds < 4294967296) {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(6);
      target2[position3++] = 214;
      target2[position3++] = 255;
      targetView2.setUint32(position3, seconds);
    } else if (seconds > 0 && seconds < 4294967296) {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(10);
      target2[position3++] = 215;
      target2[position3++] = 255;
      targetView2.setUint32(position3, date.getMilliseconds() * 4e6 + (seconds / 1e3 / 4294967296 >> 0));
      targetView2.setUint32(position3 + 4, seconds);
    } else if (isNaN(seconds)) {
      if (this.onInvalidDate) {
        allocateForWrite(0);
        return pack2(this.onInvalidDate());
      }
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(3);
      target2[position3++] = 212;
      target2[position3++] = 255;
      target2[position3++] = 255;
    } else {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(15);
      target2[position3++] = 199;
      target2[position3++] = 12;
      target2[position3++] = 255;
      targetView2.setUint32(position3, date.getMilliseconds() * 1e6);
      targetView2.setBigInt64(position3 + 4, BigInt(Math.floor(seconds)));
    }
  }
}, {
  pack(set, allocateForWrite, pack2) {
    if (this.setAsEmptyObject) {
      allocateForWrite(0);
      return pack2({});
    }
    let array = Array.from(set);
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 115;
      target2[position3++] = 0;
    }
    pack2(array);
  }
}, {
  pack(error, allocateForWrite, pack2) {
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 101;
      target2[position3++] = 0;
    }
    pack2([error.name, error.message, error.cause]);
  }
}, {
  pack(regex, allocateForWrite, pack2) {
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 120;
      target2[position3++] = 0;
    }
    pack2([regex.source, regex.flags]);
  }
}, {
  pack(arrayBuffer, allocateForWrite) {
    if (this.moreTypes)
      writeExtBuffer(arrayBuffer, 16, allocateForWrite);
    else
      writeBuffer(hasNodeBuffer ? Buffer.from(arrayBuffer) : new Uint8Array(arrayBuffer), allocateForWrite);
  }
}, {
  pack(typedArray, allocateForWrite) {
    let constructor = typedArray.constructor;
    if (constructor !== ByteArray && this.moreTypes)
      writeExtBuffer(typedArray, typedArrays.indexOf(constructor.name), allocateForWrite);
    else
      writeBuffer(typedArray, allocateForWrite);
  }
}, {
  pack(arrayBuffer, allocateForWrite) {
    if (this.moreTypes)
      writeExtBuffer(arrayBuffer, 17, allocateForWrite);
    else
      writeBuffer(hasNodeBuffer ? Buffer.from(arrayBuffer) : new Uint8Array(arrayBuffer), allocateForWrite);
  }
}, {
  pack(c1, allocateForWrite) {
    let { target: target2, position: position3 } = allocateForWrite(1);
    target2[position3] = 193;
  }
}];
function writeExtBuffer(typedArray, type, allocateForWrite, encode2) {
  let length = typedArray.byteLength;
  if (length + 1 < 256) {
    var { target: target2, position: position3 } = allocateForWrite(4 + length);
    target2[position3++] = 199;
    target2[position3++] = length + 1;
  } else if (length + 1 < 65536) {
    var { target: target2, position: position3 } = allocateForWrite(5 + length);
    target2[position3++] = 200;
    target2[position3++] = length + 1 >> 8;
    target2[position3++] = length + 1 & 255;
  } else {
    var { target: target2, position: position3, targetView: targetView2 } = allocateForWrite(7 + length);
    target2[position3++] = 201;
    targetView2.setUint32(position3, length + 1);
    position3 += 4;
  }
  target2[position3++] = 116;
  target2[position3++] = type;
  if (!typedArray.buffer) typedArray = new Uint8Array(typedArray);
  target2.set(new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength), position3);
}
function writeBuffer(buffer, allocateForWrite) {
  let length = buffer.byteLength;
  var target2, position3;
  if (length < 256) {
    var { target: target2, position: position3 } = allocateForWrite(length + 2);
    target2[position3++] = 196;
    target2[position3++] = length;
  } else if (length < 65536) {
    var { target: target2, position: position3 } = allocateForWrite(length + 3);
    target2[position3++] = 197;
    target2[position3++] = length >> 8;
    target2[position3++] = length & 255;
  } else {
    var { target: target2, position: position3, targetView: targetView2 } = allocateForWrite(length + 5);
    target2[position3++] = 198;
    targetView2.setUint32(position3, length);
    position3 += 4;
  }
  target2.set(buffer, position3);
}
function writeExtensionData(result, target2, position3, type) {
  let length = result.length;
  switch (length) {
    case 1:
      target2[position3++] = 212;
      break;
    case 2:
      target2[position3++] = 213;
      break;
    case 4:
      target2[position3++] = 214;
      break;
    case 8:
      target2[position3++] = 215;
      break;
    case 16:
      target2[position3++] = 216;
      break;
    default:
      if (length < 256) {
        target2[position3++] = 199;
        target2[position3++] = length;
      } else if (length < 65536) {
        target2[position3++] = 200;
        target2[position3++] = length >> 8;
        target2[position3++] = length & 255;
      } else {
        target2[position3++] = 201;
        target2[position3++] = length >> 24;
        target2[position3++] = length >> 16 & 255;
        target2[position3++] = length >> 8 & 255;
        target2[position3++] = length & 255;
      }
  }
  target2[position3++] = type;
  target2.set(result, position3);
  position3 += length;
  return position3;
}
function insertIds(serialized, idsToInsert) {
  let nextId;
  let distanceToMove = idsToInsert.length * 6;
  let lastEnd = serialized.length - distanceToMove;
  while (nextId = idsToInsert.pop()) {
    let offset = nextId.offset;
    let id = nextId.id;
    serialized.copyWithin(offset + distanceToMove, offset, lastEnd);
    distanceToMove -= 6;
    let position3 = offset + distanceToMove;
    serialized[position3++] = 214;
    serialized[position3++] = 105;
    serialized[position3++] = id >> 24;
    serialized[position3++] = id >> 16 & 255;
    serialized[position3++] = id >> 8 & 255;
    serialized[position3++] = id & 255;
    lastEnd = offset;
  }
  return serialized;
}
function writeBundles(start, pack2, incrementPosition) {
  if (bundledStrings2.length > 0) {
    targetView.setUint32(bundledStrings2.position + start, position2 + incrementPosition - bundledStrings2.position - start);
    bundledStrings2.stringsPosition = position2 - start;
    let writeStrings = bundledStrings2;
    bundledStrings2 = null;
    pack2(writeStrings[0]);
    pack2(writeStrings[1]);
  }
}
function prepareStructures(structures, packr2) {
  structures.isCompatible = (existingStructures) => {
    let compatible = !existingStructures || (packr2.lastNamedStructuresLength || 0) === existingStructures.length;
    if (!compatible)
      packr2._mergeStructures(existingStructures);
    return compatible;
  };
  return structures;
}
function setWriteStructSlots(writeSlots, makeStructures) {
  writeStructSlots = writeSlots;
  prepareStructures = makeStructures;
}
var defaultPackr = new Packr({ useRecords: false });
var pack = defaultPackr.pack;
var encode = defaultPackr.pack;
var { NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } = FLOAT32_OPTIONS;
var REUSE_BUFFER_MODE = 512;
var RESET_BUFFER_MODE = 1024;
var RESERVE_START_SPACE = 2048;

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr/1.11.8/46dd53c5eb8ac19961b8dcfdc6cb3c46229e7d03ddda6f31cf5a680868f31b80/node_modules/msgpackr/struct.js
var ASCII = 3;
var NUMBER = 0;
var UTF8 = 2;
var OBJECT_DATA = 1;
var DATE = 16;
var TYPE_NAMES = ["num", "object", "string", "ascii"];
TYPE_NAMES[DATE] = "date";
var float32Headers = [false, true, true, false, false, true, true, false];
var evalSupported;
try {
  new Function("");
  evalSupported = true;
} catch (error) {
}
var updatedPosition;
var hasNodeBuffer2 = typeof Buffer !== "undefined";
var textEncoder2;
var currentSource;
try {
  textEncoder2 = new TextEncoder();
} catch (error) {
}
var encodeUtf8 = hasNodeBuffer2 ? function(target2, string, position3) {
  return target2.utf8Write(string, position3, target2.byteLength - position3);
} : textEncoder2 && textEncoder2.encodeInto ? function(target2, string, position3) {
  return textEncoder2.encodeInto(string, target2.subarray(position3)).written;
} : false;
setWriteStructSlots(writeStruct, prepareStructures2);
function writeStruct(object, target2, encodingStart, position3, structures, makeRoom, pack2, packr2) {
  let typedStructs = packr2.typedStructs || (packr2.typedStructs = []);
  let targetView2 = target2.dataView;
  let refsStartPosition = (typedStructs.lastStringStart || 100) + position3;
  let safeEnd2 = target2.length - 10;
  let start = position3;
  if (position3 > safeEnd2) {
    target2 = makeRoom(position3);
    targetView2 = target2.dataView;
    position3 -= encodingStart;
    start -= encodingStart;
    refsStartPosition -= encodingStart;
    encodingStart = 0;
    safeEnd2 = target2.length - 10;
  }
  let refOffset, refPosition = refsStartPosition;
  let transition = typedStructs.transitions || (typedStructs.transitions = /* @__PURE__ */ Object.create(null));
  let nextId = typedStructs.nextId || typedStructs.length;
  let headerSize = nextId < 15 ? 1 : nextId < 240 ? 2 : nextId < 61440 ? 3 : nextId < 15728640 ? 4 : 0;
  if (headerSize === 0)
    return 0;
  position3 += headerSize;
  let queuedReferences = [];
  let usedAscii0;
  let keyIndex = 0;
  for (let key in object) {
    let value = object[key];
    let nextTransition = transition[key];
    if (!nextTransition) {
      transition[key] = nextTransition = {
        key,
        parent: transition,
        enumerationOffset: 0,
        ascii0: null,
        ascii8: null,
        num8: null,
        string16: null,
        object16: null,
        num32: null,
        float64: null,
        date64: null
      };
    }
    if (position3 > safeEnd2) {
      target2 = makeRoom(position3);
      targetView2 = target2.dataView;
      position3 -= encodingStart;
      start -= encodingStart;
      refsStartPosition -= encodingStart;
      refPosition -= encodingStart;
      encodingStart = 0;
      safeEnd2 = target2.length - 10;
    }
    switch (typeof value) {
      case "number":
        let number = value;
        if (nextId < 200 || !nextTransition.num64) {
          if (number >> 0 === number && number < 536870912 && number > -520093696) {
            if (number < 246 && number >= 0 && (nextTransition.num8 && !(nextId > 200 && nextTransition.num32) || number < 32 && !nextTransition.num32)) {
              transition = nextTransition.num8 || createTypeTransition(nextTransition, NUMBER, 1);
              target2[position3++] = number;
            } else {
              transition = nextTransition.num32 || createTypeTransition(nextTransition, NUMBER, 4);
              targetView2.setUint32(position3, number, true);
              position3 += 4;
            }
            break;
          } else if (number < 4294967296 && number >= -2147483648) {
            targetView2.setFloat32(position3, number, true);
            if (float32Headers[target2[position3 + 3] >>> 5]) {
              let xShifted;
              if ((xShifted = number * mult10[(target2[position3 + 3] & 127) << 1 | target2[position3 + 2] >> 7]) >> 0 === xShifted) {
                transition = nextTransition.num32 || createTypeTransition(nextTransition, NUMBER, 4);
                position3 += 4;
                break;
              }
            }
          }
        }
        transition = nextTransition.num64 || createTypeTransition(nextTransition, NUMBER, 8);
        targetView2.setFloat64(position3, number, true);
        position3 += 8;
        break;
      case "string":
        let strLength = value.length;
        refOffset = refPosition - refsStartPosition;
        if ((strLength << 2) + refPosition > safeEnd2) {
          target2 = makeRoom((strLength << 2) + refPosition);
          targetView2 = target2.dataView;
          position3 -= encodingStart;
          start -= encodingStart;
          refsStartPosition -= encodingStart;
          refPosition -= encodingStart;
          encodingStart = 0;
          safeEnd2 = target2.length - 10;
        }
        if (strLength > 65280 + refOffset >> 2) {
          queuedReferences.push(key, value, position3 - start);
          break;
        }
        let isNotAscii;
        let strStart = refPosition;
        if (strLength < 64) {
          let i, c1, c2;
          for (i = 0; i < strLength; i++) {
            c1 = value.charCodeAt(i);
            if (c1 < 128) {
              target2[refPosition++] = c1;
            } else if (c1 < 2048) {
              isNotAscii = true;
              target2[refPosition++] = c1 >> 6 | 192;
              target2[refPosition++] = c1 & 63 | 128;
            } else if ((c1 & 64512) === 55296 && ((c2 = value.charCodeAt(i + 1)) & 64512) === 56320) {
              isNotAscii = true;
              c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
              i++;
              target2[refPosition++] = c1 >> 18 | 240;
              target2[refPosition++] = c1 >> 12 & 63 | 128;
              target2[refPosition++] = c1 >> 6 & 63 | 128;
              target2[refPosition++] = c1 & 63 | 128;
            } else {
              isNotAscii = true;
              target2[refPosition++] = c1 >> 12 | 224;
              target2[refPosition++] = c1 >> 6 & 63 | 128;
              target2[refPosition++] = c1 & 63 | 128;
            }
          }
        } else {
          refPosition += encodeUtf8(target2, value, refPosition);
          isNotAscii = refPosition - strStart > strLength;
        }
        if (refOffset < 160 || refOffset < 246 && (nextTransition.ascii8 || nextTransition.string8)) {
          if (isNotAscii) {
            if (!(transition = nextTransition.string8)) {
              if (typedStructs.length > 10 && (transition = nextTransition.ascii8)) {
                transition.__type = UTF8;
                nextTransition.ascii8 = null;
                nextTransition.string8 = transition;
                pack2(null, 0, true);
              } else {
                transition = createTypeTransition(nextTransition, UTF8, 1);
              }
            }
          } else if (refOffset === 0 && !usedAscii0) {
            usedAscii0 = true;
            transition = nextTransition.ascii0 || createTypeTransition(nextTransition, ASCII, 0);
            break;
          } else if (!(transition = nextTransition.ascii8) && !(typedStructs.length > 10 && (transition = nextTransition.string8)))
            transition = createTypeTransition(nextTransition, ASCII, 1);
          target2[position3++] = refOffset;
        } else {
          transition = nextTransition.string16 || createTypeTransition(nextTransition, UTF8, 2);
          targetView2.setUint16(position3, refOffset, true);
          position3 += 2;
        }
        break;
      case "object":
        if (value) {
          if (value.constructor === Date) {
            transition = nextTransition.date64 || createTypeTransition(nextTransition, DATE, 8);
            targetView2.setFloat64(position3, value.getTime(), true);
            position3 += 8;
          } else {
            queuedReferences.push(key, value, keyIndex);
          }
          break;
        } else {
          nextTransition = anyType(nextTransition, position3, targetView2, -10);
          if (nextTransition) {
            transition = nextTransition;
            position3 = updatedPosition;
          } else queuedReferences.push(key, value, keyIndex);
        }
        break;
      case "boolean":
        transition = nextTransition.num8 || nextTransition.ascii8 || createTypeTransition(nextTransition, NUMBER, 1);
        target2[position3++] = value ? 249 : 248;
        break;
      case "undefined":
        nextTransition = anyType(nextTransition, position3, targetView2, -9);
        if (nextTransition) {
          transition = nextTransition;
          position3 = updatedPosition;
        } else queuedReferences.push(key, value, keyIndex);
        break;
      default:
        queuedReferences.push(key, value, keyIndex);
    }
    keyIndex++;
  }
  for (let i = 0, l = queuedReferences.length; i < l; ) {
    let key = queuedReferences[i++];
    let value = queuedReferences[i++];
    let propertyIndex = queuedReferences[i++];
    let nextTransition = transition[key];
    if (!nextTransition) {
      transition[key] = nextTransition = {
        key,
        parent: transition,
        enumerationOffset: propertyIndex - keyIndex,
        ascii0: null,
        ascii8: null,
        num8: null,
        string16: null,
        object16: null,
        num32: null,
        float64: null
      };
    }
    let newPosition;
    if (value) {
      let size;
      refOffset = refPosition - refsStartPosition;
      if (refOffset < 65280) {
        transition = nextTransition.object16;
        if (transition)
          size = 2;
        else if (transition = nextTransition.object32)
          size = 4;
        else {
          transition = createTypeTransition(nextTransition, OBJECT_DATA, 2);
          size = 2;
        }
      } else {
        transition = nextTransition.object32 || createTypeTransition(nextTransition, OBJECT_DATA, 4);
        size = 4;
      }
      newPosition = pack2(value, refPosition);
      if (typeof newPosition === "object") {
        refPosition = newPosition.position;
        targetView2 = newPosition.targetView;
        target2 = newPosition.target;
        refsStartPosition -= encodingStart;
        position3 -= encodingStart;
        start -= encodingStart;
        encodingStart = 0;
      } else
        refPosition = newPosition;
      if (size === 2) {
        targetView2.setUint16(position3, refOffset, true);
        position3 += 2;
      } else {
        targetView2.setUint32(position3, refOffset, true);
        position3 += 4;
      }
    } else {
      transition = nextTransition.object16 || createTypeTransition(nextTransition, OBJECT_DATA, 2);
      targetView2.setInt16(position3, value === null ? -10 : -9, true);
      position3 += 2;
    }
    keyIndex++;
  }
  let recordId = transition[RECORD_SYMBOL];
  if (recordId == null) {
    recordId = packr2.typedStructs.length;
    let structure = [];
    let nextTransition = transition;
    let key, type;
    while ((type = nextTransition.__type) !== void 0) {
      let size = nextTransition.__size;
      nextTransition = nextTransition.__parent;
      key = nextTransition.key;
      let property = [type, size, key];
      if (nextTransition.enumerationOffset)
        property.push(nextTransition.enumerationOffset);
      structure.push(property);
      nextTransition = nextTransition.parent;
    }
    structure.reverse();
    transition[RECORD_SYMBOL] = recordId;
    packr2.typedStructs[recordId] = structure;
    pack2(null, 0, true);
  }
  switch (headerSize) {
    case 1:
      if (recordId >= 16) return 0;
      target2[start] = recordId + 32;
      break;
    case 2:
      if (recordId >= 256) return 0;
      target2[start] = 56;
      target2[start + 1] = recordId;
      break;
    case 3:
      if (recordId >= 65536) return 0;
      target2[start] = 57;
      targetView2.setUint16(start + 1, recordId, true);
      break;
    case 4:
      if (recordId >= 16777216) return 0;
      targetView2.setUint32(start, (recordId << 8) + 58, true);
      break;
  }
  if (position3 < refsStartPosition) {
    if (refsStartPosition === refPosition)
      return position3;
    target2.copyWithin(position3, refsStartPosition, refPosition);
    refPosition += position3 - refsStartPosition;
    typedStructs.lastStringStart = position3 - start;
  } else if (position3 > refsStartPosition) {
    if (refsStartPosition === refPosition)
      return position3;
    typedStructs.lastStringStart = position3 - start;
    return writeStruct(object, target2, encodingStart, start, structures, makeRoom, pack2, packr2);
  }
  return refPosition;
}
function anyType(transition, position3, targetView2, value) {
  let nextTransition;
  if (nextTransition = transition.ascii8 || transition.num8) {
    targetView2.setInt8(position3, value, true);
    updatedPosition = position3 + 1;
    return nextTransition;
  }
  if (nextTransition = transition.string16 || transition.object16) {
    targetView2.setInt16(position3, value, true);
    updatedPosition = position3 + 2;
    return nextTransition;
  }
  if (nextTransition = transition.num32) {
    targetView2.setUint32(position3, 3758096640 + value, true);
    updatedPosition = position3 + 4;
    return nextTransition;
  }
  if (nextTransition = transition.num64) {
    targetView2.setFloat64(position3, NaN, true);
    targetView2.setInt8(position3, value);
    updatedPosition = position3 + 8;
    return nextTransition;
  }
  updatedPosition = position3;
  return;
}
function createTypeTransition(transition, type, size) {
  let typeName = TYPE_NAMES[type] + (size << 3);
  let newTransition = transition[typeName] || (transition[typeName] = /* @__PURE__ */ Object.create(null));
  newTransition.__type = type;
  newTransition.__size = size;
  newTransition.__parent = transition;
  return newTransition;
}
function onLoadedStructures2(sharedData) {
  if (!(sharedData instanceof Map))
    return sharedData;
  let typed = sharedData.get("typed") || [];
  if (Object.isFrozen(typed))
    typed = typed.map((structure) => structure.slice(0));
  let named = sharedData.get("named");
  let transitions = /* @__PURE__ */ Object.create(null);
  for (let i = 0, l = typed.length; i < l; i++) {
    let structure = typed[i];
    let transition = transitions;
    for (let [type, size, key] of structure) {
      let nextTransition = transition[key];
      if (!nextTransition) {
        transition[key] = nextTransition = {
          key,
          parent: transition,
          enumerationOffset: 0,
          ascii0: null,
          ascii8: null,
          num8: null,
          string16: null,
          object16: null,
          num32: null,
          float64: null,
          date64: null
        };
      }
      transition = createTypeTransition(nextTransition, type, size);
    }
    transition[RECORD_SYMBOL] = i;
  }
  typed.transitions = transitions;
  this.typedStructs = typed;
  this.lastTypedStructuresLength = typed.length;
  return named;
}
var sourceSymbol = /* @__PURE__ */ Symbol.for("source");
function readStruct2(src2, position3, srcEnd2, unpackr) {
  let recordId = src2[position3++] - 32;
  if (recordId >= 24) {
    switch (recordId) {
      case 24:
        recordId = src2[position3++];
        break;
      // little endian:
      case 25:
        recordId = src2[position3++] + (src2[position3++] << 8);
        break;
      case 26:
        recordId = src2[position3++] + (src2[position3++] << 8) + (src2[position3++] << 16);
        break;
      case 27:
        recordId = src2[position3++] + (src2[position3++] << 8) + (src2[position3++] << 16) + (src2[position3++] << 24);
        break;
    }
  }
  let structure = unpackr.typedStructs && unpackr.typedStructs[recordId];
  if (!structure) {
    src2 = Uint8Array.prototype.slice.call(src2, position3, srcEnd2);
    srcEnd2 -= position3;
    position3 = 0;
    if (!unpackr.getStructures)
      throw new Error(`Reference to shared structure ${recordId} without getStructures method`);
    unpackr._mergeStructures(unpackr.getStructures());
    if (!unpackr.typedStructs)
      throw new Error("Could not find any shared typed structures");
    unpackr.lastTypedStructuresLength = unpackr.typedStructs.length;
    structure = unpackr.typedStructs[recordId];
    if (!structure)
      throw new Error("Could not find typed structure " + recordId);
  }
  var construct = structure.construct;
  var fullConstruct = structure.fullConstruct;
  if (!construct) {
    construct = structure.construct = function LazyObject() {
    };
    fullConstruct = structure.fullConstruct = function LoadedObject() {
    };
    fullConstruct.prototype = unpackr.structPrototype || {};
    var prototype = construct.prototype = unpackr.structPrototype ? Object.create(unpackr.structPrototype) : {};
    let properties = [];
    let currentOffset = 0;
    let lastRefProperty;
    for (let i = 0, l = structure.length; i < l; i++) {
      let definition = structure[i];
      let [type, size, key, enumerationOffset] = definition;
      if (key === "__proto__")
        key = "__proto_";
      let property = {
        key,
        offset: currentOffset
      };
      if (enumerationOffset)
        properties.splice(i + enumerationOffset, 0, property);
      else
        properties.push(property);
      let getRef;
      switch (size) {
        // TODO: Move into a separate function
        case 0:
          getRef = () => 0;
          break;
        case 1:
          getRef = (source, position4) => {
            let ref = source.bytes[position4 + property.offset];
            return ref >= 246 ? toConstant(ref) : ref;
          };
          break;
        case 2:
          getRef = (source, position4) => {
            let src3 = source.bytes;
            let dataView2 = src3.dataView || (src3.dataView = new DataView(src3.buffer, src3.byteOffset, src3.byteLength));
            let ref = dataView2.getUint16(position4 + property.offset, true);
            return ref >= 65280 ? toConstant(ref & 255) : ref;
          };
          break;
        case 4:
          getRef = (source, position4) => {
            let src3 = source.bytes;
            let dataView2 = src3.dataView || (src3.dataView = new DataView(src3.buffer, src3.byteOffset, src3.byteLength));
            let ref = dataView2.getUint32(position4 + property.offset, true);
            return ref >= 4294967040 ? toConstant(ref & 255) : ref;
          };
          break;
      }
      property.getRef = getRef;
      currentOffset += size;
      let get;
      switch (type) {
        case ASCII:
          if (lastRefProperty && !lastRefProperty.next)
            lastRefProperty.next = property;
          lastRefProperty = property;
          property.multiGetCount = 0;
          get = function(source) {
            let src3 = source.bytes;
            let position4 = source.position;
            let refStart = currentOffset + position4;
            let ref = getRef(source, position4);
            if (typeof ref !== "number") return ref;
            let end, next = property.next;
            while (next) {
              end = next.getRef(source, position4);
              if (typeof end === "number")
                break;
              else
                end = null;
              next = next.next;
            }
            if (end == null)
              end = source.bytesEnd - refStart;
            if (source.srcString) {
              return source.srcString.slice(ref, end);
            }
            return readString(src3, ref + refStart, end - ref);
          };
          break;
        case UTF8:
        case OBJECT_DATA:
          if (lastRefProperty && !lastRefProperty.next)
            lastRefProperty.next = property;
          lastRefProperty = property;
          get = function(source) {
            let position4 = source.position;
            let refStart = currentOffset + position4;
            let ref = getRef(source, position4);
            if (typeof ref !== "number") return ref;
            let src3 = source.bytes;
            let end, next = property.next;
            while (next) {
              end = next.getRef(source, position4);
              if (typeof end === "number")
                break;
              else
                end = null;
              next = next.next;
            }
            if (end == null)
              end = source.bytesEnd - refStart;
            if (type === UTF8) {
              return src3.toString("utf8", ref + refStart, end + refStart);
            } else {
              currentSource = source;
              try {
                return unpackr.unpack(src3, { start: ref + refStart, end: end + refStart });
              } finally {
                currentSource = null;
              }
            }
          };
          break;
        case NUMBER:
          switch (size) {
            case 4:
              get = function(source) {
                let src3 = source.bytes;
                let dataView2 = src3.dataView || (src3.dataView = new DataView(src3.buffer, src3.byteOffset, src3.byteLength));
                let position4 = source.position + property.offset;
                let value = dataView2.getInt32(position4, true);
                if (value < 536870912) {
                  if (value > -520093696)
                    return value;
                  if (value > -536870912)
                    return toConstant(value & 255);
                }
                let fValue = dataView2.getFloat32(position4, true);
                let multiplier = mult10[(src3[position4 + 3] & 127) << 1 | src3[position4 + 2] >> 7];
                return (multiplier * fValue + (fValue > 0 ? 0.5 : -0.5) >> 0) / multiplier;
              };
              break;
            case 8:
              get = function(source) {
                let src3 = source.bytes;
                let dataView2 = src3.dataView || (src3.dataView = new DataView(src3.buffer, src3.byteOffset, src3.byteLength));
                let value = dataView2.getFloat64(source.position + property.offset, true);
                if (isNaN(value)) {
                  let byte = src3[source.position + property.offset];
                  if (byte >= 246)
                    return toConstant(byte);
                }
                return value;
              };
              break;
            case 1:
              get = function(source) {
                let src3 = source.bytes;
                let value = src3[source.position + property.offset];
                return value < 246 ? value : toConstant(value);
              };
              break;
          }
          break;
        case DATE:
          get = function(source) {
            let src3 = source.bytes;
            let dataView2 = src3.dataView || (src3.dataView = new DataView(src3.buffer, src3.byteOffset, src3.byteLength));
            return new Date(dataView2.getFloat64(source.position + property.offset, true));
          };
          break;
      }
      property.get = get;
    }
    if (evalSupported) {
      let objectLiteralProperties = [];
      let args = [];
      let i = 0;
      let hasInheritedProperties;
      for (let property of properties) {
        if (unpackr.alwaysLazyProperty && unpackr.alwaysLazyProperty(property.key)) {
          hasInheritedProperties = true;
          continue;
        }
        Object.defineProperty(prototype, property.key, { get: withSource(property.get), enumerable: true });
        let valueFunction = "v" + i++;
        args.push(valueFunction);
        objectLiteralProperties.push("o[" + JSON.stringify(property.key) + "]=" + valueFunction + "(s)");
      }
      if (hasInheritedProperties) {
        objectLiteralProperties.push("__proto__:this");
      }
      let toObject = new Function(...args, "var c=this;return function(s){var o=new c();" + objectLiteralProperties.join(";") + ";return o;}").apply(fullConstruct, properties.map((prop) => prop.get));
      Object.defineProperty(prototype, "toJSON", {
        value(omitUnderscoredProperties) {
          return toObject.call(this, this[sourceSymbol]);
        }
      });
    } else {
      Object.defineProperty(prototype, "toJSON", {
        value(omitUnderscoredProperties) {
          let resolved = {};
          for (let i = 0, l = properties.length; i < l; i++) {
            let key = properties[i].key;
            resolved[key] = this[key];
          }
          return resolved;
        }
        // not enumerable or anything
      });
    }
  }
  var instance = new construct();
  instance[sourceSymbol] = {
    bytes: src2,
    position: position3,
    srcString: "",
    bytesEnd: srcEnd2
  };
  return instance;
}
function toConstant(code) {
  switch (code) {
    case 246:
      return null;
    case 247:
      return void 0;
    case 248:
      return false;
    case 249:
      return true;
  }
  throw new Error("Unknown constant");
}
function withSource(get) {
  return function() {
    return get(this[sourceSymbol]);
  };
}
function saveState2() {
  if (currentSource) {
    currentSource.bytes = Uint8Array.prototype.slice.call(currentSource.bytes, currentSource.position, currentSource.bytesEnd);
    currentSource.position = 0;
    currentSource.bytesEnd = currentSource.bytes.length;
  }
}
function prepareStructures2(structures, packr2) {
  if (packr2.typedStructs) {
    let structMap = /* @__PURE__ */ new Map();
    structMap.set("named", structures);
    structMap.set("typed", packr2.typedStructs);
    structures = structMap;
  }
  let lastTypedStructuresLength = packr2.lastTypedStructuresLength || 0;
  structures.isCompatible = (existing) => {
    let compatible = true;
    if (existing instanceof Map) {
      let named = existing.get("named") || [];
      if (named.length !== (packr2.lastNamedStructuresLength || 0))
        compatible = false;
      let typed = existing.get("typed") || [];
      if (typed.length !== lastTypedStructuresLength)
        compatible = false;
    } else if (existing instanceof Array || Array.isArray(existing)) {
      if (existing.length !== (packr2.lastNamedStructuresLength || 0))
        compatible = false;
    }
    if (!compatible)
      packr2._mergeStructures(existing);
    return compatible;
  };
  packr2.lastTypedStructuresLength = packr2.typedStructs && packr2.typedStructs.length;
  return structures;
}
setReadStruct(readStruct2, onLoadedStructures2, saveState2);

// ../../../../setup-pnpm/node_modules/.bin/store/v11/links/@/msgpackr/1.11.8/46dd53c5eb8ac19961b8dcfdc6cb3c46229e7d03ddda6f31cf5a680868f31b80/node_modules/msgpackr/node-index.js
import { createRequire } from "module";
var nativeAccelerationDisabled = process.env.MSGPACKR_NATIVE_ACCELERATION_DISABLED !== void 0 && process.env.MSGPACKR_NATIVE_ACCELERATION_DISABLED.toLowerCase() === "true";
if (!nativeAccelerationDisabled) {
  let extractor;
  try {
    if (typeof __require == "function")
      extractor = require_msgpackr_extract();
    else
      extractor = createRequire(import.meta.url)("msgpackr-extract");
    if (extractor)
      setExtractor(extractor.extractStrings);
  } catch (error) {
  }
}

// ../store/index/lib/index.js
var req = createRequire2(import.meta.url);
var { DatabaseSync } = req("node:sqlite");
var packr = new Packr({
  useRecords: true,
  moreTypes: true
});
var SQLITE_BUSY = 5;
var RETRY_DELAY_MS = 50;
var MAX_RETRIES = 100;
function sqliteRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      if (isSqliteBusy(err) && attempt < MAX_RETRIES) {
        sleepSync(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}
function isSqliteBusy(err) {
  return (err?.errcode & 255) === SQLITE_BUSY;
}
var sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(sleepBuffer, 0, 0, ms);
}
function packForStorage(data) {
  return packr.pack(data);
}
var openInstances = /* @__PURE__ */ new Set();
var StoreIndex = class {
  db;
  closed = false;
  pendingWrites = [];
  flushScheduled = false;
  stmtGet;
  stmtSet;
  stmtDel;
  stmtHas;
  stmtAll;
  stmtKeys;
  exitHandler;
  constructor(storeDir) {
    const dbPath = `${storeDir}/index.db`;
    fs11.mkdirSync(storeDir, { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA busy_timeout=5000");
    sqliteRetry(() => {
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA synchronous=NORMAL");
      this.db.exec("PRAGMA mmap_size=536870912");
      this.db.exec("PRAGMA cache_size=-32000");
      this.db.exec("PRAGMA temp_store=MEMORY");
      this.db.exec("PRAGMA wal_autocheckpoint=10000");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS package_index (
          key TEXT PRIMARY KEY,
          data BLOB NOT NULL
        ) WITHOUT ROWID
      `);
    });
    this.stmtGet = this.db.prepare("SELECT data FROM package_index WHERE key = ?");
    this.stmtSet = this.db.prepare("INSERT OR REPLACE INTO package_index (key, data) VALUES (?, ?)");
    this.stmtDel = this.db.prepare("DELETE FROM package_index WHERE key = ?");
    this.stmtHas = this.db.prepare("SELECT 1 FROM package_index WHERE key = ?");
    this.stmtAll = this.db.prepare("SELECT key, data FROM package_index");
    this.stmtKeys = this.db.prepare("SELECT key FROM package_index");
    this.exitHandler = () => this.close();
    const currentMax = process.getMaxListeners();
    if (currentMax !== 0 && currentMax < openInstances.size + 11) {
      process.setMaxListeners(Math.max(currentMax + 10, openInstances.size + 11));
    }
    process.on("exit", this.exitHandler);
    openInstances.add(this);
  }
  get(key) {
    const row = sqliteRetry(() => this.stmtGet.get(key));
    if (row) {
      return packr.unpack(row.data);
    }
    return void 0;
  }
  /**
   * Get the raw msgpack-encoded buffer for a key without decoding.
   */
  getRaw(key) {
    const row = sqliteRetry(() => this.stmtGet.get(key));
    return row?.data;
  }
  set(key, data) {
    const buffer = packr.pack(data);
    sqliteRetry(() => {
      this.stmtSet.run(key, buffer);
    });
  }
  delete(key) {
    let result;
    sqliteRetry(() => {
      result = this.stmtDel.run(key);
    });
    return result.changes > 0;
  }
  has(key) {
    return sqliteRetry(() => this.stmtHas.get(key)) != null;
  }
  /**
   * Iterate over all index entries.
   * Yields [key, data] pairs where key is `integrity\tpkgId`.
   */
  *entries() {
    for (const row of this.stmtAll.iterate()) {
      yield [row.key, packr.unpack(row.data)];
    }
  }
  /**
   * Iterate over all index keys without decoding values.
   * Much faster than entries() when only keys are needed.
   */
  *keys() {
    for (const row of this.stmtKeys.iterate()) {
      yield row.key;
    }
  }
  /**
   * Queue pre-packed writes to be flushed on the next tick.
   * Used by the fetch phase for throughput.
   */
  queueWrites(writes) {
    for (const w of writes) {
      this.pendingWrites.push(w);
    }
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      process.nextTick(() => this.flush());
    }
  }
  /**
   * Flush all pending queued writes immediately.
   */
  flush() {
    this.flushScheduled = false;
    if (this.pendingWrites.length === 0)
      return;
    this.setRawMany(this.pendingWrites);
    this.pendingWrites = [];
  }
  /**
   * Write multiple pre-packed entries in a single transaction.
   * The buffers must already be msgpack-encoded.
   */
  setRawMany(entries) {
    if (this.closed || entries.length === 0)
      return;
    if (entries.length === 1) {
      sqliteRetry(() => {
        this.stmtSet.run(entries[0].key, entries[0].buffer);
      });
      return;
    }
    sqliteRetry(() => {
      this.db.exec("BEGIN IMMEDIATE");
      let committed = false;
      try {
        for (const { key, buffer } of entries) {
          this.stmtSet.run(key, buffer);
        }
        this.db.exec("COMMIT");
        committed = true;
      } finally {
        if (!committed) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
          }
        }
      }
    });
  }
  /**
   * Delete multiple index entries in a single transaction,
   * then VACUUM to reclaim disk space.
   */
  deleteMany(keys) {
    if (keys.length === 0)
      return;
    if (keys.length === 1) {
      this.delete(keys[0]);
      this.db.exec("VACUUM");
      return;
    }
    sqliteRetry(() => {
      this.db.exec("BEGIN IMMEDIATE");
      let committed = false;
      try {
        for (const key of keys) {
          this.stmtDel.run(key);
        }
        this.db.exec("COMMIT");
        committed = true;
      } finally {
        if (!committed) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
          }
        }
      }
    });
    this.db.exec("VACUUM");
  }
  checkpoint() {
    this.flush();
    sqliteRetry(() => {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    });
  }
  close() {
    if (this.closed)
      return;
    this.flush();
    this.closed = true;
    openInstances.delete(this);
    process.removeListener("exit", this.exitHandler);
    try {
      this.db.exec("PRAGMA optimize");
    } catch {
    }
    try {
      this.db.close();
    } catch {
    }
  }
};

// ../worker/lib/equalOrSemverEqual.js
var import_semver2 = __toESM(require_semver2(), 1);
function equalOrSemverEqual(version1, version2) {
  if (version1 === version2)
    return true;
  try {
    return import_semver2.default.eq(version1, version2, { loose: true });
  } catch {
    return false;
  }
}

// ../worker/lib/start.js
function startWorker() {
  process.on("uncaughtException", (err) => {
    console.error(err);
  });
  parentPort.on("message", handleMessage);
}
var cafsCache = /* @__PURE__ */ new Map();
var cafsStoreCache = /* @__PURE__ */ new Map();
var cafsLocker = /* @__PURE__ */ new Map();
var storeIndexCache = /* @__PURE__ */ new Map();
function getStoreIndex(storeDir) {
  if (!storeIndexCache.has(storeDir)) {
    storeIndexCache.set(storeDir, new StoreIndex(storeDir));
  }
  return storeIndexCache.get(storeDir);
}
async function handleMessage(message) {
  if (message === false) {
    parentPort.off("message", handleMessage);
    for (const idx of storeIndexCache.values()) {
      idx.close();
    }
    storeIndexCache.clear();
    process.exit(0);
  }
  try {
    switch (message.type) {
      case "extract": {
        parentPort.postMessage(addTarballToStore(message));
        break;
      }
      case "link": {
        parentPort.postMessage(importPackage(message));
        break;
      }
      case "add-dir": {
        parentPort.postMessage(addFilesFromDir2(message));
        break;
      }
      case "init-store": {
        parentPort.postMessage(initStore(message));
        break;
      }
      case "readPkgFromCafs": {
        const { storeDir, filesIndexFile, verifyStoreIntegrity, expectedPkg, strictStorePkgContentCheck } = message;
        const pkgFilesIndex = getStoreIndex(storeDir).get(filesIndexFile);
        if (!pkgFilesIndex) {
          parentPort.postMessage({
            status: "success",
            value: {
              verified: false,
              pkgFilesIndex: null
            }
          });
          return;
        }
        const warnings = [];
        if (expectedPkg) {
          if (pkgFilesIndex.manifest?.name != null && expectedPkg.name != null && pkgFilesIndex.manifest.name.toLowerCase() !== expectedPkg.name.toLowerCase() || pkgFilesIndex.manifest?.version != null && expectedPkg.version != null && !equalOrSemverEqual(pkgFilesIndex.manifest.version, expectedPkg.version)) {
            const msg = "Package name or version mismatch found while reading from the store.";
            const hint = `This means that either the lockfile is broken or the package metadata (name and version) inside the package's package.json file doesn't match the metadata in the registry. Expected package: ${expectedPkg.name}@${expectedPkg.version}. Actual package in the store: ${pkgFilesIndex.manifest?.name}@${pkgFilesIndex.manifest?.version}.`;
            if (strictStorePkgContentCheck ?? true) {
              throw new PnpmError("UNEXPECTED_PKG_CONTENT_IN_STORE", msg, {
                hint: `${hint}

If you want to ignore this issue, set strictStorePkgContentCheck to false in your configuration`
              });
            } else {
              warnings.push(`${msg} ${hint}`);
            }
          }
        }
        let verifyResult;
        if (verifyStoreIntegrity) {
          verifyResult = checkPkgFilesIntegrity(storeDir, pkgFilesIndex);
        } else {
          verifyResult = buildFileMapsFromIndex(storeDir, pkgFilesIndex);
        }
        const bundledManifest = pkgFilesIndex.manifest;
        const requiresBuild = pkgFilesIndex.requiresBuild ?? pkgRequiresBuild(bundledManifest, verifyResult.filesMap);
        parentPort.postMessage({
          status: "success",
          warnings,
          value: {
            verified: verifyResult.passed,
            bundledManifest,
            files: {
              filesMap: verifyResult.filesMap,
              sideEffectsMaps: verifyResult.sideEffectsMaps,
              resolvedFrom: "store",
              requiresBuild
            }
          }
        });
        break;
      }
      case "symlinkAllModules": {
        parentPort.postMessage(symlinkAllModules(message));
        break;
      }
      case "hardLinkDir": {
        hardLinkDir(message.src, message.destDirs);
        parentPort.postMessage({ status: "success" });
        break;
      }
      case "fetch-and-write-cafs": {
        parentPort.postMessage(await fetchAndWriteCafs(message));
        break;
      }
    }
  } catch (e) {
    parentPort.postMessage({
      status: "error",
      error: {
        code: e.code,
        message: e.message ?? e.toString(),
        hint: e.hint
      }
    });
  }
}
function addTarballToStore({ buffer, storeDir, integrity, filesIndexFile, appendManifest, ignoreFilePattern }) {
  if (integrity) {
    const { algorithm, hexDigest } = parseIntegrity(integrity);
    const calculatedHash = crypto5.hash(algorithm, buffer, "hex");
    if (calculatedHash !== hexDigest) {
      return {
        status: "error",
        error: {
          type: "integrity_validation_failed",
          algorithm,
          expected: integrity,
          found: formatIntegrity(algorithm, calculatedHash)
        }
      };
    }
  }
  if (!cafsCache.has(storeDir)) {
    cafsCache.set(storeDir, createCafs(storeDir));
  }
  const cafs = cafsCache.get(storeDir);
  const ignore = ignoreFilePattern ? makeIgnoreFromPattern(ignoreFilePattern) : void 0;
  let { filesIndex, manifest } = cafs.addFilesFromTarball(buffer, true, ignore);
  if (appendManifest && manifest == null) {
    manifest = appendManifest;
    addManifestToCafs(cafs, filesIndex, appendManifest);
  } else if (!filesIndex.has("package.json")) {
    addPlaceholderPackageJsonToCafs(cafs, filesIndex);
  }
  const { filesIntegrity, filesMap } = processFilesIndex(filesIndex);
  const bundledManifest = manifest != null ? normalizeBundledManifest(manifest) : void 0;
  const requiresBuild = pkgRequiresBuild(bundledManifest, filesIntegrity);
  const pkgFilesIndex = {
    requiresBuild,
    manifest: bundledManifest,
    algo: HASH_ALGORITHM,
    files: filesIntegrity
  };
  return {
    status: "success",
    value: {
      filesMap,
      manifest: bundledManifest,
      requiresBuild,
      integrity: integrity ?? calcIntegrity(buffer)
    },
    indexWrites: [{ key: filesIndexFile, buffer: packToShared(pkgFilesIndex) }]
  };
}
function calcIntegrity(buffer) {
  const calculatedHash = crypto5.hash("sha512", buffer, "hex");
  return formatIntegrity("sha512", calculatedHash);
}
function makeIgnoreFromPattern(pattern) {
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    const detail = util8.types.isNativeError(err) ? `: ${err.message}` : "";
    throw new PnpmError("INVALID_IGNORE_FILE_PATTERN", `Invalid ignoreFilePattern regex${detail}: ${pattern}`);
  }
  return (filename) => regex.test(filename);
}
function packToShared(data) {
  const packed = packForStorage(data);
  const shared = new SharedArrayBuffer(packed.byteLength);
  const view = new Uint8Array(shared);
  view.set(packed);
  return view;
}
function initStore({ storeDir }) {
  fs12.mkdirSync(storeDir, { recursive: true });
  const hexChars = "0123456789abcdef".split("");
  const filesDirPath = path16.join(storeDir, "files");
  try {
    fs12.mkdirSync(filesDirPath);
  } catch {
  }
  for (const hex1 of hexChars) {
    for (const hex2 of hexChars) {
      try {
        fs12.mkdirSync(path16.join(filesDirPath, `${hex1}${hex2}`));
      } catch {
      }
    }
  }
  return { status: "success" };
}
function addFilesFromDir2({ appendManifest, dir, files, filesIndexFile, includeNodeModules, sideEffectsCacheKey, storeDir }) {
  if (!cafsCache.has(storeDir)) {
    cafsCache.set(storeDir, createCafs(storeDir));
  }
  const cafs = cafsCache.get(storeDir);
  let { filesIndex, manifest } = cafs.addFilesFromDir(dir, {
    files,
    includeNodeModules,
    readManifest: true
  });
  if (appendManifest && manifest == null) {
    manifest = appendManifest;
    addManifestToCafs(cafs, filesIndex, appendManifest);
  } else if (!filesIndex.has("package.json")) {
    addPlaceholderPackageJsonToCafs(cafs, filesIndex);
  }
  const { filesIntegrity, filesMap } = processFilesIndex(filesIndex);
  const bundledManifest = manifest != null ? normalizeBundledManifest(manifest) : void 0;
  let requiresBuild;
  let indexWrites;
  if (sideEffectsCacheKey) {
    const existingFilesIndex = getStoreIndex(storeDir).get(filesIndexFile);
    if (!existingFilesIndex) {
      return {
        status: "success",
        value: {
          filesMap,
          manifest: bundledManifest,
          requiresBuild: pkgRequiresBuild(manifest, filesMap)
        }
      };
    }
    if (!existingFilesIndex.sideEffects) {
      existingFilesIndex.sideEffects = /* @__PURE__ */ new Map();
    }
    if (existingFilesIndex.algo !== HASH_ALGORITHM) {
      throw new PnpmError("ALGO_MISMATCH", `Algorithm mismatch: package index uses "${existingFilesIndex.algo}" but side effects were computed with "${HASH_ALGORITHM}"`);
    }
    existingFilesIndex.sideEffects.set(sideEffectsCacheKey, calculateDiff(existingFilesIndex.files, filesIntegrity));
    if (existingFilesIndex.requiresBuild == null) {
      requiresBuild = pkgRequiresBuild(manifest, filesMap);
    } else {
      requiresBuild = existingFilesIndex.requiresBuild;
    }
    indexWrites = [{ key: filesIndexFile, buffer: packToShared(existingFilesIndex) }];
  } else {
    requiresBuild = pkgRequiresBuild(bundledManifest, filesIntegrity);
    const pkgFilesIndex = {
      requiresBuild,
      manifest: bundledManifest,
      algo: HASH_ALGORITHM,
      files: filesIntegrity
    };
    indexWrites = [{ key: filesIndexFile, buffer: packToShared(pkgFilesIndex) }];
  }
  return { status: "success", value: { filesMap, manifest: bundledManifest, requiresBuild }, indexWrites };
}
function addManifestToCafs(cafs, filesIndex, manifest) {
  const fileBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const mode = 420;
  filesIndex.set("package.json", {
    mode,
    size: fileBuffer.length,
    ...cafs.addFile(fileBuffer, mode)
  });
}
var PLACEHOLDER_PACKAGE_JSON = Buffer.from(JSON.stringify({ _pnpmPlaceholder: "This file was generated by pnpm. The original package did not contain a package.json." }), "utf8");
function addPlaceholderPackageJsonToCafs(cafs, filesIndex) {
  const mode = 420;
  filesIndex.set("package.json", {
    mode,
    size: PLACEHOLDER_PACKAGE_JSON.length,
    ...cafs.addFile(PLACEHOLDER_PACKAGE_JSON, mode)
  });
}
function calculateDiff(baseFiles, sideEffectsFiles) {
  const deleted = [];
  const added = /* @__PURE__ */ new Map();
  const allFiles = /* @__PURE__ */ new Set([...baseFiles.keys(), ...sideEffectsFiles.keys()]);
  for (const file of allFiles) {
    if (!sideEffectsFiles.has(file)) {
      deleted.push(file);
    } else if (!baseFiles.has(file) || baseFiles.get(file).digest !== sideEffectsFiles.get(file).digest || baseFiles.get(file).mode !== sideEffectsFiles.get(file).mode) {
      added.set(file, sideEffectsFiles.get(file));
    }
  }
  const diff = {};
  if (deleted.length > 0) {
    diff.deleted = deleted;
  }
  if (added.size > 0) {
    diff.added = added;
  }
  return diff;
}
function processFilesIndex(filesIndex) {
  const filesIntegrity = /* @__PURE__ */ new Map();
  const filesMap = /* @__PURE__ */ new Map();
  for (const [k, { checkedAt, filePath, digest, mode, size }] of filesIndex) {
    filesIntegrity.set(k, {
      checkedAt,
      digest,
      mode,
      size
    });
    filesMap.set(k, filePath);
  }
  return { filesIntegrity, filesMap };
}
function importPackage({ storeDir, packageImportMethod, filesResponse, sideEffectsCacheKey, targetDir, requiresBuild, force, keepModulesDir, disableRelinkLocalDirDeps, safeToSkip }) {
  const cacheKey = JSON.stringify({ storeDir, packageImportMethod });
  if (!cafsStoreCache.has(cacheKey)) {
    cafsStoreCache.set(cacheKey, createCafsStore(storeDir, { packageImportMethod, cafsLocker }));
  }
  const cafsStore = cafsStoreCache.get(cacheKey);
  const { importMethod, isBuilt } = cafsStore.importPackage(targetDir, {
    filesResponse,
    force,
    disableRelinkLocalDirDeps,
    requiresBuild,
    sideEffectsCacheKey,
    keepModulesDir,
    safeToSkip
  });
  return { status: "success", value: { isBuilt, importMethod } };
}
function symlinkAllModules(opts2) {
  for (const dep of opts2.deps) {
    for (const [alias, pkgDir] of Object.entries(dep.children)) {
      if (alias !== dep.name) {
        symlinkDependencySync(pkgDir, dep.modules, alias);
      }
    }
  }
  return { status: "success" };
}
async function fetchAndWriteCafs(message) {
  const http = await import("node:http");
  const https = await import("node:https");
  const { URL } = await import("node:url");
  const { createGunzip } = await import("node:zlib");
  const { contentPathFromHex: contentPathFromHex2 } = await Promise.resolve().then(() => (init_lib5(), lib_exports));
  const base = message.registryUrl.endsWith("/") ? message.registryUrl : `${message.registryUrl}/`;
  const url = new URL("v1/files", base);
  const requestFn = url.protocol === "https:" ? https.request : http.request;
  const body = JSON.stringify({ digests: message.digests });
  const createdDirs = /* @__PURE__ */ new Set();
  const requestedDigests = /* @__PURE__ */ new Set();
  for (const d of message.digests) {
    requestedDigests.add(`${d.digest}:${d.executable ? "x" : ""}`);
  }
  return new Promise((resolve, reject) => {
    let filesWritten = 0;
    let buf = Buffer.alloc(0);
    let headerSkipped = false;
    let endMarkerSeen = false;
    const END_MARKER = Buffer.alloc(64, 0);
    const processBuffer = () => {
      if (!headerSkipped && buf.length >= 4) {
        const jsonLen = buf.readUInt32BE(0);
        if (buf.length >= 4 + jsonLen) {
          buf = buf.subarray(4 + jsonLen);
          headerSkipped = true;
        } else {
          return;
        }
      }
      while (headerSkipped && !endMarkerSeen) {
        if (buf.length < 64)
          break;
        if (buf.subarray(0, 64).equals(END_MARKER)) {
          buf = buf.subarray(64);
          endMarkerSeen = true;
          break;
        }
        if (buf.length < 69)
          break;
        const size = buf.readUInt32BE(64);
        const entryLen = 69 + size;
        if (buf.length < entryLen)
          break;
        const digest = buf.subarray(0, 64).toString("hex");
        const executable = (buf[68] & 1) !== 0;
        const requestKey = `${digest}:${executable ? "x" : ""}`;
        if (!requestedDigests.has(requestKey)) {
          throw new Error(`pnpm agent /v1/files returned an entry that was not requested: digest=${digest} executable=${String(executable)}`);
        }
        requestedDigests.delete(requestKey);
        const content = buf.subarray(69, entryLen);
        const relPath = contentPathFromHex2(executable ? "exec" : "nonexec", digest);
        const fullPath = path16.join(message.storeDir, relPath);
        const dir = path16.dirname(fullPath);
        if (!createdDirs.has(dir)) {
          fs12.mkdirSync(dir, { recursive: true });
          createdDirs.add(dir);
        }
        try {
          fs12.writeFileSync(fullPath, content, { flag: "wx", mode: executable ? 493 : 420 });
        } catch (err) {
          if (!(err instanceof Error && "code" in err && err.code === "EEXIST")) {
            throw err;
          }
          const onDiskSize = fs12.statSync(fullPath).size;
          if (onDiskSize !== content.length) {
            const tmpPath = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
            fs12.writeFileSync(tmpPath, content, { mode: executable ? 493 : 420 });
            fs12.renameSync(tmpPath, fullPath);
          }
        }
        filesWritten++;
        buf = buf.subarray(entryLen);
      }
    };
    const safeProcessBuffer = () => {
      try {
        processBuffer();
        return true;
      } catch (err) {
        reject(err);
        req2.destroy();
        return false;
      }
    };
    const FILES_REQUEST_TIMEOUT_MS = 6e5;
    const req2 = requestFn(url, {
      method: "POST",
      timeout: FILES_REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Accept-Encoding": "gzip"
      }
    }, (res) => {
      if (typeof res.statusCode === "number" && (res.statusCode < 200 || res.statusCode >= 300)) {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          reject(new Error(`pnpm agent /v1/files responded with ${res.statusCode}: ${Buffer.concat(chunks).toString("utf-8")}`));
        });
        res.on("error", reject);
        return;
      }
      let stream = res;
      if (res.headers["content-encoding"] === "gzip") {
        const gunzip = createGunzip();
        res.pipe(gunzip);
        stream = gunzip;
      }
      stream.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        safeProcessBuffer();
      });
      stream.on("end", () => {
        if (!safeProcessBuffer())
          return;
        if (!endMarkerSeen) {
          reject(new Error("pnpm agent /v1/files stream ended without the end marker"));
          return;
        }
        if (buf.length > 0) {
          reject(new Error(`pnpm agent /v1/files stream left ${buf.length} unparsed bytes after end marker`));
          return;
        }
        if (requestedDigests.size > 0) {
          const sample = [...requestedDigests].slice(0, 3).join(", ");
          reject(new Error(`pnpm agent /v1/files omitted ${requestedDigests.size} requested entries (e.g. ${sample})`));
          return;
        }
        resolve({ status: "success", filesWritten });
      });
      stream.on("error", reject);
    });
    req2.on("timeout", () => {
      req2.destroy(new Error(`pnpm agent /v1/files request timed out after ${FILES_REQUEST_TIMEOUT_MS / 1e3}s`));
    });
    req2.on("error", reject);
    req2.write(body);
    req2.end();
  });
}

// ../worker/lib/worker.js
startWorker();
/*! Bundled license information:

is-windows/index.js:
  (*!
   * is-windows <https://github.com/jonschlinkert/is-windows>
   *
   * Copyright © 2015-2018, Jon Schlinkert.
   * Released under the MIT License.
   *)
*/
