function Client() {

}

Client.prototype = {
  chain: null,

  inMulti: function() {
    return this.chain !== null;
  },

  returned: [],

  events: { },

  register: function(action, callback) {
    if(this.inMulti()) {
      this.chain.push(action);

      return;
    }

    action(callback);
  },

  flush: function() {
    var args = Array.prototype.slice.call(arguments) || [];

    if(args.length > 0) {
      this.returned.push(args);
    }

    if(this.chain.length === 0) {
      this.complete();
    }

    this.chain.shift().call(this, this.flush);
  },

  multi: function() {
    this.chain = [];

    return this;
  },

  exec: function(callback) {
    this.complete = function() {
      var returned = this.returned;

      this.complete = null;
      this.chain = null;
      this.returned = [];

      callback(returned);
    };

    this.flush();
  },

  on: function(eventType, action) {
    var event = this.events[eventType] = this.events[eventType] || [];
    event.push(action);
  },

  get: function(key, callback) {
    // TODO write function to get contents.

    return this;
  },

  set: function(key, value, callback) {
    this.register(function(cb) {
      openWritable(function(os) {
        // TODO do stuff with objectStore
        complete(cb);
      });
    }, callback);

    return this;
  },

  incr: function(key, by, callback) {
    this.register(function(cb) {
      this.get(key, function(val) {
        this.set(key, val + by, cb);
      });
    }, callback);

    return this;
  }
};