/**  Copyright (c) Manuel Lõhmus (MIT License) */

'use strict';

var path = require('path'),
    fs = require('fs'),
    crypto = require("crypto"),
    DataContext = require('data-context'),
    configSets = require('config-sets'),
    userConfigSets = configSets('ws-user', {
        isDebug: false,
        pathToFrontendErrorFile: 'log/frontend_errors.log',
        pathToLogFile: '',
        pathToLoggedUsers: 'logged_users.json',
        pathToUsersDir: 'users',
        fileSecurityCodeText: "./public/www/templates/.security-code.txt",
        fileSecurityCodeHtml: "./public/www/templates/.security-code.html"
    }),
    loggedUsers = DataContext.watchJsonFile({ filePath: userConfigSets.pathToLoggedUsers });

Object.defineProperties(CreateWsUser, {
    CONNECTING: { value: 0, writable: false, enumerable: false, configurable: false },
    OPEN: { value: 1, writable: false, enumerable: false, configurable: false },
    CLOSING: { value: 2, writable: false, enumerable: false, configurable: false },
    CLOSED: { value: 3, writable: false, enumerable: false, configurable: false },
    PAUSE: { value: 4, writable: false, enumerable: false, configurable: false },
    addUser: { value: addUser, writable: false, enumerable: false, configurable: false },
});

//*** nodemailer ***
var nodemailer = require("nodemailer"),
    nodemailerOptions = configSets('nodemailer', {
        isDebug: false,
        domain_account: 'localhost',
        auth: {
            user: "*user*@localhost",
            pass: ""
        }
    });
/**
 * @typedef {object} MailOptions
 * @property {string} from 
 * @property {string} to
 * @property {string} cc
 * @property {string} bcc
 * @property {string} subject
 * @property {string} text
 * @property {string} html
 * @property {any[]} attachments
 */
/**
 * Send mail from noreply@*******.**
 * @param {MailOptions} mailOptions
 * @param {(err:Error|null)=>void} callback
 */
function sendMail(mailOptions, callback) {

    if (nodemailerOptions.auth.user === "*user*@localhost" || nodemailerOptions.auth.pass === "") {

        var errorMessage = "Please configure 'nodemailer' transporter options in 'config-sets.json' file.\n\tSee options: https://nodemailer.com/smtp/";

        if (nodemailerOptions.isDebug) { console.error("[ ERROR ] 'nodemailer'", errorMessage); }

        return callback(errorMessage);
    }

    nodemailer.createTransport(nodemailerOptions)
        .sendMail(mailOptions, function (err, info) {

            if (err) {

                if (nodemailerOptions.isDebug) { console.error("[ ERROR ] 'nodemailer'", err); }

                callback(err);
            }

            else {

                var isOK = info.response.startsWith("250");
                mailOptions.to
                    .split(",")
                    .map(function (str) { return str.trim() })
                    .forEach(function (str) { if (!info.accepted.includes(str)) { isOK = false; } });

                if (nodemailerOptions.isDebug) { console.log("[ INFO ] 'nodemailer'", info); }

                callback(isOK ? null : new Error("Sending email failed."));
            }
        });
}

return module.exports = CreateWsUser;


/**
 * CreateWsUser
 * @param {Options} options
 * @property {0} CONNECTING - The connection is not yet open.
 * @property {1} OPEN - The connection is open and ready to communicate.
 * @property {2} CLOSING - The connection is in the process of closing.
 * @property {3} CLOSED - The connection is closed or couldn't be opened.
 * @property {4} PAUSE - The connection is paused.
 * @returns {WsUser}
 * 
 * @typedef {Object} Options
 * @property {http.IncomingMessage|http.ClientRequest} request - Reference link: https://nodejs.org/docs/latest/api/http.html#class-httpincomingmessage or https://nodejs.org/docs/latest/api/http.html#class-httpclientrequest
 * @property {Object.<string, string>} headers - Key-value pairs of header names and values. Header names are lower-cased.
 * @property {net.Socket} socket - This class is an abstraction of a TCP socket or a streaming IPC endpoint.
 * @property {string} protocol - The sub-protocol selected by the server. Default ''.
 * @property {string} origin - String. Default empty string.
 * @property {number} heartbeatInterval_ms - The interval after which ping pong takes place. Default on the client side 0ms and on the server side 30000ms.
 * @property {Object} extension - The extensions selected by the server. Default 'permessage-deflate' 
 * @property {string} url - This is the URL of the WebSocket server to connect to. Default empty string.
 * 
 * @typedef {Object} WsUser
 * @property {0|1|2|3|4} redyState CONNECTING: 0 | OPEN: 1 | CLOSING: 2 | CLOSED: 3 | PAUSE: 4
 * @property {()=>void} onopen - Event handler for the 'open' event.
 * @property {(ev:{data})=>void} onmessage - Event handler for the 'message' event.
 * @property {(ev:{error})=>void} onerror - Event handler for the 'error' event.
 * @property {(ev:{code, reason})=>void} onclose - Event handler for the 'close' event.
 * @property {(data:string|BinaryData)=>void} send - Sends data to the server over the WebSocket connection.
 * @property {(code:number, reason:string)=>void} close - Closes the WebSocket connection or connection attempt, if any.
 */
