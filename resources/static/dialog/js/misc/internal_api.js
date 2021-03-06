/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  "use strict";

  var nav = navigator,
      bid = BrowserID,
      internal = bid.internal = bid.internal || {},
      user = bid.User,
      storage = bid.Storage,
      moduleManager = bid.module;

  // given an object containing an assertion, extract the assertion string,
  // as the internal API is supposed to return a string assertion, not an
  // object.  issue #1395

  function assertionObjectToString(assertion) {
    if (assertion !== null && typeof assertion === 'object' && assertion.assertion) {
      assertion = assertion.assertion;
    }
    return assertion;
  }

  /**
   * Set the persistent flag to true for an origin.
   * @method setPersistent
   * @param {string} origin
   * @param {callback} [callback] - callback to call when complete.  Called
   * with true if successful, null if user is not authenticated or failure.
   */
  internal.setPersistent = function(origin, callback) {
    function complete(status) {
      callback && callback(status);
    }

    user.checkAuthentication(function onComplete(authenticated) {
      if (authenticated) {
        storage.site.set(origin, "remember", true);
      }

      complete(!!authenticated || null);
    }, complete.curry(null));
  };

  /**
   * Get an assertion.  Mimics the behavior of navigator.id.get.
   * options.silent defaults to false.  To get an assertion without using the
   * dialog, set options.silent to true.  To specify a required email, set
   * options.requiredEmail. By specifying both silent:true and requiredEmail:
   * <email>, an assertion will be attempted to be retreived for the given
   * email without showing the dialog.
   * @method get
   * @param {string} origin
   * @param {function} callback - called when complete.  Called with assertion
   * if success, null if the user cancels.  Other conditions causing null
   * return value: silent is true and user is not authenticated.  silent is
   * true, requiredEmail is specified but user does not control email.
   * @param {object} options.  See options block for navigator.id.get.
   * options.silent defaults to false.
   */
  internal.get = function(origin, callback, options) {
    function complete(assertion) {
      assertion = assertionObjectToString(assertion);
      // If no assertion, give no reason why there was a failure.
      callback && callback(assertion || null);
    }

    // Make our own copy, since we assign properties to it.
    // There was an error doing that in B2G, since we got a
    // WrappsJSObject.
    options = _.extend({}, options);

    var silent = !!options.silent;
    if(silent) {
      // first, check the required email field, if that is not specified, go
      // check if an email is associated with this site. If that is not
      // available, there is not enough information to continue.
      var requiredEmail = options.requiredEmail || storage.site.get(origin, "email");
      if(requiredEmail) {
        getSilent(origin, requiredEmail, callback);
      }
      else {
        complete();
      }
    }
    else {
      // Use the standard dialog facilities to get the assertion, pass the
      // options block directly to the dialog.
      options.rp_api = "internal";
      get(origin, options, complete);
    }
  };

  function get(origin, options, complete) {
    var args = arguments;
    var controller;

    // The dialog startup is asynchronous and the dialog module may not yet be
    // registered by the time BrowserID.internal.get is called. If the module
    // is not yet ready, keep polling until it is. Note, if the user's cookies
    // are disabled, this poll will continue into eternity.
    try {
      controller = moduleManager.getRunningModule("dialog");
    } catch (noModule) {
      return setTimeout(function _get_wait() {
        get.apply(null, args);
      }, 50);
    }

    controller.get(origin, options, complete, complete);
  }

  /*
   * Get an assertion without user interaction - internal use
   */
  function getSilent(origin, email, callback) {
    function complete(assertion) {
      assertion = assertionObjectToString(assertion);
      callback && callback(assertion || null);
    }

    user.checkAuthenticationAndSync(function(authenticated) {
      // User must be authenticated to get an assertion.
      if(authenticated) {
        user.setOrigin(origin);
        user.getAssertion(email, user.getOrigin(), function(assertion) {
          complete(assertion || null);
        }, complete.curry(null));
      }
      else {
        complete(null);
      }
    }, complete.curry(null));
  }

  /**
   * Log the user out of the current origin
   * @method logout
   * @param {string} origin
   * @param {function} callback
   */
  internal.logout = function(origin, callback) {
    function complete(status) {
      callback && callback(status);
    }

    user.setOrigin(origin);
    user.logout(callback, complete.curry(null));
  };

  /**
   * Log the user out everywhere
   * @method logoutEveywhere
   * @param {function} callback
   */
  internal.logoutEverywhere = function(callback) {
    function complete(success) {
      callback && callback(status);
    }

    user.logoutUser(callback, complete.curry(null));
  };

}());
