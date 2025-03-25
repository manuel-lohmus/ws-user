<div class="row w-100">
<div class="col-3 d-none d-lg-inline">
<div class="sticky-top overflow-auto vh-100">
<div id="list-headers" class="list-group mt-5">

- [WS-User](#ws-user)
    - [Overview](#overview)
    - [Features](#features)
    - [Installation](#installation)
    - [Configuration](#configuration)
    - [Usage](#usage)
    - [License](#license)
 
 
</div>
</div>
</div>
 
<div class="col">
<div class="p-2 markdown-body" data-bs-spy="scroll" data-bs-target="#list-headers" data-bs-offset="0" tabindex="0">

# WS-User  
This manual is also available in [HTML5](https://manuel-lohmus.github.io/ws-userg/README.html).

## Overview  
WS-User module is a library that manages user data over the websocket protocol.<br>
Used when building a **single-page application** (**SPA**), this library offers a modern approach.<br>
Now using the specially designed module [`ws13`](https://www.npmjs.com/package/ws13) to get a better and more stable connection.  
It frontends and backends for user data management libraries.  
`browser.js` is a frontend library that provides a user interface for managing user data.  
`server.js` is a backend library that provides managing user data over the websocket protocol in real-time.  

## Features  
- Create new user 
- Login and logout user  
- Retrieve user details  
- Update existing user information
- Open data link over websocket. Used module [`ws13`](https://www.npmjs.com/package/ws13). 
- and more... 

## Installation  
You can install `ws-user` using this command:  
`npm install ws-user`  

## Configuration  
You can configure the `ws-user` module using the `config-sets.json` file:
```json
{
  "isProduction": true,
  "production": {
    "ws-user": {
      "pathToFrontendErrors": "log/frontend_errors.log",
      "pathToLoggedUsers": "logged_users.json",
      "pathToUsersDir": "users"
    },
    "nodemailer": {
      "host": "smtp-mail.outlook.com",
      "port": 587,
      "secureConnection": false,
      "tls": {
        "ciphers": "SSLv3"
      },
      "auth": {
        "user": "*user*@outlook.com",
        "pass": ""
      }
    }
  },
  "development": {}
}
```

## Usage  
On the server side, you can use the following code to start the server:
```javascript
const CreateWsUser = require('ws-user');

const wsUser = CreateWsUser(options);

if (wsUser) {

    wsUser.onerror = (error) => {
        console.error(error);
    };
    wsUser.onopen = () => {
        console.log('Server started');
    };
    wsUser.onclose = () => {
        console.log('Server closed');
    };
    wsUser.onmessage = (event) => {
        // Received message from client and websocket is paused, disable to receive messages
        console.log(event.data);
        wsUser.messageHandled(); // continue, websocket is open, enable to receive messages
    };
    wsUser.extensionCommands = {
        'myCommand': (event) => {
            console.log(event);
            const myData = event.message; // Received `myData` from client
            // Do something
            // Send response to client
            wsUser.send(`$myCommand:${myData}`);
            event.done(); //  or wsUser.messageHandled(); `myCommand` is handled > continue, websocket is open
        }
    };
}
```
On the client side, you can use the following code to connect to the server:
```html
<!DOCTYPE html>
<html>
    <head>
        <title>WS-User</title>
        <!-- STEP 1: Import the library. -->
        <!-- Import the library. Routes in the node_modules folder on the server `tiny-https-server` -->
        <script async src="node_modules/data-context@2"></script>
        <script async src="node_modules/data-context-binding@2"></script>
        <script async src="node_modules/ws-user"></script>
        <!-- or use CDN -->
        <script src="https://cdn.jsdelivr.net/npm/data-context"></script>
        <script src="https://cdn.jsdelivr.net/npm/data-context-binding"></script>
        <script src="https://cdn.jsdelivr.net/npm/ws-user"></script>
    </head>
    <body>
        <script>
            // STEP 3: Use the library.
            importModules(['data-context', 'data-context-binding', 'ws-user'], function (dataContext, dataContextBinding, WsUser) {
                const wsUser = WsUser({ debugMode });
                wsUser.onerror = (error) => {
                    console.error(error);
                };
                wsUser.onopen = () => {
                    console.log('Connected to the server');
                };
                wsUser.onclose = () => {
                    console.log('Disconnected from the server');
                };
                wsUser.onmessage = (event) => {
                    console.log(event.data);
                    wsUser.messageHandled();
                };
                wsUser.extensionCommands = {
                    'myCommand': (event) => {
                        console.log(event);
                        const myData = event.message;
                        wsUser.send(`$myCommand:${myData}`);
                        event.done();
                    }
                };
                wsUser.onuserinfo = function (event) {
                    console.log(event);
                    if (event?.userinfo?.message) { alert(event.userinfo.message); }
                };
                //wsUser.login(email, password);
                //wsUser.logout();
                //wsUser.create_account(email, password, name);
                //wsUser.update_name(name);
                //wsUser.update_password(password);
                //wsUser.security_code(email, code, resetPassword);

            });
            
            // STEP 2: Add the importModules function.
            function importModules(importIdentifierArray, cb) {

                var thisScope = "undefined" != typeof globalThis
                    ? globalThis
                    : "undefined" != typeof window
                        ? window
                        : "undefined" != typeof global
                            ? global : "undefined" != typeof self
                                ? self
                                : {};

                if (!thisScope.modules) { thisScope.modules = {}; }

                waitModules();


                function waitModules() {

                    if (importIdentifierArray.length) {

                        for (let i = 0; i < importIdentifierArray.length; i++) {

                            if (!thisScope.modules[importIdentifierArray[i]]) { return setTimeout(waitModules, 10); }
                        }
                    }

                    cb.call(thisScope, ...importIdentifierArray.map(function (id) { return thisScope.modules[id]; }));
                }
            }
        </script>
    </body>
</html>
```

## License  

This project is licensed under the MIT License.  

Copyright &copy; 2021 Manuel Lõhmus  

[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif)](https://www.paypal.com/donate?hosted_button_id=GJHV8E2DBBFJU)  

Donations are welcome and will go towards further development of this project.  

<br>  
<br>  
<br>  
</div>  
</div>  
</div>