function CreateWsUser({
    request,
    url = '',
    headers,
    socket,
    protocol = '',
    origin = '',
    heartbeatInterval_ms = 0,
    extension,
} = {}) {

    if (CreateWsUser === this?.constructor) { throw new Error('CreateWsUser must be called without `new` keyword!'); }

        /**
         * CONNECTING: 0 | OPEN: 1 | CLOSING: 2 | CLOSED: 3 | PAUSE: 4  
         * @type {0|1|2|3|4} readyState 
         */
    var readyState = CreateWsUser.CONNECTING,
        isWsUser = false,
        connID = '',
        email = '',
        roles = [],
        organizations = [],
        sendedData = null,
        ws = createWebSocket(),
        location = origin || headers?.origin || request?.headers?.origin,
        self = Object.create(null);

    if (!ws) { return null; }

    loggedUsers.on('-change', (event) => {

        if (!loggedUsers[email] && readyState === 1 && roles.length) {

            sendUserinfo({ isLogged: false });
        }

        return Boolean(self);
    });

    return Object.defineProperties(self, {
        // Public properties
        readyState: {
            get: function () { return readyState },
            set: function (v) { readyState = v; this.onreadystate?.(v); },
            enumerable: false, configurable: false
        },
        protocol: { get: function () { return protocol }, enumerable: false, configurable: false },
        connID: { get: function () { return connID }, enumerable: false, configurable: false },
        email: { get: function () { return email }, enumerable: false, configurable: false },
        roles: { get: function () { return roles }, enumerable: false, configurable: false },
        organizations: { get: function () { return organizations }, enumerable: false, configurable: false },
        url: { get: function () { return url }, enumerable: false, configurable: false },
        isLoggedIn: { get: function () { return Boolean(loggedUsers[email]?.connIDs?.includes(connID)); }, enumerable: false, configurable: false },
        extensionCommands: { value: Object.create(null), writable: false, enumerable: false, configurable: false },
        // Public events (callbacks)
        onreadystate: { value: null, writable: true, enumerable: false, configurable: false },
        onopen: { value: null, writable: true, enumerable: false, configurable: false },
        onmessage: { value: null, writable: true, enumerable: false, configurable: false },
        onerror: { value: null, writable: true, enumerable: false, configurable: false },
        onclose: { value: null, writable: true, enumerable: false, configurable: false },
        onloggedin: { value: null, writable: true, enumerable: false, configurable: false },
        // Public methods
        send: { value: sendData, writable: false, enumerable: false, configurable: false },
        messageHandled: { value: messageHandled, writable: false, enumerable: false, configurable: false },
        close: { value: close, writable: false, enumerable: false, configurable: false }
    });


    function createWebSocket() {

        if (!headers) { headers = request.headers; }

        if (headers?.['sec-websocket-protocol']) {

            var[pro, id, mail] = headers['sec-websocket-protocol']
                .replace(/,+/g, ' ')
                .split(' ')
                .filter(p => p);

            protocol = pro ? pro : protocol; 
            connID = id ? id : '';
            email = mail ? mail.replace("*", "@") : '';

            isWsUser = protocol === 'ws-user';
        }

        if (loggedUsers[email]?.connIDs?.includes(connID)
            && loggedUsers[email].roles) {

            roles = loggedUsers[email].roles;
            organizations = loggedUsers[email].organizations;
        }

        ws = require('ws13')({
            isDebug: userConfigSets.isDebug,
            request,
            headers,
            socket,
            protocol,
            origin,
            heartbeatInterval_ms,
            extension,
        });

        if (!ws) { return null; }

        ws.onopen = onWsOpen;
        ws.onmessage = onWsMessage;
        ws.onerror = onWsError;
        ws.onclose = onWsClose;

        return ws;
    }
    // Event handlers
    function onWsOpen() {

        pDebug('Connection opened');
        self.readyState = CreateWsUser.OPEN;

        if (isWsUser && loggedUsers[email]?.connIDs.includes(connID)) {

            sendUserinfo({ isLogged: true, user: loggedUsers[email] });
        }
        else if (isWsUser) { sendUserinfo({ isLogged: false }); }

        if (sendedData?.startsWith('$userinfo')) { sendedData = null; }

        if (sendedData) { sendData(sendedData); }
        self.onopen && self.onopen.call(self);
    }
    function onWsMessage(event) {

        if (typeof event.data === 'string' && !event.data) {

            pDebug('Received - State => OPEN');
            self.readyState = CreateWsUser.OPEN;
            sendedData = null;

            return;
        }

        if (executeCommand(event.data)) { return; }

        pDebug(`'Message received'`, (event.data + '').replace(/\s+/g, '').substring(0, 64));
        self.onmessage && self.onmessage.call(self, event);
    }
    function onWsError(event) {

        pError(event);
        self.onerror && self.onerror.call(self, event);
    }
    function onWsClose(event) {

        pDebug('Connection closed', event);
        self.readyState = CreateWsUser.CLOSED;
        self.onclose && self.onclose.call(self, event);

        // websocket - Going Away
        if (isWsUser && (event.code === 1001 || event.code === 1006)) { connLogout(); }

        function connLogout() {

            if (loggedUsers[email]?.connIDs.includes(connID)) {

                loggedUsers[email].connIDs = loggedUsers[email].connIDs.filter(c => c !== connID);
            }

            if (!loggedUsers[email]?.connIDs.length) { delete loggedUsers[email]; }
        }
    }
    // Public methods
    function sendData(data) {

        if (!data || !(data?.length || data?.byteLength)
            || self.readyState === CreateWsUser.CLOSING
            || self.readyState === CreateWsUser.CLOSED) {

            return;
        }

        // OPEN: 1
        if (self.readyState === CreateWsUser.OPEN) {

            pDebug('Send - State => PAUSE');
            pDebug(`'Sending message'`, data.replace(/\s+/g, '').substring(0, 64));
            self.readyState = CreateWsUser.PAUSE;

            ws.send(data);
            sendedData = data;

            return;
        }

        // Wait for connection to open and try again in 100ms intervals
        setTimeout(sendData, 100, data);
    }
    function messageHandled() { ws.send(''); }
    function close(code = 1000, reason = 'Normal closure') {

        if (!ws) { return; }

        self.readyState = CreateWsUser.CLOSING;
        ws.close(code, reason);
    }
    // Private methods
    function executeCommand(message) {

        if (ws.protocol !== 'ws-user') { return false; }

        var msgObj = parseMsg(message);

        if (msgObj) {

            setTimeout(execute, 0, msgObj);

            return true;
        }

        return false; 

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
        function execute(msgObj) {

            var functionMap = {
                log: function (msg) {

                    if (!msg || !userConfigSets.pathToLogFile) { return; }
                    
                    var text = `${new Date().toISOString()}|${ws?.ip || 'undefined'}`;
                    while (text.length < 40) { text += ' '; }
                    text += `${msg}\n`;
                    var filePath = path.parse(userConfigSets.pathToLogFile);
                    filePath.base = location.substring(location.indexOf('//') + 2) + ('-' + filePath.base || '.log');
                    filePath = path.resolve(
                        path.parse(process.argv[1]).dir.split("node_modules").shift(),
                        filePath.dir,
                        filePath.base
                    );

                    if (!fs.existsSync(path.parse(filePath).dir)) {

                        fs.mkdirSync(
                            path.parse(filePath).dir,
                            { recursive: true }
                        );
                    }

                    fs.appendFile(filePath, text, function (err) {

                        if (err) { pError(err); }
                    });

                    done();
                },
                log_error: function (msg) {

                    var text = `[${new Date().toISOString()}][ ERROR ]\t${msg}\n`;
                    var filePath = path.resolve(path.parse(process.argv[1]).dir.split("node_modules").shift(), userConfigSets.pathToFrontendErrors);

                    if (!fs.existsSync(path.parse(filePath).dir)) {

                        fs.mkdirSync(
                            path.parse(filePath).dir,
                            { recursive: true }
                        );
                    }

                    fs.appendFile(filePath, text, function (err) {

                        if (err) { pError(err); }
                    });

                    pError('Frontend:', msg);
                    done();
                },
                login: function (msg) {

                    msg = unmasking(msg, connID);

                    var oldEmail = email, [userEmail, password] = msg.split(':');

                    var user = getUserDataFromFile(userEmail);

                    if (!user) { return; }

                    email = userEmail;

                    if (user.password !== encryptPassword(password)) {

                        sendUserinfo({
                            isLogged: false,
                            message: 'Wrong password.',
                            alerttype: 'alert-warning',
                            user: { email: userEmail, securityCode: user.securityCode }
                        });
                        done();

                        return;
                    }

                    // Logout
                    if (loggedUsers[oldEmail]?.connIDs.includes(connID)) {

                        loggedUsers[oldEmail].connIDs = loggedUsers[oldEmail].connIDs.filter(c => c !== connID);
                        organizations = [];
                        roles = [];

                        if (typeof self.onloggedin === 'function') { self.onloggedin.call(self, { isLoggedIn: false }); } 
                    }

                    if (!loggedUsers[oldEmail]?.connIDs.length) { delete loggedUsers[oldEmail]; }

                    // Login
                    if (!loggedUsers[userEmail]) {

                        loggedUsers[userEmail] = {
                            connIDs: [],
                            email: user.email,
                            name: user.name,
                            organizations: user.organizations,
                            roles: user.roles
                        };
                    }

                    if (!loggedUsers[userEmail].connIDs.includes(connID)) { loggedUsers[userEmail].connIDs.push(connID); }

                    organizations = user.organizations;
                    roles = user.roles;

                    sendUserinfo({ isLogged: true, message: 'You are logged in.', user });

                    if (!user.ip_addresses) { user.ip_addresses = []; }

                    if (!user.ip_addresses.includes(ws.ip)) {

                        user.ip_addresses.push(ws.ip);
                        saveUserDataToFile(user, function () { done(); });
                    }

                    if (typeof self.onloggedin === 'function') { self.onloggedin.call(self, { isLoggedIn: true }); } 

                    done();
                },
                logout: function (msg) {

                    var conn_id = msg;

                    if (conn_id && loggedUsers[email]) {

                        loggedUsers[email].connIDs = loggedUsers[email].connIDs.filter(c => c !== conn_id);
                        sendUserinfo({ message: 'You are logged out.' });
                    }
                    else {

                        delete loggedUsers[email];
                        sendUserinfo({ message: 'You are logged out everywhere.' });
                    }

                    if (typeof self.onloggedin === 'function') { self.onloggedin.call(self, { isLoggedIn: false }); } 

                    done();
                },
                create_account: function (msg) {

                    msg = unmasking(msg, connID);

                    var [userEmail, password, username] = msg.split(':'),
                        filePath = findUserDataFilePath(userEmail);

                    if (filePath) {

                        sendUserinfo({
                            isLogged: false,
                            message: 'Email in use.',
                            alerttype: 'alert-warning',
                        });
                        done();

                        return;
                    }

                    email = userEmail;
                    password = encryptPassword(password);

                    self.create_account = {
                        email: userEmail,
                        password,
                        name: username,
                        organizations: [],
                        roles: ['user']
                    };

                    sendSecurityCode(self.create_account, done);
                },
                update_name: function update_name(msg) {

                    var [userEmail, username] = msg.split(':'),
                        user = getUserDataFromFile(userEmail);

                    if (!user) { return; }

                    user.name = username;

                    if (loggedUsers[userEmail]) { loggedUsers[userEmail].name = username; }

                    saveUserDataToFile(user, function () {

                        sendUserinfo({ isLogged: true, message: 'You name is updated.', user });
                        done();
                    });
                },
                update_password: function update_password(msg) {

                    msg = unmasking(msg, connID);

                    var [userEmail, password] = msg.split(':'),
                        user = getUserDataFromFile(userEmail);

                    if (!user) { return; }

                    user.password = encryptPassword(password);

                    saveUserDataToFile(user, function () {

                        sendUserinfo({ isLogged: true, message: 'You password is updated.', user });
                        done();
                    });
                },
                security_code: function (msg) {

                    msg = unmasking(msg, connID);

                    var [userEmail, securityCode, resetPassword] = msg.split(':');

                    // end create account
                    if (securityCode && !resetPassword && self.create_account?.email === userEmail) {

                        if (self.create_account.securityCode !== securityCode) {

                            sendUserinfo({
                                isLogged: false,
                                message: `The security code does not match, try again. (${userEmail})`,
                                alerttype: 'alert-warning',
                                user: { email: userEmail }
                            });

                            delete self.create_account;

                            if (typeof self.onloggedin === 'function') { self.onloggedin.call(self, { isLoggedIn: false }); } 

                            done();

                            return;

                        }

                        delete self.create_account.securityCode;

                        saveUserDataToFile(self.create_account, function () {

                            sendUserinfo({ isLogged: true, message: 'You are logged in.', user: self.create_account });

                            delete self.create_account;

                            if (typeof self.onloggedin === 'function') { self.onloggedin.call(self, { isLoggedIn: true }); } 

                            done();
                        });

                        return;
                    }

                    var user = getUserDataFromFile(userEmail, done);

                    if (!user) { return; }

                    if (securityCode) {

                        if (securityCode !== user.securityCode) {

                            sendUserinfo({
                                isLogged: false,
                                message: `The security code does not match, try again. (${userEmail})`,
                                alerttype: 'alert-warning',
                                user: { email: userEmail }
                            });

                            return;
                        }

                        delete user.securityCode;
                        user.resetPassword = true;
                        sendUserinfo({ isLogged: true, message: 'You are logged in.', user });
                        delete user.resetPassword;
                        roles = user.roles;

                        saveUserDataToFile(user, done);

                        return;
                    }

                    sendSecurityCode(user, function () {

                        saveUserDataToFile(user, done);
                    });
                }
            }

            if (typeof functionMap[msgObj.cmd] === 'function') {

                return functionMap[msgObj.cmd](msgObj.rawBody);
            }

            if (typeof self.extensionCommands[msgObj.cmd] === 'function') {

                return self.extensionCommands[msgObj.cmd].call(self, { message: msgObj.rawBody, done });
            }

            pDebug('Command not found >', msgObj.cmd);
            done();

            return;


            function done() { messageHandled(); }
            function getUserDataFilePath(userEmail) {

                var filePath = findUserDataFilePath(userEmail);

                if (!filePath) {

                    sendUserinfo({
                        isLogged: false,
                        message: `User does not exist. (${userEmail})`,
                        alerttype: 'alert-warning',
                        user: { email: userEmail }
                    });
                    done();

                    return;
                }

                return filePath;
            }
            function getUserDataFromFile(userEmail) {

                if (!validEmail(userEmail)) {

                    sendUserinfo({
                        isLogged: false,
                        message: 'User email not validated.',
                        alerttype: 'alert-warning',
                    });
                    done();

                    return;
                }

                var filePath = getUserDataFilePath(userEmail, done);

                if (!filePath) { return; }

                return DataContext.parse(fs.readFileSync(filePath, { encoding: 'utf8' }), DataContext);

            }
            function saveUserDataToFile(user, cb_ok) {

                var filePath = calcUserDataFilePath(user.email);

                if (!filePath) { return; }

                if (!fs.existsSync(path.parse(filePath).dir)) {

                    fs.mkdirSync(
                        path.parse(filePath).dir,
                        { recursive: true }
                    );
                }

                fs.writeFile(
                    filePath,
                    DataContext.stringify(user, null, 2),
                    { encoding: 'utf8' },
                    (err) => {

                        if (err) throw err;
                        if (typeof cb_ok === 'function') { cb_ok(); }
                    }
                );
            }
            function sendSecurityCode(user, cb_ok) {

                user.securityCode = generateSecurityCode();

                sendSecurityCodeEmail(user, function (err) {

                    if (err) {

                        if (userConfigSets.isDebug) {

                            pDebug(user.email, 'securityCode', user.securityCode);
                        }

                        else {

                            delete user.securityCode;
                            sendUserinfo({ isLogged: false, message: 'Sending email failed.', alerttype: 'alert-warning' });
                            done();

                            return;
                        }
                    }

                    sendUserinfo({
                        isLogged: false,
                        message: 'Please check your email for the security code.',
                        alerttype: 'alert-info',
                        user: { securityCode: true, email: user.email }
                    });

                    if (typeof cb_ok === 'function') { cb_ok(); }
                });


                function sendSecurityCodeEmail(user, callback) {

                    var strText = userConfigSets?.fileSecurityCodeText && fs.existsSync(userConfigSets.fileSecurityCodeText) ? fs.readFileSync(fileText).toString() : "",
                        strHtml = userConfigSets?.fileSecurityCodeHtml && fs.existsSync(userConfigSets.fileSecurityCodeHtml) ? fs.readFileSync(fileHtml).toString() : "",
                        domain = nodemailerOptions.domain_account;

                    if (!domain || domain.includes('localhost')) {

                        domain = require('node:os').hostname();
                    }

                    var data = {
                        domain: domain.replace(/^\w/, function (c) { return c.toUpperCase(); }),
                        email: maskEmail(user.email),
                        securitycode: user.securityCode
                    };

                    Object.keys(data).forEach(function (key) {
                        strText = strText.split('[' + key + ']').join(data[key]);
                        strHtml = strHtml.split('[' + key + ']').join(htmlEncode(data[key]));
                    });

                    sendMail({
                        from: nodemailerOptions.auth.user, // sender address
                        to: user.email,// + ", conextra.ee@outlook.com", // list of receivers
                        subject: domain + " account security code", // Subject line
                        text: strText, // plain text body
                        html: strHtml, // html body
                    },
                        callback
                    );


                    function maskEmail(email) {

                        email = (email + '').split('@');
                        email[0] = email[0].length > 3
                            ? email[0].substr(0, 2) + '**********'
                            : email[0].substr(0, 1) + '**********';

                        return email.join('@');
                    }
                }
            }
        }
    }
    /**
     * @typedef {Object} Userinfo
     * @property {boolan} isLogged
     * @property {string} message
     * @property {string} alerttype "alert-error" | "alert-success" | "alert-info" | "alert-warning"
     * @property {object} user
     * 
     * @param {Userinfo} options
     * @returns {void}
     * 
     */
    function sendUserinfo({ isLogged = false, message = '', alerttype = 'alert-success', user = {} } = {}) {

        sendData('$userinfo:' + JSON.stringify({
            isLogged,
            message,
            alerttype,
            email: user.email || '',
            name: user.name || '',
            organizations: user.organizations || [],
            roles: user.roles || [],
            securityCode: Boolean(user.securityCode),
            resetPassword: Boolean(user.resetPassword)
        }));
    }

    // Debugging
    function pDebug(...args) { if (userConfigSets.isDebug) { console.log(`[ DEBUG ] 'ws-user' protocol:`, protocol, ...args); } }
    function pError(...args) { if (userConfigSets.isDebug) { console.error(`[ ERROR ] 'ws-user' protocol:`, protocol, ...args); } }
}


