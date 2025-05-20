/**  Copyright (c) Manuel Lõhmus (MIT License) */

'use strict';

(function () {

    exportModule('ws-user', ["data-context", 'data-context-binding'], function factory(DC, DB) {

        var globalScope = this,
            isDebug = document && Array.from(document.scripts).find(function (s) { return s.src.includes('ws-user'); }).attributes.debug || false,
            wsOrigin = '',
            wsUser = null,
            userEmail = '',
            connID = generateConnectionID(),
            root_datacontext = DB() || DC({});

        root_datacontext.isWsOnline = false;

        waitForReadyState("complete", autoConnect);

        return Object.defineProperties(CreateWsUser, {
            CONNECTING: { value: 0, writable: false, enumerable: false, configurable: false },
            OPEN: { value: 1, writable: false, enumerable: false, configurable: false },
            CLOSING: { value: 2, writable: false, enumerable: false, configurable: false },
            CLOSED: { value: 3, writable: false, enumerable: false, configurable: false },
            PAUSE: { value: 4, writable: false, enumerable: false, configurable: false },
            CreateLink: { value: CreateLink, writable: false, enumerable: false, configurable: false },
            wsUserURL: { value: (location.protocol == 'http:' ? 'ws://' : 'wss://') + location.hostname + ':' + ((location.port || location.protocol == 'http:' && 80 || 443) + 1), writable: true, enumerable: false, configurable: false },
            navigationLinksTemplate: { value: 'templates/navigation-links-user.html', writable: true, enumerable: false, configurable: false },
            confirmMailModalTemplate: { value: 'templates/confirm-mail-modal.html', writable: true, enumerable: false, configurable: false },
            confirmMailTemplate: { value: 'templates/confirm-mail.html', writable: true, enumerable: false, configurable: false },
            resetPasswordModalTemplate: { value: 'templates/reset-password-modal.html', writable: true, enumerable: false, configurable: false },
            resetPasswordTemplate: { value: 'templates/reset-password.html', writable: true, enumerable: false, configurable: false },
        });


        function CreateWsUser({
            debugMode = undefined,
            url = ''
        } = {}) {

            if (CreateWsUser === this?.constructor) { throw new Error('CreateWsUser must be called without `new` keyword!'); }

            if (typeof debugMode === 'boolean') { isDebug = debugMode; }
            globalScope.onerror = onerror;
            globalScope.onbeforeunload = onbeforeunload;
            globalScope.onclick = onclick;
            onclick.obj = {};
            onclick.obj[location.href.replace(location.origin, '')] = 1;

            wsUser = createWebSocket('ws-user', url);
            document.documentElement.wsLink = wsUser;

            return wsUser;


            function onerror(msg, url, line, col) {

                var err = `${msg} > ${url} > line:${line} col:${col}`;
                if (isDebug) { console.warn(err); }
                wsUser?.send('$log_error: ' + err);

                var suppressErrorAlert = isDebug;
                return suppressErrorAlert;
            }
            function onbeforeunload(event) {

                // 1000: Normal Closure
                if (wsUser?.readyState === CreateWsUser.OPEN) {

                    logout(connID);
                    setTimeout(wsUser.close, 500);
                }

                return;
            }
            function onclick(event) {

                var k = gethref(event.target);

                if (!onclick.obj) { onclick.obj = {}; }
                if (k) { onclick.obj[k] = onclick.obj[k] ? onclick.obj[k] + 1 : 1; }


                function gethref(el) {

                    while (el.href || el.parentElement) {

                        if (el.href) {

                            return el.href.replace(location.origin, '');
                        }
                        el = el.parentElement;
                    }
                }
            }
            function logout(conn_id = '') {

                if (onclick.obj && Object.keys(onclick.obj).length) 
                { wsUser.send('$log:' + JSON.stringify(onclick.obj)); }
                wsUser.logout(conn_id);
            }
        }
        function CreateLink(path, element) {

            if (CreateLink === this?.constructor) { throw new Error('CreateLink must be called without `new` keyword!'); }

            if (!element instanceof Node) {

                pError(new Error("Invalid HTML element."));

                return null;
            }

            if (!CreateLink.link_map) { CreateLink.link_map = Object.create(null); }

            if (CreateLink.link_map[path]) {
                
                if (!CreateLink.link_map[path].elements.includes(element)) {

                    CreateLink.link_map[path].elements.push(element);

                    if (!CreateLink.link_map[path].initDataContext) {

                        element.datacontext = CreateLink.link_map[path].datacontext;
                        DB.bindAllElements(element, false, true);
                    }
                }

                return CreateLink.link_map[path];
            }

            var wsLink = createWebSocket('ws-link', path);

            if (wsLink) {

                CreateLink.link_map[path] = wsLink;
                wsLink.elements = [element];
                wsLink.datacontext = DC({});
                wsLink.initDataContext = true;

                wsLink.intervalCheck = setInterval(function () {

                    wsLink.elements = wsLink.elements.filter(function (elem) { return elem.isConnected; });

                    if (!wsLink.elements.length) {

                        clearInterval(wsLink.intervalCheck);
                        wsLink.close();
                        delete CreateLink.link_map[path];
                    }
                }, 10000);

                wsLink.onmessage = function (event) {

                    if (!wsLink.elements.length) { return; }

                    if (wsLink.initDataContext) {

                        delete wsLink.initDataContext;
                        wsLink.datacontext.on('-change', onchange);

                        wsLink.elements.forEach(function (elem) {

                            elem.datacontext = wsLink.datacontext;
                            DB.bindAllElements(elem, false, true);
                        });
                    }

                    wsLink.datacontext.overwritingData(event.data);
                    wsLink.datacontext.resetChanges();
                };
                wsLink.onclose = function (event) {

                    // 1000: Normal Closure 
                    if (event.code === 1000) { return; }

                    // 1008: Policy Violation 
                    //    The endpoint is terminating the connection because it received a message that violates its policy.
                    //    This is a generic status code, used when codes 1003 and 1009 are not suitable.
                    if (event.code === 1008 && root_datacontext?.user?.isLogged) { return; }

                    reconnect();
                };
            }

            return wsLink;


            function onchange(event) {

                clearTimeout(onchange.timeout);

                onchange.timeout = setTimeout(function () {

                    var strChanges = wsLink.datacontext.stringifyChanges();

                    if (strChanges !== undefined) { wsLink.send(strChanges); }
                }, 10);

                return wsLink?.elements?.length;
            }
            function reconnect() {

                if (wsUser?.readyState !== CreateWsUser.OPEN &&
                    wsUser?.readyState !== CreateWsUser.PAUSE) {

                    setTimeout(reconnect, 1500); // 1.5s

                    return;
                }

                setTimeout(wsLink.reconnect, 100);
            }
        }
        // Private methods
        function generateConnectionID() {

            var id = '';
            var key = Array.from("abcdefghijklmnopqrstuvwxyz0123456789");

            while (key.length > 0) {
                id += key.splice(getRandomInt(key.length - 1), 1).join('');
            }

            var key = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

            while (key.length > 0) {
                id += key.splice(getRandomInt(key.length - 1), 1).join('');
            }

            return id;


            function getRandomInt(max) { return Math.floor(Math.random() * Math.floor(max)); }
        }
        function createWebSocket(protocol, url) {

            /**
             * CONNECTING: 0 | OPEN: 1 | CLOSING: 2 | CLOSED: 3 | PAUSE: 4  
             * @type {0|1|2|3|4} readyState 
             */
            var readyState = CreateWsUser.CONNECTING,
                sendedData = null,
                self = Object.create(null),
                protocols = [protocol, connID],
                ws = null,
                path = new URL(url, wsOrigin || CreateWsUser.wsUserURL || location),
                autoLoginTimeout = null;

            if (!wsOrigin) { wsOrigin = path.origin; }

            if (!userEmail) { sendedData = null; }

            if (userEmail) { protocols.push(userEmail.replace("@", "*")); }

            if (protocol === 'ws-user') {

                Object.defineProperties(self, {
                    // Public properties
                    email: { get: function () { return userEmail }, enumerable: true, configurable: false },
                    connID: { get: function () { return connID }, enumerable: true, configurable: false },
                    // Public events (callbacks)
                    onuserinfo: { value: null, writable: true, enumerable: false, configurable: false },
                    onlogin: { value: null, writable: true, enumerable: false, configurable: false },
                    // Public methods
                    login: { value: login, writable: false, enumerable: false, configurable: false },
                    logout: { value: logout, writable: false, enumerable: false, configurable: false },
                    create_account: { value: create_account, writable: false, enumerable: false, configurable: false },
                    update_name: { value: update_name, writable: false, enumerable: false, configurable: false },
                    update_password: { value: update_password, writable: false, enumerable: false, configurable: false },
                    security_code: { value: security_code, writable: false, enumerable: false, configurable: false },
                    datacontext: { get: function () { return root_datacontext.user }, enumerable: false, configurable: false },
                });

                //commands.userinfo = userinfo;
            }

            ws = newWebSocket();

            return Object.defineProperties(self, {
                // Public properties
                protocol: { get: function () { return protocol }, enumerable: false, configurable: false },
                readyState: { get: function () { return readyState }, enumerable: false, configurable: false },
                extensionCommands: { value: null, writable: true, enumerable: false, configurable: false },
                // Public events (callbacks)
                onreadystate: { value: null, writable: true, enumerable: false, configurable: false },
                onopen: { value: null, writable: true, enumerable: false, configurable: false },
                onmessage: { value: null, writable: true, enumerable: false, configurable: false },
                onerror: { value: null, writable: true, enumerable: false, configurable: false },
                onclose: { value: null, writable: true, enumerable: false, configurable: false },
                // Public methods
                send: { value: send, writable: false, enumerable: false, configurable: false },
                close: { value: close, writable: false, enumerable: false, configurable: false },
                reconnect: {
                    value: function (code = 1000, reason = 'Normal closure') { reconnect(code, reason); },
                    writable: false, enumerable: false, configurable: false
                },
            });


            function newWebSocket() {

                var _ws = new WebSocket(path, protocols);

                _ws.BinaryData = 'ArrayBuffer';

                _ws.onopen = ws?.onopen || onWsOpen;
                _ws.onmessage = ws?.onmessage || onWsMessage;
                _ws.onerror = ws?.onerror || onWsError;
                _ws.onclose = ws?.onclose || onWsClose;

                return _ws;
            }
            // Event handlers
            function onWsOpen() {

                pDebug('Connection opened');
                setReadyState(CreateWsUser.OPEN);
                if (sendedData) { send(sendedData); }
                self.onopen && self.onopen();
                autoLoginTimeout = setTimeout(function () {

                    if (root_datacontext?.user?.isLogged && ws?.protocol === "ws-user") {

                        self.onuserinfo?.({ userinfo: { message: 'Connection restored.', alerttype: 'alert-success' } });
                    }
                    else { autoLogin(); }

                }, 1000); // 1s
            }
            function onWsMessage(event) {

                if (typeof event.data === 'string' && event.data.startsWith('$redirect_to_port:')) {

                    // Redirect to another port
                    clearTimeout(autoLoginTimeout);
                    ws.onclose = null;
                    close();
                    path.port = event.data.split(':').pop();
                    ws = newWebSocket();

                    return;
                }

                if (typeof event.data === 'string' && !event.data) {

                    pDebug('Received - State => OPEN');
                    setReadyState(CreateWsUser.OPEN);
                    sendedData = null;

                    return;
                }

                pDebug('Message received', event);

                if (commandHandling(event.data)) { return; }

                if (typeof self.onmessage === 'function') {

                    self.onmessage(event)
                    setTimeout(messageHandled);

                    return;
                }

                setTimeout(messageHandled);
            }
            function onWsError(event) {

                event.preventDefault();
                self.onerror && self.onerror(event);

                return false;
            }
            function onWsClose(event) {

                pDebug('Connection closed', event);
                setReadyState(CreateWsUser.CLOSED);

                //Set the default path to the current location
                path = new URL(url, wsOrigin || location);

                // 1000: Normal Closure 
                // 1008: Policy Violation 
                //    The endpoint is terminating the connection because it received a message that violates its policy.
                //    This is a generic status code, used when codes 1003 and 1009 are not suitable.
                if (event.code === 1000 || event.code === 1008) { return; }

                if (userEmail && self.onuserinfo && ws?.protocol === "ws-user") {
                    
                    self.onuserinfo({ userinfo: { message: 'Connection lost. Reconnecting...', alerttype: 'alert-warning' } });
                }

                if (protocol === 'ws-user') {

                    setTimeout(() => {

                        if (event.code === 3001) { userEmail = ''; }
                        reconnect();

                    }, 1500); // 1.5s
                }

                self.onclose && self.onclose(event);
            }
            // Public methods
            function send(data) {

                if (!data || !(data?.length || data?.byteLength)
                    || readyState === CreateWsUser.CLOSING
                    || readyState === CreateWsUser.CLOSED) {

                    return;
                }

                // OPEN: 1
                if (readyState === CreateWsUser.OPEN) {

                    pDebug('Send - State => PAUSE');
                    setReadyState(CreateWsUser.PAUSE);
                    pDebug(`'Sending message'`, data.replace(/\s+/g, ''));

                    ws.send(data);
                    sendedData = data;

                    return;
                }

                // Wait for connection to open and try again in 100ms intervals
                setTimeout(send, 100, data);
            }
            function messageHandled() { ws.send(''); }
            function close(code = 1000, reason = 'Normal closure') {

                if (!ws) { return; }

                setReadyState(CreateWsUser.CLOSING);
                ws?.close(code, reason);
            }
            function reconnect(code = 1000, reason = 'Normal closure') {

                setTimeout(() => {

                    ws = newWebSocket();
                });

                close(code, reason);
            }
            function login(email, password, remember) {

                send('$login:' + masking(`${email}:${password}`, connID));
                setTimeout(rememberUser, 1000, email, password, remember);
            }
            function logout(conn_id = '') {

                send(`$logout:${conn_id}`);

                if (!conn_id && navigator.credentials) {

                    navigator.credentials.preventSilentAccess().catch(pError);
                }
            }
            function create_account(email, password, name) {

                send('$create_account:' + masking(`${email}:${password}:${name}`, connID));
            }
            function update_name(name) {

                send('$update_name:' + `${userEmail}:${name}`);
            }
            function update_password(password) {

                send('$update_password:' + masking(`${userEmail}:${password}`, connID));
            }
            function security_code(email, code = '', resetPassword = '') {

                send('$security_code:' + masking(`${email}:${code}:${resetPassword}`, connID));
            }
            // Private methods
            function autoLogin() {

                if (!root_datacontext?.user?.isLogged && 'credentials' in navigator) {

                    navigator.credentials
                        .get({
                            mediation: "silent",
                            password: true,
                            federated: { providers: [location.origin] }
                        })
                        .then((credential) => {

                            if (credential) { login(credential.id, credential.password); }
                        })
                        .catch(pError);
                }
            }
            function rememberUser(email, password, remember) {

                if (remember !== undefined && navigator.credentials) {

                    if (remember) {

                        navigator.credentials.store(new PasswordCredential({
                            origin: location.origin,
                            iconURL: document.querySelector('link[rel=icon]')?.href || '',
                            id: email,
                            name: root_datacontext?.user?.name || '',
                            password
                        })).catch(pError);
                    }
                    else {

                        navigator.credentials.preventSilentAccess().catch(pError);
                    }
                }
            }
            function setReadyState(state) {

                readyState = state;
                self.onreadystate?.(state);

                if (protocol === 'ws-user') {

                    root_datacontext.isWsOnline = readyState === CreateWsUser.OPEN || readyState === CreateWsUser.PAUSE;
                }
            }
            function commandHandling(message) {

                var msgObj = parseMsg(message);

                if (msgObj) {

                    setTimeout(handling, 0, msgObj);

                    return true;
                }
                else { return false; }


                function handling(msgObj) {

                    if (msgObj.cmd === 'userinfo') {

                        userinfo(msgObj.rawBody, messageHandled);

                        return;
                    }

                    if (msgObj.cmd === 'resources') {

                        if (!root_datacontext.resources?._isDataContext) { datacontext.resources = DC(datacontext.resources || []); }

                        root_datacontext.resources.overwritingData(msgObj.rawBody);
                        root_datacontext.resources.resetChanges();

                        messageHandled();

                        return;
                    }

                    if (typeof self.extensionCommands?.[msgObj.cmd] === 'function') {

                        self.extensionCommands[msgObj.cmd].call(self, { message: msgObj.rawBody, done: messageHandled });

                        return;
                    }

                    pDebug('Command not found >', msgObj.cmd);
                    messageHandled();
                }
                function parseMsg(message) {

                    if (message[0] !== '$') { return null; }

                    var msgObj = {
                        cmd: '',
                        rawBody: ''
                    };

                    message = (message + '').split(':');
                    msgObj.cmd = (message.shift() + '').trim();
                    if (msgObj.cmd[0] === '$') { msgObj.cmd = msgObj.cmd.substring(1); }
                    msgObj.rawBody = message.join(':');

                    return msgObj;
                }
            }
            function masking(str, key) {

                var encoder = new TextEncoder(),
                    decoder = new TextDecoder('utf-8');
                str = encoder.encode(str);
                key = encoder.encode(key.substring(0, 4));

                for (var i = 0, n = str.length; i < n; i++) {

                    str[i] = str[i] ^ key[i & 3];
                }

                return btoa(String.fromCharCode(...new Uint8Array(str.buffer)));
            }
            // WS-User commands
            function userinfo(msg, done) {

                if (!root_datacontext.user) { root_datacontext.user = {}; }
                DC.syncData(root_datacontext.user, JSON.parse(msg));
                userEmail = root_datacontext.user.email;

                if (!root_datacontext.user.isLogged && globalScope.UFE) { globalScope.UFE.renderIndexContent(); }

                if (root_datacontext.user.message && globalScope.UFE) {

                    setTimeout(globalScope.UFE.showAlert, 100, root_datacontext.user.message, root_datacontext.user.alerttype);
                }

                if (root_datacontext.user.securityCode && globalScope.UFE && CreateWsUser.confirmMailModalTemplate) {

                    globalScope.UFE.openModal(CreateWsUser.confirmMailModalTemplate);
                }
                else if (root_datacontext.user.securityCode && globalScope.UFE && CreateWsUser.confirmMailTemplate) {

                    globalScope.UFE.renderContent(CreateWsUser.confirmMailTemplate);
                }

                if (root_datacontext.user.resetPassword && globalScope.UFE && CreateWsUser.resetPasswordModalTemplate) {

                    globalScope.UFE.openModal(CreateWsUser.resetPasswordModalTemplate);
                }
                else if (root_datacontext.user.resetPassword && globalScope.UFE && CreateWsUser.resetPasswordTemplate) {

                    globalScope.UFE.renderContent(CreateWsUser.resetPasswordTemplate);
                }

                if (root_datacontext.user.roles?.includes('user') && globalScope.UFE?.navigationLinksContainerSelector) {

                    var contentDiv = document.querySelector(globalScope.UFE.navigationLinksContainerSelector);
                    if (!userinfo.navigationLinksOriginalHTML) { userinfo.navigationLinksOriginalHTML = contentDiv.innerHTML; }
                    contentDiv.innerHTML = '';
                    contentDiv.setAttribute('template', CreateWsUser.navigationLinksTemplate);
                    DB.bindAllElements(contentDiv, true);
                    setTimeout(function () { globalScope.UFE?.setMenuItemActive(location.hash); });
                }
                else if (globalScope.UFE?.navigationLinksContainerSelector) {

                    var contentDiv = document.querySelector(globalScope.UFE.navigationLinksContainerSelector);
                    if (userinfo.navigationLinksOriginalHTML) { contentDiv.innerHTML = userinfo.navigationLinksOriginalHTML; }
                    contentDiv.removeAttribute('template');
                    DB.bindAllElements(contentDiv, true);
                    setTimeout(function () { globalScope.UFE?.setMenuItemActive(location.hash); });
                }

                if (self.onuserinfo) {

                    self.onuserinfo({ user: root_datacontext.user });
                }

                done();
            }

            // Debugging
            function pDebug(...args) { if (isDebug) { console.log(`[ DEBUG ] '${protocol}' > ${path} `, ...args); } }
            function pError(...args) { if (isDebug) { console.error(`[ ERROR ] '${protocol}' > ${path} `, ...args); } }
        }

        function autoConnect() {

            setTimeout(function () {

                globalScope.wsUser = CreateWsUser();

            }, 200);
        }
        function waitForReadyState(state, cb) {

            if (document.readyState == state)
                setTimeout(cb, 50);
            else
                setTimeout(waitForReadyState, 0, state, cb);
        }
    });

    /**
     * Exporting the library as a module.
     * @param {string} exportIdentifier Export identifier
     * @param {string[]} importIdentifierArray Import identifier array
     * @param {any} factory Factory function
     * @returns {void}
     */
    function exportModule(exportIdentifier, importIdentifierArray, factory) {

        var thisScope = "undefined" != typeof globalThis
            ? globalThis
            : "undefined" != typeof window
                ? window
                : "undefined" != typeof global
                    ? global : "undefined" != typeof self
                        ? self
                        : {};

        if (!thisScope.modules) { thisScope.modules = {}; }

        // Browser
        waitModules();


        function waitModules() {

            if (importIdentifierArray.length) {

                for (let i = 0; i < importIdentifierArray.length; i++) {

                    if (!thisScope.modules[importIdentifierArray[i]]) {

                        waitModules.count = waitModules.count ? waitModules.count + 1 : 1;
                        if (waitModules.count > 100) { console.warn('Wait for module', importIdentifierArray[i]); }
                        return setTimeout(waitModules, 10);
                    }
                }
            }

            thisScope.modules[exportIdentifier] = factory.call(thisScope, ...importIdentifierArray.map(function (id) { return thisScope.modules[id]; }));
        }
    }
})();