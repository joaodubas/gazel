/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

(function() {
'use strict';
var gazel = gazel || {};

var exists = function (obj) {
  return typeof obj !== 'undefined' && obj != null;
};

window.indexedDB = window.indexedDB
  || window.mozIndexedDB
  || window.msIndexedDB
  || window.webkitIndexedDB
  || window.oIndexedDB;

window.IDBTransaction = window.IDBTransaction
  || window.webkitIDBTransaction;

var slice = Array.prototype.slice,
    splice = Array.prototype.splice;
function Dict() { }

Dict.prototype = {

  items: { },

  prop: function(key) {
    return ':' + key;
  },

  get: function(key, def) {
    var p = this.prop(key),
        k = this.items;

    return k.hasOwnProperty(p) ? k[p] : def;
  },

  set: function(key, value) {
    var p = this.prop(key);

    this.items[p] = value;

    return value;
  },

  count: function() {
    return Object.keys(this.items).length;
  },

  has: function(key) {
    var p = this.prop(key);

    return this.items.hasOwnProperty(p);
  },

  del: function(key) {
    var p = this.prop(key),
        k = this.items;

    if(k.hasOwnProperty(p))
      delete k[p];
  },

  keys: function() {
    return Object.keys(this.items).map(function(key) {
      return key.substring(1);
    });
  }
};
var Trans = Object.create(Dict, {

  abortAll: function() {
    var self = this,
        keys = self.keys();

    keys.forEach(function(key) {
      var tx = self.get(key);
      tx.abort();

      self.del(key);
    });
  }

});
function Client() {

}

Client.prototype = {
  chain: null,

  inMulti: false,

  returned: [],

  events: { },

  trans: new Trans(),

  register: function(action, callback) {
    if(this.inMulti) {
      this.chain.push(action);

      return;
    }

    var self = this;
    action(function() {
      var args = slice.call(arguments);

      if(self.trans.count() > 0) {
        self.trans.keys.forEach(function(key) {
          self.trans.del(key);
        });
      }

      (callback || function(){}).apply(null, args);
    });
  },

  flush: function() {
    var args = slice.call(arguments) || [];

    this.returned.push(args);

    if(this.chain.length === 0) {
      this.complete();

      return;
    }

    this.chain.shift().call(this, this.flush);
  },

  multi: function() {
    this.chain = [];
    this.inMulti = true;

    return this;
  },

  exec: function(callback) {
    this.inMulti = false;

    this.complete = function() {
      var returned = this.returned;

      this.complete = null;
      this.chain = null;
      this.returned = [];

      callback(returned);
    };

    var action = this.chain.shift();
    action.call(this, this.flush);
  },

  on: function(eventType, action) {
    var event = this.events[eventType] = this.events[eventType] || [];
    event.push(action);
  }
};
Client.prototype.discard = function() {
  this.trans.abortAll();
};
Client.prototype.handleError = function() {
  var args = Array.prototype.slice.call(arguments);

  var actions = this.events['error'] || [];
  actions.forEach(function(action) {
    action.apply(null, args);
  });
};
Client.prototype.get = function(key, callback) {
  var self = this;

  this.register(function(cb) {
    openDatabase(function(db) {

      var tx = self.trans.get('read', undefined);
      if(!tx) {
        tx = db.transaction([gazel.osName], IDBTransaction.READ);
        tx.onerror = onerror;

        self.trans.set('read', tx);
      }

      var req = tx.objectStore(gazel.osName).get(key);
      req.onerror = self.handleError.bind(self);
      req.onsuccess = function (e) {
        cb.call(self, e.target.result);
      };

    }, self.handleError.bind(self));

  }, callback);

  return this;
};
Client.prototype.set = function(key, value, callback) {
  var self = this;

  this.register(function(cb) {
    openReadable(function(db) {

      var tx = self.trans.get('write', undefined);
      if(!tx) {
        var tx = db.transaction([gazel.osName], IDBTransaction.READ_WRITE);
        tx.onerror = onerror;

        self.trans.set('write', tx);
      }

      var req = tx.objectStore(gazel.osName).put(value, key);
      req.onerror = self.handleError.bind(self);
      req.onsuccess = function (e) {
        cb.call(self, e.target.result);
      };

    }, self.handleError.bind(self));
  }, callback);

  return this;
};
Client.prototype.incr = function(key, by, callback) {
  this.register(function(cb) {
    this.get(key, function(val) {
      this.set(key, val + by, cb);
    });
  }, callback);

  return this;
};
gazel.print = function() {
  var args = Array.prototype.slice.call(arguments);
  if(args.length === 0)
    return;

  var items = args[0] instanceof Array ? args[0] : [args[0]];
  items.forEach(function(item) {
    console.log(item);
  });
};
gazel.version = 1;
gazel.dbName = "gazeldb";
gazel.osName = "gazelos";

gazel.compatible = exists(window.indexedDB)
  && exists(window.IDBTransaction);

gazel.createClient = function() {
  return new Client;
};

this.gazel = gazel;
var db;
var loadingDb = false;

function openDatabase(onsuccess, onerror) {
  if(db) {
    onsuccess(db);
    return;
  }

  if(loadingDb) {
    setTimeout(function() {
      openDatabase(onsuccess, onerror);
    }, 100);

    return;
  }
  loadingDb = true;

  var req = window.indexedDB.open(gazel.dbName, gazel.version);
  
  req.onupgradeneeded = function (e) {
    var uDb = e.target.result;

    if(!uDb.objectStoreNames.contains(gazel.osName))
      uDb.createObjectStore(gazel.osName);
  };

  var reqSuccess;
  reqSuccess = req.onsuccess = function (e) {
    var sDb = e.target.result;

    if (sDb.setVersion && Number(sDb.version) !== gazel.version) {
      var dbReq = sDb.setVersion(String(gazel.version));
      dbReq.onsuccess = function (e2) {
        var e3 = {}; e3.target = {};
        e3.target.result = e2.target.result.db;
        
        req.onupgradeneeded(e3);
        reqSuccess(e3);
        
        return;
      };

      dbReq.onerror = onerror;
      dbReq.onfailure = onerror;
      dbReq.onblocked = onerror;

      return;
    }

    db = sDb;
    loadingDb = false;

    onsuccess(db);
  };

  req.onerror = onerror;
}

function openReadable(onsuccess, onerror) {
  openDatabase(function (db) {
    var tx = db.transaction([gazel.osName], IDBTransaction.READ);
    tx.onerror = onerror;
    onsuccess(tx);
  }, onerror);
}

function openWritable(onsuccess, onerror) {
  openDatabase(function (db) {
    var tx = db.transaction([gazel.osName], IDBTransaction.READ_WRITE);
    tx.onerror = onerror;
    onsuccess(tx);
  }, onerror);
}
}).call(this);