//*** Helpers ***/
function encryptPassword(password) {

    return sha512('us' + password);

    function sha512(data) { return crypto.createHash("sha512").update(data, "binary").digest("hex"); }
}
function unmasking(str, key) {

    str = Buffer.from(str, 'base64');
    key = Buffer.from(key.substring(0, 4), 'utf-8');

    for (var i = 0, n = str.length; i < n; i++) {

        str[i] = str[i] ^ key[i & 3];
    }

    return str.toString('utf8');
}
function generateSecurityCode() {

    function getRandomInt(max) { return Math.floor(Math.random() * Math.floor(max)); }

    var key = Array.from("0123456789");
    var code = '';

    while (code.length < 7) {
        code += key.splice(getRandomInt(key.length - 1), 1).join('');
    }
    return code;

}
function calcFilePath(filePath) {

    return path.resolve(path.parse(process.argv[1]).dir.split("node_modules").shift(), filePath);
}
function calcUserDataFilePath(userEmail) {

    return calcFilePath(path.join(userConfigSets.pathToUsersDir, userEmail, userEmail + '.json'));
}
function findUserDataFilePath(userEmail) {

    var filePath = calcUserDataFilePath(userEmail);

    if (!fs.existsSync(filePath)) { return; }

    return filePath;
}
function addUser(email, password, username) {

    if (!validEmail(email)) { return `Error: Email not validated.`; }
    if (!password) { return `Error: Password not validated.`; }
    if (password.length < 6) { return `Error: Password too short.`; }

    var filePath = findUserDataFilePath(email);

    if (filePath) { return `Error: Email in use.`; }

    if (!username) {

        // If username is not provided, use the part before the '@' in the email address
        username = email.split('@')[0];
        // Replace all '.' with ' ' in username
        username = username.replace(/\./g, ' ');
        // Remove all special characters from username
        username = username.trim().replace(/[^a-zA-Z0-9_\s]/g, '');
        // Capitalize the first letters
        username = username.replace(/^\w/, function (c) { return c.toUpperCase(); });
    }

    password = encryptPassword(password);

    var user = {
        email,
        password,
        name: username,
        organizations: [],
        roles: ['user'],
        //securityCode: generateSecurityCode()
    };

    // Create user directory if it doesn't exist
    filePath = calcUserDataFilePath(email);

    if (!fs.existsSync(path.parse(filePath).dir)) {

        fs.mkdirSync(
            path.parse(filePath).dir,
            { recursive: true }
        );
    }

    // Write user data to file
    fs.writeFileSync(filePath, DataContext.stringify(user, null, 2), { encoding: 'utf8' });

    return 'User created successfully.';
}
function validEmail(mail) { return /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()\.,;\s@\"]+\.{0,1})+([^<>()\.,;:\s@\"]{2,}|[\d\.]+))$/.test(mail); }
function htmlEncode(input) {

    var strOutput;

    if (input && input.constructor === String) {

        strOutput = "";

        for (var i = 0; i < input.length; i++) {

            var charCode = input.charCodeAt(i);

            switch (charCode) {

                case 9: strOutput += "&emsp;"; break; // \t
                case 10: strOutput += input.charCodeAt(i - 1) === 13 ? "" : "<br/>"; break; // \n
                case 13: strOutput += "<br/>"; break; // \r
                case 32: strOutput += "&nbsp;"; break; // " "
                case 34: strOutput += "&quot;"; break; // "
                case 38: strOutput += "&amp;"; break; // &
                case 39: strOutput += "&apos;"; break; // '
                case 60: strOutput += "&lt;"; break; // < 
                case 62: strOutput += "&gt;"; break; // >
                case 338: strOutput += "&OElig;"; break; // ?
                case 339: strOutput += "&oelig;"; break; // ?
                case 352: strOutput += "&Scaron;"; break; // Š
                case 353: strOutput += "&scaron;"; break; // š
                case 376: strOutput += "&Yuml;"; break; // ?
                case 402: strOutput += "&fnof;"; break; // ?
                case 710: strOutput += "&circ;"; break; // ?
                case 732: strOutput += "&tilde;"; break; // ?
                case 8194: strOutput += "&ensp;"; break; // 
                case 8195: strOutput += "&emsp;"; break; // 
                case 8201: strOutput += "&thinsp;"; break; // 
                case 8204: strOutput += "&zwnj;"; break; // 
                case 8205: strOutput += "&zwj;"; break; // 
                case 8206: strOutput += "&lrm;"; break; // 
                case 8207: strOutput += "&rlm;"; break; // 
                case 8211: strOutput += "&ndash;"; break; // –
                case 8212: strOutput += "&mdash;"; break; // —
                case 8216: strOutput += "&lsquo;"; break; // ‘
                case 8217: strOutput += "&rsquo;"; break; // ’
                case 8218: strOutput += "&sbquo;"; break; // ‚
                case 8220: strOutput += "&ldquo;"; break; // “
                case 8221: strOutput += "&rdquo;"; break; // ”
                case 8222: strOutput += "&bdquo;"; break; // „
                case 8224: strOutput += "&dagger;"; break; // †
                case 8225: strOutput += "&Dagger;"; break; // ‡
                case 8226: strOutput += "&bull;"; break; // •
                case 8249: strOutput += "&lsaquo;"; break; // ‹
                case 8250: strOutput += "&rsaquo;"; break; // ›
                //case : strOutput += "&;"; break; // 

                default:
                    if (charCode < 128)
                        strOutput += input.charAt(i);
                    else
                        strOutput += "&#" + charCode + ";";
                    break;
            }
        }

        return strOutput;
    }

    return input;
};
function htmlDecode(input) {

    var strOutput;

    if (input && input.constructor === String) {

        strOutput = "";

        /** @const */
        var entities = { "Aacute": [193], "aacute": [225], "Abreve": [258], "abreve": [259], "ac": [8766], "acd": [8767], "acE": [8766, 819], "Acirc": [194], "acirc": [226], "acute": [180], "Acy": [1040], "acy": [1072], "AElig": [198], "aelig": [230], "af": [8289], "Afr": [120068], "afr": [120094], "Agrave": [192], "agrave": [224], "alefsym": [8501], "aleph": [8501], "Alpha": [913], "alpha": [945], "Amacr": [256], "amacr": [257], "amalg": [10815], "AMP": [38], "amp": [38], "And": [10835], "and": [8743], "andand": [10837], "andd": [10844], "andslope": [10840], "andv": [10842], "ang": [8736], "ange": [10660], "angle": [8736], "angmsd": [8737], "angmsdaa": [10664], "angmsdab": [10665], "angmsdac": [10666], "angmsdad": [10667], "angmsdae": [10668], "angmsdaf": [10669], "angmsdag": [10670], "angmsdah": [10671], "angrt": [8735], "angrtvb": [8894], "angrtvbd": [10653], "angsph": [8738], "angst": [197], "angzarr": [9084], "Aogon": [260], "aogon": [261], "Aopf": [120120], "aopf": [120146], "ap": [8776], "apacir": [10863], "apE": [10864], "ape": [8778], "apid": [8779], "apos": [39], "ApplyFunction": [8289], "approx": [8776], "approxeq": [8778], "Aring": [197], "aring": [229], "Ascr": [119964], "ascr": [119990], "Assign": [8788], "ast": [42], "asymp": [8776], "asympeq": [8781], "Atilde": [195], "atilde": [227], "Auml": [196], "auml": [228], "awconint": [8755], "awint": [10769], "backcong": [8780], "backepsilon": [1014], "backprime": [8245], "backsim": [8765], "backsimeq": [8909], "Backslash": [8726], "Barv": [10983], "barvee": [8893], "Barwed": [8966], "barwed": [8965], "barwedge": [8965], "bbrk": [9141], "bbrktbrk": [9142], "bcong": [8780], "Bcy": [1041], "bcy": [1073], "bdquo": [8222], "becaus": [8757], "Because": [8757], "because": [8757], "bemptyv": [10672], "bepsi": [1014], "bernou": [8492], "Bernoullis": [8492], "Beta": [914], "beta": [946], "beth": [8502], "between": [8812], "Bfr": [120069], "bfr": [120095], "bigcap": [8898], "bigcirc": [9711], "bigcup": [8899], "bigodot": [10752], "bigoplus": [10753], "bigotimes": [10754], "bigsqcup": [10758], "bigstar": [9733], "bigtriangledown": [9661], "bigtriangleup": [9651], "biguplus": [10756], "bigvee": [8897], "bigwedge": [8896], "bkarow": [10509], "blacklozenge": [10731], "blacksquare": [9642], "blacktriangle": [9652], "blacktriangledown": [9662], "blacktriangleleft": [9666], "blacktriangleright": [9656], "blank": [9251], "blk12": [9618], "blk14": [9617], "blk34": [9619], "block": [9608], "bne": [61, 8421], "bnequiv": [8801, 8421], "bNot": [10989], "bnot": [8976], "Bopf": [120121], "bopf": [120147], "bot": [8869], "bottom": [8869], "bowtie": [8904], "boxbox": [10697], "boxDL": [9559], "boxDl": [9558], "boxdL": [9557], "boxdl": [9488], "boxDR": [9556], "boxDr": [9555], "boxdR": [9554], "boxdr": [9484], "boxH": [9552], "boxh": [9472], "boxHD": [9574], "boxHd": [9572], "boxhD": [9573], "boxhd": [9516], "boxHU": [9577], "boxHu": [9575], "boxhU": [9576], "boxhu": [9524], "boxminus": [8863], "boxplus": [8862], "boxtimes": [8864], "boxUL": [9565], "boxUl": [9564], "boxuL": [9563], "boxul": [9496], "boxUR": [9562], "boxUr": [9561], "boxuR": [9560], "boxur": [9492], "boxV": [9553], "boxv": [9474], "boxVH": [9580], "boxVh": [9579], "boxvH": [9578], "boxvh": [9532], "boxVL": [9571], "boxVl": [9570], "boxvL": [9569], "boxvl": [9508], "boxVR": [9568], "boxVr": [9567], "boxvR": [9566], "boxvr": [9500], "bprime": [8245], "Breve": [728], "breve": [728], "brvbar": [166], "Bscr": [8492], "bscr": [119991], "bsemi": [8271], "bsim": [8765], "bsime": [8909], "bsol": [92], "bsolb": [10693], "bsolhsub": [10184], "bull": [8226], "bullet": [8226], "bump": [8782], "bumpE": [10926], "bumpe": [8783], "Bumpeq": [8782], "bumpeq": [8783], "Cacute": [262], "cacute": [263], "Cap": [8914], "cap": [8745], "capand": [10820], "capbrcup": [10825], "capcap": [10827], "capcup": [10823], "capdot": [10816], "CapitalDifferentialD": [8517], "caps": [8745, 65024], "caret": [8257], "caron": [711], "Cayleys": [8493], "ccaps": [10829], "Ccaron": [268], "ccaron": [269], "Ccedil": [199], "ccedil": [231], "Ccirc": [264], "ccirc": [265], "Cconint": [8752], "ccups": [10828], "ccupssm": [10832], "Cdot": [266], "cdot": [267], "cedil": [184], "Cedilla": [184], "cemptyv": [10674], "cent": [162], "CenterDot": [183], "centerdot": [183], "Cfr": [8493], "cfr": [120096], "CHcy": [1063], "chcy": [1095], "check": [10003], "checkmark": [10003], "Chi": [935], "chi": [967], "cir": [9675], "circ": [710], "circeq": [8791], "circlearrowleft": [8634], "circlearrowright": [8635], "circledast": [8859], "circledcirc": [8858], "circleddash": [8861], "CircleDot": [8857], "circledR": [174], "circledS": [9416], "CircleMinus": [8854], "CirclePlus": [8853], "CircleTimes": [8855], "cirE": [10691], "cire": [8791], "cirfnint": [10768], "cirmid": [10991], "cirscir": [10690], "ClockwiseContourIntegral": [8754], "CloseCurlyDoubleQuote": [8221], "CloseCurlyQuote": [8217], "clubs": [9827], "clubsuit": [9827], "Colon": [8759], "colon": [58], "Colone": [10868], "colone": [8788], "coloneq": [8788], "comma": [44], "commat": [64], "comp": [8705], "compfn": [8728], "complement": [8705], "complexes": [8450], "cong": [8773], "congdot": [10861], "Congruent": [8801], "Conint": [8751], "conint": [8750], "ContourIntegral": [8750], "Copf": [8450], "copf": [120148], "coprod": [8720], "Coproduct": [8720], "COPY": [169], "copy": [169], "copysr": [8471], "CounterClockwiseContourIntegral": [8755], "crarr": [8629], "Cross": [10799], "cross": [10007], "Cscr": [119966], "cscr": [119992], "csub": [10959], "csube": [10961], "csup": [10960], "csupe": [10962], "ctdot": [8943], "cudarrl": [10552], "cudarrr": [10549], "cuepr": [8926], "cuesc": [8927], "cularr": [8630], "cularrp": [10557], "Cup": [8915], "cup": [8746], "cupbrcap": [10824], "CupCap": [8781], "cupcap": [10822], "cupcup": [10826], "cupdot": [8845], "cupor": [10821], "cups": [8746, 65024], "curarr": [8631], "curarrm": [10556], "curlyeqprec": [8926], "curlyeqsucc": [8927], "curlyvee": [8910], "curlywedge": [8911], "curren": [164], "curvearrowleft": [8630], "curvearrowright": [8631], "cuvee": [8910], "cuwed": [8911], "cwconint": [8754], "cwint": [8753], "cylcty": [9005], "Dagger": [8225], "dagger": [8224], "daleth": [8504], "Darr": [8609], "dArr": [8659], "darr": [8595], "dash": [8208], "Dashv": [10980], "dashv": [8867], "dbkarow": [10511], "dblac": [733], "Dcaron": [270], "dcaron": [271], "Dcy": [1044], "dcy": [1076], "DD": [8517], "dd": [8518], "ddagger": [8225], "ddarr": [8650], "DDotrahd": [10513], "ddotseq": [10871], "deg": [176], "Del": [8711], "Delta": [916], "delta": [948], "demptyv": [10673], "dfisht": [10623], "Dfr": [120071], "dfr": [120097], "dHar": [10597], "dharl": [8643], "dharr": [8642], "DiacriticalAcute": [180], "DiacriticalDot": [729], "DiacriticalDoubleAcute": [733], "DiacriticalGrave": [96], "DiacriticalTilde": [732], "diam": [8900], "Diamond": [8900], "diamond": [8900], "diamondsuit": [9830], "diams": [9830], "die": [168], "DifferentialD": [8518], "digamma": [989], "disin": [8946], "div": [247], "divide": [247], "divideontimes": [8903], "divonx": [8903], "DJcy": [1026], "djcy": [1106], "dlcorn": [8990], "dlcrop": [8973], "dollar": [36], "Dopf": [120123], "dopf": [120149], "Dot": [168], "dot": [729], "DotDot": [8412], "doteq": [8784], "doteqdot": [8785], "DotEqual": [8784], "dotminus": [8760], "dotplus": [8724], "dotsquare": [8865], "doublebarwedge": [8966], "DoubleContourIntegral": [8751], "DoubleDot": [168], "DoubleDownArrow": [8659], "DoubleLeftArrow": [8656], "DoubleLeftRightArrow": [8660], "DoubleLeftTee": [10980], "DoubleLongLeftArrow": [10232], "DoubleLongLeftRightArrow": [10234], "DoubleLongRightArrow": [10233], "DoubleRightArrow": [8658], "DoubleRightTee": [8872], "DoubleUpArrow": [8657], "DoubleUpDownArrow": [8661], "DoubleVerticalBar": [8741], "DownArrow": [8595], "Downarrow": [8659], "downarrow": [8595], "DownArrowBar": [10515], "DownArrowUpArrow": [8693], "DownBreve": [785], "downdownarrows": [8650], "downharpoonleft": [8643], "downharpoonright": [8642], "DownLeftRightVector": [10576], "DownLeftTeeVector": [10590], "DownLeftVector": [8637], "DownLeftVectorBar": [10582], "DownRightTeeVector": [10591], "DownRightVector": [8641], "DownRightVectorBar": [10583], "DownTee": [8868], "DownTeeArrow": [8615], "drbkarow": [10512], "drcorn": [8991], "drcrop": [8972], "Dscr": [119967], "dscr": [119993], "DScy": [1029], "dscy": [1109], "dsol": [10742], "Dstrok": [272], "dstrok": [273], "dtdot": [8945], "dtri": [9663], "dtrif": [9662], "duarr": [8693], "duhar": [10607], "dwangle": [10662], "DZcy": [1039], "dzcy": [1119], "dzigrarr": [10239], "Eacute": [201], "eacute": [233], "easter": [10862], "Ecaron": [282], "ecaron": [283], "ecir": [8790], "Ecirc": [202], "ecirc": [234], "ecolon": [8789], "Ecy": [1069], "ecy": [1101], "eDDot": [10871], "Edot": [278], "eDot": [8785], "edot": [279], "ee": [8519], "efDot": [8786], "Efr": [120072], "efr": [120098], "eg": [10906], "Egrave": [200], "egrave": [232], "egs": [10902], "egsdot": [10904], "el": [10905], "Element": [8712], "elinters": [9191], "ell": [8467], "els": [10901], "elsdot": [10903], "Emacr": [274], "emacr": [275], "empty": [8709], "emptyset": [8709], "EmptySmallSquare": [9723], "emptyv": [8709], "EmptyVerySmallSquare": [9643], "emsp": [8195], "emsp13": [8196], "emsp14": [8197], "ENG": [330], "eng": [331], "ensp": [8194], "Eogon": [280], "eogon": [281], "Eopf": [120124], "eopf": [120150], "epar": [8917], "eparsl": [10723], "eplus": [10865], "epsi": [949], "Epsilon": [917], "epsilon": [949], "epsiv": [1013], "eqcirc": [8790], "eqcolon": [8789], "eqsim": [8770], "eqslantgtr": [10902], "eqslantless": [10901], "Equal": [10869], "equals": [61], "EqualTilde": [8770], "equest": [8799], "Equilibrium": [8652], "equiv": [8801], "equivDD": [10872], "eqvparsl": [10725], "erarr": [10609], "erDot": [8787], "Escr": [8496], "escr": [8495], "esdot": [8784], "Esim": [10867], "esim": [8770], "Eta": [919], "eta": [951], "ETH": [208], "eth": [240], "Euml": [203], "euml": [235], "euro": [8364], "excl": [33], "exist": [8707], "Exists": [8707], "expectation": [8496], "ExponentialE": [8519], "exponentiale": [8519], "fallingdotseq": [8786], "Fcy": [1060], "fcy": [1092], "female": [9792], "ffilig": [64259], "fflig": [64256], "ffllig": [64260], "Ffr": [120073], "ffr": [120099], "filig": [64257], "FilledSmallSquare": [9724], "FilledVerySmallSquare": [9642], "fjlig": [102, 106], "flat": [9837], "fllig": [64258], "fltns": [9649], "fnof": [402], "Fopf": [120125], "fopf": [120151], "ForAll": [8704], "forall": [8704], "fork": [8916], "forkv": [10969], "Fouriertrf": [8497], "fpartint": [10765], "frac12": [189], "frac13": [8531], "frac14": [188], "frac15": [8533], "frac16": [8537], "frac18": [8539], "frac23": [8532], "frac25": [8534], "frac34": [190], "frac35": [8535], "frac38": [8540], "frac45": [8536], "frac56": [8538], "frac58": [8541], "frac78": [8542], "frasl": [8260], "frown": [8994], "Fscr": [8497], "fscr": [119995], "gacute": [501], "Gamma": [915], "gamma": [947], "Gammad": [988], "gammad": [989], "gap": [10886], "Gbreve": [286], "gbreve": [287], "Gcedil": [290], "Gcirc": [284], "gcirc": [285], "Gcy": [1043], "gcy": [1075], "Gdot": [288], "gdot": [289], "gE": [8807], "ge": [8805], "gEl": [10892], "gel": [8923], "geq": [8805], "geqq": [8807], "geqslant": [10878], "ges": [10878], "gescc": [10921], "gesdot": [10880], "gesdoto": [10882], "gesdotol": [10884], "gesl": [8923, 65024], "gesles": [10900], "Gfr": [120074], "gfr": [120100], "Gg": [8921], "gg": [8811], "ggg": [8921], "gimel": [8503], "GJcy": [1027], "gjcy": [1107], "gl": [8823], "gla": [10917], "glE": [10898], "glj": [10916], "gnap": [10890], "gnapprox": [10890], "gnE": [8809], "gne": [10888], "gneq": [10888], "gneqq": [8809], "gnsim": [8935], "Gopf": [120126], "gopf": [120152], "grave": [96], "GreaterEqual": [8805], "GreaterEqualLess": [8923], "GreaterFullEqual": [8807], "GreaterGreater": [10914], "GreaterLess": [8823], "GreaterSlantEqual": [10878], "GreaterTilde": [8819], "Gscr": [119970], "gscr": [8458], "gsim": [8819], "gsime": [10894], "gsiml": [10896], "GT": [62], "Gt": [8811], "gt": [62], "gtcc": [10919], "gtcir": [10874], "gtdot": [8919], "gtlPar": [10645], "gtquest": [10876], "gtrapprox": [10886], "gtrarr": [10616], "gtrdot": [8919], "gtreqless": [8923], "gtreqqless": [10892], "gtrless": [8823], "gtrsim": [8819], "gvertneqq": [8809, 65024], "gvnE": [8809, 65024], "Hacek": [711], "hairsp": [8202], "half": [189], "hamilt": [8459], "HARDcy": [1066], "hardcy": [1098], "hArr": [8660], "harr": [8596], "harrcir": [10568], "harrw": [8621], "Hat": [94], "hbar": [8463], "Hcirc": [292], "hcirc": [293], "hearts": [9829], "heartsuit": [9829], "hellip": [8230], "hercon": [8889], "Hfr": [8460], "hfr": [120101], "HilbertSpace": [8459], "hksearow": [10533], "hkswarow": [10534], "hoarr": [8703], "homtht": [8763], "hookleftarrow": [8617], "hookrightarrow": [8618], "Hopf": [8461], "hopf": [120153], "horbar": [8213], "HorizontalLine": [9472], "Hscr": [8459], "hscr": [119997], "hslash": [8463], "Hstrok": [294], "hstrok": [295], "HumpDownHump": [8782], "HumpEqual": [8783], "hybull": [8259], "hyphen": [8208], "Iacute": [205], "iacute": [237], "ic": [8291], "Icirc": [206], "icirc": [238], "Icy": [1048], "icy": [1080], "Idot": [304], "IEcy": [1045], "iecy": [1077], "iexcl": [161], "iff": [8660], "Ifr": [8465], "ifr": [120102], "Igrave": [204], "igrave": [236], "ii": [8520], "iiiint": [10764], "iiint": [8749], "iinfin": [10716], "iiota": [8489], "IJlig": [306], "ijlig": [307], "Im": [8465], "Imacr": [298], "imacr": [299], "image": [8465], "ImaginaryI": [8520], "imagline": [8464], "imagpart": [8465], "imath": [305], "imof": [8887], "imped": [437], "Implies": [8658], "in": [8712], "incare": [8453], "infin": [8734], "infintie": [10717], "inodot": [305], "Int": [8748], "int": [8747], "intcal": [8890], "integers": [8484], "Integral": [8747], "intercal": [8890], "Intersection": [8898], "intlarhk": [10775], "intprod": [10812], "InvisibleComma": [8291], "InvisibleTimes": [8290], "IOcy": [1025], "iocy": [1105], "Iogon": [302], "iogon": [303], "Iopf": [120128], "iopf": [120154], "Iota": [921], "iota": [953], "iprod": [10812], "iquest": [191], "Iscr": [8464], "iscr": [119998], "isin": [8712], "isindot": [8949], "isinE": [8953], "isins": [8948], "isinsv": [8947], "isinv": [8712], "it": [8290], "Itilde": [296], "itilde": [297], "Iukcy": [1030], "iukcy": [1110], "Iuml": [207], "iuml": [239], "Jcirc": [308], "jcirc": [309], "Jcy": [1049], "jcy": [1081], "Jfr": [120077], "jfr": [120103], "jmath": [567], "Jopf": [120129], "jopf": [120155], "Jscr": [119973], "jscr": [119999], "Jsercy": [1032], "jsercy": [1112], "Jukcy": [1028], "jukcy": [1108], "Kappa": [922], "kappa": [954], "kappav": [1008], "Kcedil": [310], "kcedil": [311], "Kcy": [1050], "kcy": [1082], "Kfr": [120078], "kfr": [120104], "kgreen": [312], "KHcy": [1061], "khcy": [1093], "KJcy": [1036], "kjcy": [1116], "Kopf": [120130], "kopf": [120156], "Kscr": [119974], "kscr": [120000], "lAarr": [8666], "Lacute": [313], "lacute": [314], "laemptyv": [10676], "lagran": [8466], "Lambda": [923], "lambda": [955], "Lang": [10218], "lang": [10216], "langd": [10641], "langle": [10216], "lap": [10885], "Laplacetrf": [8466], "laquo": [171], "Larr": [8606], "lArr": [8656], "larr": [8592], "larrb": [8676], "larrbfs": [10527], "larrfs": [10525], "larrhk": [8617], "larrlp": [8619], "larrpl": [10553], "larrsim": [10611], "larrtl": [8610], "lat": [10923], "lAtail": [10523], "latail": [10521], "late": [10925], "lates": [10925, 65024], "lBarr": [10510], "lbarr": [10508], "lbbrk": [10098], "lbrace": [123], "lbrack": [91], "lbrke": [10635], "lbrksld": [10639], "lbrkslu": [10637], "Lcaron": [317], "lcaron": [318], "Lcedil": [315], "lcedil": [316], "lceil": [8968], "lcub": [123], "Lcy": [1051], "lcy": [1083], "ldca": [10550], "ldquo": [8220], "ldquor": [8222], "ldrdhar": [10599], "ldrushar": [10571], "ldsh": [8626], "lE": [8806], "le": [8804], "LeftAngleBracket": [10216], "LeftArrow": [8592], "Leftarrow": [8656], "leftarrow": [8592], "LeftArrowBar": [8676], "LeftArrowRightArrow": [8646], "leftarrowtail": [8610], "LeftCeiling": [8968], "LeftDoubleBracket": [10214], "LeftDownTeeVector": [10593], "LeftDownVector": [8643], "LeftDownVectorBar": [10585], "LeftFloor": [8970], "leftharpoondown": [8637], "leftharpoonup": [8636], "leftleftarrows": [8647], "LeftRightArrow": [8596], "Leftrightarrow": [8660], "leftrightarrow": [8596], "leftrightarrows": [8646], "leftrightharpoons": [8651], "leftrightsquigarrow": [8621], "LeftRightVector": [10574], "LeftTee": [8867], "LeftTeeArrow": [8612], "LeftTeeVector": [10586], "leftthreetimes": [8907], "LeftTriangle": [8882], "LeftTriangleBar": [10703], "LeftTriangleEqual": [8884], "LeftUpDownVector": [10577], "LeftUpTeeVector": [10592], "LeftUpVector": [8639], "LeftUpVectorBar": [10584], "LeftVector": [8636], "LeftVectorBar": [10578], "lEg": [10891], "leg": [8922], "leq": [8804], "leqq": [8806], "leqslant": [10877], "les": [10877], "lescc": [10920], "lesdot": [10879], "lesdoto": [10881], "lesdotor": [10883], "lesg": [8922, 65024], "lesges": [10899], "lessapprox": [10885], "lessdot": [8918], "lesseqgtr": [8922], "lesseqqgtr": [10891], "LessEqualGreater": [8922], "LessFullEqual": [8806], "LessGreater": [8822], "lessgtr": [8822], "LessLess": [10913], "lesssim": [8818], "LessSlantEqual": [10877], "LessTilde": [8818], "lfisht": [10620], "lfloor": [8970], "Lfr": [120079], "lfr": [120105], "lg": [8822], "lgE": [10897], "lHar": [10594], "lhard": [8637], "lharu": [8636], "lharul": [10602], "lhblk": [9604], "LJcy": [1033], "ljcy": [1113], "Ll": [8920], "ll": [8810], "llarr": [8647], "llcorner": [8990], "Lleftarrow": [8666], "llhard": [10603], "lltri": [9722], "Lmidot": [319], "lmidot": [320], "lmoust": [9136], "lmoustache": [9136], "lnap": [10889], "lnapprox": [10889], "lnE": [8808], "lne": [10887], "lneq": [10887], "lneqq": [8808], "lnsim": [8934], "loang": [10220], "loarr": [8701], "lobrk": [10214], "LongLeftArrow": [10229], "Longleftarrow": [10232], "longleftarrow": [10229], "LongLeftRightArrow": [10231], "Longleftrightarrow": [10234], "longleftrightarrow": [10231], "longmapsto": [10236], "LongRightArrow": [10230], "Longrightarrow": [10233], "longrightarrow": [10230], "looparrowleft": [8619], "looparrowright": [8620], "lopar": [10629], "Lopf": [120131], "lopf": [120157], "loplus": [10797], "lotimes": [10804], "lowast": [8727], "lowbar": [95], "LowerLeftArrow": [8601], "LowerRightArrow": [8600], "loz": [9674], "lozenge": [9674], "lozf": [10731], "lpar": [40], "lparlt": [10643], "lrarr": [8646], "lrcorner": [8991], "lrhar": [8651], "lrhard": [10605], "lrm": [8206], "lrtri": [8895], "lsaquo": [8249], "Lscr": [8466], "lscr": [120001], "Lsh": [8624], "lsh": [8624], "lsim": [8818], "lsime": [10893], "lsimg": [10895], "lsqb": [91], "lsquo": [8216], "lsquor": [8218], "Lstrok": [321], "lstrok": [322], "LT": [60], "Lt": [8810], "lt": [60], "ltcc": [10918], "ltcir": [10873], "ltdot": [8918], "lthree": [8907], "ltimes": [8905], "ltlarr": [10614], "ltquest": [10875], "ltri": [9667], "ltrie": [8884], "ltrif": [9666], "ltrPar": [10646], "lurdshar": [10570], "luruhar": [10598], "lvertneqq": [8808, 65024], "lvnE": [8808, 65024], "macr": [175], "male": [9794], "malt": [10016], "maltese": [10016], "Map": [10501], "map": [8614], "mapsto": [8614], "mapstodown": [8615], "mapstoleft": [8612], "mapstoup": [8613], "marker": [9646], "mcomma": [10793], "Mcy": [1052], "mcy": [1084], "mdash": [8212], "mDDot": [8762], "measuredangle": [8737], "MediumSpace": [8287], "Mellintrf": [8499], "Mfr": [120080], "mfr": [120106], "mho": [8487], "micro": [181], "mid": [8739], "midast": [42], "midcir": [10992], "middot": [183], "minus": [8722], "minusb": [8863], "minusd": [8760], "minusdu": [10794], "MinusPlus": [8723], "mlcp": [10971], "mldr": [8230], "mnplus": [8723], "models": [8871], "Mopf": [120132], "mopf": [120158], "mp": [8723], "Mscr": [8499], "mscr": [120002], "mstpos": [8766], "Mu": [924], "mu": [956], "multimap": [8888], "mumap": [8888], "nabla": [8711], "Nacute": [323], "nacute": [324], "nang": [8736, 8402], "nap": [8777], "napE": [10864, 824], "napid": [8779, 824], "napos": [329], "napprox": [8777], "natur": [9838], "natural": [9838], "naturals": [8469], "nbsp": [160], "nbump": [8782, 824], "nbumpe": [8783, 824], "ncap": [10819], "Ncaron": [327], "ncaron": [328], "Ncedil": [325], "ncedil": [326], "ncong": [8775], "ncongdot": [10861, 824], "ncup": [10818], "Ncy": [1053], "ncy": [1085], "ndash": [8211], "ne": [8800], "nearhk": [10532], "neArr": [8663], "nearr": [8599], "nearrow": [8599], "nedot": [8784, 824], "NegativeMediumSpace": [8203], "NegativeThickSpace": [8203], "NegativeThinSpace": [8203], "NegativeVeryThinSpace": [8203], "nequiv": [8802], "nesear": [10536], "nesim": [8770, 824], "NestedGreaterGreater": [8811], "NestedLessLess": [8810], "NewLine": [10], "nexist": [8708], "nexists": [8708], "Nfr": [120081], "nfr": [120107], "ngE": [8807, 824], "nge": [8817], "ngeq": [8817], "ngeqq": [8807, 824], "ngeqslant": [10878, 824], "nges": [10878, 824], "nGg": [8921, 824], "ngsim": [8821], "nGt": [8811, 8402], "ngt": [8815], "ngtr": [8815], "nGtv": [8811, 824], "nhArr": [8654], "nharr": [8622], "nhpar": [10994], "ni": [8715], "nis": [8956], "nisd": [8954], "niv": [8715], "NJcy": [1034], "njcy": [1114], "nlArr": [8653], "nlarr": [8602], "nldr": [8229], "nlE": [8806, 824], "nle": [8816], "nLeftarrow": [8653], "nleftarrow": [8602], "nLeftrightarrow": [8654], "nleftrightarrow": [8622], "nleq": [8816], "nleqq": [8806, 824], "nleqslant": [10877, 824], "nles": [10877, 824], "nless": [8814], "nLl": [8920, 824], "nlsim": [8820], "nLt": [8810, 8402], "nlt": [8814], "nltri": [8938], "nltrie": [8940], "nLtv": [8810, 824], "nmid": [8740], "NoBreak": [8288], "NonBreakingSpace": [160], "Nopf": [8469], "nopf": [120159], "Not": [10988], "not": [172], "NotCongruent": [8802], "NotCupCap": [8813], "NotDoubleVerticalBar": [8742], "NotElement": [8713], "NotEqual": [8800], "NotEqualTilde": [8770, 824], "NotExists": [8708], "NotGreater": [8815], "NotGreaterEqual": [8817], "NotGreaterFullEqual": [8807, 824], "NotGreaterGreater": [8811, 824], "NotGreaterLess": [8825], "NotGreaterSlantEqual": [10878, 824], "NotGreaterTilde": [8821], "NotHumpDownHump": [8782, 824], "NotHumpEqual": [8783, 824], "notin": [8713], "notindot": [8949, 824], "notinE": [8953, 824], "notinva": [8713], "notinvb": [8951], "notinvc": [8950], "NotLeftTriangle": [8938], "NotLeftTriangleBar": [10703, 824], "NotLeftTriangleEqual": [8940], "NotLess": [8814], "NotLessEqual": [8816], "NotLessGreater": [8824], "NotLessLess": [8810, 824], "NotLessSlantEqual": [10877, 824], "NotLessTilde": [8820], "NotNestedGreaterGreater": [10914, 824], "NotNestedLessLess": [10913, 824], "notni": [8716], "notniva": [8716], "notnivb": [8958], "notnivc": [8957], "NotPrecedes": [8832], "NotPrecedesEqual": [10927, 824], "NotPrecedesSlantEqual": [8928], "NotReverseElement": [8716], "NotRightTriangle": [8939], "NotRightTriangleBar": [10704, 824], "NotRightTriangleEqual": [8941], "NotSquareSubset": [8847, 824], "NotSquareSubsetEqual": [8930], "NotSquareSuperset": [8848, 824], "NotSquareSupersetEqual": [8931], "NotSubset": [8834, 8402], "NotSubsetEqual": [8840], "NotSucceeds": [8833], "NotSucceedsEqual": [10928, 824], "NotSucceedsSlantEqual": [8929], "NotSucceedsTilde": [8831, 824], "NotSuperset": [8835, 8402], "NotSupersetEqual": [8841], "NotTilde": [8769], "NotTildeEqual": [8772], "NotTildeFullEqual": [8775], "NotTildeTilde": [8777], "NotVerticalBar": [8740], "npar": [8742], "nparallel": [8742], "nparsl": [11005, 8421], "npart": [8706, 824], "npolint": [10772], "npr": [8832], "nprcue": [8928], "npre": [10927, 824], "nprec": [8832], "npreceq": [10927, 824], "nrArr": [8655], "nrarr": [8603], "nrarrc": [10547, 824], "nrarrw": [8605, 824], "nRightarrow": [8655], "nrightarrow": [8603], "nrtri": [8939], "nrtrie": [8941], "nsc": [8833], "nsccue": [8929], "nsce": [10928, 824], "Nscr": [119977], "nscr": [120003], "nshortmid": [8740], "nshortparallel": [8742], "nsim": [8769], "nsime": [8772], "nsimeq": [8772], "nsmid": [8740], "nspar": [8742], "nsqsube": [8930], "nsqsupe": [8931], "nsub": [8836], "nsubE": [10949, 824], "nsube": [8840], "nsubset": [8834, 8402], "nsubseteq": [8840], "nsubseteqq": [10949, 824], "nsucc": [8833], "nsucceq": [10928, 824], "nsup": [8837], "nsupE": [10950, 824], "nsupe": [8841], "nsupset": [8835, 8402], "nsupseteq": [8841], "nsupseteqq": [10950, 824], "ntgl": [8825], "Ntilde": [209], "ntilde": [241], "ntlg": [8824], "ntriangleleft": [8938], "ntrianglelefteq": [8940], "ntriangleright": [8939], "ntrianglerighteq": [8941], "Nu": [925], "nu": [957], "num": [35], "numero": [8470], "numsp": [8199], "nvap": [8781, 8402], "nVDash": [8879], "nVdash": [8878], "nvDash": [8877], "nvdash": [8876], "nvge": [8805, 8402], "nvgt": [62, 8402], "nvHarr": [10500], "nvinfin": [10718], "nvlArr": [10498], "nvle": [8804, 8402], "nvlt": [60, 8402], "nvltrie": [8884, 8402], "nvrArr": [10499], "nvrtrie": [8885, 8402], "nvsim": [8764, 8402], "nwarhk": [10531], "nwArr": [8662], "nwarr": [8598], "nwarrow": [8598], "nwnear": [10535], "Oacute": [211], "oacute": [243], "oast": [8859], "ocir": [8858], "Ocirc": [212], "ocirc": [244], "Ocy": [1054], "ocy": [1086], "odash": [8861], "Odblac": [336], "odblac": [337], "odiv": [10808], "odot": [8857], "odsold": [10684], "OElig": [338], "oelig": [339], "ofcir": [10687], "Ofr": [120082], "ofr": [120108], "ogon": [731], "Ograve": [210], "ograve": [242], "ogt": [10689], "ohbar": [10677], "ohm": [937], "oint": [8750], "olarr": [8634], "olcir": [10686], "olcross": [10683], "oline": [8254], "olt": [10688], "Omacr": [332], "omacr": [333], "Omega": [937], "omega": [969], "Omicron": [927], "omicron": [959], "omid": [10678], "ominus": [8854], "Oopf": [120134], "oopf": [120160], "opar": [10679], "OpenCurlyDoubleQuote": [8220], "OpenCurlyQuote": [8216], "operp": [10681], "oplus": [8853], "Or": [10836], "or": [8744], "orarr": [8635], "ord": [10845], "order": [8500], "orderof": [8500], "ordf": [170], "ordm": [186], "origof": [8886], "oror": [10838], "orslope": [10839], "orv": [10843], "oS": [9416], "Oscr": [119978], "oscr": [8500], "Oslash": [216], "oslash": [248], "osol": [8856], "Otilde": [213], "otilde": [245], "Otimes": [10807], "otimes": [8855], "otimesas": [10806], "Ouml": [214], "ouml": [246], "ovbar": [9021], "OverBar": [8254], "OverBrace": [9182], "OverBracket": [9140], "OverParenthesis": [9180], "par": [8741], "para": [182], "parallel": [8741], "parsim": [10995], "parsl": [11005], "part": [8706], "PartialD": [8706], "Pcy": [1055], "pcy": [1087], "percnt": [37], "period": [46], "permil": [8240], "perp": [8869], "pertenk": [8241], "Pfr": [120083], "pfr": [120109], "Phi": [934], "phi": [966], "phiv": [981], "phmmat": [8499], "phone": [9742], "Pi": [928], "pi": [960], "pitchfork": [8916], "piv": [982], "planck": [8463], "planckh": [8462], "plankv": [8463], "plus": [43], "plusacir": [10787], "plusb": [8862], "pluscir": [10786], "plusdo": [8724], "plusdu": [10789], "pluse": [10866], "PlusMinus": [177], "plusmn": [177], "plussim": [10790], "plustwo": [10791], "pm": [177], "Poincareplane": [8460], "pointint": [10773], "Popf": [8473], "popf": [120161], "pound": [163], "Pr": [10939], "pr": [8826], "prap": [10935], "prcue": [8828], "prE": [10931], "pre": [10927], "prec": [8826], "precapprox": [10935], "preccurlyeq": [8828], "Precedes": [8826], "PrecedesEqual": [10927], "PrecedesSlantEqual": [8828], "PrecedesTilde": [8830], "preceq": [10927], "precnapprox": [10937], "precneqq": [10933], "precnsim": [8936], "precsim": [8830], "Prime": [8243], "prime": [8242], "primes": [8473], "prnap": [10937], "prnE": [10933], "prnsim": [8936], "prod": [8719], "Product": [8719], "profalar": [9006], "profline": [8978], "profsurf": [8979], "prop": [8733], "Proportion": [8759], "Proportional": [8733], "propto": [8733], "prsim": [8830], "prurel": [8880], "Pscr": [119979], "pscr": [120005], "Psi": [936], "psi": [968], "puncsp": [8200], "Qfr": [120084], "qfr": [120110], "qint": [10764], "Qopf": [8474], "qopf": [120162], "qprime": [8279], "Qscr": [119980], "qscr": [120006], "quaternions": [8461], "quatint": [10774], "quest": [63], "questeq": [8799], "QUOT": [34], "quot": [34], "rAarr": [8667], "race": [8765, 817], "Racute": [340], "racute": [341], "radic": [8730], "raemptyv": [10675], "Rang": [10219], "rang": [10217], "rangd": [10642], "range": [10661], "rangle": [10217], "raquo": [187], "Rarr": [8608], "rArr": [8658], "rarr": [8594], "rarrap": [10613], "rarrb": [8677], "rarrbfs": [10528], "rarrc": [10547], "rarrfs": [10526], "rarrhk": [8618], "rarrlp": [8620], "rarrpl": [10565], "rarrsim": [10612], "Rarrtl": [10518], "rarrtl": [8611], "rarrw": [8605], "rAtail": [10524], "ratail": [10522], "ratio": [8758], "rationals": [8474], "RBarr": [10512], "rBarr": [10511], "rbarr": [10509], "rbbrk": [10099], "rbrace": [125], "rbrack": [93], "rbrke": [10636], "rbrksld": [10638], "rbrkslu": [10640], "Rcaron": [344], "rcaron": [345], "Rcedil": [342], "rcedil": [343], "rceil": [8969], "rcub": [125], "Rcy": [1056], "rcy": [1088], "rdca": [10551], "rdldhar": [10601], "rdquo": [8221], "rdquor": [8221], "rdsh": [8627], "Re": [8476], "real": [8476], "realine": [8475], "realpart": [8476], "reals": [8477], "rect": [9645], "REG": [174], "reg": [174], "ReverseElement": [8715], "ReverseEquilibrium": [8651], "ReverseUpEquilibrium": [10607], "rfisht": [10621], "rfloor": [8971], "Rfr": [8476], "rfr": [120111], "rHar": [10596], "rhard": [8641], "rharu": [8640], "rharul": [10604], "Rho": [929], "rho": [961], "rhov": [1009], "RightAngleBracket": [10217], "RightArrow": [8594], "Rightarrow": [8658], "rightarrow": [8594], "RightArrowBar": [8677], "RightArrowLeftArrow": [8644], "rightarrowtail": [8611], "RightCeiling": [8969], "RightDoubleBracket": [10215], "RightDownTeeVector": [10589], "RightDownVector": [8642], "RightDownVectorBar": [10581], "RightFloor": [8971], "rightharpoondown": [8641], "rightharpoonup": [8640], "rightleftarrows": [8644], "rightleftharpoons": [8652], "rightrightarrows": [8649], "rightsquigarrow": [8605], "RightTee": [8866], "RightTeeArrow": [8614], "RightTeeVector": [10587], "rightthreetimes": [8908], "RightTriangle": [8883], "RightTriangleBar": [10704], "RightTriangleEqual": [8885], "RightUpDownVector": [10575], "RightUpTeeVector": [10588], "RightUpVector": [8638], "RightUpVectorBar": [10580], "RightVector": [8640], "RightVectorBar": [10579], "ring": [730], "risingdotseq": [8787], "rlarr": [8644], "rlhar": [8652], "rlm": [8207], "rmoust": [9137], "rmoustache": [9137], "rnmid": [10990], "roang": [10221], "roarr": [8702], "robrk": [10215], "ropar": [10630], "Ropf": [8477], "ropf": [120163], "roplus": [10798], "rotimes": [10805], "RoundImplies": [10608], "rpar": [41], "rpargt": [10644], "rppolint": [10770], "rrarr": [8649], "Rrightarrow": [8667], "rsaquo": [8250], "Rscr": [8475], "rscr": [120007], "Rsh": [8625], "rsh": [8625], "rsqb": [93], "rsquo": [8217], "rsquor": [8217], "rthree": [8908], "rtimes": [8906], "rtri": [9657], "rtrie": [8885], "rtrif": [9656], "rtriltri": [10702], "RuleDelayed": [10740], "ruluhar": [10600], "rx": [8478], "Sacute": [346], "sacute": [347], "sbquo": [8218], "Sc": [10940], "sc": [8827], "scap": [10936], "Scaron": [352], "scaron": [353], "sccue": [8829], "scE": [10932], "sce": [10928], "Scedil": [350], "scedil": [351], "Scirc": [348], "scirc": [349], "scnap": [10938], "scnE": [10934], "scnsim": [8937], "scpolint": [10771], "scsim": [8831], "Scy": [1057], "scy": [1089], "sdot": [8901], "sdotb": [8865], "sdote": [10854], "searhk": [10533], "seArr": [8664], "searr": [8600], "searrow": [8600], "sect": [167], "semi": [59], "seswar": [10537], "setminus": [8726], "setmn": [8726], "sext": [10038], "Sfr": [120086], "sfr": [120112], "sfrown": [8994], "sharp": [9839], "SHCHcy": [1065], "shchcy": [1097], "SHcy": [1064], "shcy": [1096], "ShortDownArrow": [8595], "ShortLeftArrow": [8592], "shortmid": [8739], "shortparallel": [8741], "ShortRightArrow": [8594], "ShortUpArrow": [8593], "shy": [173], "Sigma": [931], "sigma": [963], "sigmaf": [962], "sigmav": [962], "sim": [8764], "simdot": [10858], "sime": [8771], "simeq": [8771], "simg": [10910], "simgE": [10912], "siml": [10909], "simlE": [10911], "simne": [8774], "simplus": [10788], "simrarr": [10610], "slarr": [8592], "SmallCircle": [8728], "smallsetminus": [8726], "smashp": [10803], "smeparsl": [10724], "smid": [8739], "smile": [8995], "smt": [10922], "smte": [10924], "smtes": [10924, 65024], "SOFTcy": [1068], "softcy": [1100], "sol": [47], "solb": [10692], "solbar": [9023], "Sopf": [120138], "sopf": [120164], "spades": [9824], "spadesuit": [9824], "spar": [8741], "sqcap": [8851], "sqcaps": [8851, 65024], "sqcup": [8852], "sqcups": [8852, 65024], "Sqrt": [8730], "sqsub": [8847], "sqsube": [8849], "sqsubset": [8847], "sqsubseteq": [8849], "sqsup": [8848], "sqsupe": [8850], "sqsupset": [8848], "sqsupseteq": [8850], "squ": [9633], "Square": [9633], "square": [9633], "SquareIntersection": [8851], "SquareSubset": [8847], "SquareSubsetEqual": [8849], "SquareSuperset": [8848], "SquareSupersetEqual": [8850], "SquareUnion": [8852], "squarf": [9642], "squf": [9642], "srarr": [8594], "Sscr": [119982], "sscr": [120008], "ssetmn": [8726], "ssmile": [8995], "sstarf": [8902], "Star": [8902], "star": [9734], "starf": [9733], "straightepsilon": [1013], "straightphi": [981], "strns": [175], "Sub": [8912], "sub": [8834], "subdot": [10941], "subE": [10949], "sube": [8838], "subedot": [10947], "submult": [10945], "subnE": [10955], "subne": [8842], "subplus": [10943], "subrarr": [10617], "Subset": [8912], "subset": [8834], "subseteq": [8838], "subseteqq": [10949], "SubsetEqual": [8838], "subsetneq": [8842], "subsetneqq": [10955], "subsim": [10951], "subsub": [10965], "subsup": [10963], "succ": [8827], "succapprox": [10936], "succcurlyeq": [8829], "Succeeds": [8827], "SucceedsEqual": [10928], "SucceedsSlantEqual": [8829], "SucceedsTilde": [8831], "succeq": [10928], "succnapprox": [10938], "succneqq": [10934], "succnsim": [8937], "succsim": [8831], "SuchThat": [8715], "Sum": [8721], "sum": [8721], "sung": [9834], "Sup": [8913], "sup": [8835], "sup1": [185], "sup2": [178], "sup3": [179], "supdot": [10942], "supdsub": [10968], "supE": [10950], "supe": [8839], "supedot": [10948], "Superset": [8835], "SupersetEqual": [8839], "suphsol": [10185], "suphsub": [10967], "suplarr": [10619], "supmult": [10946], "supnE": [10956], "supne": [8843], "supplus": [10944], "Supset": [8913], "supset": [8835], "supseteq": [8839], "supseteqq": [10950], "supsetneq": [8843], "supsetneqq": [10956], "supsim": [10952], "supsub": [10964], "supsup": [10966], "swarhk": [10534], "swArr": [8665], "swarr": [8601], "swarrow": [8601], "swnwar": [10538], "szlig": [223], "Tab": [9], "target": [8982], "Tau": [932], "tau": [964], "tbrk": [9140], "Tcaron": [356], "tcaron": [357], "Tcedil": [354], "tcedil": [355], "Tcy": [1058], "tcy": [1090], "tdot": [8411], "telrec": [8981], "Tfr": [120087], "tfr": [120113], "there4": [8756], "Therefore": [8756], "therefore": [8756], "Theta": [920], "theta": [952], "thetasym": [977], "thetav": [977], "thickapprox": [8776], "thicksim": [8764], "ThickSpace": [8287, 8202], "thinsp": [8201], "ThinSpace": [8201], "thkap": [8776], "thksim": [8764], "THORN": [222], "thorn": [254], "Tilde": [8764], "tilde": [732], "TildeEqual": [8771], "TildeFullEqual": [8773], "TildeTilde": [8776], "times": [215], "timesb": [8864], "timesbar": [10801], "timesd": [10800], "tint": [8749], "toea": [10536], "top": [8868], "topbot": [9014], "topcir": [10993], "Topf": [120139], "topf": [120165], "topfork": [10970], "tosa": [10537], "tprime": [8244], "TRADE": [8482], "trade": [8482], "triangle": [9653], "triangledown": [9663], "triangleleft": [9667], "trianglelefteq": [8884], "triangleq": [8796], "triangleright": [9657], "trianglerighteq": [8885], "tridot": [9708], "trie": [8796], "triminus": [10810], "TripleDot": [8411], "triplus": [10809], "trisb": [10701], "tritime": [10811], "trpezium": [9186], "Tscr": [119983], "tscr": [120009], "TScy": [1062], "tscy": [1094], "TSHcy": [1035], "tshcy": [1115], "Tstrok": [358], "tstrok": [359], "twixt": [8812], "twoheadleftarrow": [8606], "twoheadrightarrow": [8608], "Uacute": [218], "uacute": [250], "Uarr": [8607], "uArr": [8657], "uarr": [8593], "Uarrocir": [10569], "Ubrcy": [1038], "ubrcy": [1118], "Ubreve": [364], "ubreve": [365], "Ucirc": [219], "ucirc": [251], "Ucy": [1059], "ucy": [1091], "udarr": [8645], "Udblac": [368], "udblac": [369], "udhar": [10606], "ufisht": [10622], "Ufr": [120088], "ufr": [120114], "Ugrave": [217], "ugrave": [249], "uHar": [10595], "uharl": [8639], "uharr": [8638], "uhblk": [9600], "ulcorn": [8988], "ulcorner": [8988], "ulcrop": [8975], "ultri": [9720], "Umacr": [362], "umacr": [363], "uml": [168], "UnderBar": [95], "UnderBrace": [9183], "UnderBracket": [9141], "UnderParenthesis": [9181], "Union": [8899], "UnionPlus": [8846], "Uogon": [370], "uogon": [371], "Uopf": [120140], "uopf": [120166], "UpArrow": [8593], "Uparrow": [8657], "uparrow": [8593], "UpArrowBar": [10514], "UpArrowDownArrow": [8645], "UpDownArrow": [8597], "Updownarrow": [8661], "updownarrow": [8597], "UpEquilibrium": [10606], "upharpoonleft": [8639], "upharpoonright": [8638], "uplus": [8846], "UpperLeftArrow": [8598], "UpperRightArrow": [8599], "Upsi": [978], "upsi": [965], "upsih": [978], "Upsilon": [933], "upsilon": [965], "UpTee": [8869], "UpTeeArrow": [8613], "upuparrows": [8648], "urcorn": [8989], "urcorner": [8989], "urcrop": [8974], "Uring": [366], "uring": [367], "urtri": [9721], "Uscr": [119984], "uscr": [120010], "utdot": [8944], "Utilde": [360], "utilde": [361], "utri": [9653], "utrif": [9652], "uuarr": [8648], "Uuml": [220], "uuml": [252], "uwangle": [10663], "vangrt": [10652], "varepsilon": [1013], "varkappa": [1008], "varnothing": [8709], "varphi": [981], "varpi": [982], "varpropto": [8733], "vArr": [8661], "varr": [8597], "varrho": [1009], "varsigma": [962], "varsubsetneq": [8842, 65024], "varsubsetneqq": [10955, 65024], "varsupsetneq": [8843, 65024], "varsupsetneqq": [10956, 65024], "vartheta": [977], "vartriangleleft": [8882], "vartriangleright": [8883], "Vbar": [10987], "vBar": [10984], "vBarv": [10985], "Vcy": [1042], "vcy": [1074], "VDash": [8875], "Vdash": [8873], "vDash": [8872], "vdash": [8866], "Vdashl": [10982], "Vee": [8897], "vee": [8744], "veebar": [8891], "veeeq": [8794], "vellip": [8942], "Verbar": [8214], "verbar": [124], "Vert": [8214], "vert": [124], "VerticalBar": [8739], "VerticalLine": [124], "VerticalSeparator": [10072], "VerticalTilde": [8768], "VeryThinSpace": [8202], "Vfr": [120089], "vfr": [120115], "vltri": [8882], "vnsub": [8834, 8402], "vnsup": [8835, 8402], "Vopf": [120141], "vopf": [120167], "vprop": [8733], "vrtri": [8883], "Vscr": [119985], "vscr": [120011], "vsubnE": [10955, 65024], "vsubne": [8842, 65024], "vsupnE": [10956, 65024], "vsupne": [8843, 65024], "Vvdash": [8874], "vzigzag": [10650], "Wcirc": [372], "wcirc": [373], "wedbar": [10847], "Wedge": [8896], "wedge": [8743], "wedgeq": [8793], "weierp": [8472], "Wfr": [120090], "wfr": [120116], "Wopf": [120142], "wopf": [120168], "wp": [8472], "wr": [8768], "wreath": [8768], "Wscr": [119986], "wscr": [120012], "xcap": [8898], "xcirc": [9711], "xcup": [8899], "xdtri": [9661], "Xfr": [120091], "xfr": [120117], "xhArr": [10234], "xharr": [10231], "Xi": [926], "xi": [958], "xlArr": [10232], "xlarr": [10229], "xmap": [10236], "xnis": [8955], "xodot": [10752], "Xopf": [120143], "xopf": [120169], "xoplus": [10753], "xotime": [10754], "xrArr": [10233], "xrarr": [10230], "Xscr": [119987], "xscr": [120013], "xsqcup": [10758], "xuplus": [10756], "xutri": [9651], "xvee": [8897], "xwedge": [8896], "Yacute": [221], "yacute": [253], "YAcy": [1071], "yacy": [1103], "Ycirc": [374], "ycirc": [375], "Ycy": [1067], "ycy": [1099], "yen": [165], "Yfr": [120092], "yfr": [120118], "YIcy": [1031], "yicy": [1111], "Yopf": [120144], "yopf": [120170], "Yscr": [119988], "yscr": [120014], "YUcy": [1070], "yucy": [1102], "Yuml": [376], "yuml": [255], "Zacute": [377], "zacute": [378], "Zcaron": [381], "zcaron": [382], "Zcy": [1047], "zcy": [1079], "Zdot": [379], "zdot": [380], "zeetrf": [8488], "ZeroWidthSpace": [8203], "Zeta": [918], "zeta": [950], "Zfr": [8488], "zfr": [120119], "ZHcy": [1046], "zhcy": [1078], "zigrarr": [8669], "Zopf": [8484], "zopf": [120171], "Zscr": [119989], "zscr": [120015], "zwj": [8205], "zwnj": [8204] };

        for (var i = 0; i < input.length; i++) {

            var char = input.charAt(i);

            if (char === "&") {

                var key = "";

                while (++i < input.length && (char = input.charAt(i)) !== ";")
                    key += char;

                if (entities[key])
                    strOutput += String.fromCharCode(entities[key]);
                else if (key.substring(0, 2) === "#x")
                    strOutput += String.fromCharCode(parseInt(key.substring(2), 16));
                else
                    strOutput += String.fromCodePoint(key.substring(1));
            }
            else
                strOutput += char;
        }

        return strOutput;
    }

    return input;
};

