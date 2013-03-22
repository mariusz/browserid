/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  var bid = BrowserID,
      network = bid.Network,
      user = bid.User,
      storage = bid.Storage;

  // Initialize all localstorage values to default values.  Neccesary for
  // proper sync of IE8 localStorage across multiple simultaneous
  // browser sessions.
  storage.setDefaultValues();

  network.init();

  var chan = Channel.build({
    window: window.parent,
    origin: "*",
    scope: "mozid_ni"
  });

  var remoteOrigin;

  function setRemoteOrigin(o) {
    if (!remoteOrigin) {
      remoteOrigin = o;
      user.setOrigin(remoteOrigin);
    }
  }

  var loggedInUser;

  // the controlling page may "pause" the iframe when someone else (the dialog)
  // is supposed to emit events
  var pause = false;

  function checkAndEmit(oncomplete) {
    if (pause) return;

    network.cookiesEnabled(function(enabled) {
      if (!enabled) {
        // cookies are disabled, call onready and do nothing more.
        // By not setting loggedInUser to null, the RP can call .logout
        // a single time and have the .onlogout callback fired, which in
        // turn allows the RP to sign the user out of their site.
        return oncomplete && oncomplete();
      }

      // this will re-certify the user if neccesary
      user.getSilentAssertion(loggedInUser, function(email, assertion) {
        if (loggedInUser === email) {
          chan.notify({ method: 'match' });
        } else if (email) {
          // only send login events when the assertion is defined - when
          // the 'loggedInUser' is already logged in, it's false - that is
          // when the site already has the user logged in and does not want
          // the resources or cost required to generate an assertion
          if (assertion) chan.notify({ method: 'login', params: assertion });
          loggedInUser = email;
        } else if (loggedInUser !== null) {
          // only send logout events when loggedInUser is not null, which is an
          // indicator that the site thinks the user is logged out
          chan.notify({ method: 'logout' });
          loggedInUser = null;
        }
        oncomplete && oncomplete();
      }, function(err) {
        chan.notify({ method: 'logout' });
        loggedInUser = null;
        oncomplete && oncomplete();
      });
    });
  }

  function watchState() {
    storage.watchLoggedIn(remoteOrigin, checkAndEmit);
  }

  // one of two events will cause us to begin checking to
  // see if an event shall be emitted - either an explicit
  // loggedInUser event or page load.
  chan.bind("loggedInUser", function(trans, email) {
    loggedInUser = email;
  });

  chan.bind("loaded", function(trans, params) {
    trans.delayReturn(true);
    setRemoteOrigin(trans.origin);
    checkAndEmit(function() {
      watchState();
      trans.complete();
    });
  });

  chan.bind("logout", function(trans, params) {
    // set remote origin so that .logout can be called even if .request has
    // not.
    // See https://github.com/mozilla/browserid/pull/2529
    setRemoteOrigin(trans.origin);
    // loggedInUser will be undefined if none of loaded, loggedInUser nor
    // logout have been called before. This allows the user to be force logged
    // out.
    if (loggedInUser !== null) {
      // Some browsers (Chrome) disable access to localStorage if access
      // to cookies is disabled. Ignore any localStorage exceptions for now
      // and allow the site to log the user out.
      try {
        storage.setLoggedIn(remoteOrigin, false);
      } catch (e) { }
      loggedInUser = null;
      chan.notify({ method: 'logout' });
    }
  });

  chan.bind("dialog_running", function(trans, params) {
    pause = true;
  });

  chan.bind("dialog_complete", function(trans, params) {
    pause = false;
    // the dialog running can change authentication status,
    // lets manually purge our network cache
    network.clearContext();
    checkAndEmit();
  });
}());
