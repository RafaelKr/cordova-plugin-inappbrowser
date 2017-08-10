/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

(function() {
  // special patch to correctly work on Ripple emulator (CB-9760)
  if(window.parent && !!window.parent.ripple) { // https://gist.github.com/triceam/4658021
    module.exports = window.open.bind(window); // fallback to default window.open behaviour
    return;
  }

  var exec = require('cordova/exec');
  var channel = require('cordova/channel');
  var modulemapper = require('cordova/modulemapper');
  var urlutil = require('cordova/urlutil');

  function InAppBrowser() {
    this.channels = {
      'loadstart': channel.create('loadstart'),
      'loadstop': channel.create('loadstop'),
      'loaderror': channel.create('loaderror'),
      'exit': channel.create('exit')
    };
  }

  function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function serializeWindowFeatureObject(obj) {
    var qs = '';

    for(var key in obj) {
      var value = obj[key];

      if(typeof value === 'boolean') {
        value = value ? 'yes' : 'no';
      }

      qs += key + '=' + value + ',';
    }

    return qs.slice(0, -1);
  }

  function deserializeWindowFeaturesQueryString(qs) {
    if(qs.length === 0) {
      return {};
    }

    return qs
      .split(',')
      .reduce(function(a, b) {
        b = b.split('=');
        b[0] = b[0].trim();
        b[1] = b[1].trim();

        if(b[1] === 'yes' || b[1] === 'no') {
          a[b[0]] = b[1] === 'yes' ? true : false;

          return a;
        }

        a[b[0]] = b[1] || null;

        return a;
      }, {});
  }

  InAppBrowser.prototype = {
    _eventHandler: function(event) {
      if(event && (event.type in this.channels)) {
        this.channels[event.type].fire(event);
      }
    },
    close: function() {
      exec(null, null, 'InAppBrowser', 'close', []);
    },
    show: function() {
      exec(null, null, 'InAppBrowser', 'show', []);
    },
    hide: function() {
      exec(null, null, 'InAppBrowser', 'hide', []);
    },
    resize: function(size) {
      if(cordova.platformId !== 'android' && cordova.platformId !== 'ios') {
        console.error('Resizing is only supported by Android.');
        return;
      }

      let windowFeatures = {
        width: isNumeric(size.width) ? size.width : null,
        height: isNumeric(size.height) ? size.height : null
      };

      exec(null, null, 'InAppBrowser', 'resize', [windowFeatures]);
    },
    addEventListener: function(eventname, f) {
      if(eventname in this.channels) {
        this.channels[eventname].subscribe(f);
      }
    },
    removeEventListener: function(eventname, f) {
      if(eventname in this.channels) {
        this.channels[eventname].unsubscribe(f);
      }
    },

    executeScript: function(injectDetails, cb) {
      if(injectDetails.code) {
        exec(cb, null, 'InAppBrowser', 'injectScriptCode', [injectDetails.code, !!cb]);
      } else if(injectDetails.file) {
        exec(cb, null, 'InAppBrowser', 'injectScriptFile', [injectDetails.file, !!cb]);
      } else {
        throw new Error('executeScript requires exactly one of code or file to be specified');
      }
    },

    insertCSS: function(injectDetails, cb) {
      if(injectDetails.code) {
        exec(cb, null, 'InAppBrowser', 'injectStyleCode', [injectDetails.code, !!cb]);
      } else if(injectDetails.file) {
        exec(cb, null, 'InAppBrowser', 'injectStyleFile', [injectDetails.file, !!cb]);
      } else {
        throw new Error('insertCSS requires exactly one of code or file to be specified');
      }
    }
  };

  /**
   * create the InAppBrowser
   * @param  {string} url                                    - The URL to load. Call encodeURI() on this if the URL contains Unicode characters.
   * @param  {string} [target='_self']                       - The target in which to load the URL.
   * @param  {string|Object} [windowFeatures='location=yes'] - Options for the InAppBrowser.
   * @param  {Object} [callbacks]                            - eventlisteners for loadstart, loadstop, loaderror and exit.
   * @return {Object}                                        - returns the InAppBrowser object with it's methods.
   */
  module.exports = function(url, target, windowFeatures, callbacks) {
    windowFeatures = windowFeatures || '';

    // Don't catch calls that write to existing frames (e.g. named iframes).
    if(window.frames && window.frames[target]) {
      var origOpenFunc = modulemapper.getOriginalSymbol(window, 'open');
      return origOpenFunc.apply(window, arguments);
    }

    url = urlutil.makeAbsolute(url);
    var iab = new InAppBrowser();

    callbacks = callbacks || {};
    for(var callbackName in callbacks) {
      iab.addEventListener(callbackName, callbacks[callbackName]);
    }

    var cb = function(eventname) {
      iab._eventHandler(eventname);
    };

    // android needs an object, other platforms need a query string
    if(typeof windowFeatures === 'string') {
      if(cordova.platformId === 'android' || cordova.platformId === 'ios') {
        windowFeatures = deserializeWindowFeaturesQueryString(windowFeatures);
        windowFeatures.width = isNumeric(windowFeatures.width) ? windowFeatures.width : null;
        windowFeatures.height = isNumeric(windowFeatures.height) ? windowFeatures.height : null;
      }
    // if windowFeatures is an object
    } else if(!!windowFeatures && windowFeatures.constructor === Object) {
      if(cordova.platformId === 'android' || cordova.platformId === 'ios') {
        windowFeatures.width = isNumeric(windowFeatures.width) ? windowFeatures.width : null;
        windowFeatures.height = isNumeric(windowFeatures.height) ? windowFeatures.height : null;
      } else {
        windowFeatures = serializeWindowFeatureObject(windowFeatures);
      }
    } else {
      throw new Error('invalid options parameter');
    }

    exec(cb, cb, 'InAppBrowser', 'open', [url, target, windowFeatures]);
    return iab;
  };
})();
