(function () {
'use strict';
var gazel = gazel || {};

var exists = function (obj) {
    return typeof obj !== "undefined" && obj != null;
};

window.indexedDB = window.indexedDB || window.mozIndexedDB
        || window.msIndexedDB || window.webkitIndexedDB || window.oIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;

function complete(func, params) {
    if (exists(func) && typeof func === "function") {
        func.apply(null, params);
    }
};

function error(e) {
    gazel._events.forEach(function (action) {
        action(e);
    });
};
function openDatabase(osName, onsuccess) {
    var db;

    var req = window.indexedDB.open(gazel.dbName, gazel.version);
    req.onsuccess = function (e) {
        db = e.target.result;
        complete(onsuccess, [db]);
    };
    req.onerror = error;
    req.onupgradeneeded = function () {
        var os = db.createObjectStore(osName);
    };
};

function openReadable(osName, onsuccess) {
    openDatabase(osName, function (db) {
        var tx = db.transaction([osName], IDBTransaction.READ);
        tx.onerror = error;
        complete(onsuccess, [tx]);
    });
};

function openWritable(osName, onsuccess) {
    openDatabase(osName, function (db) {
        var tx = db.transaction([osName], IDBTransaction.READ_WRITE);
        tx.onerror = error;
        complete(onsuccess, [tx]);
    });
};
var Queue = (function () {
    function Queue() {
    };

    Queue.prototype.items = [];
    Queue.prototype.results = [];
    Queue.prototype.add = function (action) {
        this.items.push(action);
    };
    Queue.prototype.complete = function () { }
    Queue.prototype.flush = function () {
        var args = Array.prototype.slice.call(arguments);
        if (args.length > 0) { this.results.push(args); }
        if (this.items.length > 0) {
            var action = this.items.shift();
            action();
        } else { // Complete, call back multi.
            var results = this.results;
            this.clear();
            this.complete(results);
        }
    };
    Queue.prototype.clear = function () {
        this.items = [];
        this.results = [];
    };

    return Queue;
})();

Queue.create = function () { return new Queue(); };
gazel.multi = function () {
    // Let gazel know that we are in a multi.
    gazel._multi = true;
};

gazel.exec = function (complete) {
    // Finalize the execution stack.
    gazel._queue.complete = complete;
    gazel._queue.flush();
};
gazel.version = 1;
gazel.dbName = "gazeldb";
gazel.osName = "gazelos";

gazel.compatible = exists(window.indexedDB) && exists(window.localStorage)
    && exists(window.IDBTransaction);

gazel._events = [];
gazel._multi = false;
gazel._queue = Queue.create();

gazel.on = function (name, action) {
    gazel._events.push({
        name: name,
        action: action
    });

    return gazel;
};

gazel.get = function (key, onsuccess) {
    var get = function () {
        var n = gazel.osName;
        openReadable(n, function (tx) {
            var req = tx.objectStore(n).get(key);
            req.onerror = error;
            req.onsuccess = function (e) {
                complete(onsuccess, [e.target.result]);
            };
        });
    }

    if (gazel._multi) {
        onsuccess = gazel._queue.flush;
        gazel._queue.add(get);
    } else {
        get();
    }

    return gazel;
};

gazel.set = function (key, value, onsuccess) {
    var set = function () {
        var n = gazel.osName;
        openWritable(n, function (tx) {
            var req = tx.objectStore(n).put(value, key);
            req.onerror = error;
            req.onsuccess = function (e) {
                complete(onsuccess, [e.target.result]);
            };
        });
    }

    if (gazel._multi) {
        onsuccess = gazel._queue.flush;
        gazel._queue.add(set);
    } else {
        set();
    }

    return gazel;
};

gazel.incr = function (key, by, onsuccess) {
    var n = gazel.osName;
    openWritable(n, function (tx) {
        var req = tx.objectStore(n).get(key);
        req.onerror = error;
        req.onsuccess = function (e) {
            var value = e.target.result += by;

            req = tx.objectStore(n).put(value, key)
            req.onerror = error;
            req.onsuccess = function (e) {
                complete(onsuccess, [e.target.result]);
            };
        };
    });

    return gazel;
};

this.gazel = gazel;
}).call(this);
